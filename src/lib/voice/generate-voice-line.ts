import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { fal } from '@fal-ai/client'
import { prisma } from '@/lib/prisma'
import { getAudioApiKey, getProviderConfig, getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { extractStorageKey, getSignedUrl, toFetchableUrl, uploadObject } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey, resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { synthesizeWithBailianTTS, synthesizeWithCosyVoiceTTS } from '@/lib/providers/bailian'
import { synthesizeWithOmnivoiceTTS } from '@/lib/providers/omnivoice'
import {
  parseSpeakerVoiceMap,
  resolveVoiceBindingForProvider,
  type CharacterVoiceFields,
  type SpeakerVoiceMap,
} from '@/lib/voice/provider-voice-binding'

type CheckCancelled = () => Promise<void>
type CharacterVoiceProfile = CharacterVoiceFields & { name: string }

function normalizeBailianVoiceGenerationError(errorMessage: string | null | undefined, modelId?: string) {
  const message = typeof errorMessage === 'string' ? errorMessage.trim() : ''
  if (!message) return 'BAILIAN_AUDIO_GENERATION_FAILED'

  const normalized = message.toLowerCase()
  if (normalized.includes('invalidparameter')) {
    if (modelId?.startsWith('cosyvoice-')) {
      return '无效音色ID或参数，CosyVoice 请检查所选音色是否可用'
    }
    return '无效音色ID，QwenTTS 必须使用 AI 设计音色'
  }

  return message
}

function isCosyVoiceModel(modelId: string): boolean {
  return modelId.startsWith('cosyvoice-')
}

// ponytail: 简单语种探测 —— 文本含 CJK 统一汉字则报 zh,否则 en;CosyVoice 支持多语种,
// 这里只覆盖最常见的中英场景,后续可扩展。
function detectLanguageHints(text: string): string {
  return /\p{Script=Han}/u.test(text) ? 'zh' : 'en'
}

function getWavDurationFromBuffer(buffer: Buffer): number {
  try {
    const riff = buffer.slice(0, 4).toString('ascii')
    if (riff !== 'RIFF') {
      return Math.round((buffer.length * 8) / 128)
    }

    const byteRate = buffer.readUInt32LE(28)
    let offset = 12
    let dataSize = 0

    while (offset < buffer.length - 8) {
      const chunkId = buffer.slice(offset, offset + 4).toString('ascii')
      const chunkSize = buffer.readUInt32LE(offset + 4)

      if (chunkId === 'data') {
        dataSize = chunkSize
        break
      }

      offset += 8 + chunkSize
    }

    if (dataSize > 0 && byteRate > 0) {
      return Math.round((dataSize / byteRate) * 1000)
    }

    return Math.round((buffer.length * 8) / 128)
  } catch {
    return Math.round((buffer.length * 8) / 128)
  }
}

async function generateVoiceWithIndexTTS2(params: {
  endpoint: string
  referenceAudioUrl: string
  text: string
  emotionPrompt?: string | null
  strength?: number
  falApiKey?: string
}) {
  const strength = typeof params.strength === 'number' ? params.strength : 0.4

  _ulogInfo(`IndexTTS2: Generating with reference audio, strength: ${strength}`)
  if (params.emotionPrompt) {
    _ulogInfo(`IndexTTS2: Using emotion prompt: ${params.emotionPrompt}`)
  }

  if (params.falApiKey) {
    fal.config({ credentials: params.falApiKey })
  }

  const audioDataUrl = params.referenceAudioUrl.startsWith('data:')
    ? params.referenceAudioUrl
    : await normalizeToBase64ForGeneration(params.referenceAudioUrl)

  const input: {
    audio_url: string
    prompt: string
    should_use_prompt_for_emotion: boolean
    strength: number
    emotion_prompt?: string
  } = {
    audio_url: audioDataUrl,
    prompt: params.text,
    should_use_prompt_for_emotion: true,
    strength,
  }

  if (params.emotionPrompt?.trim()) {
    input.emotion_prompt = params.emotionPrompt.trim()
  }

  const result = await fal.subscribe(params.endpoint, {
    input,
    logs: false,
  })

  const audioUrl = (result as { data?: { audio?: { url?: string } } })?.data?.audio?.url
  if (!audioUrl) {
    throw new Error('No audio URL in response')
  }

  const audioData = await downloadAudioData(audioUrl)

  return {
    audioData,
    audioDuration: getWavDurationFromBuffer(audioData),
  }
}

function matchCharacterBySpeaker(
  speaker: string,
  characters: CharacterVoiceProfile[],
) {
  const exactMatch = characters.find((character) => character.name === speaker)
  if (exactMatch) return exactMatch
  return characters.find((character) => character.name.includes(speaker) || speaker.includes(character.name))
}

async function resolveReferenceAudioUrl(referenceAudioUrl: string): Promise<string> {
  if (referenceAudioUrl.startsWith('http') || referenceAudioUrl.startsWith('data:')) {
    return referenceAudioUrl
  }
  if (referenceAudioUrl.startsWith('/m/')) {
    const storageKey = await resolveStorageKeyFromMediaValue(referenceAudioUrl)
    if (!storageKey) {
      throw new Error(`无法解析参考音频路径: ${referenceAudioUrl}`)
    }
    return getSignedUrl(storageKey, 3600)
  }
  if (referenceAudioUrl.startsWith('/api/files/')) {
    const storageKey = extractStorageKey(referenceAudioUrl)
    return storageKey ? getSignedUrl(storageKey, 3600) : referenceAudioUrl
  }
  return getSignedUrl(referenceAudioUrl, 3600)
}

async function downloadAudioData(audioUrl: string): Promise<Buffer> {
  const response = await fetch(toFetchableUrl(audioUrl))
  if (!response.ok) {
    throw new Error(`Audio download failed: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

export async function synthesizeVoiceLineAudio(params: {
  projectId: string
  episodeId: string
  userId: string
  lineId: string
  speaker: string
  text: string
  emotionPrompt?: string | null
  emotionStrength?: number | null
  audioModel?: string
  storageKeyPrefix?: string
}) {
  const text = params.text.trim()
  if (!text) {
    throw new Error('Voice line text is empty')
  }

  const [projectData, episode] = await Promise.all([
    prisma.novelPromotionProject.findUnique({
      where: { projectId: params.projectId },
      include: { characters: true },
    }),
    prisma.novelPromotionEpisode.findUnique({
      where: { id: params.episodeId },
      select: { speakerVoices: true },
    }),
  ])

  if (!projectData) {
    throw new Error('Novel promotion project not found')
  }

  const speakerVoices: SpeakerVoiceMap = parseSpeakerVoiceMap(episode?.speakerVoices)
  const character = matchCharacterBySpeaker(params.speaker, projectData.characters || [])
  const speakerVoice = speakerVoices[params.speaker]

  const audioSelection = await resolveModelSelectionOrSingle(params.userId, params.audioModel, 'audio')
  const providerKey = getProviderKey(audioSelection.provider).toLowerCase()
  const voiceBinding = resolveVoiceBindingForProvider({
    providerKey,
    character,
    speakerVoice,
  })
  let generated: { audioData: Buffer; audioDuration: number }
  if (providerKey === 'fal') {
    if (!voiceBinding || voiceBinding.provider !== 'fal') {
      throw new Error('请先为该发言人设置参考音频')
    }

    const fullAudioUrl = await resolveReferenceAudioUrl(voiceBinding.referenceAudioUrl)
    const falApiKey = await getAudioApiKey(params.userId, audioSelection.modelKey)
    generated = await generateVoiceWithIndexTTS2({
      endpoint: audioSelection.modelId,
      referenceAudioUrl: fullAudioUrl,
      text,
      emotionPrompt: params.emotionPrompt,
      strength: params.emotionStrength ?? 0.4,
      falApiKey,
    })
  } else if (providerKey === 'bailian') {
    if (!voiceBinding || voiceBinding.provider !== 'bailian') {
      const hasUploadedReference =
        !!character?.customVoiceUrl ||
        (speakerVoice?.provider === 'fal' && !!speakerVoice.audioUrl)
      if (hasUploadedReference) {
        throw new Error('无音色ID，百炼 TTS 必须使用 AI 设计或克隆音色')
      }
      throw new Error('请先为该发言人绑定百炼音色')
    }
    const { apiKey } = await getProviderConfig(params.userId, audioSelection.provider)
    let modelId = audioSelection.modelId

    // ponytail: voiceId 前缀比 audioModel 选择更可信——如果绑定的是 cosyvoice-v* 音色,
    // 但当前选的是 qwen 模型(或反之),自动切换到匹配的模型,避免 API 返回不透明的 InvalidParameter。
    const voiceIsCosy = voiceBinding.voiceId.startsWith('cosyvoice-v') || voiceBinding.voiceId.startsWith('cosyvoice-')
    const modelIsCosy = isCosyVoiceModel(modelId)
    if (voiceIsCosy && !modelIsCosy) {
      modelId = 'cosyvoice-v3.5-plus'
    } else if (!voiceIsCosy && modelIsCosy) {
      // Qwen voiceId 必须走 qwen 模型;默认回退
      modelId = 'qwen3-tts-vd-2026-01-26'
    }

    let audioData: Buffer = Buffer.alloc(0)
    let audioDuration = 0
    if (isCosyVoiceModel(modelId)) {
      const result = await synthesizeWithCosyVoiceTTS({
        text,
        voiceId: voiceBinding.voiceId,
        modelId,
        languageHints: detectLanguageHints(text),
        format: 'wav',
        sampleRate: 24000,
        // ponytail: CosyVoice 的 instruction 字段承载风格/情感指令,
        // 与 IndexTTS2 的 emotionPrompt 语义最接近——当用户在前端写了情感提示,透传下去。
        instruction: params.emotionPrompt?.trim() || undefined,
      }, apiKey)
      if (!result.success || !result.audioData) {
        throw new Error(normalizeBailianVoiceGenerationError(result.error, modelId))
      }
      audioData = result.audioData
      audioDuration = result.audioDuration ?? (result.format === 'wav' ? getWavDurationFromBuffer(audioData) : 0)
    } else {
      const result = await synthesizeWithBailianTTS({
        text,
        voiceId: voiceBinding.voiceId,
        modelId,
        languageType: 'Chinese',
      }, apiKey)
      if (!result.success || !result.audioData) {
        throw new Error(normalizeBailianVoiceGenerationError(result.error, modelId))
      }
      audioData = result.audioData
      audioDuration = result.audioDuration ?? getWavDurationFromBuffer(audioData)
    }

    generated = { audioData, audioDuration }
  } else if (providerKey === 'omnivoice') {
    if (!voiceBinding || voiceBinding.provider !== 'omnivoice') {
      throw new Error('请先为该发言人绑定 OmniVoice 音色')
    }
    const result = await synthesizeWithOmnivoiceTTS({
      text,
      profileId: voiceBinding.profileId,
    })
    if (!result.success || !result.audioData) {
      throw new Error(result.errorCode || result.error || 'OMNIVOICE_TTS_FAILED')
    }
    generated = {
      audioData: result.audioData,
      audioDuration: result.audioDuration ?? getWavDurationFromBuffer(result.audioData),
    }
  } else {
    throw new Error(`AUDIO_PROVIDER_UNSUPPORTED: ${audioSelection.provider}`)
  }

  const prefix = params.storageKeyPrefix || 'voice'
  const audioKey = `${prefix}/${params.projectId}/${params.episodeId}/${params.lineId}.wav`
  const storageKey = await uploadObject(generated.audioData, audioKey, undefined, 'audio/wav')
  const signedUrl = getSignedUrl(storageKey, 7200)
  return {
    lineId: params.lineId,
    audioUrl: signedUrl,
    storageKey,
    audioDuration: generated.audioDuration || null,
    audioDurationSeconds: generated.audioDuration ? generated.audioDuration / 1000 : null,
    sizeBytes: generated.audioData.length,
  }
}

export async function generateVoiceLine(params: {
  projectId: string
  episodeId?: string | null
  lineId: string
  userId: string
  audioModel?: string
  checkCancelled?: CheckCancelled
}) {
  const checkCancelled = params.checkCancelled

  const line = await prisma.novelPromotionVoiceLine.findUnique({
    where: { id: params.lineId },
    select: {
      id: true,
      episodeId: true,
      speaker: true,
      content: true,
      emotionPrompt: true,
      emotionStrength: true,
    },
  })
  if (!line) {
    throw new Error('Voice line not found')
  }

  const episodeId = params.episodeId || line.episodeId
  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const generated = await synthesizeVoiceLineAudio({
    projectId: params.projectId,
    episodeId,
    lineId: line.id,
    userId: params.userId,
    speaker: line.speaker,
    text: line.content || '',
    emotionPrompt: line.emotionPrompt,
    emotionStrength: line.emotionStrength,
    audioModel: params.audioModel,
  })

  await checkCancelled?.()

  // storageKey 固定为 voice/{project}/{episode}/{line}.wav —— 重新生成时对象被覆盖,
  // publicId 也稳定不变。必须 upsert MediaObject 刷新 durationMs/sizeBytes,
  // 并把 audioMediaId 写回,否则 resolveMediaRef 会命中旧 MediaObject。
  const media = await ensureMediaObjectFromStorageKey(generated.storageKey, {
    mimeType: 'audio/wav',
    sizeBytes: generated.sizeBytes,
    durationMs: generated.audioDuration ?? null,
  })

  await prisma.novelPromotionVoiceLine.update({
    where: { id: line.id },
    data: {
      audioUrl: generated.storageKey,
      audioDuration: generated.audioDuration || null,
      audioMediaId: media.id,
    },
  })

  return generated
}

export function estimateVoiceLineMaxSeconds(content: string | null | undefined) {
  const chars = typeof content === 'string' ? content.length : 0
  return Math.max(5, Math.ceil(chars / 2))
}
