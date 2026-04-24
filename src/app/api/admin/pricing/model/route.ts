import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdminAuth } from '@/lib/auth/withAdminAuth'
import type { BuiltinPricingCatalogEntry } from '@/lib/model-pricing/catalog'

type SystemConfigWithModels = {
  id: string
  models?: string
}

export async function PUT(request: NextRequest) {
  return withAdminAuth(request, async () => {
    const body = await request.json()
    const { provider, modelId, apiType, mode, flatAmount, tiers } = body

    if (!provider || !modelId || !apiType || !mode) {
      return NextResponse.json(
        { error: 'provider, modelId, apiType, and mode are required' },
        { status: 400 }
      )
    }

    const key = `${provider}:${modelId}`

    // Get current config
    const config = await (prisma.systemConfig.findFirst as () => Promise<SystemConfigWithModels | null>)()

    // Parse models array
    let models: Array<{ modelKey: string; customPricing?: unknown } | unknown> = []
    if (config?.models) {
      try {
        models = JSON.parse(config.models)
      } catch {
        // Ignore parse errors
      }
    }

    // Find the special pricing entry
    const pricingEntryIndex = models.findIndex((m: unknown) =>
      m && typeof m === 'object' && 'modelKey' in m && m.modelKey === '__admin_pricing__'
    )

    type PricingEntryType = {
      modelKey: string
      customPricing: Record<string, unknown>
    }

    let pricingEntry: PricingEntryType
    if (pricingEntryIndex === -1) {
      pricingEntry = { modelKey: '__admin_pricing__', customPricing: {} }
      models.push(pricingEntry)
    } else {
      pricingEntry = models[pricingEntryIndex] as PricingEntryType
    }

    if (!pricingEntry.customPricing || typeof pricingEntry.customPricing !== 'object') {
      pricingEntry.customPricing = {}
    }

    // Add/update the pricing entry
    pricingEntry.customPricing[key] = {
      provider,
      modelId,
      apiType: apiType as BuiltinPricingCatalogEntry['apiType'],
      mode,
      flatAmount: mode === 'flat' ? Number(flatAmount) : undefined,
      tiers: mode === 'capability' ? tiers : undefined,
    }

    // Save to database
    if (config) {
      await (prisma.systemConfig.update as unknown as (args: {
        where: { id: string }
        data: { models: string }
      }) => Promise<unknown>)({
        where: { id: config.id },
        data: { models: JSON.stringify(models) },
      })
    } else {
      await (prisma.systemConfig.create as unknown as (args: {
        data: {
          providers: string
          models: string
          defaultModels: string
          workflowConcurrency: string
          capabilityDefaults: string
        }
      }) => Promise<unknown>)({
        data: {
          providers: '[]',
          models: JSON.stringify(models),
          defaultModels: '{}',
          workflowConcurrency: '{}',
          capabilityDefaults: '{}',
        },
      })
    }

    return NextResponse.json({ success: true, key })
  })
}

export async function DELETE(request: NextRequest) {
  return withAdminAuth(request, async () => {
    const body = await request.json()
    const { key } = body

    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }

    // Get current config
    const config = await (prisma.systemConfig.findFirst as () => Promise<SystemConfigWithModels | null>)()
    if (!config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    // Parse models array
    let models: Array<{ modelKey: string; customPricing?: unknown } | unknown> = []
    if (config.models) {
      try {
        models = JSON.parse(config.models)
      } catch {
        // Ignore parse errors
      }
    }

    // Find the special pricing entry
    const pricingEntry = models.find((m: unknown) =>
      m && typeof m === 'object' && 'modelKey' in m && m.modelKey === '__admin_pricing__'
    ) as { customPricing?: Record<string, unknown> } | undefined

    if (pricingEntry?.customPricing && typeof pricingEntry.customPricing === 'object') {
      delete pricingEntry.customPricing[key]
    }

    // Save to database
    await (prisma.systemConfig.update as unknown as (args: {
      where: { id: string }
      data: { models: string }
    }) => Promise<unknown>)({
      where: { id: config.id },
      data: { models: JSON.stringify(models) },
    })

    return NextResponse.json({ success: true })
  })
}
