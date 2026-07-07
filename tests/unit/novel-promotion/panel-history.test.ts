import { describe, expect, it } from 'vitest'
import { archiveToHistory, parsePanelHistory } from '@/lib/novel-promotion/panel-history'

describe('parsePanelHistory', () => {
  it('returns empty array for null/undefined/empty', () => {
    expect(parsePanelHistory(null)).toEqual([])
    expect(parsePanelHistory(undefined)).toEqual([])
    expect(parsePanelHistory('')).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parsePanelHistory('not-json')).toEqual([])
    expect(parsePanelHistory('{broken')).toEqual([])
  })

  it('filters out malformed entries', () => {
    const raw = JSON.stringify([
      { url: 'images/a.png', timestamp: '2026-07-06T10:00:00.000Z' },
      { url: '', timestamp: '2026-07-06T11:00:00.000Z' },
      { timestamp: '2026-07-06T12:00:00.000Z' },
      'not-an-object',
    ])
    expect(parsePanelHistory(raw)).toEqual([
      { url: 'images/a.png', timestamp: '2026-07-06T10:00:00.000Z' },
    ])
  })

  it('parses well-formed history', () => {
    const raw = JSON.stringify([
      { url: 'images/a.png', timestamp: '2026-07-06T10:00:00.000Z' },
      { url: 'images/b.png', timestamp: '2026-07-06T11:00:00.000Z' },
    ])
    expect(parsePanelHistory(raw)).toHaveLength(2)
  })
})

describe('archiveToHistory', () => {
  it('returns "[]" when currentUrl empty', () => {
    expect(archiveToHistory(null, null)).toBe('[]')
    expect(archiveToHistory('[]', '')).toBe('[]')
    expect(archiveToHistory('[]', undefined)).toBe('[]')
  })

  it('prepends currentUrl to empty history', () => {
    const now = new Date('2026-07-06T10:00:00.000Z')
    const result = JSON.parse(archiveToHistory(null, 'images/a.png', now))
    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('images/a.png')
    expect(result[0].timestamp).toBe('2026-07-06T10:00:00.000Z')
  })

  it('prepends to existing history (newest first)', () => {
    const existing = JSON.stringify([
      { url: 'images/old.png', timestamp: '2026-07-05T00:00:00.000Z' },
    ])
    const now = new Date('2026-07-06T10:00:00.000Z')
    const result = JSON.parse(archiveToHistory(existing, 'images/new.png', now))
    expect(result).toHaveLength(2)
    expect(result[0].url).toBe('images/new.png')
    expect(result[1].url).toBe('images/old.png')
  })

  it('does not duplicate if currentUrl already at head', () => {
    const existing = JSON.stringify([
      { url: 'images/a.png', timestamp: '2026-07-06T10:00:00.000Z' },
    ])
    const result = JSON.parse(archiveToHistory(existing, 'images/a.png'))
    expect(result).toHaveLength(1)
  })

  it('handles garbage in existing history by resetting', () => {
    const now = new Date('2026-07-06T10:00:00.000Z')
    const result = JSON.parse(archiveToHistory('garbage', 'images/a.png', now))
    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('images/a.png')
  })
})
