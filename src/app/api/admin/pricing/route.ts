import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { withAdminAuth } from '@/lib/auth/withAdminAuth'
import { listBuiltinPricingCatalog } from '@/lib/model-pricing/catalog'

type SystemConfigWithModels = {
  models?: string | null
}

export async function GET(request: NextRequest) {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return withAdminAuth(request, async () => {
    // Load built-in pricing
    const builtinPricing = listBuiltinPricingCatalog()

    // Load custom pricing from models field
    const systemConfig = await (prisma.systemConfig.findFirst as unknown as (args: {
      select: { models: boolean }
    }) => Promise<SystemConfigWithModels | null>)({
      select: { models: true },
    })

    const customPricing: Record<string, {
      provider: string
      modelId: string
      apiType: string
      mode: 'flat' | 'capability'
      flatAmount?: number
      tiers?: unknown[]
      isCustom: boolean
    }> = {}

    if (systemConfig?.models) {
      try {
        const models: Array<{ modelKey: string; customPricing?: unknown } | unknown> = JSON.parse(systemConfig.models)
        // Find the special pricing entry
        const pricingEntry = models.find((m: unknown) =>
          m && typeof m === 'object' && 'modelKey' in m && m.modelKey === '__admin_pricing__'
        ) as { customPricing?: unknown } | undefined
        if (pricingEntry?.customPricing && typeof pricingEntry.customPricing === 'object') {
          Object.assign(customPricing, pricingEntry.customPricing)
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Merge built-in and custom pricing
    const models: Array<{
      key: string
      provider: string
      modelId: string
      apiType: string
      mode: 'flat' | 'capability'
      flatAmount?: number
      tiers?: unknown[]
      isCustom: boolean
    }> = []
    const seenKeys = new Set<string>()

    // Add custom pricing first (they take precedence)
    for (const [key, model] of Object.entries(customPricing)) {
      seenKeys.add(key)
      models.push({ ...model, key, isCustom: true })
    }

    // Add built-in pricing
    for (const entry of builtinPricing) {
      const key = `${entry.provider}:${entry.modelId}`
      if (seenKeys.has(key)) continue
      seenKeys.add(key)

      models.push({
        key,
        provider: entry.provider,
        modelId: entry.modelId,
        apiType: entry.apiType,
        mode: entry.pricing.mode,
        flatAmount: entry.pricing.flatAmount,
        tiers: entry.pricing.tiers,
        isCustom: false,
      })
    }

    return NextResponse.json({ models })
  })
}
