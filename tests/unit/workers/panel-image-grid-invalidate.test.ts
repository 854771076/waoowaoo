import { describe, it, expect } from 'vitest'
import { buildGridInvalidationPatch } from '@/lib/workers/handlers/panel-image-grid-invalidate'

describe('buildGridInvalidationPatch', () => {
  it('clears gridVideoPromptAt when layout is grid', () => {
    expect(buildGridInvalidationPatch('grid')).toEqual({ gridVideoPromptAt: null })
  })
  it('returns empty patch when layout is single', () => {
    expect(buildGridInvalidationPatch('single')).toEqual({})
  })
})
