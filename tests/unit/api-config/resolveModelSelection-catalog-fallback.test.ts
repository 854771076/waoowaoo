import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreference: {
      findUnique: vi.fn().mockResolvedValue({ customModels: '[]', customProviders: '[]' }),
    },
  },
}))

import { resolveModelSelection, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { ensureBailianCatalogRegistered } from '@/lib/providers/bailian'
import { ensureOmnivoiceCatalogRegistered } from '@/lib/providers/omnivoice'

describe('resolveModelSelection — catalog fallback', () => {
  beforeEach(() => {
    ensureBailianCatalogRegistered()
    ensureOmnivoiceCatalogRegistered()
  })

  it('accepts omnivoice::omnivoice-tts-v1 when not in user customModels', async () => {
    const sel = await resolveModelSelection('user1', 'omnivoice::omnivoice-tts-v1', 'audio')
    expect(sel.provider).toBe('omnivoice')
    expect(sel.modelId).toBe('omnivoice-tts-v1')
    expect(sel.mediaType).toBe('audio')
  })

  it('accepts bailian::qwen3-tts-vd-2026-01-26 when not in user customModels', async () => {
    const sel = await resolveModelSelection('user1', 'bailian::qwen3-tts-vd-2026-01-26', 'audio')
    expect(sel.provider).toBe('bailian')
    expect(sel.modelId).toBe('qwen3-tts-vd-2026-01-26')
  })

  it('rejects unknown audio model not in catalog', async () => {
    await expect(resolveModelSelection('user1', 'fake::nonexistent', 'audio'))
      .rejects.toThrow(/MODEL_NOT_FOUND/)
  })

  it('does NOT fall back for llm modality (preserves existing behavior)', async () => {
    await expect(resolveModelSelection('user1', 'bailian::qwen3.5-plus', 'llm'))
      .rejects.toThrow(/MODEL_NOT_FOUND/)
  })
})

describe('resolveModelSelectionOrSingle — catalog fallback with multiple models', () => {
  beforeEach(() => {
    ensureBailianCatalogRegistered()
    ensureOmnivoiceCatalogRegistered()
  })

  it('returns first catalog model when no model specified and multiple catalog audio models exist', async () => {
    const sel = await resolveModelSelectionOrSingle('user1', null, 'audio')
    expect(sel).toBeDefined()
    expect(sel.mediaType).toBe('audio')
    // When multiple catalog models exist, the first registered one is used as default
    expect(sel.modelKey).toBeTruthy()
  })

  it('returns explicitly specified model even when multiple catalog models exist', async () => {
    const sel = await resolveModelSelectionOrSingle('user1', 'omnivoice::omnivoice-tts-v1', 'audio')
    expect(sel.provider).toBe('omnivoice')
    expect(sel.modelId).toBe('omnivoice-tts-v1')
  })

  it('returns explicitly specified bailian model when provided', async () => {
    const sel = await resolveModelSelectionOrSingle('user1', 'bailian::qwen3-tts-vd-2026-01-26', 'audio')
    expect(sel.provider).toBe('bailian')
    expect(sel.modelId).toBe('qwen3-tts-vd-2026-01-26')
  })
})
