import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { ensureGridSplitImagesForPanel } from '@/lib/storyboard-images/grid-split-service'
import { extractGridSplitImages } from '@/lib/storyboard-images/grid-split'
import { extractGridVideoFrames } from '@/lib/storyboard-images/grid-video-frames'
import { buildImageBillingPayload, getProjectModelConfig } from '@/lib/config-service'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { withTaskUiPayload } from '@/lib/task/ui-payload'

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

function readRequestedCellIndex(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const cellIndex = (body as Record<string, unknown>).cellIndex
  return typeof cellIndex === 'number' && Number.isFinite(cellIndex) && cellIndex > 0
    ? Math.floor(cellIndex)
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
  const locale = resolveRequiredTaskLocale(request, body)
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
      storyboard: { select: { episodeId: true } },
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
  const enhance = !!(
    body
    && typeof body === 'object'
    && !Array.isArray(body)
    && (body as Record<string, unknown>).enhance === true
  )

  if (enhance) {
    const modelConfig = await getProjectModelConfig(projectId, authResult.session.user.id)
    const imageModel = modelConfig.editModel || modelConfig.storyboardModel
    if (!imageModel) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'GRID_SPLIT_ENHANCE_MODEL_NOT_CONFIGURED',
        message: 'editModel or storyboardModel is required for grid split enhancement',
      })
    }
    const cellIndex = readRequestedCellIndex(body)
    const payload = {
      panelGridSize,
      ...(cellIndex ? { cellIndex } : {}),
      count: cellIndex ? 1 : panelGridSize,
      imageModel,
    }
    let billingPayload: Record<string, unknown>
    try {
      billingPayload = await buildImageBillingPayload({
        projectId,
        userId: authResult.session.user.id,
        imageModel,
        basePayload: payload,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image model capability not configured'
      throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
    }
    const result = await submitTask({
      userId: authResult.session.user.id,
      locale,
      requestId: getRequestId(request),
      projectId,
      episodeId: panel.storyboard.episodeId,
      type: TASK_TYPE.GRID_SPLIT_ENHANCE,
      targetType: 'NovelPromotionPanel',
      targetId: panel.id,
      payload: withTaskUiPayload(billingPayload, {
        intent: 'modify',
        hasOutputAtStart: true,
      }),
      dedupeKey: `grid_split_enhance:${panel.id}:${cellIndex || 'all'}`,
    })

    return NextResponse.json({
      ...result,
      enhanced: true,
      cellIndex,
      panelGridSize,
    })
  }

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
