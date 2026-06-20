import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildOmniVoiceError } from './_helpers'

vi.mock('@/lib/providers/omnivoice/client', () => ({
  getOmnivoiceClient: vi.fn(),
}))

import { getOmnivoiceClient } from '@/lib/providers/omnivoice/client'
import { createOmnivoiceVoiceDesign } from '@/lib/providers/omnivoice/voice-design'

describe('createOmnivoiceVoiceDesign', () => {
  const createProfile = vi.fn()
  const generateSpeech = vi.fn()
  beforeEach(() => {
    createProfile.mockReset()
    generateSpeech.mockReset()
    ;(getOmnivoiceClient as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      design: { createProfile, generateSpeech },
    })
  })

  it('passes a normalized Chinese instruct (deduped, 、-joined) and language=zh', async () => {
    createProfile.mockResolvedValue({ id: 'prof_d1', name: 'vv_user1234_Hero', kind: 'design' })
    generateSpeech.mockResolvedValue({
      audio: new Uint8Array([1, 2, 3, 4]),
      audioId: 'a',
      audioPath: 'p',
      audioDurationSec: 1,
      generationTimeSec: 1,
      seed: 0,
      contentType: 'audio/wav',
      routingStatus: null,
      routingReason: null,
    })

    // Mixed separators + duplicates — the validator should normalize to
    // a deduped、-joined form before reaching the SDK.
    const r = await createOmnivoiceVoiceDesign({
      voicePrompt: '男, 青年、中音调,男',
      previewText: '你好世界',
      preferredName: 'Hero',
      language: 'zh',
      userId: 'user1234ext',
    })

    expect(createProfile).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'design',
      name: 'vv_user1234_Hero',
      vdStates: { Style: 'Auto' },
      instruct: '男、青年、中音调',
      language: 'zh',
    }))
    expect(generateSpeech).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'prof_d1',
      text: '你好世界',
      language: 'zh',
    }))
    expect(r.success).toBe(true)
    expect(r.profileId).toBe('prof_d1')
    expect(typeof r.audioBase64).toBe('string')
    expect(r.audioBase64!.length).toBeGreaterThan(0)
    expect(r.responseFormat).toBe('wav')
  })

  it('passes an English instruct as-is (lowercased) and infers language=en when params.language unset', async () => {
    createProfile.mockResolvedValue({ id: 'prof_en', kind: 'design' })
    generateSpeech.mockResolvedValue({
      audio: new Uint8Array([0, 1]),
      audioId: 'a2',
      audioPath: 'p2',
      audioDurationSec: 1,
      generationTimeSec: 1,
      seed: 0,
      contentType: 'audio/wav',
      routingStatus: null,
      routingReason: null,
    })

    const r = await createOmnivoiceVoiceDesign({
      voicePrompt: 'Male, Young Adult, low pitch',
      previewText: 'hello',
      // language intentionally omitted — should fall back to validator's detected language
      userId: 'u1',
    })

    expect(createProfile).toHaveBeenCalledWith(expect.objectContaining({
      instruct: 'male, young adult, low pitch',
      language: 'en',
    }))
    expect(r.success).toBe(true)
  })

  it('rejects empty voicePrompt before any SDK call', async () => {
    const r = await createOmnivoiceVoiceDesign({
      voicePrompt: '',
      previewText: 't',
      userId: 'u',
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('OMNIVOICE_VOICE_PROMPT_REQUIRED')
    expect(createProfile).not.toHaveBeenCalled()
  })

  it('rejects free-form Chinese (e.g. "青年男主音") locally with UNKNOWN_TOKEN before SDK call', async () => {
    const r = await createOmnivoiceVoiceDesign({
      voicePrompt: '青年男主音',
      previewText: 't',
      userId: 'u',
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('OMNIVOICE_INSTRUCT_UNKNOWN_TOKEN')
    expect(r.error).toContain('青年男主音')
    expect(createProfile).not.toHaveBeenCalled()
  })

  it('rejects mixed-language instruct locally before SDK call', async () => {
    const r = await createOmnivoiceVoiceDesign({
      voicePrompt: '男, male',
      previewText: 't',
      userId: 'u',
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('OMNIVOICE_INSTRUCT_MIXED_LANGUAGE')
    expect(createProfile).not.toHaveBeenCalled()
  })

  it('returns mapped error on createProfile failure (instruct already valid)', async () => {
    createProfile.mockRejectedValue(buildOmniVoiceError(500, { detail: 'down' }, 'down'))
    const r = await createOmnivoiceVoiceDesign({
      voicePrompt: '男',
      previewText: '你好',
      userId: 'u',
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('OMNIVOICE_BACKEND_ERROR')
  })
})
