export type PanelHistoryEntry = { url: string; timestamp: string }
export type PanelMediaType = 'image' | 'video'

export const HISTORY_FIELD = {
  image: 'imageHistory',
  video: 'videoHistory',
} as const

const ENTRY_SHAPE = (e: unknown): e is PanelHistoryEntry =>
  !!e && typeof e === 'object' && typeof (e as PanelHistoryEntry).url === 'string'
  && (e as PanelHistoryEntry).url.length > 0
  && typeof (e as PanelHistoryEntry).timestamp === 'string'

export function parsePanelHistory(raw: string | null | undefined): PanelHistoryEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(ENTRY_SHAPE)
  } catch {
    return []
  }
}

export function archiveToHistory(
  rawHistory: string | null | undefined,
  currentUrl: string | null | undefined,
  now: Date = new Date(),
): string {
  const url = typeof currentUrl === 'string' ? currentUrl.trim() : ''
  if (!url) return rawHistory || '[]'
  const existing = parsePanelHistory(rawHistory)
  if (existing[0]?.url === url) return JSON.stringify(existing)
  const entry: PanelHistoryEntry = { url, timestamp: now.toISOString() }
  return JSON.stringify([entry, ...existing.filter((e) => e.url !== url)])
}
