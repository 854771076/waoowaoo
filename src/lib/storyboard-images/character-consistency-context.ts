import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'

export interface PanelCharacterReference {
  name: string
  appearance?: string
  slot?: string
}

interface CharacterAppearanceLike {
  changeReason: string | null
  description?: string | null
  descriptions?: string | null
  imageUrls: string | null
  imageUrl: string | null
  selectedIndex: number | null
}

interface CharacterLike {
  name: string
  appearances?: CharacterAppearanceLike[]
}

export type CharacterConsistencyFallbackReason =
  | 'character_not_found'
  | 'requested_appearance_not_found'
  | 'appearance_not_found'

export interface CharacterConsistencyItem {
  name: string
  requestedAppearance: string | null
  resolvedAppearance: string | null
  description: string
  referenceImageUrl: string | null
  slot: string | null
  fallbackReason: CharacterConsistencyFallbackReason | null
  consistencyPrompt: string
  forbiddenChanges: string[]
}

export interface CharacterConsistencyContext {
  source: 'character_consistency_context'
  characters: CharacterConsistencyItem[]
}

function parseDescriptionList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function parseImageUrls(value: string | null | undefined): string[] {
  return decodeImageUrlsFromDb(value, 'characterAppearance.imageUrls')
}

function findCharacterByName<T extends { name: string }>(characters: T[], referenceName: string): T | undefined {
  const refLower = referenceName.toLowerCase().trim()
  if (!refLower) return undefined

  const exact = characters.find((character) => character.name.toLowerCase().trim() === refLower)
  if (exact) return exact

  const refAliases = refLower.split('/').map((item) => item.trim()).filter(Boolean)
  for (const character of characters) {
    const charAliases = character.name.toLowerCase().split('/').map((item) => item.trim()).filter(Boolean)
    const hasOverlap = refAliases.some((refAlias) => charAliases.includes(refAlias))
    if (hasOverlap) return character
  }

  return undefined
}

function pickAppearanceDescription(appearance: CharacterAppearanceLike | null): string {
  if (!appearance) return '无角色外貌数据'
  const descriptions = parseDescriptionList(appearance.descriptions || null)
  if (descriptions.length > 0) {
    const selectedIndex = typeof appearance.selectedIndex === 'number' ? appearance.selectedIndex : 0
    const selected = descriptions[selectedIndex] || descriptions[0]
    if (selected && selected.trim()) return selected.trim()
  }
  if (typeof appearance.description === 'string' && appearance.description.trim()) {
    return appearance.description.trim()
  }
  return '无描述'
}

function pickReferenceImageUrl(appearance: CharacterAppearanceLike | null): string | null {
  if (!appearance) return null
  const imageUrls = parseImageUrls(appearance.imageUrls)
  const selectedIndex = appearance.selectedIndex
  const selectedUrl = selectedIndex !== null && selectedIndex !== undefined ? imageUrls[selectedIndex] : null
  return selectedUrl || imageUrls[0] || appearance.imageUrl || null
}

function buildConsistencyPrompt(item: {
  name: string
  resolvedAppearance: string | null
  description: string
}) {
  const appearance = item.resolvedAppearance ? `外貌版本：${item.resolvedAppearance}。` : ''
  return `${item.name} 需要保持同一角色身份和外貌连续性。${appearance}固定外貌描述：${item.description}。`
}

export function buildCharacterConsistencyContext(params: {
  panelCharacters: PanelCharacterReference[]
  projectCharacters: CharacterLike[]
}): CharacterConsistencyContext {
  const forbiddenChanges = [
    '不要改变角色年龄、脸型、发型、服装主色和标志性配饰',
    '不要把同一角色画成不同人物或随机替换服装',
  ]

  return {
    source: 'character_consistency_context',
    characters: params.panelCharacters.map((reference) => {
      const character = findCharacterByName(params.projectCharacters, reference.name)
      if (!character) {
        const description = '无角色外貌数据'
        return {
          name: reference.name,
          requestedAppearance: reference.appearance || null,
          resolvedAppearance: null,
          description,
          referenceImageUrl: null,
          slot: reference.slot || null,
          fallbackReason: 'character_not_found',
          consistencyPrompt: buildConsistencyPrompt({
            name: reference.name,
            resolvedAppearance: null,
            description,
          }),
          forbiddenChanges,
        }
      }

      const appearances = character.appearances || []
      const matchedAppearance =
        reference.appearance
          ? appearances.find((appearance) => (appearance.changeReason || '').toLowerCase() === reference.appearance!.toLowerCase())
          : null
      const resolvedAppearance = matchedAppearance || appearances[0] || null
      const fallbackReason: CharacterConsistencyFallbackReason | null = (() => {
        if (matchedAppearance) return null
        if (reference.appearance) return 'requested_appearance_not_found'
        if (!resolvedAppearance) return 'appearance_not_found'
        return null
      })()
      const description = pickAppearanceDescription(resolvedAppearance)
      const resolvedAppearanceName = resolvedAppearance?.changeReason || null

      return {
        name: character.name,
        requestedAppearance: reference.appearance || null,
        resolvedAppearance: resolvedAppearanceName,
        description,
        referenceImageUrl: pickReferenceImageUrl(resolvedAppearance),
        slot: reference.slot || null,
        fallbackReason,
        consistencyPrompt: buildConsistencyPrompt({
          name: character.name,
          resolvedAppearance: resolvedAppearanceName,
          description,
        }),
        forbiddenChanges,
      }
    }),
  }
}
