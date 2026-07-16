import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { createProductionCanvasSnapshot } from '@/lib/production-canvas/service'

type RouteContext = { params: Promise<{ projectId: string }> }

export const POST = apiHandler(async (request: NextRequest, context: RouteContext) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as Record<string, unknown>
  const canvasId = typeof body.canvasId === 'string' && body.canvasId.trim() ? body.canvasId.trim() : ''
  if (!canvasId) {
    throw new ApiError('INVALID_PARAMS', { message: 'canvasId is required' })
  }

  const snapshot = await createProductionCanvasSnapshot({
    projectId,
    userId: authResult.session.user.id,
    canvasId,
    reason: typeof body.reason === 'string' ? body.reason : 'manual',
  })

  return NextResponse.json({ data: { snapshot } })
})
