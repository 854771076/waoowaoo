import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import {
  validatePreviewText,
  validateVoicePrompt,
  validateVoicePrefix,
} from '@/lib/providers/bailian/voice-design'

const VALID_BAILIAN_FLAVORS = new Set(['qwen', 'cosyvoice-design', 'cosyvoice-clone'])
const VALID_COSYVOICE_TARGETS = new Set([
  'cosyvoice-v3.5-plus',
  'cosyvoice-v3.5-flash',
  'cosyvoice-v3-plus',
  'cosyvoice-v3-flash',
  'cosyvoice-v2',
])
const VALID_LANGUAGES = new Set(['zh', 'en', 'fr', 'de', 'ja', 'ko', 'ru', 'pt', 'th', 'id', 'vi'])

/**
 * 声音设计 API (Asset Hub)
 * POST /api/asset-hub/voice-design
 * Supports qwen, cosyvoice-design, cosyvoice-clone flavours.
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const locale = resolveRequiredTaskLocale(request, body)
  const provider = body.provider === 'omnivoice' ? 'omnivoice' : 'bailian'
  const flavor = typeof body.flavor === 'string' && VALID_BAILIAN_FLAVORS.has(body.flavor)
    ? body.flavor as 'qwen' | 'cosyvoice-design' | 'cosyvoice-clone'
    : 'qwen'
  const voicePrompt = typeof body.voicePrompt === 'string' ? body.voicePrompt.trim() : ''
  const previewText = typeof body.previewText === 'string' ? body.previewText.trim() : ''
  const preferredName = typeof body.preferredName === 'string' && body.preferredName.trim()
    ? body.preferredName.trim()
    : 'custom_voice'
  const language = body.language === 'en' ? 'en' : 'zh'
  const prefix = typeof body.prefix === 'string' ? body.prefix.trim() : ''
  const targetModel = typeof body.targetModel === 'string' && VALID_COSYVOICE_TARGETS.has(body.targetModel)
    ? body.targetModel
    : 'cosyvoice-v3.5-plus'
  const audioUrl = typeof body.audioUrl === 'string' ? body.audioUrl.trim() : ''
  const audioStorageKey = typeof body.audioStorageKey === 'string' ? body.audioStorageKey.trim() : ''
  const languageHints = Array.isArray(body.languageHints)
    ? body.languageHints.filter((v): v is string => typeof v === 'string' && VALID_LANGUAGES.has(v)).slice(0, 1)
    : []
  const maxPromptAudioLength = typeof body.maxPromptAudioLength === 'number' && Number.isFinite(body.maxPromptAudioLength)
    ? Math.min(30, Math.max(3, body.maxPromptAudioLength))
    : 10
  const enablePreprocess = body.enablePreprocess === true

  if (provider === 'bailian' && flavor === 'cosyvoice-clone') {
    if (!audioUrl && !audioStorageKey) {
      throw new ApiError('INVALID_PARAMS', { message: 'audioUrl or audioStorageKey is required for clone' })
    }
    const prefixCheck = validateVoicePrefix(prefix || 'clone')
    if (!prefixCheck.valid) throw new ApiError('INVALID_PARAMS', { message: prefixCheck.error })
  } else if (provider === 'omnivoice' || flavor !== 'cosyvoice-clone') {
    const promptValidation = validateVoicePrompt(voicePrompt)
    if (!promptValidation.valid) throw new ApiError('INVALID_PARAMS', { message: promptValidation.error })
    const textValidation = validatePreviewText(previewText)
    if (!textValidation.valid) throw new ApiError('INVALID_PARAMS', { message: textValidation.error })
    if (flavor === 'cosyvoice-design') {
      const prefixCheck = validateVoicePrefix(prefix || 'cv')
      if (!prefixCheck.valid) throw new ApiError('INVALID_PARAMS', { message: prefixCheck.error })
    }
  }

  const digest = createHash('sha1')
    .update(JSON.stringify({
      userId: session.user.id,
      provider,
      flavor,
      voicePrompt,
      previewText,
      preferredName,
      language,
      prefix,
      targetModel,
      audioUrl,
      audioStorageKey,
      languageHints,
      maxPromptAudioLength: flavor === 'cosyvoice-clone' ? maxPromptAudioLength : undefined,
      enablePreprocess: flavor === 'cosyvoice-clone' ? enablePreprocess : undefined,
    }))
    .digest('hex')
    .slice(0, 16)

  const payload = {
    provider,
    flavor,
    voicePrompt,
    previewText,
    preferredName,
    language,
    prefix,
    targetModel,
    audioUrl,
    audioStorageKey,
    languageHints,
    maxPromptAudioLength,
    enablePreprocess,
    displayMode: 'detail' as const,
  }

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
    targetType: 'GlobalAssetHubVoiceDesign',
    targetId: session.user.id,
    payload,
    dedupeKey: `${TASK_TYPE.ASSET_HUB_VOICE_DESIGN}:${digest}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.ASSET_HUB_VOICE_DESIGN, payload),
  })

  return NextResponse.json(result)
})
