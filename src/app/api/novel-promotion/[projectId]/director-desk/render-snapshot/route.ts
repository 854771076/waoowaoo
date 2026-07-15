import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getProjectModelConfig, resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { parseDirectorProject, type DirectorSnapshot } from '@/lib/director-desk/schema'
import { resolveModelSelection } from '@/lib/api-config'
import { prisma } from '@/lib/prisma'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { hasPanelImageOutput } from '@/lib/task/has-output'
import { TASK_TYPE } from '@/lib/task/types'
import { withTaskUiPayload } from '@/lib/task/ui-payload'

function isTriplet(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

function parseSnapshotInput(value: unknown): DirectorSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (typeof input.id !== 'string' || !input.id) return null
  if (typeof input.name !== 'string') return null
  if (typeof input.cameraId !== 'string' || !input.cameraId) return null
  if (typeof input.capturedAt !== 'number' || !Number.isFinite(input.capturedAt)) return null
  if (!input.camera || typeof input.camera !== 'object' || Array.isArray(input.camera)) return null
  const camera = input.camera as Record<string, unknown>
  if (typeof camera.fov !== 'number' || !Number.isFinite(camera.fov)) return null
  if (!isTriplet(camera.position)) return null
  if (!isTriplet(camera.target)) return null
  const project = parseDirectorProject(input.project)
  if (!project) return null

  return {
    id: input.id,
    name: input.name,
    capturedAt: input.capturedAt,
    project,
    cameraId: input.cameraId,
    camera: {
      fov: camera.fov,
      position: camera.position,
      target: camera.target,
    },
    imageDataUrl: typeof input.imageDataUrl === 'string' ? input.imageDataUrl : undefined,
    imageUrl: typeof input.imageUrl === 'string' ? input.imageUrl : null,
    note: typeof input.note === 'string' ? input.note : undefined,
  }
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => null) as {
    panelId?: unknown
    snapshot?: unknown
    locale?: unknown
  } | null
  const panelId = typeof body?.panelId === 'string' ? body.panelId : ''
  const snapshot = parseSnapshotInput(body?.snapshot)
  if (!panelId || !snapshot) throw new ApiError('INVALID_PARAMS')

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    include: {
      storyboard: {
        include: {
          episode: { include: { novelPromotionProject: true } },
        },
      },
    },
  })
  if (!panel || panel.storyboard.episode.novelPromotionProject.projectId !== projectId) {
    throw new ApiError('NOT_FOUND')
  }

  const projectModelConfig = await getProjectModelConfig(projectId, session.user.id)
  if (!projectModelConfig.storyboardModel) {
    throw new ApiError('INVALID_PARAMS', { code: 'STORYBOARD_MODEL_NOT_CONFIGURED' })
  }
  try {
    await resolveModelSelection(session.user.id, projectModelConfig.storyboardModel, 'image')
  } catch (error) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'STORYBOARD_MODEL_INVALID',
      message: error instanceof Error ? error.message : 'Storyboard image model is invalid',
    })
  }

  const generationOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId,
    userId: session.user.id,
    modelType: 'image',
    modelKey: projectModelConfig.storyboardModel,
  })
  const locale = resolveRequiredTaskLocale(request, body)
  const payload = {
    source: 'director_snapshot',
    panelId,
    candidateCount: 1,
    panelGridSize: 1,
    imageModel: projectModelConfig.storyboardModel,
    directorSnapshot: snapshot,
    ...(Object.keys(generationOptions).length > 0 ? { generationOptions } : {}),
  }
  const hasOutputAtStart = await hasPanelImageOutput(panelId)
  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
	    projectId,
	    type: TASK_TYPE.IMAGE_PANEL,
	    targetType: 'DirectorDeskSnapshot',
	    targetId: `${panelId}:${snapshot.id}`,
	    payload: withTaskUiPayload(payload, {
	      intent: 'regenerate',
	      hasOutputAtStart,
    }),
    dedupeKey: `director_snapshot:${panelId}:${snapshot.id}:${snapshot.capturedAt}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, payload),
  })

  return NextResponse.json(result)
})
