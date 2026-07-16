import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProductionCanvasAction } from '@/lib/production-canvas/service'
import { locales, type Locale } from '@/i18n/routing'

type RouteContext = { params: Promise<{ projectId: string }> }

function readRequiredString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function readLocale(value: unknown): Locale | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return locales.includes(normalized as Locale) ? normalized as Locale : undefined
}

export const POST = apiHandler(async (request: NextRequest, context: RouteContext) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as Record<string, unknown>
  const canvasId = readRequiredString(body.canvasId)
  const nodeId = readRequiredString(body.nodeId)
  const actionKey = readRequiredString(body.actionKey)
  if (!canvasId || !nodeId || !actionKey) {
    throw new ApiError('INVALID_PARAMS', { message: 'canvasId, nodeId and actionKey are required' })
  }

  const result = await executeProductionCanvasAction({
    projectId,
    userId: authResult.session.user.id,
    canvasId,
    nodeId,
    actionKey,
    locale: readLocale(body.locale),
  })

  return NextResponse.json({ data: result })
})
