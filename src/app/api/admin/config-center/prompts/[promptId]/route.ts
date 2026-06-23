import { NextResponse } from 'next/server'

import { requireAdminAuth } from '@/lib/admin/auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch {}
  throw new ApiError('INVALID_PARAMS')
}

export const dynamic = 'force-dynamic'

export const PATCH = apiHandler(async (req, ctx) => {
  const authResult = await requireAdminAuth()
  if (authResult instanceof Response) return authResult

  const { promptId } = await ctx.params as { promptId?: string }
  if (!promptId) throw new ApiError('INVALID_PARAMS', { field: 'promptId' })

  const body = await readJsonBody(req)
  if (!('description' in body)) {
    throw new ApiError('INVALID_PARAMS', { field: 'description' })
  }
  const raw = body.description
  if (raw !== null && typeof raw !== 'string') {
    throw new ApiError('INVALID_PARAMS', { field: 'description' })
  }
  const description = typeof raw === 'string' ? (raw.trim() || null) : null

  const existing = await prisma.promptDefinition.findUnique({
    where: { promptId },
    select: { id: true },
  })
  if (!existing) throw new ApiError('NOT_FOUND')

  const prompt = await prisma.promptDefinition.update({
    where: { promptId },
    data: { description },
  })

  return NextResponse.json({ prompt })
})
