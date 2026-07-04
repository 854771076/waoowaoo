import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'

const VALID_RATIOS = new Set(['1:1', '16:9', '9:16'])

// PATCH - 更新项目封面字段（coverMediaId / coverImageRatio）
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({} as Record<string, unknown>))

  const hasCoverMediaId = Object.prototype.hasOwnProperty.call(body, 'coverMediaId')
  const hasCoverImageRatio = Object.prototype.hasOwnProperty.call(body, 'coverImageRatio')

  if (!hasCoverMediaId && !hasCoverImageRatio) {
    throw new ApiError('INVALID_PARAMS', { message: 'Provide coverMediaId and/or coverImageRatio' })
  }

  let coverMediaId: string | null | undefined
  if (hasCoverMediaId) {
    const raw = (body as { coverMediaId?: unknown }).coverMediaId
    if (raw === null) {
      coverMediaId = null
    } else if (typeof raw === 'string' && raw.trim()) {
      const media = await prisma.mediaObject.findUnique({ where: { id: raw } })
      if (!media) {
        throw new ApiError('NOT_FOUND', { message: 'MediaObject not found' })
      }
      coverMediaId = raw
    } else {
      throw new ApiError('INVALID_PARAMS', { message: 'coverMediaId must be a string or null' })
    }
  }

  let coverImageRatio: string | null | undefined
  if (hasCoverImageRatio) {
    const raw = (body as { coverImageRatio?: unknown }).coverImageRatio
    if (raw === null) {
      coverImageRatio = null
    } else if (typeof raw === 'string' && VALID_RATIOS.has(raw)) {
      coverImageRatio = raw
    } else {
      throw new ApiError('INVALID_PARAMS', { message: "coverImageRatio must be one of '1:1', '16:9', '9:16' or null" })
    }
  }

  if (coverMediaId !== undefined) {
    await prisma.project.update({
      where: { id: projectId },
      data: { coverMediaId },
    })
  }

  if (coverImageRatio !== undefined) {
    await prisma.novelPromotionProject.upsert({
      where: { projectId },
      update: { coverImageRatio },
      create: { projectId, coverImageRatio },
    })
  }

  return NextResponse.json({ success: true })
})
