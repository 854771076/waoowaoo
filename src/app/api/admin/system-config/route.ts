import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth/withAdminAuth'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { encryptApiKey } from '@/lib/crypto-utils'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

export const GET = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return withAdminAuth(request, async () => {
    let config = await prisma.systemConfig.findFirst()

    if (!config) {
      // Initialize if not exists
      config = await prisma.systemConfig.create({
        data: {},
      })
    }

    // Return config (api keys are already encrypted in database)
    return NextResponse.json({ config })
  })
})

export const PUT = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return withAdminAuth(request, async () => {
    const body = await request.json()
    const {
      llmBaseUrl,
      llmApiKey,
      falApiKey,
      googleAiKey,
      arkApiKey,
      qwenApiKey,
      newapiApiKey,
      newapiBaseUrl,
      customModels,
      customProviders,
    } = body

    // Encrypt api keys before saving
    const encryptedData = {
      llmBaseUrl,
      llmApiKey: llmApiKey ? encryptApiKey(llmApiKey) : null,
      falApiKey: falApiKey ? encryptApiKey(falApiKey) : null,
      googleAiKey: googleAiKey ? encryptApiKey(googleAiKey) : null,
      arkApiKey: arkApiKey ? encryptApiKey(arkApiKey) : null,
      qwenApiKey: qwenApiKey ? encryptApiKey(qwenApiKey) : null,
      newapiApiKey: newapiApiKey ? encryptApiKey(newapiApiKey) : null,
      newapiBaseUrl,
      customModels,
      customProviders,
    }

    let config = await prisma.systemConfig.findFirst()

    if (config) {
      config = await prisma.systemConfig.update({
        where: { id: config.id },
        data: encryptedData,
      })
    } else {
      config = await prisma.systemConfig.create({
        data: encryptedData,
      })
    }

    return NextResponse.json({ config })
  })
})
