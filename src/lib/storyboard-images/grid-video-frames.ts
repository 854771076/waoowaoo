import type { GridVideoSourceImage } from './grid-split'

export interface GridVideoFrame {
  cellIndex: number
  imageUrl: string
  enhancedImageUrl?: string
  imagePrompt?: string
  videoPrompt: string
  action?: string
  shotType?: string
  cameraMove?: string
  description?: string
  location?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseContext(gridGenerationContextJson: string | null | undefined): Record<string, unknown> {
  if (!gridGenerationContextJson) return {}
  try {
    return asRecord(JSON.parse(gridGenerationContextJson))
  } catch {
    return {}
  }
}

function extractGridCells(context: Record<string, unknown>): Map<number, Record<string, unknown>> {
  const preImageGridPrompt = asRecord(context.preImageGridPrompt)
  const gridCells = preImageGridPrompt.gridCells
  const result = new Map<number, Record<string, unknown>>()
  if (!Array.isArray(gridCells)) return result
  for (const cell of gridCells) {
    const record = asRecord(cell)
    const cellIndex = typeof record.cellIndex === 'number' ? Math.floor(record.cellIndex) : 0
    if (cellIndex > 0) result.set(cellIndex, record)
  }
  return result
}

function extractSplitImagesByIndex(context: Record<string, unknown>): Map<number, { imageUrl: string; enhancedImageUrl?: string }> {
  const images = context.gridSplitImages
  const result = new Map<number, { imageUrl: string; enhancedImageUrl?: string }>()
  if (!Array.isArray(images)) return result
  for (const item of images) {
    const record = asRecord(item)
    const rawImageUrl = pickText(record.imageUrl)
    const originalImageUrl = pickText(record.originalImageUrl)
    const explicitEnhancedImageUrl = pickText(record.enhancedImageUrl)
    const legacyEnhancedImageUrl = originalImageUrl && originalImageUrl !== rawImageUrl ? rawImageUrl : ''
    const imageUrl = originalImageUrl || rawImageUrl
    const enhancedImageUrl = explicitEnhancedImageUrl || legacyEnhancedImageUrl
    const cellIndex = typeof record.cellIndex === 'number' ? Math.floor(record.cellIndex) : 0
    if (cellIndex > 0 && imageUrl) {
      result.set(cellIndex, {
        imageUrl,
        enhancedImageUrl: enhancedImageUrl || undefined,
      })
    }
  }
  return result
}

export function buildGridVideoFrames(
  gridGenerationContextJson: string | null | undefined,
  images: GridVideoSourceImage[],
): GridVideoFrame[] {
  const context = parseContext(gridGenerationContextJson)
  const gridCellsByIndex = extractGridCells(context)
  return images
    .slice()
    .sort((left, right) => left.cellIndex - right.cellIndex)
    .map((image) => {
      const cell = gridCellsByIndex.get(image.cellIndex) || {}
      const videoPrompt = pickText(cell.videoPrompt) || pickText(cell.action) || `格 ${image.cellIndex}`
      return {
        cellIndex: image.cellIndex,
        imageUrl: image.imageUrl,
        enhancedImageUrl: image.enhancedImageUrl || undefined,
        imagePrompt: pickText(cell.imagePrompt) || undefined,
        videoPrompt,
        action: pickText(cell.action) || undefined,
        shotType: pickText(cell.shotType) || undefined,
        cameraMove: pickText(cell.cameraMove) || undefined,
        description: pickText(cell.description) || undefined,
        location: pickText(cell.location) || undefined,
      }
    })
}

export function buildGridVideoFramesContext(
  gridGenerationContextJson: string | null | undefined,
  images: GridVideoSourceImage[],
): string {
  const context = parseContext(gridGenerationContextJson)
  const frames = buildGridVideoFrames(gridGenerationContextJson, images)
  return JSON.stringify({
    ...context,
    gridVideoFrames: frames,
  }, null, 2)
}

export function extractGridVideoFrames(gridGenerationContextJson: string | null | undefined): GridVideoFrame[] {
  const context = parseContext(gridGenerationContextJson)
  const splitImagesByIndex = extractSplitImagesByIndex(context)
  const frames = context.gridVideoFrames
  if (!Array.isArray(frames)) return []
  const result: GridVideoFrame[] = []
  for (const frame of frames) {
    const record = asRecord(frame)
    const cellIndex = typeof record.cellIndex === 'number' ? Math.floor(record.cellIndex) : 0
    const splitImage = splitImagesByIndex.get(cellIndex)
    const imageUrl = splitImage?.imageUrl || pickText(record.originalImageUrl) || pickText(record.imageUrl)
    const enhancedImageUrl = pickText(record.enhancedImageUrl) || splitImage?.enhancedImageUrl || ''
    const videoPrompt = pickText(record.videoPrompt)
    if (cellIndex <= 0 || !imageUrl || !videoPrompt) continue
    result.push({
      cellIndex,
      imageUrl,
      enhancedImageUrl: enhancedImageUrl || undefined,
      imagePrompt: pickText(record.imagePrompt) || undefined,
      videoPrompt,
      action: pickText(record.action) || undefined,
      shotType: pickText(record.shotType) || undefined,
      cameraMove: pickText(record.cameraMove) || undefined,
      description: pickText(record.description) || undefined,
      location: pickText(record.location) || undefined,
    })
  }
  return result.sort((left, right) => left.cellIndex - right.cellIndex)
}

export function selectGridVideoFrameImages(
  frames: Array<Pick<GridVideoFrame, 'cellIndex' | 'imageUrl' | 'videoPrompt'>>,
): { firstImageUrl: string | null; lastImageUrl: string | null; aggregatePrompt: string } {
  const sorted = frames
    .filter((frame) => frame.imageUrl && frame.videoPrompt)
    .slice()
    .sort((left, right) => left.cellIndex - right.cellIndex)
  const first = sorted[0] || null
  const last = sorted[sorted.length - 1] || null
  return {
    firstImageUrl: first?.imageUrl || null,
    lastImageUrl: last?.imageUrl || null,
    aggregatePrompt: sorted.map((frame) => frame.videoPrompt).join('\n'),
  }
}

export function shouldUseGridFirstLastFrame(params: {
  supportsFirstLastFrame: boolean
  selection: { firstImageUrl: string | null; lastImageUrl: string | null; aggregatePrompt?: string }
}): boolean {
  return params.supportsFirstLastFrame && !!params.selection.firstImageUrl && !!params.selection.lastImageUrl
}
