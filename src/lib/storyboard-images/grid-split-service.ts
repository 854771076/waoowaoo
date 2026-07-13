import { prisma } from '@/lib/prisma'
import { toFetchableUrl } from '@/lib/storage'
import { generateImage } from '@/lib/generator-api'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import { buildPromptAsync, PROMPT_IDS } from '@/lib/prompt-i18n'
import { toSignedUrlIfCos, uploadImageSourceToCos } from '@/lib/workers/utils'
import {
  collectPanelReferenceImages,
  findCharacterByName,
  parseImageUrls,
  parsePanelCharacterReferences,
  type PanelCharacterReference,
} from '@/lib/workers/handlers/image-task-handler-shared'
import {
  buildGridSplitImagesContext,
  cropAllGridImageBuffersForVideo,
  selectReusableGridSplitImages,
  type GridVideoSourceImage,
} from './grid-split'
import { extractGridVideoFrames, type GridVideoFrame } from './grid-video-frames'

export interface GridSplitPanelInput {
  id: string
  imageUrl: string | null
  gridGenerationContext: string | null
}

export interface EnsureGridSplitImagesForPanelParams {
  panel: GridSplitPanelInput
  panelGridSize: number
  force?: boolean
}

export interface EnsureGridSplitImagesForPanelResult {
  images: GridVideoSourceImage[]
  frames: GridVideoFrame[]
  gridGenerationContext: string
  reused: boolean
}

interface EnhanceGridSplitImagesForPanelParams {
  panel: GridSplitPanelInput & {
    characters?: string | null
    location?: string | null
    sketchImageUrl?: string | null
    directorShotUrls?: string[] | null
  }
  projectData: {
    videoRatio?: string | null
    characters?: Array<{
      name: string
      appearances?: Array<{
        changeReason: string | null
        description?: string | null
        descriptions?: string | null
        imageUrls: string | null
        imageUrl: string | null
        selectedIndex: number | null
      }>
    }>
    locations?: Array<{
      name: string
      images?: Array<{
        imageIndex?: number
        isSelected: boolean
        imageUrl: string | null
      }>
    }>
  }
  panelGridSize: number
  userId: string
  modelId: string
  projectId?: string | null
  locale?: 'zh' | 'en'
  cellIndex?: number | null
  onProgress?: (progress: { completed: number; total: number; cellIndex: number }) => Promise<void> | void
}

export interface EnhanceGridSplitImagesForPanelResult {
  images: GridVideoSourceImage[]
  frames: GridVideoFrame[]
  gridGenerationContext: string
  enhancedCount: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isCharacterSheetAppearance(appearance: {
  changeReason: string | null
  description?: string | null
  descriptions?: string | null
}): boolean {
  const descriptions = (() => {
    if (!appearance.descriptions) return []
    try {
      const parsed = JSON.parse(appearance.descriptions)
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    } catch {
      return []
    }
  })()
  const text = [
    appearance.changeReason,
    appearance.description,
    ...descriptions,
  ].map((item) => item || '').join(' ').toLowerCase()
  return text.includes('三视图')
    || text.includes('三面图')
    || text.includes('三视')
    || text.includes('three-view')
    || text.includes('turnaround')
    || text.includes('turn around')
}

function collectCharacterSheetReferenceImages(
  projectCharacters: NonNullable<EnhanceGridSplitImagesForPanelParams['projectData']['characters']>,
  panelCharacters: PanelCharacterReference[],
): string[] {
  const refs: string[] = []
  for (const panelCharacter of panelCharacters) {
    const character = findCharacterByName(projectCharacters, panelCharacter.name)
    const sheetAppearance = character?.appearances?.find(isCharacterSheetAppearance)
    if (!sheetAppearance) continue
    const imageUrls = parseImageUrls(sheetAppearance.imageUrls, 'characterAppearance.imageUrls')
    const selectedIndex = sheetAppearance.selectedIndex
    const selectedUrl = selectedIndex !== null && selectedIndex !== undefined ? imageUrls[selectedIndex] : null
    for (const url of [selectedUrl, ...imageUrls, sheetAppearance.imageUrl]) {
      const signed = toSignedUrlIfCos(url, 3600)
      if (signed && !refs.includes(signed)) refs.push(signed)
    }
  }
  return refs
}

function parseGridContext(gridGenerationContextJson: string | null | undefined): Record<string, unknown> {
  if (!gridGenerationContextJson) return {}
  try {
    return asRecord(JSON.parse(gridGenerationContextJson))
  } catch {
    return {}
  }
}

function isEnhancedGridSplitImage(image: GridVideoSourceImage): boolean {
  const originalImageUrl = pickText(asRecord(image).originalImageUrl)
  const imageUrl = pickText(image.imageUrl)
  return !!originalImageUrl
    || imageUrl.startsWith('images/grid-video-source-enhanced-')
    || imageUrl.includes('/grid-video-source-enhanced-')
}

async function buildEnhancedPrompt(params: {
  cellIndex: number
  panelGridSize: number
  frame: GridVideoFrame | undefined
  projectId?: string | null
  locale?: 'zh' | 'en'
}) {
  const frame = params.frame
  return await buildPromptAsync({
    promptId: PROMPT_IDS.NP_PANEL_GRID_ENHANCE,
    locale: params.locale || 'zh',
    projectId: params.projectId,
    variables: {
      cell_index: String(params.cellIndex),
      panel_grid_size: String(params.panelGridSize),
      image_prompt: frame?.imagePrompt || '',
      video_prompt: frame?.videoPrompt || '',
      description: frame?.description || '',
      location: frame?.location || '',
    },
  })
}

function updateGridContextWithEnhancedImages(params: {
  gridGenerationContextJson: string | null | undefined
  enhancedImages: GridVideoSourceImage[]
  frames: GridVideoFrame[]
  modelId: string
}): string {
  const context = parseGridContext(params.gridGenerationContextJson)
  return JSON.stringify({
    ...context,
    gridSplitImages: params.enhancedImages,
    gridVideoFrames: params.frames,
    gridEnhanceMetadata: {
      source: 'grid_split_image_enhance',
      modelId: params.modelId,
      enhancedAt: new Date().toISOString(),
      enhancedCount: params.enhancedImages.length,
    },
  }, null, 2)
}

export async function ensureGridSplitImagesForPanel(
  params: EnsureGridSplitImagesForPanelParams,
): Promise<EnsureGridSplitImagesForPanelResult> {
  const panelGridSize = Math.floor(params.panelGridSize)
  if (panelGridSize <= 1) {
    throw new Error('GRID_SPLIT_INVALID_SIZE')
  }
  if (!params.panel.imageUrl) {
    throw new Error('GRID_SPLIT_IMAGE_REQUIRED')
  }

  const reusable = params.force
    ? []
    : selectReusableGridSplitImages(params.panel.gridGenerationContext, {
      panelGridSize,
      sourceGridImageUrl: params.panel.imageUrl,
    })

  if (reusable.length > 0) {
    return {
      images: reusable,
      frames: extractGridVideoFrames(params.panel.gridGenerationContext),
      gridGenerationContext: params.panel.gridGenerationContext || '',
      reused: true,
    }
  }

  const gridImageUrl = toSignedUrlIfCos(params.panel.imageUrl, 3600)
  if (!gridImageUrl) {
    throw new Error('GRID_SPLIT_IMAGE_URL_INVALID')
  }
  const response = await fetch(toFetchableUrl(gridImageUrl))
  if (!response.ok) {
    throw new Error(`GRID_SPLIT_IMAGE_DOWNLOAD_FAILED:${response.status}`)
  }

  const gridImageBuffer = Buffer.from(await response.arrayBuffer())
  const splitBuffers = await cropAllGridImageBuffersForVideo({
    imageBuffer: gridImageBuffer,
    panelGridSize,
    minOutputWidth: 768,
  })
  const images: GridVideoSourceImage[] = []
  for (const split of splitBuffers) {
    const imageUrl = await uploadImageSourceToCos(
      split.buffer,
      'grid-video-source',
      `${params.panel.id}-${split.cellIndex}`,
    )
    images.push({
      imageUrl,
      cellIndex: split.cellIndex,
      panelGridSize,
    })
  }

  const gridGenerationContext = buildGridSplitImagesContext(params.panel.gridGenerationContext, {
    panelGridSize,
    sourceGridImageUrl: params.panel.imageUrl,
    images,
  })

  await prisma.novelPromotionPanel.update({
    where: { id: params.panel.id },
    data: { gridGenerationContext },
  })

  return {
    images,
    frames: extractGridVideoFrames(gridGenerationContext),
    gridGenerationContext,
    reused: false,
  }
}

export async function enhanceGridSplitImagesForPanel(
  params: EnhanceGridSplitImagesForPanelParams,
): Promise<EnhanceGridSplitImagesForPanelResult> {
  const splitResult = await ensureGridSplitImagesForPanel({
    panel: params.panel,
    panelGridSize: params.panelGridSize,
    force: false,
  })
  const framesByIndex = new Map(splitResult.frames.map((frame) => [frame.cellIndex, frame]))
  const panelCharacters = parsePanelCharacterReferences(params.panel.characters)
  const assetRefs = [
    ...await collectPanelReferenceImages(params.projectData, params.panel),
    ...collectCharacterSheetReferenceImages(params.projectData.characters || [], panelCharacters),
  ]
  const uniqueAssetRefs = Array.from(new Set(assetRefs))
  const aspectRatio = params.projectData.videoRatio || '16:9'
  const requestedCellIndex = typeof params.cellIndex === 'number' && Number.isFinite(params.cellIndex)
    ? Math.floor(params.cellIndex)
    : null
  const targetImages = requestedCellIndex
    ? splitResult.images.filter((image) => image.cellIndex === requestedCellIndex)
    : splitResult.images.filter((image) => !isEnhancedGridSplitImage(image))
  if (requestedCellIndex && targetImages.length === 0) {
    throw new Error(`GRID_SPLIT_ENHANCE_CELL_NOT_FOUND:${requestedCellIndex}`)
  }
  if (targetImages.length === 0) {
    return {
      images: splitResult.images,
      frames: splitResult.frames,
      gridGenerationContext: splitResult.gridGenerationContext,
      enhancedCount: 0,
    }
  }
  const enhancedByIndex = new Map<number, GridVideoSourceImage>()
  let completed = 0
  let enhancedCount = 0

  for (const image of targetImages) {
    const sourceImage = toSignedUrlIfCos(image.imageUrl, 3600)
    if (!sourceImage) {
      enhancedByIndex.set(image.cellIndex, image)
      completed += 1
      await params.onProgress?.({ completed, total: targetImages.length, cellIndex: image.cellIndex })
      continue
    }
    const referenceImages = await normalizeReferenceImagesForGeneration([
      sourceImage,
      ...uniqueAssetRefs,
    ], {
      context: {
        panelId: params.panel.id,
        cellIndex: image.cellIndex,
        source: 'grid_split_image_enhance',
      },
    })
    const prompt = await buildEnhancedPrompt({
      cellIndex: image.cellIndex,
      panelGridSize: image.panelGridSize,
      frame: framesByIndex.get(image.cellIndex),
      projectId: params.projectId,
      locale: params.locale,
    })
    const generated = await generateImage(params.userId, params.modelId, prompt, {
      referenceImages,
      aspectRatio,
      resolution: '1080p',
    })
    if (!generated.success) {
      throw new Error(generated.error || `GRID_SPLIT_ENHANCE_FAILED:${image.cellIndex}`)
    }
    const generatedSource = generated.imageUrl || generated.imageBase64
    if (!generatedSource) {
      throw new Error(`GRID_SPLIT_ENHANCE_EMPTY_RESULT:${image.cellIndex}`)
    }
    const enhancedUrl = await uploadImageSourceToCos(
      generatedSource,
      'grid-video-source-enhanced',
      `${params.panel.id}-${image.cellIndex}`,
    )
    enhancedByIndex.set(image.cellIndex, {
      ...image,
      imageUrl: enhancedUrl,
      originalImageUrl: pickText(asRecord(image).originalImageUrl) || image.imageUrl,
    } as GridVideoSourceImage)
    enhancedCount += 1
    completed += 1
    await params.onProgress?.({ completed, total: targetImages.length, cellIndex: image.cellIndex })
  }

  const enhancedImages = splitResult.images.map((image) => enhancedByIndex.get(image.cellIndex) || image)
  const enhancedFrames = splitResult.frames.map((frame) => {
    const enhancedImage = enhancedImages.find((image) => image.cellIndex === frame.cellIndex)
    return enhancedImage ? { ...frame, imageUrl: enhancedImage.imageUrl } : frame
  })
  const gridGenerationContext = updateGridContextWithEnhancedImages({
    gridGenerationContextJson: splitResult.gridGenerationContext,
    enhancedImages,
    frames: enhancedFrames,
    modelId: params.modelId,
  })

  await prisma.novelPromotionPanel.update({
    where: { id: params.panel.id },
    data: { gridGenerationContext },
  })

  return {
    images: enhancedImages,
    frames: enhancedFrames,
    gridGenerationContext,
    enhancedCount,
  }
}
