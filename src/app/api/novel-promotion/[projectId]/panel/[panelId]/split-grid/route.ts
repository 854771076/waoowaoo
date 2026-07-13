import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ensureGridSplitImagesForPanel } from '@/lib/storyboard-images/grid-split-service'
import { extractGridSplitImages } from '@/lib/storyboard-images/grid-split'
import { extractGridVideoFrames } from '@/lib/storyboard-images/grid-video-frames'

function readPanelGridSize(contextJson: string | null | undefined, fallback: number): number {
  if (!contextJson) return fallback
  try {
    const parsed = JSON.parse(contextJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback
    const gridMetadata = (parsed as Record<string, unknown>).gridMetadata
    if (!gridMetadata || typeof gridMetadata !== 'object' || Array.isArray(gridMetadata)) return fallback
    const panelGridSize = (gridMetadata as Record<string, unknown>).panelGridSize
    return typeof panelGridSize === 'number' && panelGridSize > 1
      ? Math.floor(panelGridSize)
      : fallback
  } catch {
    return fallback
  }
}

function readRequestedGridSize(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const gridSize = (body as Record<string, unknown>).gridSize
  return typeof gridSize === 'number' && Number.isFinite(gridSize) && gridSize > 1
    ? Math.floor(gridSize)
    : null
}

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; panelId: string }> },
) => {
  const { projectId, panelId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      id: panelId,
      storyboard: { episode: { novelPromotionProject: { projectId } } },
    },
    select: { id: true, imageLayout: true, gridGenerationContext: true },
  })
  if (!panel) throw new ApiError('NOT_FOUND')
  if (panel.imageLayout !== 'grid') {
    throw new ApiError('INVALID_PARAMS', { code: 'GRID_SPLIT_PANEL_NOT_GRID' })
  }

  return NextResponse.json({
    images: extractGridSplitImages(panel.gridGenerationContext),
    frames: extractGridVideoFrames(panel.gridGenerationContext),
  })
})

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; panelId: string }> },
) => {
  const { projectId, panelId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      id: panelId,
      storyboard: { episode: { novelPromotionProject: { projectId } } },
    },
    select: {
      id: true,
      imageUrl: true,
      imageLayout: true,
      gridGenerationContext: true,
    },
  })
  if (!panel) throw new ApiError('NOT_FOUND')
  if (panel.imageLayout !== 'grid') {
    throw new ApiError('INVALID_PARAMS', { code: 'GRID_SPLIT_PANEL_NOT_GRID' })
  }

  const panelGridSize = readPanelGridSize(panel.gridGenerationContext, readRequestedGridSize(body) || 4)
  const force = !!(
    body
    && typeof body === 'object'
    && !Array.isArray(body)
    && (body as Record<string, unknown>).force === true
  )

  const result = await ensureGridSplitImagesForPanel({
    panel,
    panelGridSize,
    force,
  })

  return NextResponse.json({
    images: result.images,
    frames: result.frames,
    reused: result.reused,
  })
})
