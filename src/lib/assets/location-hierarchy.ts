import {
  formatLocationAvailableSlotsText,
  parseLocationAvailableSlots,
} from '@/lib/location-available-slots'

export type PromptLocationAssetWithParent = {
  id?: string
  name: string
  sceneType: 'macro' | 'micro'
  summary?: string | null
  parentId?: string | null
  parentName?: string | null
  images?: Array<{
    isSelected?: boolean
    description?: string | null
    availableSlots?: string | null
  }>
}

type LibEntry = {
  name: string
  sceneType: 'macro' | 'micro'
  parentName?: string | null
}

export function buildLocationPathName(name: string, parentName: string | null | undefined): string {
  return parentName ? `${parentName}/${name}` : name
}

export function buildLocationLibList(entries: LibEntry[]): string {
  if (entries.length === 0) return ''
  return entries
    .map((e) => {
      const path = buildLocationPathName(e.name, e.parentName ?? null)
      return e.sceneType === 'micro' ? `${path}（局部）` : `${path}（大场景）`
    })
    .join('、')
}

export function formatLocationExistingInfo(loc: {
  name: string
  summary?: string | null
  sceneType: 'macro' | 'micro'
  parentName?: string | null
}): string {
  const path = buildLocationPathName(loc.name, loc.parentName ?? null)
  const summary = typeof loc.summary === 'string' && loc.summary.trim() ? loc.summary.trim() : ''
  return summary ? `${path}(${summary})` : path
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase()
}

export function findLocationAsset(
  locations: PromptLocationAssetWithParent[],
  ref: string | null,
): { found: PromptLocationAssetWithParent | null; parent: PromptLocationAssetWithParent | null } {
  if (!ref) return { found: null, parent: null }
  const trimmed = ref.trim()
  if (!trimmed) return { found: null, parent: null }
  const needle = normalizeForCompare(trimmed)

  const byId = new Map<string, PromptLocationAssetWithParent>()
  for (const l of locations) if (l.id) byId.set(l.id, l)

  // 1) exact full-name match (macro by name, or micro matched on full path stored as name)
  const exact = locations.find((l) => normalizeForCompare(l.name) === needle)
  if (exact) {
    const parent = exact.parentId ? byId.get(exact.parentId) ?? null : null
    return { found: exact, parent }
  }

  // 2) path suffix match — e.g. "林家老宅/正堂" against micro name "正堂" with parent name "林家老宅"
  for (const l of locations) {
    if (l.sceneType !== 'micro' || !l.parentId) continue
    const parent = byId.get(l.parentId)
    if (!parent) continue
    const full = normalizeForCompare(`${parent.name}/${l.name}`)
    if (full === needle) return { found: l, parent }
  }

  // 3) tail-only match against name; accept only if unique; otherwise take first
  const tail = needle.includes('/') ? needle.slice(needle.lastIndexOf('/') + 1) : needle
  const tailMatches = locations.filter((l) => normalizeForCompare(l.name) === tail)
  if (tailMatches.length === 1) {
    const found = tailMatches[0]
    const parent = found.parentId ? byId.get(found.parentId) ?? null : null
    return { found, parent }
  }

  // 4) ambiguous or nothing — return first tail match if any (caller logs a warning)
  if (tailMatches.length > 1) {
    const found = tailMatches[0]
    const parent = found.parentId ? byId.get(found.parentId) ?? null : null
    return { found, parent }
  }

  return { found: null, parent: null }
}

function getSelectedImage(loc: PromptLocationAssetWithParent) {
  return loc.images?.find((i) => i.isSelected) ?? loc.images?.[0] ?? null
}

export function assembleLocationDescription(
  found: PromptLocationAssetWithParent,
  parent: PromptLocationAssetWithParent | null,
  locale: 'zh' | 'en' = 'zh',
): string {
  const childImg = getSelectedImage(found)
  const childDesc = childImg?.description || '无'
  const childSlots = formatLocationAvailableSlotsText(
    parseLocationAvailableSlots(childImg?.availableSlots ?? null),
    locale,
  )
  const childText = childSlots ? `${childDesc}\n\n${childSlots}` : childDesc

  // ponytail: 大场景或孤立子场景（父被删）直接用自身描述；有父时父在前、子在后
  if (found.sceneType !== 'micro' || !parent) {
    return childText
  }

  const parentImg = getSelectedImage(parent)
  const parentDesc = parentImg?.description || parent.summary || '无'
  const parentSlots = formatLocationAvailableSlotsText(
    parseLocationAvailableSlots(parentImg?.availableSlots ?? null),
    locale,
  )
  const parentText = parentSlots ? `${parentDesc}\n\n${parentSlots}` : parentDesc

  return `${parent.name}: ${parentText}\n\n${found.name}: ${childText}`
}
