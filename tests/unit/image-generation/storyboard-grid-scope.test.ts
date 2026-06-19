import { describe, expect, it } from 'vitest'
import {
  getImageGenerationCountConfig,
  getImageGenerationCountOptions,
  normalizeImageGenerationCount,
} from '@/lib/image-generation/count'

describe('storyboard-grid scope', () => {
  it('exposes 1..16 options with default=1', () => {
    const config = getImageGenerationCountConfig('storyboard-grid')
    expect(config).toEqual({
      defaultValue: 1,
      min: 1,
      max: 16,
      storageKey: 'image-count:storyboard-grid',
    })
    expect(getImageGenerationCountOptions('storyboard-grid')).toEqual(
      Array.from({ length: 16 }, (_v, i) => i + 1),
    )
  })

  it('clamps out-of-range values', () => {
    expect(normalizeImageGenerationCount('storyboard-grid', 0)).toBe(1)
    expect(normalizeImageGenerationCount('storyboard-grid', 99)).toBe(16)
    expect(normalizeImageGenerationCount('storyboard-grid', '6')).toBe(6)
    expect(normalizeImageGenerationCount('storyboard-grid', 'abc')).toBe(1)
  })
})
