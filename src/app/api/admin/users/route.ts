import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { withAdminAuth } from '@/lib/auth/withAdminAuth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

export const GET = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return withAdminAuth(request, async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        isDisabled: true,
        createdAt: true,
        balance: {
          select: {
            balance: true,
            totalSpent: true,
          },
        },
        _count: {
          select: {
            projects: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Format response with aggregated stats
    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      role: user.role,
      isDisabled: user.isDisabled,
      balance: user.balance?.balance ?? 0,
      totalSpent: user.balance?.totalSpent ?? 0,
      projectCount: user._count.projects,
      createdAt: user.createdAt,
    }))

    return NextResponse.json({ users: formattedUsers })
  })
})

export const POST = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return withAdminAuth(request, async () => {
    const body = await request.json()
    const { name, password, role = 'user', isDisabled = false, initialBalance = 0 } = body

    if (!name || !password) {
      throw new ApiError('INVALID_PARAMS', { message: '用户名和密码不能为空' })
    }

    if (password.length < 6) {
      throw new ApiError('INVALID_PARAMS', { message: '密码长度不能少于6位' })
    }

    const existing = await prisma.user.findUnique({ where: { name } })
    if (existing) {
      throw new ApiError('INVALID_PARAMS', { message: '用户名已存在' })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.$transaction(async tx => {
      const newUser = await tx.user.create({
        data: {
          name,
          password: hashedPassword,
          role,
          isDisabled,
        },
      })

      await tx.userBalance.create({
        data: {
          userId: newUser.id,
          balance: initialBalance,
          frozenAmount: 0,
          totalSpent: 0,
        },
      })

      return newUser
    })

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        isDisabled: user.isDisabled,
      },
    }, { status: 201 })
  })
})
