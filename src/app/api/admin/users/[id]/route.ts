import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
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

    const { name, password, role, balance, isDisabled } = body

    // Check cannot edit yourself for certain fields
    const session = await getServerSession(authOptions)
    const authSession = session as AuthSession | null
    const isSelf = authSession?.user?.id === id

    // Check username uniqueness
    if (name) {
      const existing = await prisma.user.findUnique({ where: { name } })
      if (existing && existing.id !== id) {
        throw new ApiError('INVALID_PARAMS', { message: '用户名已存在' })
      }
    }

    // Validate password if provided
    if (password && password.length < 6) {
      throw new ApiError('INVALID_PARAMS', { message: '密码长度不能少于6位' })
    }

    // Prevent admin from disabling themselves or changing own role
    const updateData: any = {}
    if (name) updateData.name = name
    if (password) updateData.password = await bcrypt.hash(password, 12)
    if (!isSelf && role) updateData.role = role
    if (!isSelf && typeof isDisabled === 'boolean') updateData.isDisabled = isDisabled

    await prisma.$transaction(async tx => {
      // Update user basic info
      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id },
          data: updateData,
        })
      }

      // Update balance if provided
      if (typeof balance === 'number') {
        await tx.userBalance.upsert({
          where: { userId: id },
          update: { balance },
          create: {
            userId: id,
            balance,
            frozenAmount: 0,
            totalSpent: 0,
          },
        })
      }
    })

    return NextResponse.json({ success: true })
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
