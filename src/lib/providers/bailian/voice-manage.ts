const BAILIAN_VOICE_CUSTOMIZATION_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'

interface BailianVoiceManageResponse {
  request_id?: string
  code?: string
  message?: string
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function parseManageResponse(response: Response): Promise<BailianVoiceManageResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as BailianVoiceManageResponse
  } catch {
    throw new Error('BAILIAN_VOICE_MANAGE_RESPONSE_INVALID_JSON')
  }
}

function detectVoiceFlavor(voiceId: string): 'qwen' | 'cosyvoice' {
  // qwen voice id returned by qwen-voice-design (no documented prefix); cosyvoice returns
  // ids starting with `cosyvoice-v*` per docs.
  return voiceId.startsWith('cosyvoice-v') ? 'cosyvoice' : 'qwen'
}

export async function deleteBailianVoice(params: {
  apiKey: string
  voiceId: string
}): Promise<{ requestId?: string; flavor: 'qwen' | 'cosyvoice' }> {
  const apiKey = readTrimmedString(params.apiKey)
  const voiceId = readTrimmedString(params.voiceId)
  if (!apiKey) throw new Error('BAILIAN_API_KEY_REQUIRED')
  if (!voiceId) throw new Error('BAILIAN_VOICE_ID_REQUIRED')

  const flavor = detectVoiceFlavor(voiceId)
  const body = flavor === 'cosyvoice'
    ? {
        model: 'voice-enrollment',
        input: { action: 'delete_voice', voice_id: voiceId },
      }
    : {
        model: 'qwen-voice-design',
        input: { action: 'delete', voice: voiceId },
      }

  const response = await fetch(BAILIAN_VOICE_CUSTOMIZATION_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await parseManageResponse(response)
  if (!response.ok) {
    const code = readTrimmedString(data.code)
    const message = readTrimmedString(data.message)
    throw new Error(`BAILIAN_VOICE_DELETE_FAILED(${response.status}): ${code || message || 'unknown error'}`)
  }

  return { requestId: readTrimmedString(data.request_id) || undefined, flavor }
}
