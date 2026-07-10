import {
  assembleLocationDescription,
  findLocationAsset,
  type PromptLocationAssetWithParent,
} from '@/lib/assets/location-hierarchy'

type PromptLocationImage = {
  isSelected?: boolean
  description?: string | null
  availableSlots?: string | null
}

type PromptLocationAsset = {
  name: string
  id?: string
  sceneType?: 'macro' | 'micro'
  parentId?: string | null
  parentName?: string | null
  summary?: string | null
  images?: PromptLocationImage[]
}

type Locale = 'zh' | 'en'

export function buildInsertPanelLocationsDescription(
  locations: PromptLocationAsset[],
  relatedLocations: string[],
  locale: Locale = 'zh',
): string {
  if (relatedLocations.length === 0) {
    return '无'
  }

  const lines: string[] = []
  for (const ref of relatedLocations) {
    const { found, parent } = findLocationAsset(
      locations as PromptLocationAssetWithParent[],
      ref,
    )
    if (!found) continue
    const text = assembleLocationDescription(found, parent, locale)
    // ponytail: micro 的 text 已经带 "{parent.name}: ...\n\n{found.name}: ..." 前缀
    // 只有 macro / 孤立 micro 需要我们加 "{name}: " 前缀。
    lines.push(parent ? text : `${found.name}: ${text}`)
  }

  return lines.length > 0 ? lines.join('\n') : '无'
}
