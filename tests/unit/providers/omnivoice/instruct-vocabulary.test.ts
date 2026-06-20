import { describe, it, expect } from 'vitest'
import {
  validateOmnivoiceInstruct,
  OMNIVOICE_ZH_VOCABULARY,
  OMNIVOICE_EN_VOCABULARY,
} from '@/lib/providers/omnivoice/instruct-vocabulary'

describe('validateOmnivoiceInstruct', () => {
  it('rejects empty / whitespace-only input', () => {
    expect(validateOmnivoiceInstruct('')).toMatchObject({ ok: false, errorCode: 'OMNIVOICE_INSTRUCT_EMPTY' })
    expect(validateOmnivoiceInstruct('   ')).toMatchObject({ ok: false, errorCode: 'OMNIVOICE_INSTRUCT_EMPTY' })
    expect(validateOmnivoiceInstruct(null)).toMatchObject({ ok: false, errorCode: 'OMNIVOICE_INSTRUCT_EMPTY' })
  })

  it('accepts a single Chinese token', () => {
    const r = validateOmnivoiceInstruct('男')
    expect(r).toEqual({ ok: true, normalized: '男', language: 'zh' })
  })

  it('accepts multi-token Chinese with 、 separator', () => {
    const r = validateOmnivoiceInstruct('男、青年、中音调')
    expect(r).toEqual({ ok: true, normalized: '男、青年、中音调', language: 'zh' })
  })

  it('accepts Chinese with full-width comma as separator', () => {
    const r = validateOmnivoiceInstruct('男,青年,中音调')
    expect(r).toEqual({ ok: true, normalized: '男、青年、中音调', language: 'zh' })
  })

  it('accepts English instruct', () => {
    const r = validateOmnivoiceInstruct('male, young adult, low pitch')
    expect(r).toEqual({ ok: true, normalized: 'male, young adult, low pitch', language: 'en' })
  })

  it('lowercases English tokens', () => {
    const r = validateOmnivoiceInstruct('Male, Young Adult')
    expect(r).toMatchObject({ ok: true, normalized: 'male, young adult', language: 'en' })
  })

  it('dedupes repeated tokens preserving first-seen order', () => {
    const r = validateOmnivoiceInstruct('男、青年、男、中音调、青年')
    expect(r).toEqual({ ok: true, normalized: '男、青年、中音调', language: 'zh' })
  })

  it('rejects mixed Chinese + English', () => {
    const r = validateOmnivoiceInstruct('男, male')
    expect(r).toMatchObject({ ok: false, errorCode: 'OMNIVOICE_INSTRUCT_MIXED_LANGUAGE' })
  })

  it('rejects unknown Chinese tokens with the trigger words', () => {
    const r = validateOmnivoiceInstruct('青年男主音')
    expect(r).toMatchObject({
      ok: false,
      errorCode: 'OMNIVOICE_INSTRUCT_UNKNOWN_TOKEN',
      unknownTokens: ['青年男主音'],
    })
  })

  it('rejects unknown English tokens', () => {
    const r = validateOmnivoiceInstruct('male, broadcaster')
    expect(r).toMatchObject({
      ok: false,
      errorCode: 'OMNIVOICE_INSTRUCT_UNKNOWN_TOKEN',
      unknownTokens: ['broadcaster'],
    })
  })

  it('every Chinese vocab entry validates as a singleton', () => {
    for (const token of OMNIVOICE_ZH_VOCABULARY) {
      const r = validateOmnivoiceInstruct(token)
      expect(r).toEqual({ ok: true, normalized: token, language: 'zh' })
    }
  })

  it('every English vocab entry validates as a singleton', () => {
    for (const token of OMNIVOICE_EN_VOCABULARY) {
      const r = validateOmnivoiceInstruct(token)
      expect(r).toEqual({ ok: true, normalized: token, language: 'en' })
    }
  })
})
