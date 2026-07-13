import { buildStoryboardGridLayout } from './grid'
import { buildGridVideoFrames } from './grid-video-frames'

export interface GridCellCrop {
  cellIndex?: number
  left: number
  top: number
  width: number
  height: number
}

export interface GridVideoSourceImage {
  imageUrl: string
  cellIndex: number
  panelGridSize: number
}

interface GridSplitMetadata {
  panelGridSize: number
  sourceGridImageUrl: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeCellIndex(cellIndex: number, panelGridSize: number): number {
  if (!Number.isFinite(cellIndex)) return 1
  return Math.max(1, Math.min(panelGridSize, Math.floor(cellIndex)))
}

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function computeGridCellCrop(params: {
  width: number
  height: number
  panelGridSize: number
  cellIndex?: number
}): GridCellCrop {
  const layout = buildStoryboardGridLayout('grid_auto', params.panelGridSize)
  const cellIndex = normalizeCellIndex(params.cellIndex ?? 1, layout.panelCount)
  const zeroBased = cellIndex - 1
  const column = zeroBased % layout.columns
  const row = Math.floor(zeroBased / layout.columns)
  const baseWidth = Math.floor(params.width / layout.columns)
  const baseHeight = Math.floor(params.height / layout.rows)
  const left = column * baseWidth
  const top = row * baseHeight
  const width = column === layout.columns - 1 ? params.width - left : baseWidth
  const height = row === layout.rows - 1 ? params.height - top : baseHeight
  return { left, top, width, height }
}

export function computeAllGridCellCrops(params: {
  width: number
  height: number
  panelGridSize: number
}): Array<GridCellCrop & { cellIndex: number }> {
  const layout = buildStoryboardGridLayout('grid_auto', params.panelGridSize)
  return Array.from({ length: layout.panelCount }, (_, index) => {
    const cellIndex = index + 1
    return {
      cellIndex,
      ...computeGridCellCrop({
        width: params.width,
        height: params.height,
        panelGridSize: params.panelGridSize,
        cellIndex,
      }),
    }
  })
}

export async function cropGridImageBufferForVideo(params: {
  imageBuffer: Buffer
  panelGridSize: number
  cellIndex?: number
  minOutputWidth?: number
}): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const metadata = await sharp(params.imageBuffer).metadata()
  const width = metadata.width
  const height = metadata.height
  if (!width || !height) {
    throw new Error('GRID_SPLIT_INVALID_IMAGE_METADATA')
  }
  const crop = computeGridCellCrop({
    width,
    height,
    panelGridSize: params.panelGridSize,
    cellIndex: params.cellIndex ?? 1,
  })
  let pipeline = sharp(params.imageBuffer).extract(crop)
  if (params.minOutputWidth && crop.width < params.minOutputWidth) {
    const scale = params.minOutputWidth / crop.width
    pipeline = pipeline.resize({
      width: params.minOutputWidth,
      height: Math.round(crop.height * scale),
      fit: 'fill',
      kernel: 'lanczos3',
    })
  }
  return await pipeline.jpeg({ quality: 95, mozjpeg: true })
    .toBuffer()
}

export async function cropAllGridImageBuffersForVideo(params: {
  imageBuffer: Buffer
  panelGridSize: number
  minOutputWidth?: number
}): Promise<Array<{ cellIndex: number; buffer: Buffer }>> {
  const layout = buildStoryboardGridLayout('grid_auto', params.panelGridSize)
  const result: Array<{ cellIndex: number; buffer: Buffer }> = []
  for (let index = 1; index <= layout.panelCount; index += 1) {
    result.push({
      cellIndex: index,
      buffer: await cropGridImageBufferForVideo({
        imageBuffer: params.imageBuffer,
        panelGridSize: params.panelGridSize,
        cellIndex: index,
        minOutputWidth: params.minOutputWidth,
      }),
    })
  }
  return result
}

export function extractGridVideoSourceImage(
  gridGenerationContextJson: string | null | undefined,
): GridVideoSourceImage | null {
  if (!gridGenerationContextJson) return null
  try {
    const parsed = JSON.parse(gridGenerationContextJson)
    const sourceImage = asRecord(asRecord(parsed).gridVideoSourceImage)
    const imageUrl = typeof sourceImage.imageUrl === 'string' ? sourceImage.imageUrl.trim() : ''
    const cellIndex = typeof sourceImage.cellIndex === 'number' ? Math.floor(sourceImage.cellIndex) : 0
    const panelGridSize = typeof sourceImage.panelGridSize === 'number' ? Math.floor(sourceImage.panelGridSize) : 0
    if (!imageUrl || cellIndex <= 0 || panelGridSize <= 1) return null
    return { imageUrl, cellIndex, panelGridSize }
  } catch {
    return null
  }
}

export function buildGridVideoSourceImageContext(
  gridGenerationContextJson: string | null | undefined,
  sourceImage: GridVideoSourceImage,
): string {
  let parsed: Record<string, unknown> = {}
  if (gridGenerationContextJson) {
    try {
      parsed = asRecord(JSON.parse(gridGenerationContextJson))
    } catch {
      parsed = {}
    }
  }
  return JSON.stringify({
    ...parsed,
    gridVideoSourceImage: sourceImage,
  }, null, 2)
}

export function extractGridSplitImages(
  gridGenerationContextJson: string | null | undefined,
): GridVideoSourceImage[] {
  if (!gridGenerationContextJson) return []
  try {
    const parsed = JSON.parse(gridGenerationContextJson)
    const images = asRecord(parsed).gridSplitImages
    if (!Array.isArray(images)) return []
    return images
      .map((item) => {
        const record = asRecord(item)
        const imageUrl = typeof record.imageUrl === 'string' ? record.imageUrl.trim() : ''
        const cellIndex = typeof record.cellIndex === 'number' ? Math.floor(record.cellIndex) : 0
        const panelGridSize = typeof record.panelGridSize === 'number' ? Math.floor(record.panelGridSize) : 0
        return imageUrl && cellIndex > 0 && panelGridSize > 1
          ? { imageUrl, cellIndex, panelGridSize }
          : null
      })
      .filter((item): item is GridVideoSourceImage => item !== null)
  } catch {
    return []
  }
}

function extractGridSplitMetadata(gridGenerationContextJson: string | null | undefined): GridSplitMetadata | null {
  if (!gridGenerationContextJson) return null
  try {
    const parsed = asRecord(JSON.parse(gridGenerationContextJson))
    const metadata = asRecord(parsed.gridSplitMetadata)
    const panelGridSize = typeof metadata.panelGridSize === 'number' ? Math.floor(metadata.panelGridSize) : 0
    const sourceGridImageUrl = pickText(metadata.sourceGridImageUrl) || null
    if (panelGridSize <= 1) return null
    return { panelGridSize, sourceGridImageUrl }
  } catch {
    return null
  }
}

export function selectReusableGridSplitImages(
  gridGenerationContextJson: string | null | undefined,
  params: { panelGridSize: number; sourceGridImageUrl: string | null | undefined },
): GridVideoSourceImage[] {
  const metadata = extractGridSplitMetadata(gridGenerationContextJson)
  if (!metadata) return []
  const sourceGridImageUrl = pickText(params.sourceGridImageUrl)
  if (!sourceGridImageUrl || metadata.sourceGridImageUrl !== sourceGridImageUrl) return []
  if (metadata.panelGridSize !== params.panelGridSize) return []
  const images = extractGridSplitImages(gridGenerationContextJson)
    .filter((image) => image.panelGridSize === params.panelGridSize)
    .sort((left, right) => left.cellIndex - right.cellIndex)
  const expectedIndexes = new Set(Array.from({ length: params.panelGridSize }, (_, index) => index + 1))
  for (const image of images) {
    expectedIndexes.delete(image.cellIndex)
  }
  return expectedIndexes.size === 0 ? images : []
}

export function buildGridSplitImagesContext(
  gridGenerationContextJson: string | null | undefined,
  params: { panelGridSize: number; images: GridVideoSourceImage[]; sourceGridImageUrl?: string | null },
): string {
  let parsed: Record<string, unknown> = {}
  if (gridGenerationContextJson) {
    try {
      parsed = asRecord(JSON.parse(gridGenerationContextJson))
    } catch {
      parsed = {}
    }
  }
  const firstImage = params.images.find((image) => image.cellIndex === 1) || params.images[0] || null
  const gridVideoFrames = buildGridVideoFrames(gridGenerationContextJson, params.images)
  return JSON.stringify({
    ...parsed,
    gridSplitMetadata: {
      panelGridSize: params.panelGridSize,
      sourceGridImageUrl: params.sourceGridImageUrl || null,
    },
    gridSplitImages: params.images,
    gridVideoFrames,
    ...(firstImage ? { gridVideoSourceImage: firstImage } : {}),
  }, null, 2)
}
