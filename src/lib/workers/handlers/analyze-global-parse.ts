import { safeParseJsonObject } from '@/lib/json-repair'

export const CHUNK_SIZE = 3000
const INVALID_LOCATION_KEYWORDS = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']

export type CharacterBrief = {
  id: string
  name: string
  aliases: string[]
  introduction: string
}

export type AnalyzeGlobalCharactersData = {
  new_characters?: Array<Record<string, unknown>>
  updated_characters?: Array<Record<string, unknown>>
  characters?: Array<Record<string, unknown>>
}

export type SubLocationRaw = {
  name?: unknown
  summary?: unknown
  description?: unknown
  descriptions?: unknown
  available_slots?: unknown
}

export type LocationRaw = {
  name?: unknown
  summary?: unknown
  description?: unknown
  descriptions?: unknown
  available_slots?: unknown
  sub_locations?: unknown
  local_scenes?: unknown
  micro_locations?: unknown
  children?: unknown
}

export type AnalyzeGlobalLocationsData = {
  locations?: LocationRaw[]
}

export function asLocationRecordArray(value: unknown): LocationRaw[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  ) as LocationRaw[]
}

export function asSubLocationArray(value: unknown): SubLocationRaw[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  ) as SubLocationRaw[]
}

export function extractSubLocationArray(location: LocationRaw): SubLocationRaw[] {
  for (const value of [
    location.sub_locations,
    location.local_scenes,
    location.micro_locations,
    location.children,
  ]) {
    const rows = asSubLocationArray(value)
    if (rows.length > 0) return rows
  }
  return []
}

export type AnalyzeGlobalPropsData = {
  props?: Array<Record<string, unknown>>
}

export function chunkContent(text: string, maxSize = CHUNK_SIZE): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\n+/)
  let current = ''

  for (const p of paragraphs) {
    if (current.length + p.length + 2 > maxSize) {
      if (current.trim()) chunks.push(current.trim())
      current = p
    } else {
      current += (current ? '\n\n' : '') + p
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export function parseJsonResponse(responseText: string): Record<string, unknown> {
  return safeParseJsonObject(responseText)
}

export function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => readText(item).trim()).filter(Boolean)
}

export function parseAliases(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return toStringArray(parsed)
  } catch {
    return []
  }
}

export function buildCharactersLibInfo(characters: CharacterBrief[]): string {
  if (characters.length === 0) return '暂无已有角色'
  return characters
    .map((c, i) => {
      const aliasStr = c.aliases.length > 0 ? `别名：${c.aliases.join('、')}` : '别名：无'
      const introStr = c.introduction ? `介绍：${c.introduction}` : '介绍：暂无'
      return `${i + 1}. ${c.name}\n   ${aliasStr}\n   ${introStr}`
    })
    .join('\n\n')
}

export function isInvalidLocation(name: string, summary: string): boolean {
  return INVALID_LOCATION_KEYWORDS.some((keyword) => name.includes(keyword) || summary.includes(keyword))
}

export function safeParseCharactersResponse(responseText: string): AnalyzeGlobalCharactersData {
  try {
    const parsed = parseJsonResponse(responseText) as AnalyzeGlobalCharactersData
    if (!parsed.new_characters && Array.isArray(parsed.characters)) {
      parsed.new_characters = parsed.characters
    }
    return parsed
  } catch {
    return {}
  }
}

export function safeParseLocationsResponse(responseText: string): AnalyzeGlobalLocationsData {
  try {
    return parseJsonResponse(responseText) as AnalyzeGlobalLocationsData
  } catch {
    return {}
  }
}

export function safeParsePropsResponse(responseText: string): AnalyzeGlobalPropsData {
  try {
    return parseJsonResponse(responseText) as AnalyzeGlobalPropsData
  } catch {
    return {}
  }
}
