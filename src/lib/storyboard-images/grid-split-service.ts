import { prisma } from '@/lib/prisma'
import { toSignedUrlIfCos, uploadImageSourceToCos } from '@/lib/workers/utils'
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
  const response = await fetch(gridImageUrl)
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
