import { NextRequest } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({}))
  const panelId = typeof body?.panelId === 'string' ? body.panelId.trim() : ''
  if (!panelId) {
    throw new ApiError('INVALID_PARAMS')
  }
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId: episodeId || null,
    type: TASK_TYPE.AI_GRID_VIDEO_PROMPT,
    targetType: 'NovelPromotionPanel',
    targetId: panelId,
    routePath: `/api/novel-promotion/${projectId}/ai-grid-video-prompt`,
    body,
    dedupeKey: `ai_grid_video_prompt:${panelId}`,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
