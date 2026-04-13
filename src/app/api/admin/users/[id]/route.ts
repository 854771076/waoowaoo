import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth/withAdminAuth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import type { AuthSession } from '@/lib/api-auth'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

export const PATCH = apiHandler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return withAdminAuth(request, async () => {
    const { id } = await context.params
    const body = await request.json()

    const { isDisabled } = body

    const user = await prisma.user.update({
      where: { id },
      data: { isDisabled },
      select: {
        id: true,
        name: true,
        isDisabled: true,
      },
    })

    return NextResponse.json({ user })
  })
})

export const DELETE = apiHandler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return withAdminAuth(request, async () => {
    const { id } = await context.params

    // Check if deleting yourself
    const session = await getServerSession(authOptions)
    const authSession = session as AuthSession | null
    if (authSession?.user?.id === id) {
      throw new ApiError('INVALID_PARAMS', { message: '不能删除自己的账号' })
    }

    await prisma.user.delete({ where: { id } })

    return NextResponse.json({ success: true })
  })
})
