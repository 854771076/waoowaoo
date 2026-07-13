import type { Character, CharacterAppearance, Location } from '@/types/project'
import type { VideoPanel } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'

export type VideoReferenceImageKind = 'source' | 'lastFrame' | 'character' | 'characterSheet' | 'location'

export interface VideoReferenceImageChoice {
  id: string
  kind: VideoReferenceImageKind
  url: string
  label: string
  required: boolean
  selectedByDefault: boolean
  ownerId?: string
}

interface BuildVideoReferenceImageChoicesParams {
  panel: Pick<VideoPanel, 'imageUrl' | 'textPanel'>
  nextPanel?: Pick<VideoPanel, 'imageUrl'> | null
  characters: Character[]
  locations: Location[]
  includeLastFrame?: boolean
  includeCharacterSheet?: boolean
  characterImagesPerPerson?: number
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeName(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function pushUniqueUrl(urls: string[], url: string | null | undefined): void {
  const normalized = normalizeText(url)
  if (!normalized || urls.includes(normalized)) return
  urls.push(normalized)
}

function getPanelCharacterNames(panel: Pick<VideoPanel, 'textPanel'>): string[] {
  const rawCharacters = panel.textPanel?.characters
  if (!Array.isArray(rawCharacters)) return []

  const names: string[] = []
  for (const item of rawCharacters) {
    const name = typeof item === 'string' ? item : item?.name
    const normalized = normalizeText(name)
    if (normalized && !names.some((existing) => normalizeName(existing) === normalizeName(normalized))) {
      names.push(normalized)
    }
  }
  return names
}

function resolveAppearanceSelectedUrl(appearance: CharacterAppearance): string | null {
  if (
    typeof appearance.selectedIndex === 'number'
    && appearance.selectedIndex >= 0
    && appearance.selectedIndex < appearance.imageUrls.length
  ) {
    const selected = normalizeText(appearance.imageUrls[appearance.selectedIndex])
    if (selected) return selected
  }
  return normalizeText(appearance.imageUrl) || appearance.imageUrls.map(normalizeText).find(Boolean) || null
}

function resolveCharacterReferenceUrls(appearance: CharacterAppearance, limit: number): string[] {
  const urls: string[] = []
  pushUniqueUrl(urls, resolveAppearanceSelectedUrl(appearance))
  for (const imageUrl of appearance.imageUrls) {
    pushUniqueUrl(urls, imageUrl)
    if (urls.length >= limit) break
  }
  return urls.slice(0, limit)
}

function isCharacterSheetAppearance(appearance: CharacterAppearance): boolean {
  const text = [
    appearance.changeReason,
    appearance.description,
    ...(appearance.descriptions || []),
  ].map(normalizeText).join(' ').toLowerCase()
  return text.includes('三视图')
    || text.includes('三面图')
    || text.includes('three-view')
    || text.includes('turnaround')
    || text.includes('turn around')
}

function resolveSelectedLocationImage(location: Location) {
  if (location.selectedImageId) {
    const selectedById = location.images.find((image) => image.id === location.selectedImageId)
    if (selectedById?.imageUrl) return selectedById
  }
  return location.images.find((image) => image.isSelected && image.imageUrl)
    || location.images.find((image) => image.imageUrl)
    || null
}

export function buildVideoReferenceImageChoices({
  panel,
  nextPanel,
  characters,
  locations,
  includeLastFrame = false,
  includeCharacterSheet = false,
  characterImagesPerPerson = 2,
}: BuildVideoReferenceImageChoicesParams): VideoReferenceImageChoice[] {
  const choices: VideoReferenceImageChoice[] = []
  const sourceUrl = normalizeText(panel.imageUrl)
  if (sourceUrl) {
    choices.push({
      id: 'source',
      kind: 'source',
      url: sourceUrl,
      label: '视频源图',
      required: true,
      selectedByDefault: true,
    })
  }

  const lastFrameUrl = includeLastFrame ? normalizeText(nextPanel?.imageUrl) : ''
  if (lastFrameUrl) {
    choices.push({
      id: 'lastFrame',
      kind: 'lastFrame',
      url: lastFrameUrl,
      label: '尾帧图',
      required: true,
      selectedByDefault: true,
    })
  }

  const currentCharacterNames = getPanelCharacterNames(panel)
  const characterLimit = Math.max(1, Math.min(2, Math.floor(characterImagesPerPerson)))
  for (const characterName of currentCharacterNames) {
    const character = characters.find((item) => normalizeName(item.name) === normalizeName(characterName))
    if (!character) continue
    const normalAppearance = character.appearances.find((appearance) => !isCharacterSheetAppearance(appearance))
      || character.appearances[0]
    if (normalAppearance) {
      resolveCharacterReferenceUrls(normalAppearance, characterLimit).forEach((url, index) => {
        choices.push({
          id: `character:${character.id}:${normalAppearance.id}:${index}`,
          kind: 'character',
          url,
          label: character.name,
          required: false,
          selectedByDefault: index === 0,
          ownerId: character.id,
        })
      })
    }
    if (includeCharacterSheet) {
      const sheetAppearance = character.appearances.find(isCharacterSheetAppearance)
      const sheetUrl = sheetAppearance ? resolveAppearanceSelectedUrl(sheetAppearance) : null
      if (sheetAppearance && sheetUrl) {
        choices.push({
          id: `character-sheet:${character.id}:${sheetAppearance.id}`,
          kind: 'characterSheet',
          url: sheetUrl,
          label: `${character.name} 三视图`,
          required: false,
          selectedByDefault: false,
          ownerId: character.id,
        })
      }
    }
  }

  const panelLocationName = normalizeText(panel.textPanel?.location)
  if (panelLocationName) {
    const location = locations.find((item) => normalizeName(item.name) === normalizeName(panelLocationName))
    const selectedImage = location ? resolveSelectedLocationImage(location) : null
    if (location && selectedImage?.imageUrl) {
      choices.push({
        id: `location:${location.id}`,
        kind: 'location',
        url: selectedImage.imageUrl,
        label: location.name,
        required: false,
        selectedByDefault: true,
        ownerId: location.id,
      })
    }
  }

  return choices
}

export function getDefaultSelectedVideoReferenceImageIds(choices: VideoReferenceImageChoice[]): Set<string> {
  return new Set(choices.filter((choice) => choice.required || choice.selectedByDefault).map((choice) => choice.id))
}

export function resolveSelectedVideoReferenceImages(
  choices: VideoReferenceImageChoice[],
  selectedIds: Set<string>,
): string[] {
  const urls: string[] = []
  for (const choice of choices) {
    if (!choice.required && !selectedIds.has(choice.id)) continue
    pushUniqueUrl(urls, choice.url)
  }
  return urls
}
