import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { HISTORY_FIELD, parsePanelHistory } from '@/lib/novel-promotion/panel-history'

/**
 * GET /api/novel-promotion/[projectId]/panel/[panelId]/history?type=image|video
 *
 * Returns the panel's image/video history entries with resolved public URLs
 * and media metadata, sorted newest-first by timestamp.
 *
 * Older rows may have history arrays in ascending order (legacy `push()`
 * behavior); newer rows are prepended via archiveToHistory. Sorting by
 * timestamp descending handles both.
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; panelId: string }> },
) => {
  const { projectId, panelId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  if (type !== 'image' && type !== 'video') throw new ApiError('INVALID_PARAMS')
  const field = HISTORY_FIELD[type]

  // Scoped find: panel must belong to project through storyboard → episode → novelPromotionProject
  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      id: panelId,
      storyboard: { episode: { novelPromotionProject: { projectId } } },
    },
    select: { id: true, [field]: true },
  })
  if (!panel) throw new ApiError('NOT_FOUND')

  const entries = parsePanelHistory((panel as Record<string, unknown>)[field] as string | null)

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const storageKeys = entries.map((e) => e.url)
  const mediaObjects = storageKeys.length
    ? await prisma.mediaObject.findMany({
        where: { storageKey: { in: storageKeys } },
        select: { storageKey: true, publicId: true, mimeType: true, sizeBytes: true },
      })
    : []
  const mediaByKey = new Map(mediaObjects.map((m) => [m.storageKey, m]))

  const items = entries.map((e) => {
    const media = mediaByKey.get(e.url)
    return {
      url: e.url,
      publicUrl: media?.publicId ? `/m/${encodeURIComponent(media.publicId)}` : e.url,
      timestamp: e.timestamp,
      mimeType: media?.mimeType ?? null,
      sizeBytes: media?.sizeBytes != null ? Number(media.sizeBytes) : null,
    }
  })

  return NextResponse.json({ items })
})
