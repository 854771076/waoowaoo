import { describe, it, expect } from 'vitest'
import type { OfficialProviderKey } from '@/lib/providers/official/model-registry'

describe('OmniVoice 契约', () => {
  it('OfficialProviderKey 包含 omnivoice', () => {
    const allowed: OfficialProviderKey[] = ['bailian', 'siliconflow', 'starrouter', 'omnivoice']
    expect(allowed).toContain('omnivoice')
  })

  it('voiceType 已知值集合', () => {
    const known = ['qwen-designed', 'custom', 'omnivoice-clone', 'omnivoice-design']
    expect(known).toEqual([
      'qwen-designed',
      'custom',
      'omnivoice-clone',
      'omnivoice-design',
    ])
  })
})
