import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadObject, generateUniqueKey, getSignedUrl } from '@/lib/storage'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { createOmnivoiceClone } from '@/lib/providers/omnivoice'

/**
 * PATCH /api/novel-promotion/[projectId]/character-voice
 * 更新角色的配音音色设置
 * Body: { characterId, voiceType, voiceId, customVoiceUrl }
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { characterId, voiceType, voiceId, customVoiceUrl } = body

  if (!characterId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // ponytail: PATCH 按"传入才更新"语义——避免只改 voiceId 时误清空 customVoiceUrl。
  // 显式传 null 表示清空,undefined/缺省表示保留。
  const data: {
    voiceType?: string | null
    voiceId?: string | null
    customVoiceUrl?: string | null
  } = {}
  if (Object.prototype.hasOwnProperty.call(body, 'voiceType')) {
    data.voiceType = typeof voiceType === 'string' && voiceType ? voiceType : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'voiceId')) {
    data.voiceId = typeof voiceId === 'string' && voiceId ? voiceId : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'customVoiceUrl')) {
    data.customVoiceUrl = typeof customVoiceUrl === 'string' && customVoiceUrl ? customVoiceUrl : null
  }

  // 更新角色音色设置
  const character = await prisma.novelPromotionCharacter.update({
    where: { id: characterId },
    data,
  })

  return NextResponse.json({ success: true, character })
})

/**
 * POST /api/novel-promotion/[projectId]/character-voice
 * 上传自定义音色音频 或 保存 AI 设计的声音
 * FormData: { characterId, file } - 文件上传
 * JSON: { characterId, voiceDesign: { voiceId, audioBase64 } } - AI 声音设计
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const contentType = request.headers.get('content-type') || ''

  // 处理 JSON 请求（AI 声音设计 / 声音克隆后保存）
  if (contentType.includes('application/json')) {
    const body = await request.json()
    const { characterId, voiceDesign } = body

    if (!characterId || !voiceDesign) {
      throw new ApiError('INVALID_PARAMS')
    }

    const { voiceId, audioBase64, provider } = voiceDesign
    if (!voiceId) {
      throw new ApiError('INVALID_PARAMS')
    }

    // 按 provider 决定 voiceType：OmniVoice 设计 → omnivoice-design，否则百炼设计
    const voiceType = provider === 'omnivoice' ? 'omnivoice-design' : 'qwen-designed'

    const updateData: {
      voiceType: string
      voiceId: string
      customVoiceUrl?: string | null
    } = { voiceType, voiceId }

    let cosUrl: string | null = null
    if (audioBase64) {
      // 解码 base64 音频并上传到 COS（设计/克隆返回了试听音频时才覆盖）
      const audioBuffer = Buffer.from(audioBase64, 'base64')
      const key = generateUniqueKey(`voice/custom/${projectId}/${characterId}`, 'wav')
      cosUrl = await uploadObject(audioBuffer, key)
      updateData.customVoiceUrl = cosUrl
    }

    // 更新角色音色设置
    const character = await prisma.novelPromotionCharacter.update({
      where: { id: characterId },
      data: updateData,
    })

    _ulogInfo(`Character ${characterId} AI-designed voice saved: voiceId=${voiceId}, hasPreview=${!!cosUrl}`)

    // 返回签名URL
    const signedAudioUrl = cosUrl ? getSignedUrl(cosUrl, 7200) : null

    return NextResponse.json({
      success: true,
      audioUrl: signedAudioUrl,
      character: {
        ...character,
        customVoiceUrl: signedAudioUrl,
      },
    })
  }

  // 处理 FormData 请求（文件上传 / 声音克隆）
  const formData = await request.formData()
  const file = formData.get('file') as File
  const characterId = formData.get('characterId') as string
  const mode = (formData.get('mode') as string | null)?.trim() || 'upload'

  if (!file || !characterId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 验证文件类型
  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a']
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 读取文件
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // 获取文件扩展名
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3'

  // OmniVoice 声音克隆分支：上传参考音频 → clone → 保存 profileId
  if (mode === 'clone') {
    const authedUserId = authResult.session.user.id
    const cloneResult = await createOmnivoiceClone({
      name: characterId,
      refAudio: buffer,
      refAudioFilename: file.name,
      language: (formData.get('language') as string | null)?.trim() || 'Auto',
      userId: authedUserId,
    })
    if (!cloneResult.success || !cloneResult.profileId) {
      const status = cloneResult.errorCode === 'OMNIVOICE_BACKEND_UNREACHABLE' ? 502 : 400
      return NextResponse.json({
        success: false,
        error: cloneResult.error,
        errorCode: cloneResult.errorCode,
      }, { status })
    }

    const cloneKey = generateUniqueKey(`voice/custom/${projectId}/${characterId}`, ext)
    const cloneCosUrl = await uploadObject(buffer, cloneKey)

    const clonedCharacter = await prisma.novelPromotionCharacter.update({
      where: { id: characterId },
      data: {
        voiceType: 'omnivoice-clone',
        voiceId: cloneResult.profileId,
        customVoiceUrl: cloneCosUrl,
      },
    })

    const clonePreviewUrl = getSignedUrl(cloneCosUrl, 7200)
    return NextResponse.json({
      success: true,
      audioUrl: clonePreviewUrl,
      profileId: cloneResult.profileId,
      character: {
        ...clonedCharacter,
        customVoiceUrl: clonePreviewUrl,
      },
    })
  }

  // 上传到COS
  const key = generateUniqueKey(`voice/custom/${projectId}/${characterId}`, ext)
  const audioUrl = await uploadObject(buffer, key)

  // 更新角色音色设置为自定义
  const character = await prisma.novelPromotionCharacter.update({
    where: { id: characterId },
    data: {
      voiceType: 'uploaded',
      voiceId: null,
      customVoiceUrl: audioUrl
    }
  })

  _ulogInfo(`Character ${characterId} voice uploaded: ${audioUrl}`)

  // 返回签名URL，以便前端可以立即播放
  const signedAudioUrl = getSignedUrl(audioUrl, 7200)

  return NextResponse.json({
    success: true,
    audioUrl: signedAudioUrl,
    character: {
      ...character,
      customVoiceUrl: signedAudioUrl // 返回签名URL给前端
    }
  })
})
