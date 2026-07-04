import { describe, it, expect } from 'vitest'
import {
  normalizeRatio,
  buildFallbackPrompt,
  type CoverRatio,
} from '@/lib/workers/handlers/project-cover-image-task-handler'

// CoverContext isn't exported — derive it from the function signature.
type CoverContext = Parameters<typeof buildFallbackPrompt>[0]

function baseCtx(overrides: Partial<CoverContext> = {}): CoverContext {
  return {
    projectId: 'proj-test',
    projectName: '斗破苍穹',
    description: '少年逆袭修仙',
    artStylePrompt: null,
    artStyleId: null,
    charactersSummary: null,
    locationsSummary: null,
    storySummary: null,
    ratio: '1:1',
    imageModel: 'test-image-model',
    characterModel: null,
    locationModel: null,
    storyboardModel: null,
    analysisModel: 'test-analysis-model',
    imageResolution: null,
    ...overrides,
  }
}

describe('project cover handler — normalizeRatio', () => {
  it('defaults to 1:1 for null/undefined/invalid', () => {
    expect(normalizeRatio(null)).toBe('1:1')
    expect(normalizeRatio(undefined)).toBe('1:1')
    expect(normalizeRatio('')).toBe('1:1')
    expect(normalizeRatio('2:1')).toBe('1:1')
    expect(normalizeRatio(123)).toBe('1:1')
    expect(normalizeRatio({})).toBe('1:1')
  })

  it('accepts valid ratios', () => {
    expect(normalizeRatio('1:1')).toBe('1:1')
    expect(normalizeRatio('16:9')).toBe('16:9')
    expect(normalizeRatio('9:16')).toBe('9:16')
  })
})

describe('project cover handler — buildFallbackPrompt', () => {
  it('includes project name and description', () => {
    const plan = buildFallbackPrompt(baseCtx())
    expect(plan.imagePrompt).toContain('斗破苍穹')
    expect(plan.imagePrompt).toContain('少年逆袭修仙')
  })

  it('includes negative prompt covering text/watermark', () => {
    const plan = buildFallbackPrompt(baseCtx())
    expect(plan.negativePrompt.toLowerCase()).toMatch(/text|watermark/)
  })

  it('still works when description is empty', () => {
    const plan = buildFallbackPrompt(baseCtx({ description: '', projectName: 'OnlyName' }))
    expect(plan.imagePrompt).toContain('OnlyName')
    expect(plan.imagePrompt.length).toBeGreaterThan(10)
  })

  it('works for all ratios', () => {
    for (const ratio of ['1:1', '16:9', '9:16'] as CoverRatio[]) {
      const plan = buildFallbackPrompt(baseCtx({ ratio }))
      expect(plan.imagePrompt).toBeTruthy()
      expect(plan.negativePrompt).toBeTruthy()
    }
  })
})
