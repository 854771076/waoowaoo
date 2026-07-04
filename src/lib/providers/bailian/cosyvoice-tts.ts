import { toFetchableUrl } from '@/lib/storage/utils'

export const COSYVOICE_TTS_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'
export const COSYVOICE_TTS_MAX_CHARS = 280 // ponytail: CosyVoice 单次建议 ≤300 字

export interface CosyVoiceTTSInput {
  text: string
  voiceId: string
  modelId: string // e.g. cosyvoice-v3.5-plus
  languageHints?: string // 'zh' | 'en' | ...
  format?: 'wav' | 'mp3' | 'pcm' | 'opus'
  sampleRate?: number
  volume?: number // 0-100
  rate?: number // 0.5-2.0
  pitch?: number // 0.5-2.0
  instruction?: string
}

export interface CosyVoiceTTSResult {
  success: boolean
  audioData?: Buffer
  audioDuration?: number
  audioUrl?: string
  requestId?: string
  error?: string
  characters?: number
  format?: string
}

interface CosyVoiceTTSResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    finish_reason?: string
    audio?: {
      data?: string
      url?: string
      id?: string
      expires_at?: number
    }
  }
  usage?: { characters?: number }
}

// ponytail: 下列工具函数(getWavDurationFromBuffer/decodeWavBuffer/buildWavBuffer/
// mergeWavBuffers/splitTextByLimit)与 qwen tts 共享 WAV 合并逻辑;它们同时也被 qwen tts
// 内部使用。如果后续要做 opus/mp3 合并再引入解码器,这里默认请求 wav 即可。
interface WavFormat {
  audioFormat: number
  numChannels: number
  sampleRate: number
  byteRate: number
  blockAlign: number
  bitsPerSample: number
}

interface WavDecoded { format: WavFormat; data: Buffer }

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getWavDurationFromBuffer(buffer: Buffer): number {
  try {
    const decoded = decodeWavBuffer(buffer)
    if (decoded.format.byteRate <= 0) return 0
    return Math.round((decoded.data.length / decoded.format.byteRate) * 1000)
  } catch {
    return 0
  }
}

function decodeWavBuffer(buffer: Buffer): WavDecoded {
  if (buffer.length < 44) throw new Error('COSYVOICE_TTS_WAV_TOO_SHORT')
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error('COSYVOICE_TTS_WAV_INVALID_HEADER')
  }
  let fmt: WavFormat | null = null
  let pcmData: Buffer | null = null
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize
    if (chunkEnd > buffer.length) throw new Error('COSYVOICE_TTS_WAV_CHUNK_OUT_OF_RANGE')
    if (chunkId === 'fmt ') {
      if (chunkSize < 16) throw new Error('COSYVOICE_TTS_WAV_FMT_INVALID')
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        numChannels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      }
    } else if (chunkId === 'data') {
      pcmData = buffer.subarray(chunkStart, chunkEnd)
    }
    offset = chunkEnd + (chunkSize % 2)
  }
  if (!fmt || !pcmData) throw new Error('COSYVOICE_TTS_WAV_MISSING_CHUNKS')
  return { format: fmt, data: Buffer.from(pcmData) }
}

function buildWavBuffer(format: WavFormat, pcmData: Buffer): Buffer {
  const headerSize = 44
  const output = Buffer.allocUnsafe(headerSize + pcmData.length)
  output.write('RIFF', 0, 'ascii')
  output.writeUInt32LE(36 + pcmData.length, 4)
  output.write('WAVE', 8, 'ascii')
  output.write('fmt ', 12, 'ascii')
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(format.audioFormat, 20)
  output.writeUInt16LE(format.numChannels, 22)
  output.writeUInt32LE(format.sampleRate, 24)
  output.writeUInt32LE(format.byteRate, 28)
  output.writeUInt16LE(format.blockAlign, 32)
  output.writeUInt16LE(format.bitsPerSample, 34)
  output.write('data', 36, 'ascii')
  output.writeUInt32LE(pcmData.length, 40)
  pcmData.copy(output, 44)
  return output
}

function isWavFormatEqual(left: WavFormat, right: WavFormat): boolean {
  return left.audioFormat === right.audioFormat
    && left.numChannels === right.numChannels
    && left.sampleRate === right.sampleRate
    && left.byteRate === right.byteRate
    && left.blockAlign === right.blockAlign
    && left.bitsPerSample === right.bitsPerSample
}

function mergeWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) throw new Error('COSYVOICE_TTS_SEGMENTS_EMPTY')
  if (buffers.length === 1) return buffers[0]
  const decoded = buffers.map((b) => decodeWavBuffer(b))
  const [first, ...rest] = decoded
  for (const item of rest) {
    if (!isWavFormatEqual(first.format, item.format)) {
      throw new Error('COSYVOICE_TTS_SEGMENT_WAV_FORMAT_MISMATCH')
    }
  }
  return buildWavBuffer(first.format, Buffer.concat(decoded.map((d) => d.data)))
}

const SPLIT_HINT_CHARS = new Set([
  '。', '！', '？', '；', '，', '、',
  '.', '!', '?', ';', ',', ':', '：',
  '\n',
])

function splitTextByLimit(text: string, maxChars: number): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const chars = Array.from(trimmed)
  if (chars.length <= maxChars) return [trimmed]
  const segments: string[] = []
  let cursor = 0
  while (cursor < chars.length) {
    const hardEnd = Math.min(cursor + maxChars, chars.length)
    if (hardEnd === chars.length) {
      const seg = chars.slice(cursor, hardEnd).join('').trim()
      if (seg) segments.push(seg)
      break
    }
    let splitPoint = hardEnd
    for (let index = hardEnd - 1; index > cursor; index -= 1) {
      if (SPLIT_HINT_CHARS.has(chars[index])) { splitPoint = index + 1; break }
    }
    const seg = chars.slice(cursor, splitPoint).join('').trim()
    if (!seg) throw new Error('COSYVOICE_TTS_SPLIT_FAILED')
    segments.push(seg)
    cursor = splitPoint
    while (cursor < chars.length && /\s/.test(chars[cursor])) cursor += 1
  }
  return segments
}

async function parseResponse(response: Response): Promise<CosyVoiceTTSResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try { return JSON.parse(raw) as CosyVoiceTTSResponse } catch { throw new Error('COSYVOICE_TTS_RESPONSE_INVALID_JSON') }
}

async function fetchAudioBuffer(audio: NonNullable<CosyVoiceTTSResponse['output']>['audio']): Promise<{ buffer: Buffer; url?: string }> {
  const b64 = readTrimmedString(audio?.data)
  const url = readTrimmedString(audio?.url)
  if (b64) return { buffer: Buffer.from(b64, 'base64'), url: url || undefined }
  if (!url) throw new Error('COSYVOICE_TTS_AUDIO_MISSING')
  const resp = await fetch(toFetchableUrl(url))
  if (!resp.ok) throw new Error(`COSYVOICE_TTS_AUDIO_DOWNLOAD_FAILED(${resp.status})`)
  return { buffer: Buffer.from(await resp.arrayBuffer()), url }
}

function clamp(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, value))
}

async function synthesizeSegment(params: CosyVoiceTTSInput & { apiKey: string }): Promise<{ audioBuffer: Buffer; audioUrl?: string; requestId?: string; characters: number; format: string }> {
  const languageHints = readTrimmedString(params.languageHints) || undefined
  const format = params.format || 'wav'
  const body: Record<string, unknown> = {
    model: params.modelId,
    input: {
      text: params.text,
      voice: params.voiceId,
      format,
      sample_rate: params.sampleRate || 24000,
      volume: clamp(params.volume, 0, 100) ?? 50,
      rate: clamp(params.rate, 0.5, 2.0) ?? 1.0,
      pitch: clamp(params.pitch, 0.5, 2.0) ?? 1.0,
      ...(languageHints ? { language_hints: [languageHints] } : {}),
      ...(readTrimmedString(params.instruction) ? { instruction: params.instruction } : {}),
    },
  }

  const response = await fetch(COSYVOICE_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await parseResponse(response)
  if (!response.ok) {
    throw new Error(`COSYVOICE_TTS_FAILED(${response.status}): ${readTrimmedString(data.code) || readTrimmedString(data.message) || 'unknown error'}`)
  }
  if (!data.output?.audio) throw new Error('COSYVOICE_TTS_OUTPUT_AUDIO_MISSING')
  const { buffer, url } = await fetchAudioBuffer(data.output.audio)
  return {
    audioBuffer: buffer,
    audioUrl: url,
    requestId: readTrimmedString(data.request_id) || undefined,
    characters: typeof data.usage?.characters === 'number' ? data.usage.characters : 0,
    format,
  }
}

export async function synthesizeWithCosyVoiceTTS(
  input: CosyVoiceTTSInput,
  apiKey: string,
): Promise<CosyVoiceTTSResult> {
  const text = readTrimmedString(input.text)
  const voiceId = readTrimmedString(input.voiceId)
  const modelId = readTrimmedString(input.modelId)
  if (!apiKey.trim()) return { success: false, error: 'BAILIAN_API_KEY_REQUIRED' }
  if (!text) return { success: false, error: 'COSYVOICE_TTS_TEXT_REQUIRED' }
  if (!voiceId) return { success: false, error: 'COSYVOICE_TTS_VOICE_ID_REQUIRED' }
  if (!modelId) return { success: false, error: 'COSYVOICE_TTS_MODEL_ID_REQUIRED' }

  const segments = splitTextByLimit(text, COSYVOICE_TTS_MAX_CHARS)
  if (segments.length === 0) return { success: false, error: 'COSYVOICE_TTS_TEXT_REQUIRED' }

  try {
    const buffers: Buffer[] = []
    let totalCharacters = 0
    let lastRequestId: string | undefined
    let firstAudioUrl: string | undefined
    let segFormat = 'wav'
    for (const segment of segments) {
      const result = await synthesizeSegment({ ...input, text: segment, apiKey })
      buffers.push(result.audioBuffer)
      totalCharacters += result.characters
      segFormat = result.format
      if (!firstAudioUrl && result.audioUrl) firstAudioUrl = result.audioUrl
      if (result.requestId) lastRequestId = result.requestId
    }
    // ponytail: 仅 wav 可无损拼接;mp3/pcm/opus 回退到最后一段 buffer。
    // 实际长度 <280 字时永远只有一段,这里只是防御。
    const merged = segFormat === 'wav' ? mergeWavBuffers(buffers) : buffers[buffers.length - 1]
    return {
      success: true,
      audioData: merged,
      audioDuration: segFormat === 'wav' ? getWavDurationFromBuffer(merged) : undefined,
      audioUrl: segments.length === 1 ? firstAudioUrl : undefined,
      requestId: lastRequestId,
      characters: totalCharacters,
      format: segFormat,
    }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'COSYVOICE_TTS_UNKNOWN_ERROR' }
  }
}
