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
  panel: Pick<VideoPanel, 'imageUrl' | 'textPanel' | 'directorStoryboardBoards'>
  nextPanel?: Pick<VideoPanel, 'imageUrl'> | null
  characters: Character[]
  locations: Location[]
  includeLastFrame?: boolean
  includeCharacterSheet?: boolean
  directorStoryboardBoardId?: string
  characterImagesPerPerson?: number
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeName(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function normalizeComparableName(value: unknown): string {
  return normalizeName(value).replace(/[\s/／、,，;；:：()（）[\]【】《》"'“”‘’._-]+/g, '')
}

function splitNameAliases(value: unknown): string[] {
  return normalizeText(value)
    .split(/[\/／、,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function pushUniqueUrl(urls: string[], url: string | null | undefined): void {
  const normalized = normalizeText(url)
  if (!normalized || urls.includes(normalized)) return
  urls.push(normalized)
}

function collectAppearanceImageUrls(appearance: CharacterAppearance): string[] {
  const urls: string[] = []
  pushUniqueUrl(urls, resolveAppearanceSelectedUrl(appearance))
  for (const imageUrl of appearance.imageUrls) {
    pushUniqueUrl(urls, imageUrl)
  }
  return urls
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

function characterMatchesPanelName(character: Character, panelName: string): boolean {
  const panelNames = splitNameAliases(panelName)
  if (panelNames.length === 0) return false
  const characterNames = [
    ...splitNameAliases(character.name),
    ...(Array.isArray(character.aliases) ? character.aliases.flatMap(splitNameAliases) : []),
  ]
  return panelNames.some((panelAlias) => {
    const normalizedPanelAlias = normalizeComparableName(panelAlias)
    if (!normalizedPanelAlias) return false
    return characterNames.some((characterAlias) => {
      const normalizedCharacterAlias = normalizeComparableName(characterAlias)
      return normalizedCharacterAlias === normalizedPanelAlias
        || normalizedCharacterAlias.includes(normalizedPanelAlias)
        || normalizedPanelAlias.includes(normalizedCharacterAlias)
    })
  })
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

function collectLocationImages(location: Location) {
  const selectedImage = resolveSelectedLocationImage(location)
  const images = []
  if (selectedImage?.imageUrl) images.push(selectedImage)
  for (const image of location.images) {
    if (!image.imageUrl) continue
    if (images.some((item) => item.imageUrl === image.imageUrl)) continue
    images.push(image)
  }
  return images
}

function locationMatchesPanelName(location: Location, panelName: string): boolean {
  const normalizedPanelLocation = normalizeComparableName(panelName)
  const normalizedLocationName = normalizeComparableName(location.name)
  if (!normalizedPanelLocation || !normalizedLocationName) return false
  return normalizedLocationName === normalizedPanelLocation
    || normalizedLocationName.includes(normalizedPanelLocation)
    || normalizedPanelLocation.includes(normalizedLocationName)
}

export function buildVideoReferenceImageChoices({
  panel,
  nextPanel,
  characters,
  locations,
  includeLastFrame = false,
  includeCharacterSheet = false,
  directorStoryboardBoardId,
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
  } else {
    const directorStoryboardBoards = panel.directorStoryboardBoards ?? []
    const selectedDirectorBoard = directorStoryboardBoards.find((board) => board.id === directorStoryboardBoardId)
      || directorStoryboardBoards[0]
    const directorSourceUrl = normalizeText(selectedDirectorBoard?.coverImageUrl)
    if (selectedDirectorBoard && directorSourceUrl) {
      choices.push({
        id: `source:director-storyboard:${selectedDirectorBoard.id}`,
        kind: 'source',
        url: directorSourceUrl,
        label: selectedDirectorBoard.name || '导演分镜图',
        required: true,
        selectedByDefault: true,
      })
    }
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
  const defaultCharacterLimit = Math.max(1, Math.min(2, Math.floor(characterImagesPerPerson)))
  const matchedCharacters = characters.filter((character) =>
    currentCharacterNames.some((characterName) => characterMatchesPanelName(character, characterName)),
  )
  const characterChoices = matchedCharacters.length > 0
    ? matchedCharacters.map((character) => ({ character, matched: true }))
    : currentCharacterNames.length > 0
      // 资产命名和分镜称呼不一致时仍展示角色资产，方便人工检查并手动勾选。
      ? characters.map((character) => ({ character, matched: false }))
      : []
  for (const { character, matched } of characterChoices) {
    const normalAppearance = character.appearances.find((appearance) => !isCharacterSheetAppearance(appearance))
      || character.appearances[0]
    if (normalAppearance) {
      const defaultUrls = new Set(resolveCharacterReferenceUrls(normalAppearance, defaultCharacterLimit))
      collectAppearanceImageUrls(normalAppearance).forEach((url, index) => {
        choices.push({
          id: `character:${character.id}:${normalAppearance.id}:${index}`,
          kind: 'character',
          url,
          label: character.name,
          required: false,
          selectedByDefault: matched && defaultUrls.has(url) && index === 0,
          ownerId: character.id,
        })
      })
    }
    const sheetAppearance = character.appearances.find(isCharacterSheetAppearance)
    if (sheetAppearance) {
      collectAppearanceImageUrls(sheetAppearance).forEach((url, index) => {
        choices.push({
          id: `character-sheet:${character.id}:${sheetAppearance.id}:${index}`,
          kind: 'characterSheet',
          url,
          label: `${character.name} 三视图`,
          required: false,
          selectedByDefault: matched && includeCharacterSheet && index === 0,
          ownerId: character.id,
        })
      })
    }
  }

  const panelLocationName = normalizeText(panel.textPanel?.location)
  if (panelLocationName) {
    const matchedLocations = locations.filter((item) => locationMatchesPanelName(item, panelLocationName))
    const locationChoices = matchedLocations.length > 0
      ? matchedLocations.map((location) => ({ location, matched: true }))
      // 场景名来自文本分镜，可能是“客厅一角”等局部称呼；匹配不到时仍展示项目场景图供人工选择。
      : locations.map((location) => ({ location, matched: false }))
    for (const { location, matched } of locationChoices) {
      const selectedImage = resolveSelectedLocationImage(location)
      collectLocationImages(location).forEach((image) => {
        if (!image.imageUrl) return
        choices.push({
          id: `location:${location.id}:${image.imageIndex}`,
          kind: 'location',
          url: image.imageUrl,
          label: location.name,
          required: false,
          selectedByDefault: matched && selectedImage?.imageUrl === image.imageUrl,
          ownerId: location.id,
        })
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
