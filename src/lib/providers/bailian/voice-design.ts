import { logInfo as _ulogInfo } from '@/lib/logging/core'

export type BailianVoiceDesignFlavor = 'qwen' | 'cosyvoice-design' | 'cosyvoice-clone'

const BAILIAN_VOICE_CUSTOMIZATION_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'

export interface QwenVoiceDesignInput {
  flavor?: 'qwen'
  voicePrompt: string
  previewText: string
  preferredName?: string
  language?: 'zh' | 'en'
  /** Defaults to qwen3-tts-vd-2026-01-26 */
  targetModel?: string
}

export interface CosyVoiceDesignInput {
  flavor: 'cosyvoice-design'
  voicePrompt: string
  previewText: string
  prefix: string // digits/letters ≤10 chars
  languageHints?: ('zh' | 'en' | 'fr' | 'de' | 'ja' | 'ko' | 'ru' | 'pt' | 'th' | 'id' | 'vi')[]
  /** Defaults to cosyvoice-v3.5-plus */
  targetModel?: string
  sampleRate?: 16000 | 24000 | 48000
  responseFormat?: 'wav' | 'mp3' | 'pcm'
}

export interface CosyVoiceCloneInput {
  flavor: 'cosyvoice-clone'
  /** Publicly accessible reference audio URL */
  audioUrl: string
  prefix: string
  languageHints?: ('zh' | 'en' | 'fr' | 'de' | 'ja' | 'ko' | 'ru' | 'pt' | 'th' | 'id' | 'vi')[]
  /** Defaults to cosyvoice-v3.5-plus */
  targetModel?: string
  maxPromptAudioLength?: number // seconds 3-30, default 10
  enablePreprocess?: boolean
}

export type VoiceDesignInput = QwenVoiceDesignInput | CosyVoiceDesignInput | CosyVoiceCloneInput

export interface VoiceDesignResult {
  success: boolean
  voiceId?: string
  targetModel?: string
  audioBase64?: string
  sampleRate?: number
  responseFormat?: string
  usageCount?: number
  requestId?: string
  error?: string
  errorCode?: string
  flavor: BailianVoiceDesignFlavor
  status?: 'DEPLOYING' | 'OK' | 'UNDEPLOYED'
}

export interface BailianVoiceListItem {
  voiceId: string
  prefix?: string
  targetModel?: string
  status?: string
  createTime?: string
  updateTime?: string
  /** 来源：cosyvoice（voice-enrollment）或 qwen（customization） */
  source: 'cosyvoice' | 'qwen'
}

export interface ListBailianVoicesResult {
  success: boolean
  voices: BailianVoiceListItem[]
  error?: string
  requestId?: string
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildRequestBody(input: VoiceDesignInput): { model: string; body: Record<string, unknown>; flavor: BailianVoiceDesignFlavor } {
  if (!input.flavor || input.flavor === 'qwen') {
    const qi = input as QwenVoiceDesignInput
    return {
      model: 'qwen-voice-design',
      flavor: 'qwen',
      body: {
        model: 'qwen-voice-design',
        input: {
          action: 'create',
          target_model: qi.targetModel || 'qwen3-tts-vd-2026-01-26',
          voice_prompt: qi.voicePrompt,
          preview_text: qi.previewText,
          preferred_name: qi.preferredName || 'custom_voice',
          language: qi.language || 'zh',
        },
        parameters: {
          sample_rate: 24000,
          response_format: 'wav',
        },
      },
    }
  }

  if (input.flavor === 'cosyvoice-design') {
    const ci = input as CosyVoiceDesignInput
    const targetModel = ci.targetModel || 'cosyvoice-v3.5-plus'
    return {
      model: 'voice-enrollment',
      flavor: 'cosyvoice-design',
      body: {
        model: 'voice-enrollment',
        input: {
          action: 'create_voice',
          target_model: targetModel,
          voice_prompt: ci.voicePrompt,
          preview_text: ci.previewText,
          prefix: ci.prefix || 'cv',
          ...(ci.languageHints?.length ? { language_hints: ci.languageHints.slice(0, 1) } : {}),
        },
        parameters: {
          sample_rate: ci.sampleRate || 24000,
          response_format: ci.responseFormat || 'wav',
        },
      },
    }
  }

  // cosyvoice-clone
  const ci = input as CosyVoiceCloneInput
  const targetModel = ci.targetModel || 'cosyvoice-v3.5-plus'
  return {
    model: 'voice-enrollment',
    flavor: 'cosyvoice-clone',
    body: {
      model: 'voice-enrollment',
      input: {
        action: 'create_voice',
        target_model: targetModel,
        url: ci.audioUrl,
        prefix: ci.prefix || 'clone',
        ...(ci.languageHints?.length ? { language_hints: ci.languageHints.slice(0, 1) } : {}),
        ...(typeof ci.maxPromptAudioLength === 'number' ? { max_prompt_audio_length: ci.maxPromptAudioLength } : {}),
        ...(ci.enablePreprocess ? { enable_preprocess: true } : {}),
      },
    },
  }
}

export async function createVoiceDesign(
  input: VoiceDesignInput,
  apiKey: string,
): Promise<VoiceDesignResult> {
  if (!apiKey) {
    return { success: false, error: '请配置阿里百炼 API Key', flavor: input.flavor || 'qwen' }
  }

  const { body, flavor } = buildRequestBody(input)
  const inputPayload = body.input as Record<string, unknown>
  _ulogInfo('[VoiceDesign] 请求:', JSON.stringify({
    ...body,
    input: { ...inputPayload, url: inputPayload.url ? '<redacted>' : undefined },
  }, null, 2))

  try {
    const response = await fetch(BAILIAN_VOICE_CUSTOMIZATION_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json() as {
      output?: {
        voice?: string
        target_model?: string
        preview_audio?: { data?: string; sample_rate?: number; response_format?: string }
        voice_id?: string
        status?: string
      }
      usage?: { count?: number }
      request_id?: string
      code?: string
      message?: string
    }

    if (response.ok && data.output) {
      const voiceId = readTrimmedString(data.output.voice) || readTrimmedString(data.output.voice_id)
      return {
        success: true,
        voiceId,
        targetModel: readTrimmedString(data.output.target_model) || undefined,
        audioBase64: data.output.preview_audio?.data,
        sampleRate: data.output.preview_audio?.sample_rate,
        responseFormat: data.output.preview_audio?.response_format,
        usageCount: data.usage?.count,
        requestId: data.request_id,
        flavor,
        status: data.output.status as VoiceDesignResult['status'],
      }
    }

    return {
      success: false,
      error: readTrimmedString(data.message) || '声音设计 API 调用失败',
      errorCode: readTrimmedString(data.code),
      requestId: data.request_id,
      flavor,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '网络请求失败'
    return { success: false, error: message || '网络请求失败', flavor }
  }
}

export function validateVoicePrompt(voicePrompt: string): { valid: boolean; error?: string } {
  if (!voicePrompt || voicePrompt.trim().length === 0) {
    return { valid: false, error: '声音提示词不能为空' }
  }
  if (Array.from(voicePrompt).length > 500) {
    return { valid: false, error: '声音提示词不能超过500个字符' }
  }
  return { valid: true }
}

export function validatePreviewText(previewText: string): { valid: boolean; error?: string } {
  if (!previewText || previewText.trim().length === 0) {
    return { valid: false, error: '预览文本不能为空' }
  }
  if (previewText.length < 5) {
    return { valid: false, error: '预览文本至少需要5个字符' }
  }
  if (Array.from(previewText).length > 200) {
    return { valid: false, error: '预览文本不能超过200个字符' }
  }
  return { valid: true }
}

export function validateVoicePrefix(prefix: string): { valid: boolean; error?: string } {
  if (!prefix || !/^[A-Za-z0-9]{1,10}$/.test(prefix)) {
    return { valid: false, error: '音色前缀为 1-10 位字母或数字' }
  }
  return { valid: true }
}

interface ListResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    voices?: Array<{
      voice_id?: string
      voice?: string
      prefix?: string
      target_model?: string
      status?: string
      create_time?: string
      update_time?: string
      preferred_name?: string
      // qwen customization has different shape
      voice_name?: string
      model?: string
    }>
    // qwen list may use a different key
    voice_list?: Array<Record<string, unknown>>
  }
}

/**
 * 拉取百炼账号下已存在的所有自定义音色（CosyVoice voice-enrollment + Qwen 旧版）。
 * 两个端点分别请求后合并;单个端点失败不阻塞另一个。
 */
export async function listBailianVoices(apiKey: string): Promise<ListBailianVoicesResult> {
  if (!apiKey) {
    return { success: false, voices: [], error: '请配置阿里百炼 API Key' }
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  async function fetchList(
    model: 'voice-enrollment' | 'qwen-voice-design',
    action: string,
    source: 'cosyvoice' | 'qwen',
  ): Promise<BailianVoiceListItem[]> {
    try {
      const res = await fetch(BAILIAN_VOICE_CUSTOMIZATION_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          input: { action, page_size: 100 },
        }),
      })
      const data = (await res.json().catch(() => ({}))) as ListResponse
      if (!res.ok) return []
      const rawList = data.output?.voices ?? data.output?.voice_list ?? []
      return rawList.map((v) => ({
        voiceId: readTrimmedString(v.voice_id) || readTrimmedString(v.voice) || readTrimmedString(v.voice_name) || '',
        prefix: readTrimmedString(v.prefix) || undefined,
        targetModel: readTrimmedString(v.target_model) || readTrimmedString(v.model) || undefined,
        status: readTrimmedString(v.status) || undefined,
        createTime: readTrimmedString(v.create_time) || undefined,
        updateTime: readTrimmedString(v.update_time) || undefined,
        source,
      })).filter((v) => v.voiceId.length > 0)
    } catch {
      return []
    }
  }

  const [cosyList, qwenList] = await Promise.all([
    fetchList('voice-enrollment', 'list_voice', 'cosyvoice'),
    fetchList('qwen-voice-design', 'list', 'qwen'),
  ])

  return {
    success: true,
    voices: [...cosyList, ...qwenList],
  }
}
