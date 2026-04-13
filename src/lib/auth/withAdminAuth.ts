import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { AuthSession } from '@/lib/api-auth'

export async function withAdminAuth(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  const authSession = session as AuthSession | null

  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: authSession.user.id },
    select: { role: true, isDisabled: true },
  })

  if (!user || user.role !== 'admin' || user.isDisabled) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return handler()
}
