import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  getOrCreateProductionCanvas,
  saveProductionCanvasLayout,
} from '@/lib/production-canvas/service'
import type { ProductionCanvasSaveInput } from '@/lib/production-canvas/types'

type RouteContext = { params: Promise<{ projectId: string }> }

export const GET = apiHandler(async (_request: NextRequest, context: RouteContext) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const canvas = await getOrCreateProductionCanvas(projectId, authResult.session.user.id)
  return NextResponse.json({ data: { canvas } })
})

export const PATCH = apiHandler(async (request: NextRequest, context: RouteContext) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as { canvasId?: unknown; layout?: ProductionCanvasSaveInput }
  const canvasId = typeof body.canvasId === 'string' && body.canvasId.trim() ? body.canvasId.trim() : ''
  if (!canvasId) {
    throw new ApiError('INVALID_PARAMS', { message: 'canvasId is required' })
  }

  const canvas = await saveProductionCanvasLayout({
    projectId,
    userId: authResult.session.user.id,
    canvasId,
    input: body.layout || {},
  })

  return NextResponse.json({ data: { canvas } })
})
