import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { estimateVoiceLineMaxSeconds } from '@/lib/voice/generate-voice-line'
import { hasVoiceLineAudioOutput } from '@/lib/task/has-output'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { composeModelKey, parseModelKeyStrict } from '@/lib/model-config-contract'
import { getModelsByType, getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { OMNIVOICE_TTS_MODEL_ID } from '@/lib/providers/omnivoice/catalog'
import { BAILIAN_TTS_MODEL_ID } from '@/lib/providers/bailian/tts'
import {
  hasAnyVoiceBinding,
  hasVoiceBindingForProvider,
  parseSpeakerVoiceMap,
  type CharacterVoiceFields,
  type SpeakerVoiceEntry,
  type SpeakerVoiceMap,
} from '@/lib/voice/provider-voice-binding'

type VoiceLineRow = {
  id: string
  speaker: string
  content: string
}

type CharacterRow = CharacterVoiceFields & {
  name: string
}

type VoiceBindingValidationResult =
  | { ok: true }
  | { ok: false; message: string }

function matchCharacterBySpeaker(speaker: string, characters: CharacterRow[]) {
  const normalizedSpeaker = speaker.trim().toLowerCase()
  return characters.find((character) => character.name.trim().toLowerCase() === normalizedSpeaker) || null
}

function detectVoiceProvider(
  character: CharacterRow | null,
  speakerVoice: SpeakerVoiceEntry | undefined,
): 'bailian' | 'omnivoice' | 'fal' | null {
  // Speaker voice takes priority (per-episode override)
  if (speakerVoice) {
    return speakerVoice.provider
  }
  // Check character-level voice binding
  if (character?.voiceId) {
    const voiceType = (character.voiceType || '').toLowerCase()
    if (voiceType.startsWith('omnivoice-')) {
      return 'omnivoice'
    }
    return 'bailian'
  }
  if (character?.customVoiceUrl) {
    return 'fal'
  }
  return null
}

function getProviderDisplayName(providerKey: string): string {
  switch (providerKey) {
    case 'bailian': return '百炼 QwenTTS'
    case 'omnivoice': return 'OmniVoice'
    case 'fal': return 'FAL IndexTTS'
    default: return providerKey
  }
}

/**
 * 把音色 provider 映射到对应的 TTS audioModel modelKey。
 * - bailian / omnivoice 走内置 catalog 模型
 * - fal 依赖用户自定义音频模型（取第一个 fal 模型）
 * 解析失败返回 null，由调用方决定如何提示。
 */
async function resolveAudioModelKeyForProvider(
  userId: string,
  providerKey: 'bailian' | 'omnivoice' | 'fal',
): Promise<string | null> {
  if (providerKey === 'omnivoice') {
    return composeModelKey('omnivoice', OMNIVOICE_TTS_MODEL_ID)
  }
  if (providerKey === 'bailian') {
    return composeModelKey('bailian', BAILIAN_TTS_MODEL_ID)
  }
  // fal：取用户配置的第一个 fal 音频模型
  const audioModels = await getModelsByType(userId, 'audio')
  const falModel = audioModels.find((model) => getProviderKey(model.provider).toLowerCase() === 'fal')
  return falModel ? falModel.modelKey : null
}

function validateSpeakerVoiceForProvider(
  speaker: string,
  characters: CharacterRow[],
  speakerVoices: SpeakerVoiceMap,
  providerKey: string,
): VoiceBindingValidationResult {
  const character = matchCharacterBySpeaker(speaker, characters)
  const speakerVoice = speakerVoices[speaker]

  if (hasVoiceBindingForProvider({
    providerKey,
    character,
    speakerVoice,
  })) {
    return { ok: true }
  }

  const existingVoiceProvider = detectVoiceProvider(character, speakerVoice)

  if (providerKey === 'bailian') {
    const hasUploadedReference =
      !!character?.customVoiceUrl ||
      (speakerVoice?.provider === 'fal' && !!speakerVoice.audioUrl)
    if (hasUploadedReference) {
      return {
        ok: false,
        message: '无音色ID，QwenTTS 必须使用 AI 设计音色',
      }
    }
    if (existingVoiceProvider && existingVoiceProvider !== 'bailian') {
      return {
        ok: false,
        message: `当前角色音色为 ${getProviderDisplayName(existingVoiceProvider)} 类型，切换到对应 TTS 引擎后可生成，或重新设计百炼音色`,
      }
    }
    return {
      ok: false,
      message: '请先为该发言人绑定百炼音色',
    }
  }

  if (providerKey === 'omnivoice') {
    if (existingVoiceProvider && existingVoiceProvider !== 'omnivoice') {
      return {
        ok: false,
        message: `当前角色音色为 ${getProviderDisplayName(existingVoiceProvider)} 类型，切换到对应 TTS 引擎后可生成，或重新设计 OmniVoice 音色`,
      }
    }
    return {
      ok: false,
      message: '请先为该发言人绑定 OmniVoice 音色',
    }
  }

  if (existingVoiceProvider) {
    return {
      ok: false,
      message: `当前角色音色为 ${getProviderDisplayName(existingVoiceProvider)} 类型，请切换到对应 TTS 引擎`,
    }
  }

  return {
    ok: false,
    message: '请先为该发言人设置参考音频',
  }
}

function hasSpeakerVoiceForProvider(
  speaker: string,
  characters: CharacterRow[],
  speakerVoices: SpeakerVoiceMap,
  providerKey: string,
): boolean {
  const character = matchCharacterBySpeaker(speaker, characters)
  const speakerVoice = speakerVoices[speaker]
  return hasVoiceBindingForProvider({
    providerKey,
    character,
    speakerVoice,
  })
}

/** 自动模式：该发言人是否有任意可用音色绑定（不限 provider） */
function hasAnySpeakerVoiceBinding(
  speaker: string,
  characters: CharacterRow[],
  speakerVoices: SpeakerVoiceMap,
): boolean {
  const character = matchCharacterBySpeaker(speaker, characters)
  const speakerVoice = speakerVoices[speaker]
  return hasAnyVoiceBinding({ character, speakerVoice })
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => null)
  const locale = resolveRequiredTaskLocale(request, body)
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId : ''
  const lineId = typeof body?.lineId === 'string' ? body.lineId : ''
  const requestedAudioModel = typeof body?.audioModel === 'string' ? body.audioModel.trim() : ''
  const all = body?.all === true

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!all && !lineId) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (requestedAudioModel && !parseModelKeyStrict(requestedAudioModel)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: 'audioModel'})
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
    select: { audioModel: true },
  })
  const preferredAudioModel = typeof pref?.audioModel === 'string' ? pref.audioModel.trim() : ''
  if (preferredAudioModel && !parseModelKeyStrict(preferredAudioModel)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: 'audioModel'})
  }
  const projectData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: {
      id: true,
      audioModel: true,
      characters: {
        select: {
          name: true,
          customVoiceUrl: true,
          voiceId: true,
          voiceType: true,
        },
      },
    },
  })
  if (!projectData) {
    throw new ApiError('NOT_FOUND')
  }
  const projectAudioModel = typeof projectData.audioModel === 'string' ? projectData.audioModel.trim() : ''
  if (projectAudioModel && !parseModelKeyStrict(projectAudioModel)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: 'audioModel'})
  }
  // 是否由用户显式指定了本次生成的 TTS 引擎。
  // 仅当本次请求显式传入 audioModel 时才强制用该引擎（向后兼容 UI 引擎下拉）。
  // 未指定（自动）→ 引擎跟随每条台词所绑定音色的 provider，
  //   忽略 project/preference 默认（这些全局默认会与音色 provider 冲突）。
  const autoMode = !requestedAudioModel
  const explicitSelection = autoMode
    ? null
    : await resolveModelSelectionOrSingle(session.user.id, requestedAudioModel, 'audio')
  const explicitProviderKey = explicitSelection
    ? getProviderKey(explicitSelection.provider).toLowerCase()
    : null

  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: {
      id: episodeId,
      novelPromotionProjectId: projectData.id},
    select: {
      id: true,
      speakerVoices: true}})
  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  const speakerVoices = parseSpeakerVoiceMap(episode.speakerVoices)
  const characters = projectData.characters || []

  let voiceLines: VoiceLineRow[] = []
  if (all) {
    const allLines = await prisma.novelPromotionVoiceLine.findMany({
      where: {
        episodeId,
        audioUrl: null},
      orderBy: { lineIndex: 'asc' },
      select: {
        id: true,
        speaker: true,
        content: true}})
    voiceLines = allLines.filter((line) =>
      autoMode
        ? hasAnySpeakerVoiceBinding(line.speaker, characters, speakerVoices)
        : hasSpeakerVoiceForProvider(line.speaker, characters, speakerVoices, explicitProviderKey!),
    )
  } else {
    const line = await prisma.novelPromotionVoiceLine.findFirst({
      where: {
        id: lineId,
        episodeId},
      select: {
        id: true,
        speaker: true,
        content: true}})
    if (!line) {
      throw new ApiError('NOT_FOUND')
    }
    if (autoMode) {
      if (!hasAnySpeakerVoiceBinding(line.speaker, characters, speakerVoices)) {
        throw new ApiError('INVALID_PARAMS', {
          message: '请先为该发言人设置音色',
        })
      }
    } else {
      const validation = validateSpeakerVoiceForProvider(
        line.speaker,
        characters,
        speakerVoices,
        explicitProviderKey!,
      )
      if (!validation.ok) {
        throw new ApiError('INVALID_PARAMS', {
          message: validation.message,
        })
      }
    }
    voiceLines = [line]
  }

  if (voiceLines.length === 0) {
    if (all) {
      const firstLineWithoutBinding = await prisma.novelPromotionVoiceLine.findFirst({
        where: {
          episodeId,
          audioUrl: null,
        },
        orderBy: { lineIndex: 'asc' },
        select: {
          speaker: true,
        },
      })
      const validation = firstLineWithoutBinding
        ? (autoMode
          ? (hasAnySpeakerVoiceBinding(firstLineWithoutBinding.speaker, characters, speakerVoices)
            ? { ok: true as const }
            : { ok: false as const, message: '请先为该发言人设置音色' })
          : validateSpeakerVoiceForProvider(
            firstLineWithoutBinding.speaker,
            characters,
            speakerVoices,
            explicitProviderKey!,
          ))
        : { ok: false as const, message: '没有需要生成的台词' }
      return NextResponse.json({
        success: true,
        async: true,
        results: [],
        taskIds: [],
        total: 0,
        ...(validation.ok ? {} : { error: validation.message }),
      })
    }
    throw new ApiError('INVALID_PARAMS', {
      message: '没有需要生成的台词',
    })
  }

  const results = await Promise.all(
    voiceLines.map(async (line) => {
      // 自动模式：引擎跟随该台词音色 provider；显式模式：用全局选定引擎
      let lineAudioModelKey: string
      if (autoMode) {
        const character = matchCharacterBySpeaker(line.speaker, characters)
        const voiceProvider = detectVoiceProvider(character, speakerVoices[line.speaker])
        if (!voiceProvider) {
          throw new ApiError('INVALID_PARAMS', {
            message: `发言人「${line.speaker}」未设置音色`,
          })
        }
        const resolvedKey = await resolveAudioModelKeyForProvider(session.user.id, voiceProvider)
        if (!resolvedKey) {
          throw new ApiError('INVALID_PARAMS', {
            message: `未配置 ${getProviderDisplayName(voiceProvider)} 音频模型`,
          })
        }
        lineAudioModelKey = resolvedKey
      } else {
        lineAudioModelKey = explicitSelection!.modelKey
      }

      const payload = {
        episodeId,
        lineId: line.id,
        maxSeconds: estimateVoiceLineMaxSeconds(line.content),
        audioModel: lineAudioModelKey}
      const result = await submitTask({
        userId: session.user.id,
    locale,
        requestId: getRequestId(request),
        projectId,
        episodeId,
        type: TASK_TYPE.VOICE_LINE,
        targetType: 'NovelPromotionVoiceLine',
        targetId: line.id,
        payload: withTaskUiPayload(payload, {
          hasOutputAtStart: await hasVoiceLineAudioOutput(line.id)}),
        dedupeKey: `voice_line:${line.id}`,
        billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, payload)})

      return {
        lineId: line.id,
        taskId: result.taskId}
    }),
  )

  if (all) {
    return NextResponse.json({
      success: true,
      async: true,
      results,
      taskIds: results.map((item) => item.taskId),
      total: results.length})
  }

  return NextResponse.json({
    success: true,
    async: true,
    taskId: results[0].taskId})
})
