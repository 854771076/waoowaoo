import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth/withAdminAuth'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { encryptApiKey } from '@/lib/crypto-utils'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { PRESET_PROVIDERS, type Provider, type CustomModel } from '@/app/[locale]/profile/components/api-config/types'
import { DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY, DEFAULT_IMAGE_WORKFLOW_CONCURRENCY, DEFAULT_VIDEO_WORKFLOW_CONCURRENCY } from '@/lib/workflow-concurrency'

// Migrate legacy flat config to modern provider-based format
function migrateLegacyConfig(config: {
  llmBaseUrl?: string | null
  llmApiKey?: string | null
  falApiKey?: string | null
  googleAiKey?: string | null
  arkApiKey?: string | null
  qwenApiKey?: string | null
  newapiApiKey?: string | null
  newapiBaseUrl?: string | null
  customModels?: string | null
  customProviders?: string | null
}): {
  providers: string
  models: string
  defaultModels: string
  workflowConcurrency: string
  capabilityDefaults: string
} {
  // If we already have custom providers, no migration needed
  if (config.customProviders) {
    return {
      providers: config.customProviders || '[]',
      models: config.customModels || '[]',
      defaultModels: '{}',
      workflowConcurrency: JSON.stringify({
        analysis: DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
        image: DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
        video: DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
      }),
      capabilityDefaults: '{}',
    }
  }

  // Migrate legacy single API keys to preset providers
  const migratedProviders: Provider[] = []

  // OpenRouter is the default LLM provider
  if (config.llmApiKey || config.llmBaseUrl) {
    const preset = PRESET_PROVIDERS.find(p => p.id === 'openrouter')
    if (preset) {
      migratedProviders.push({
        ...preset,
        apiKey: config.llmApiKey || undefined,
        baseUrl: config.llmBaseUrl || preset.baseUrl,
        hasApiKey: !!config.llmApiKey,
        hidden: false,
        isGlobal: true,
      })
    }
  }

  // FAL
  if (config.falApiKey) {
    const preset = PRESET_PROVIDERS.find(p => p.id === 'fal')
    if (preset) {
      migratedProviders.push({
        ...preset,
        apiKey: config.falApiKey || undefined,
        hasApiKey: !!config.falApiKey,
        hidden: false,
        isGlobal: true,
      })
    }
  }

  // Google AI Studio
  if (config.googleAiKey) {
    const preset = PRESET_PROVIDERS.find(p => p.id === 'google')
    if (preset) {
      migratedProviders.push({
        ...preset,
        apiKey: config.googleAiKey || undefined,
        hasApiKey: !!config.googleAiKey,
        hidden: false,
        isGlobal: true,
      })
    }
  }

  // ByteDance Ark
  if (config.arkApiKey) {
    const preset = PRESET_PROVIDERS.find(p => p.id === 'ark')
    if (preset) {
      migratedProviders.push({
        ...preset,
        apiKey: config.arkApiKey || undefined,
        hasApiKey: !!config.arkApiKey,
        hidden: false,
        isGlobal: true,
      })
    }
  }

  // Alibaba Bailian (formerly qwen)
  if (config.qwenApiKey) {
    const preset = PRESET_PROVIDERS.find(p => p.id === 'bailian')
    if (preset) {
      migratedProviders.push({
        ...preset,
        apiKey: config.qwenApiKey || undefined,
        hasApiKey: !!config.qwenApiKey,
        hidden: false,
        isGlobal: true,
      })
    }
  }

  // NewAPI
  if (config.newapiApiKey) {
    const preset = PRESET_PROVIDERS.find(p => p.id === 'newapi')
    if (preset) {
      migratedProviders.push({
        ...preset,
        apiKey: config.newapiApiKey || undefined,
        baseUrl: config.newapiBaseUrl || preset.baseUrl,
        hasApiKey: !!config.newapiApiKey,
        hidden: false,
        isGlobal: true,
      })
    }
  }

  return {
    providers: JSON.stringify(migratedProviders),
    models: config.customModels || '[]',
    defaultModels: '{}',
    workflowConcurrency: JSON.stringify({
      analysis: DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
      image: DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
      video: DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
    }),
    capabilityDefaults: '{}',
  }
}

export const GET = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return withAdminAuth(request, async () => {
    let config = await prisma.systemConfig.findFirst()

    if (!config) {
      // Initialize with empty provider structure
      const initial = migrateLegacyConfig({})
      config = await prisma.systemConfig.create({
        data: initial,
      })
    }

    // Check if we need migration from legacy format
    let needsMigration = false
    if (!config.providers) {
      needsMigration = true
    }

    let providers: Provider[] = []
    let models: CustomModel[] = []
    let defaultModels: Record<string, string> = {}
    let workflowConcurrency = {
      analysis: DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
      image: DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
      video: DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
    }
    let capabilityDefaults = {}

    if (needsMigration) {
      // Migrate legacy config
      const migrated = migrateLegacyConfig({
        llmBaseUrl: config.llmBaseUrl,
        llmApiKey: config.llmApiKey,
        falApiKey: config.falApiKey,
        googleAiKey: config.googleAiKey,
        arkApiKey: config.arkApiKey,
        qwenApiKey: config.qwenApiKey,
        newapiApiKey: config.newapiApiKey,
        newapiBaseUrl: config.newapiBaseUrl,
        customModels: config.customModels,
        customProviders: config.customProviders,
      })

      // Update database with migrated format
      await prisma.systemConfig.update({
        where: { id: config.id },
        data: migrated,
      })

      providers = JSON.parse(migrated.providers)
      models = JSON.parse(migrated.models)
      defaultModels = JSON.parse(migrated.defaultModels)
      workflowConcurrency = JSON.parse(migrated.workflowConcurrency)
      capabilityDefaults = JSON.parse(migrated.capabilityDefaults)
    } else {
      // Already in modern format
      providers = config.providers ? JSON.parse(config.providers) : []
      models = config.models ? JSON.parse(config.models) : []
      defaultModels = config.defaultModels ? JSON.parse(config.defaultModels) : {}
      workflowConcurrency = config.workflowConcurrency ? JSON.parse(config.workflowConcurrency) : {
        analysis: DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
        image: DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
        video: DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
      }
      capabilityDefaults = config.capabilityDefaults ? JSON.parse(config.capabilityDefaults) : {}
    }

    return NextResponse.json({
      providers,
      models,
      defaultModels,
      workflowConcurrency,
      capabilityDefaults,
    })
  })
})

export const PUT = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return withAdminAuth(request, async () => {
    const body = await request.json()
    const {
      providers,
      models,
      defaultModels,
      workflowConcurrency,
      capabilityDefaults,
    } = body

    // Encrypt API keys before saving
    const encryptedProviders = providers.map((p: Provider) => {
      if (p.apiKey && p.apiKey.length > 0) {
        return {
          ...p,
          apiKey: encryptApiKey(p.apiKey),
        }
      }
      return p
    })

    const encryptedData = {
      providers: JSON.stringify(encryptedProviders),
      models: JSON.stringify(models),
      defaultModels: JSON.stringify(defaultModels),
      workflowConcurrency: JSON.stringify(workflowConcurrency),
      capabilityDefaults: JSON.stringify(capabilityDefaults),
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

    return NextResponse.json({ success: true })
  })
})
