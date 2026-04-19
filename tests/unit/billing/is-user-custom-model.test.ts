import { describe, it, expect } from 'vitest'
import { isUserCustomModel } from '@/lib/billing/service'

describe('billing/isUserCustomModel', () => {
  // Built-in models should return false
  it('returns false for built-in openai models', () => {
    expect(isUserCustomModel('openai:gpt-4o')).toBe(false)
    expect(isUserCustomModel('openai:gpt-3.5-turbo')).toBe(false)
  })

  it('returns false for built-in anthropic models', () => {
    expect(isUserCustomModel('anthropic:claude-3-opus')).toBe(false)
    expect(isUserCustomModel('anthropic:claude-3-sonnet')).toBe(false)
  })

  it('returns false for other built-in provider models', () => {
    expect(isUserCustomModel('google:gemini-1.5-pro')).toBe(false)
    expect(isUserCustomModel('fal:flux-1')).toBe(false)
    expect(isUserCustomModel('bailian:dashscope')).toBe(false)
    expect(isUserCustomModel('ark:doubao')).toBe(false)
  })

  // User-added models with double colons should return true
  it('returns true for user-added models under built-in providers', () => {
    expect(isUserCustomModel('openai::gpt-4o-my-custom')).toBe(true)
    expect(isUserCustomModel('anthropic::claude-3-custom-deployment')).toBe(true)
    expect(isUserCustomModel('openai::my-org:custom-model')).toBe(true)
  })

  // Non-built-in providers with double colons are user-added
  it('returns true for user-added models with custom provider', () => {
    expect(isUserCustomModel('my-provider::custom-model')).toBe(true)
    expect(isUserCustomModel('local::my-model')).toBe(true)
  })

  // No colon means built-in single-word model id
  it('returns false for models without colon', () => {
    expect(isUserCustomModel('builtin-model')).toBe(false)
    expect(isUserCustomModel('default')).toBe(false)
  })

  // Single colon means built-in model
  it('returns false for models with single colon', () => {
    expect(isUserCustomModel('openai:gpt-4')).toBe(false)
    expect(isUserCustomModel('anthropic:claude-3-5-sonnet')).toBe(false)
  })
})
