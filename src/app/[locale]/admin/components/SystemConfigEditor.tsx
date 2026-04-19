'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { GlassModalShell } from '@/components/ui/primitives'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { apiFetch } from '@/lib/api-fetch'
import type { CapabilitySelections } from '@/lib/model-config-contract'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import {
  encodeModelKey,
} from '@/app/[locale]/profile/components/api-config'
import {
  PRESET_MODELS,
  PRESET_PROVIDERS,
  resolvePresetProviderName,
  isPresetComingSoonModelKey,
  type Provider,
  type CustomModel,
} from '@/app/[locale]/profile/components/api-config/types'
import {
  mergeProvidersForDisplay,
  parsePricingDisplayMap,
  applyPricingDisplay,
  DEFAULT_WORKFLOW_CONCURRENCY,
  parseWorkflowConcurrency,
} from '@/app/[locale]/profile/components/api-config/hooks'
import { ApiConfigToolbar } from '@/app/[locale]/profile/components/api-config-tab/ApiConfigToolbar'
import { ApiConfigProviderList } from '@/app/[locale]/profile/components/api-config-tab/ApiConfigProviderList'
import { useApiConfigFilters } from '@/app/[locale]/profile/components/api-config-tab/hooks/useApiConfigFilters'
import { AppIcon } from '@/components/ui/icons'
import type { CapabilityValue } from '@/lib/model-config-contract'

type CustomProviderType = 'gemini-compatible' | 'openai-compatible'

interface DefaultModels {
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  storyboardModel?: string
  editModel?: string
  videoModel?: string
  audioModel?: string
  lipSyncModel?: string
  voiceDesignModel?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const Icons = {
  settings: () => (
    <AppIcon name="settingsHex" className="w-3.5 h-3.5" />
  ),
  llm: () => (
    <AppIcon name="menu" className="w-3.5 h-3.5" />
  ),
  image: () => (
    <AppIcon name="image" className="w-3.5 h-3.5" />
  ),
  video: () => (
    <AppIcon name="video" className="w-3.5 h-3.5" />
  ),
  audio: () => (
    <AppIcon name="audioWave" className="w-3.5 h-3.5" />
  ),
  lipsync: () => (
    <AppIcon name="audioWave" className="w-3.5 h-3.5" />
  ),
  chevronDown: () => (
    <AppIcon name="chevronDown" className="w-3 h-3" />
  ),
}

export default function SystemConfigEditor() {
  const {
    providers,
    models,
    defaultModels,
    enablePlatformFeeForUserApi,
    userApiPlatformFee,
    setEnablePlatformFee,
    updatePlatformFee,
    loading,
    saveStatus,
    flushConfig,
    updateProviderHidden,
    updateProviderApiKey,
    updateProviderBaseUrl,
    reorderProviders,
    addProvider,
    deleteProvider,
    toggleModel,
    deleteModel,
    addModel,
    updateModel,
  } = useGlobalSystemProviders()

  const t = useTranslations('apiConfig')
  const tc = useTranslations('common')
  const tp = useTranslations('providerSection')
  const ta = useTranslations('admin')

  const savingState = saveStatus === 'saving'
    ? resolveTaskPresentationState({
        phase: 'processing',
        intent: 'modify',
        resource: 'text',
        hasOutput: true,
      })
    : null

  const {
    modelProviders,
    getModelsForProvider,
  } = useApiConfigFilters({
    providers,
    models,
  })

  const [showAddGeminiProvider, setShowAddGeminiProvider] = useState(false)
  const [newGeminiProvider, setNewGeminiProvider] = useState<{
    name: string
    baseUrl: string
    apiKey: string
    apiType: CustomProviderType
  }>({
    name: '',
    baseUrl: '',
    apiKey: '',
    apiType: 'gemini-compatible',
  })
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'passed' | 'failed'>('idle')
  const [testSteps, setTestSteps] = useState<Array<{
    name: string
    status: 'pass' | 'fail' | 'skip'
    message: string
    model?: string
    detail?: string
  }>>([])

  const doAddProvider = useCallback(() => {
    const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const providerId = `${newGeminiProvider.apiType}:${uuid}`
    const name = newGeminiProvider.name.trim()
    const baseUrl = newGeminiProvider.baseUrl.trim()
    const apiKey = newGeminiProvider.apiKey.trim()

    addProvider({
      id: providerId,
      name,
      baseUrl,
      apiKey,
      apiMode: newGeminiProvider.apiType === 'openai-compatible' ? 'openai-official' : 'gemini-sdk',
      isGlobal: true,
    })

    setNewGeminiProvider({ name: '', baseUrl: '', apiKey: '', apiType: 'gemini-compatible' })
    setTestStatus('idle')
    setTestSteps([])
    setShowAddGeminiProvider(false)
  }, [newGeminiProvider, addProvider])

  const handleAddGeminiProvider = useCallback(async () => {
    if (!newGeminiProvider.name || !newGeminiProvider.baseUrl) {
      alert(tp('fillRequired'))
      return
    }

    setTestStatus('testing')
    setTestSteps([])

    try {
      const res = await apiFetch('/api/user/api-config/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiType: newGeminiProvider.apiType,
          baseUrl: newGeminiProvider.baseUrl.trim(),
          apiKey: newGeminiProvider.apiKey.trim(),
        }),
      })

      const data = await res.json()
      const steps = data.steps || []
      setTestSteps(steps)

      if (data.success) {
        setTestStatus('passed')
        // Auto-add on success
        doAddProvider()
      } else {
        setTestStatus('failed')
      }
    } catch {
      setTestSteps([{ name: 'models', status: 'fail', message: 'Network error' }])
      setTestStatus('failed')
    }
  }, [newGeminiProvider, tp, doAddProvider])

  const handleForceAdd = useCallback(() => {
    doAddProvider()
  }, [doAddProvider])

  const handleCancelAddGeminiProvider = () => {
    setNewGeminiProvider({ name: '', baseUrl: '', apiKey: '', apiType: 'gemini-compatible' })
    setTestStatus('idle')
    setTestSteps([])
    setShowAddGeminiProvider(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--glass-text-tertiary)]">
        {tc('loading')}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ApiConfigToolbar
        title={ta('systemConfigDescription')}
        saveStatus={saveStatus}
        savingState={savingState}
        savingLabel={t('saving')}
        savedLabel={t('saved')}
        saveFailedLabel={t('saveFailed')}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-6">
          <ApiConfigProviderList
            modelProviders={modelProviders}
            allModels={models}
            defaultModels={defaultModels}
            getModelsForProvider={getModelsForProvider}
            onAddGeminiProvider={() => setShowAddGeminiProvider(true)}
            onToggleModel={toggleModel}
            onUpdateApiKey={updateProviderApiKey}
            onUpdateBaseUrl={updateProviderBaseUrl}
            onReorderProviders={reorderProviders}
            onDeleteModel={deleteModel}
            onUpdateModel={updateModel}
            onDeleteProvider={deleteProvider}
            onAddModel={addModel}
            onFlushConfig={flushConfig}
            onToggleProviderHidden={updateProviderHidden}
            labels={{
              providerPool: t('providerPool'),
              providerPoolDesc: t('providerPoolDescGlobal'),
              dragToSort: t('dragToSort'),
              dragToSortHint: t('dragToSortHint'),
              hideProvider: t('hideProvider'),
              showProvider: t('showProvider'),
              showHiddenProviders: t('showHiddenProviders'),
              hideHiddenProviders: t('hideHiddenProviders'),
              hiddenProvidersPrefix: t('hiddenProvidersPrefix'),
              addGeminiProvider: t('addGeminiProvider'),
            }}
          />

          {/* Platform Fee Configuration for User API */}
          <div className="mt-8 rounded-xl border border-[var(--glass-border)] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[var(--glass-text-primary)]">
              {ta('userApiPlatformFeeTitle')}
            </h3>
            <p className="mb-4 text-xs text-[var(--glass-text-secondary)]">
              {ta('userApiPlatformFeeDescription')}
            </p>

            <div className="mb-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="enablePlatformFee"
                checked={enablePlatformFeeForUserApi}
                onChange={(e) => setEnablePlatformFee(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--glass-border)] bg-[var(--glass-bg)] text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="enablePlatformFee" className="text-sm font-medium text-[var(--glass-text-primary)]">
                {ta('enablePlatformFeeForUserApi')}
              </label>
            </div>

            {enablePlatformFeeForUserApi && (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                    {ta('platformFeeText')}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={userApiPlatformFee.text ?? 0}
                    onChange={(e) => updatePlatformFee('text', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="glass-input-base w-full px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                    {ta('platformFeeImage')}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={userApiPlatformFee.image ?? 0}
                    onChange={(e) => updatePlatformFee('image', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="glass-input-base w-full px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                    {ta('platformFeeVideo')}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={userApiPlatformFee.video ?? 0}
                    onChange={(e) => updatePlatformFee('video', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="glass-input-base w-full px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                    {ta('platformFeeAudio')}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={userApiPlatformFee.audio ?? 0}
                    onChange={(e) => updatePlatformFee('audio', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="glass-input-base w-full px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                    {ta('platformFeeLipSync')}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={userApiPlatformFee['lip-sync'] ?? 0}
                    onChange={(e) => updatePlatformFee('lip-sync', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="glass-input-base w-full px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <GlassModalShell
        open={showAddGeminiProvider}
        onClose={handleCancelAddGeminiProvider}
        title={t('addGeminiProvider')}
        description={t('providerPool')}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancelAddGeminiProvider}
              className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm"
            >
              {tc('cancel')}
            </button>
            {testStatus === 'failed' && (
              <button
                onClick={handleForceAdd}
                className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm"
              >
                {t('addAnyway')}
              </button>
            )}
            <button
              onClick={handleAddGeminiProvider}
              disabled={testStatus === 'testing'}
              className="glass-btn-base glass-btn-primary px-3 py-1.5 text-sm"
            >
              {testStatus === 'testing' ? t('testing') : tp('add')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
            <AppIcon name="alert" className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-[12px] leading-relaxed">{t('customProviderTip')}</span>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('apiType')}
            </label>
            <div className="relative">
              <select
                value={newGeminiProvider.apiType}
                onChange={(event) =>
                  setNewGeminiProvider({
                    ...newGeminiProvider,
                    apiType: event.target.value as CustomProviderType,
                  })
                }
                disabled={testStatus === 'testing'}
                className="glass-select-base w-full cursor-pointer appearance-none px-3 py-2.5 pr-8 text-sm"
              >
                <option value="gemini-compatible">{t('apiTypeGeminiCompatible')}</option>
                <option value="openai-compatible">{t('apiTypeOpenAICompatible')}</option>
              </select>
              <div className="pointer-events-none absolute right-3 top-3 text-[var(--glass-text-tertiary)]">
                <Icons.chevronDown />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {tp('name')}
            </label>
            <input
              type="text"
              value={newGeminiProvider.name}
              onChange={(event) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  name: event.target.value,
                })
              }
              disabled={testStatus === 'testing'}
              placeholder={tp('name')}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('baseUrl')}
            </label>
            <input
              type="text"
              value={newGeminiProvider.baseUrl}
              onChange={(event) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  baseUrl: event.target.value,
                })
              }
              disabled={testStatus === 'testing'}
              placeholder={t('baseUrl')}
              className="glass-input-base w-full px-3 py-2.5 text-sm font-mono"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('apiKeyLabel')}
            </label>
            <input
              type="password"
              value={newGeminiProvider.apiKey}
              onChange={(event) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  apiKey: event.target.value,
                })
              }
              disabled={testStatus === 'testing'}
              placeholder={t('apiKeyLabel')}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
            />
          </div>

          {/* Test Results */}
          {testStatus !== 'idle' && (
            <div className="space-y-2 rounded-xl border border-[var(--glass-border)] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--glass-text-primary)]">
                <AppIcon name="settingsHex" className="h-3.5 w-3.5" />
                {t('testConnection')}
              </div>

              {testStatus === 'testing' && testSteps.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-[var(--glass-text-secondary)]">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t('testing')}
                </div>
              )}

              {testSteps.map((step) => {
                const stepLabel = t(`testStep.${step.name}` as Parameters<typeof t>[0])
                return (
                  <div key={step.name} className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs">
                      {step.status === 'pass' && (
                        <span className="text-green-500">
                          <AppIcon name="check" className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {step.status === 'fail' && (
                        <span className="text-red-500">
                          <AppIcon name="close" className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {step.status === 'skip' && (
                        <span className="text-[var(--glass-text-tertiary)]">–</span>
                      )}
                      <span className="font-medium text-[var(--glass-text-primary)]">
                        {stepLabel}
                      </span>
                      {step.model && (
                        <span className="rounded bg-[var(--glass-bg-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--glass-text-secondary)]">
                          {step.model}
                        </span>
                      )}
                    </div>
                    {step.detail && (
                      <p className={`pl-5 text-[11px] ${step.status === 'fail' ? 'text-red-400' : 'text-[var(--glass-text-secondary)]'}`}>
                        {step.detail}
                      </p>
                    )}
                  </div>
                )
              })}

              {testStatus === 'failed' && (
                <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 px-2.5 py-2 text-[11px] text-yellow-600 dark:text-yellow-400">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{t('testWarning')}</span>
                </div>
              )}
              {testStatus === 'passed' && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-2.5 py-2 text-[11px] text-green-600 dark:text-green-400">
                  <AppIcon name="check" className="h-3.5 w-3.5" />
                  {t('testPassed')}
                </div>
              )}
            </div>
          )}
        </div>
      </GlassModalShell>
    </div>
  )
}

// Custom hook for global system config that fetches from admin API instead of user API
function useGlobalSystemProviders() {
  const locale = useLocale()
  const t = useTranslations('apiConfig')

  const presetProviders = PRESET_PROVIDERS.map(provider => ({
    ...provider,
    name: resolvePresetProviderName(provider.id, provider.name, locale),
  }))

  const [providers, setProviders] = useState<Provider[]>(
    presetProviders.map(provider => ({ ...provider, apiKey: '', hasApiKey: false, isGlobal: true })),
  )
  const [models, setModels] = useState<CustomModel[]>(
    PRESET_MODELS.map(model => {
      const modelKey = encodeModelKey(model.provider, model.modelId)
      return {
        ...model,
        modelKey,
        price: 0,
        priceLabel: '--',
        enabled: !isPresetComingSoonModelKey(modelKey),
        isGlobal: true,
      }
    }),
  )
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({})
  const [workflowConcurrency, setWorkflowConcurrency] = useState(DEFAULT_WORKFLOW_CONCURRENCY)
  const [capabilityDefaults, setCapabilityDefaults] = useState<CapabilitySelections>({})
  const [enablePlatformFeeForUserApi, setEnablePlatformFeeForUserApi] = useState(false)
  const [userApiPlatformFee, setUserApiPlatformFee] = useState<Record<string, number>>({
    text: 0,
    image: 0,
    video: 0,
    audio: 0,
    'lip-sync': 0,
  })
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const initializedRef = useRef(false)

  // Always hold latest values in refs for async save
  const latestModelsRef = useRef(models)
  const latestProvidersRef = useRef(providers)
  const latestDefaultModelsRef = useRef(defaultModels)
  const latestWorkflowConcurrencyRef = useRef(workflowConcurrency)
  const latestCapabilityDefaultsRef = useRef(capabilityDefaults)
  const latestEnablePlatformFeeRef = useRef(enablePlatformFeeForUserApi)
  const latestPlatformFeeRef = useRef(userApiPlatformFee)

  useEffect(() => { latestModelsRef.current = models }, [models])
  useEffect(() => { latestProvidersRef.current = providers }, [providers])
  useEffect(() => { latestDefaultModelsRef.current = defaultModels }, [defaultModels])
  useEffect(() => { latestWorkflowConcurrencyRef.current = workflowConcurrency }, [workflowConcurrency])
  useEffect(() => { latestCapabilityDefaultsRef.current = capabilityDefaults }, [capabilityDefaults])
  useEffect(() => { latestEnablePlatformFeeRef.current = enablePlatformFeeForUserApi }, [enablePlatformFeeForUserApi])
  useEffect(() => { latestPlatformFeeRef.current = userApiPlatformFee }, [userApiPlatformFee])

  // Load config
  useEffect(() => {
    async function fetchConfig() {
      initializedRef.current = false
      let loadedSuccessfully = false
      try {
        const res = await apiFetch('/api/admin/system-config')
        if (!res.ok) {
          throw new Error(`system-config load failed: HTTP ${res.status}`)
        }

        const data = await res.json()
        const pricingDisplay = parsePricingDisplayMap(data.pricingDisplay || {})

        // Merge preset and saved providers, keep the order of savedProviders (drag-and-drop sorting depends on it)
        const savedProviders: Provider[] = data.providers || []
        setProviders(mergeProvidersForDisplay(savedProviders, presetProviders))

        // Merge preset and saved models
        const savedModelsRaw = data.models || []
        const savedModelsNormalized = savedModelsRaw.map((m: CustomModel) => ({
          ...m,
          modelKey: m.modelKey || encodeModelKey(m.provider, m.modelId),
        }))
        const savedModels: CustomModel[] = []
        const seen = new Set<string>()
        for (const model of savedModelsNormalized) {
          const key = model.modelKey
          if (seen.has(key)) continue
          seen.add(key)
          savedModels.push(model)
        }
        const hasSavedModels = savedModels.length > 0
        const allModels = PRESET_MODELS.map(preset => {
          const presetModelKey = encodeModelKey(preset.provider, preset.modelId)
          const saved = savedModels.find((m: CustomModel) =>
            m.modelKey === presetModelKey
          )
          const mergedPreset: CustomModel = {
            ...preset,
            modelKey: presetModelKey,
            price: 0,
            priceLabel: '--',
            enabled: isPresetComingSoonModelKey(presetModelKey)
              ? false
              : (hasSavedModels ? (!!saved) : false),
            isGlobal: true,
          }
          return applyPricingDisplay(mergedPreset, pricingDisplay)
        })
        const customModels = savedModels.filter((m: CustomModel) =>
          !PRESET_MODELS.find(preset => encodeModelKey(preset.provider, preset.modelId) === m.modelKey)
        ).map((m: CustomModel) => ({
          ...applyPricingDisplay(m, pricingDisplay),
          // Respect enabled from server (backend already returns enabled: false for disabled presets)
          enabled: (m as CustomModel & { enabled?: boolean }).enabled !== false,
          isGlobal: PRESET_MODELS.some((preset) => encodeModelKey(preset.provider, preset.modelId) === m.modelKey),
        }))

        setModels([...allModels, ...customModels])

        // Load default model config - normalize invalid model keys to empty
        if (data.defaultModels && isRecord(data.defaultModels)) {
          const normalized: DefaultModels = {}
          const possibleFields: Array<keyof DefaultModels> = [
            'analysisModel',
            'characterModel',
            'locationModel',
            'storyboardModel',
            'editModel',
            'videoModel',
            'audioModel',
            'lipSyncModel',
            'voiceDesignModel',
          ]
          for (const field of possibleFields) {
            const value = (data.defaultModels as Record<string, unknown>)[field]
            if (typeof value === 'string' && value.trim()) {
              // Only keep if valid format
              if (parseModelKeyStrict(value)) {
                normalized[field] = value
              }
              // else: invalid format - leave it undefined/empty
            }
          }
          setDefaultModels(normalized as Record<string, string>)
        }
        setWorkflowConcurrency(parseWorkflowConcurrency((data as { workflowConcurrency?: unknown }).workflowConcurrency))
        if (data.capabilityDefaults && typeof data.capabilityDefaults === 'object') {
          setCapabilityDefaults(data.capabilityDefaults as CapabilitySelections)
        }
        // Load platform fee configuration
        if (typeof data.enablePlatformFeeForUserApi === 'boolean') {
          setEnablePlatformFeeForUserApi(data.enablePlatformFeeForUserApi)
        }
        if (data.userApiPlatformFee && typeof data.userApiPlatformFee === 'object') {
          setUserApiPlatformFee({
            text: 0,
            image: 0,
            video: 0,
            audio: 0,
            'lip-sync': 0,
            ...data.userApiPlatformFee,
          })
        }
        loadedSuccessfully = true
      } catch (error) {
        console.error('Failed to fetch global system config:', error)
        setSaveStatus('error')
      } finally {
        setLoading(false)
        if (loadedSuccessfully) {
          // Delay setting initialized to ensure all state updates complete before starting listening
          setTimeout(() => {
            initializedRef.current = true
          }, 100)
        }
      }
    }
    fetchConfig()
  }, [presetProviders])

  // Core save function
  const performSave = useCallback(async (
    overrides?: {
      defaultModels?: typeof defaultModels
      workflowConcurrency?: typeof workflowConcurrency
      capabilityDefaults?: typeof capabilityDefaults
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _optimistic = false,
    silent = false,
  ): Promise<boolean> => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    if (!silent) {
      setSaveStatus('saving')
    }
    try {
      const currentModels = latestModelsRef.current
      const currentProviders = latestProvidersRef.current
      const currentDefaultModels = overrides?.defaultModels ?? latestDefaultModelsRef.current
      const currentWorkflowConcurrency = overrides?.workflowConcurrency ?? latestWorkflowConcurrencyRef.current
      const currentCapabilityDefaults = overrides?.capabilityDefaults ?? latestCapabilityDefaultsRef.current
      const currentEnablePlatformFee = latestEnablePlatformFeeRef.current
      const currentPlatformFee = latestPlatformFeeRef.current
      const enabledModels = currentModels.filter(m => m.enabled)
      const res = await apiFetch('/api/admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: enabledModels,
          providers: currentProviders,
          defaultModels: currentDefaultModels,
          workflowConcurrency: currentWorkflowConcurrency,
          capabilityDefaults: currentCapabilityDefaults,
          enablePlatformFeeForUserApi: currentEnablePlatformFee,
          userApiPlatformFee: currentPlatformFee,
        }),
      })
      if (res.ok) {
        if (!silent) {
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 3000)
        }
        return true
      } else {
        if (!silent) setSaveStatus('error')
        return false
      }
    } catch (error) {
      console.error('Failed to save global system config:', error)
      if (!silent) setSaveStatus('error')
      return false
    }
  }, []) // No dependencies - all values read from refs

  const flushConfig = useCallback(async () => {
    const success = await performSave(undefined, false, true)
    if (!success) {
      throw new Error('GLOBAL_CONFIG_FLUSH_FAILED')
    }
  }, [performSave])

  // Default model update
  const updateDefaultModel = useCallback((
    field: string,
    modelKey: string,
    capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>,
  ) => {
    setDefaultModels(prev => {
      const next = { ...prev, [field]: modelKey }
      latestDefaultModelsRef.current = next

      if (capabilityFieldsToDefault && capabilityFieldsToDefault.length > 0) {
        setCapabilityDefaults(prevCap => {
          const nextCap = { ...prevCap }
          const existing = { ...(nextCap[modelKey] || {}) }
          let changed = false
          for (const def of capabilityFieldsToDefault) {
            if (existing[def.field] === undefined) {
              existing[def.field] = def.options[0]
              changed = true
            }
          }
          if (changed) {
            nextCap[modelKey] = existing
            latestCapabilityDefaultsRef.current = nextCap
            void performSave({ defaultModels: next, capabilityDefaults: nextCap }, true)
            return nextCap
          }
          return prevCap
        })
      } else {
        void performSave({ defaultModels: next }, true)
      }
      return next
    })
  }, [performSave])

  const batchUpdateDefaultModels = useCallback((
    fields: string[],
    modelKey: string,
    capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>,
  ) => {
    setDefaultModels(prev => {
      const next = { ...prev }
      for (const field of fields) {
        (next as Record<string, string>)[field] = modelKey
      }
      latestDefaultModelsRef.current = next

      if (capabilityFieldsToDefault && capabilityFieldsToDefault.length > 0) {
        setCapabilityDefaults(prevCap => {
          const nextCap = { ...prevCap }
          const existing = { ...(nextCap[modelKey] || {}) }
          let changed = false
          for (const def of capabilityFieldsToDefault) {
            if (existing[def.field] === undefined) {
              existing[def.field] = def.options[0]
              changed = true
            }
          }
          if (changed) {
            nextCap[modelKey] = existing
            latestCapabilityDefaultsRef.current = nextCap
            void performSave({ defaultModels: next, capabilityDefaults: nextCap }, true)
            return nextCap
          }
          return prevCap
        })
      } else {
        void performSave({ defaultModels: next }, true)
      }
      return next
    })
  }, [performSave])

  const updateCapabilityDefault = useCallback((modelKey: string, field: string, value: string | number | boolean | null) => {
    setCapabilityDefaults(previous => {
      const next: CapabilitySelections = { ...previous }
      const current = { ...(next[modelKey] || {}) }
      if (value === null) {
        delete current[field]
      } else {
        current[field] = value
      }

      if (Object.keys(current).length === 0) {
        delete next[modelKey]
      } else {
        next[modelKey] = current
      }
      latestCapabilityDefaultsRef.current = next
      void performSave({ capabilityDefaults: next }, true)
      return next
    })
  }, [performSave])

  const updateWorkflowConcurrency = useCallback((field: keyof typeof workflowConcurrency, value: number) => {
    setWorkflowConcurrency((previous: typeof workflowConcurrency) => {
      const next = { ...previous, [field]: value }
      latestWorkflowConcurrencyRef.current = next
      void performSave({ workflowConcurrency: next }, true)
      return next
    })
  }, [performSave])

  // Provider operations
  const updateProviderApiKey = useCallback((providerId: string, apiKey: string) => {
    setProviders(prev => {
      const next = prev.map(p =>
        p.id === providerId ? { ...p, apiKey, hasApiKey: !!apiKey, isGlobal: true } : p
      )
      latestProvidersRef.current = next
      void performSave(undefined, true)
      return next
    })
  }, [performSave])

  const updateProviderHidden = useCallback((providerId: string, hidden: boolean) => {
    setProviders((previous) => {
      const next = previous.map(provider =>
        provider.id === providerId ? { ...provider, hidden, isGlobal: true } : provider,
      )
      latestProvidersRef.current = next
      void performSave(undefined, true)
      return next
    })
  }, [performSave])

  const reorderProviders = useCallback((activeProviderId: string, overProviderId: string) => {
    if (activeProviderId === overProviderId) return
    setProviders((previous) => {
      const oldIndex = previous.findIndex((provider) => provider.id === activeProviderId)
      const newIndex = previous.findIndex((provider) => provider.id === overProviderId)
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return previous
      }

      const next = [...previous]
      const moved = next[oldIndex]
      next.splice(oldIndex, 1)
      next.splice(newIndex, 0, moved)
      latestProvidersRef.current = next
      void performSave(undefined, true)
      return next
    })
  }, [performSave])

  const addProvider = useCallback((provider: Omit<Provider, 'hasApiKey'>) => {
    setProviders(prev => {
      const normalizedProviderId = provider.id.toLowerCase()
      if (prev.some((p: Provider) => p.id.toLowerCase() === normalizedProviderId)) {
        alert(t('providerIdExists'))
        return prev
      }
      const newProvider: Provider = { ...provider, hasApiKey: !!provider.apiKey, isGlobal: true }
      const next = [...prev, newProvider]
      latestProvidersRef.current = next

      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, performSave])

  const deleteProvider = useCallback((providerId: string) => {
    const provider = providers.find(p => p.id === providerId)
    if (provider?.isGlobal || PRESET_PROVIDERS.find(p => p.id === providerId)) {
      alert(t('presetProviderCannotDelete'))
      return
    }
    if (confirm(t('confirmDeleteProvider'))) {
      setProviders(prev => {
        const next = prev.filter(p => p.id !== providerId)
        latestProvidersRef.current = next
        return next
      })
      setModels(prev => {
        const nextModels = prev.filter(m => m.provider !== providerId)
        setDefaultModels(prevDefaults => {
          const next = { ...prevDefaults }
          const remainingModelKeys = new Set(nextModels.map(m => m.modelKey))
              ; (['analysisModel', 'characterModel', 'locationModel', 'storyboardModel', 'editModel', 'videoModel', 'audioModel', 'lipSyncModel', 'voiceDesignModel'] as const)
              .forEach(field => {
                const current = (next as Record<string, string>)[field]
                if (current && !remainingModelKeys.has(current)) {
                  delete (next as Record<string, string>)[field]
                }
              })
          latestDefaultModelsRef.current = next
          return next
        })
        latestModelsRef.current = nextModels
        void performSave(undefined, true)
        return nextModels
      })
    }
  }, [t, performSave, providers])

  const updateProviderInfo = useCallback((providerId: string, name: string, baseUrl?: string) => {
    setProviders(prev => {
      const next = prev.map(p =>
        p.id === providerId ? { ...p, name, baseUrl, isGlobal: true } : p
      )
      latestProvidersRef.current = next
      void performSave(undefined, true)
      return next
    })
  }, [performSave])

  const updateProviderBaseUrl = useCallback((providerId: string, baseUrl: string) => {
    setProviders(prev => {
      const next = prev.map(p =>
        p.id === providerId ? { ...p, baseUrl, isGlobal: true } : p
      )
      latestProvidersRef.current = next
      void performSave(undefined, true)
      return next
    })
  }, [performSave])

  // Model operations
  const toggleModel = useCallback((modelKey: string, providerId?: string) => {
    setModels(prev => {
      const next = prev.map(m =>
        m.modelKey === modelKey && (providerId ? m.provider === providerId : true)
          ? { ...m, enabled: !m.enabled }
          : m
      )
      latestModelsRef.current = next
      void performSave(undefined, true)
      return next
    })
  }, [performSave])

  const updateModel = useCallback((modelKey: string, updates: Partial<CustomModel>, providerId?: string) => {
    let nextModelKey = ''
    setModels(prev => {
      const next = prev.map(m => {
        if (m.modelKey !== modelKey && (providerId ? m.provider !== providerId : true)) return m
        const mergedProvider = updates.provider ?? m.provider
        const mergedModelId = updates.modelId ?? m.modelId
        nextModelKey = encodeModelKey(mergedProvider, mergedModelId)
        return {
          ...m,
          ...updates,
          provider: mergedProvider,
          modelId: mergedModelId,
          modelKey: nextModelKey,
          name: updates.name ?? m.name,
          price: updates.price ?? m.price,
        }
      })
      latestModelsRef.current = next
      return next
    })
    // If model key changed, update default models
    if (nextModelKey && nextModelKey !== modelKey) {
      setDefaultModels(prevDefaults => {
        const next = { ...prevDefaults }
              ; (['analysisModel', 'characterModel', 'locationModel', 'storyboardModel', 'editModel', 'videoModel', 'audioModel', 'lipSyncModel', 'voiceDesignModel'] as const)
          .forEach(field => {
            if ((next as Record<string, string>)[field] === modelKey) {
              (next as Record<string, string>)[field] = nextModelKey
            }
          })
        latestDefaultModelsRef.current = next
        return next
      })
    }
    void performSave(undefined, false)
  }, [performSave])

  const addModel = useCallback((model: Omit<CustomModel, 'enabled'>) => {
    setModels(prev => {
      const next = [
        ...prev,
        {
          ...model,
          modelKey: model.modelKey || encodeModelKey(model.provider, model.modelId),
          price: 0,
          priceLabel: '--',
          enabled: true,
          isGlobal: true,
        },
      ]
      latestModelsRef.current = next
      void performSave(undefined, false)
      return next
    })
  }, [performSave])

  const deleteModel = useCallback((modelKey: string, providerId?: string) => {
    const model = models.find(m => m.modelKey === modelKey && (providerId ? m.provider === providerId : true))
    if (model?.isGlobal || PRESET_MODELS.find(preset => {
      const presetModelKey = encodeModelKey(preset.provider, preset.modelId)
      return presetModelKey === modelKey
    })) {
      alert(t('presetModelCannotDelete'))
      return
    }
    if (confirm(t('confirmDeleteModel'))) {
      setModels(prev => {
        const nextModels = prev.filter(m =>
          !(m.modelKey === modelKey && (providerId ? m.provider === providerId : true))
        )
        setDefaultModels(prevDefaults => {
          const next = { ...prevDefaults }
          const remainingModelKeys = new Set(nextModels.map(m => m.modelKey))
              ; (['analysisModel', 'characterModel', 'locationModel', 'storyboardModel', 'editModel', 'videoModel', 'audioModel', 'lipSyncModel', 'voiceDesignModel'] as const)
            .forEach(field => {
              const current = (next as Record<string, string>)[field]
              if (current && !remainingModelKeys.has(current)) {
                delete (next as Record<string, string>)[field]
              }
            })
          latestDefaultModelsRef.current = next
          return next
        })
        latestModelsRef.current = nextModels
        void performSave(undefined, true)
        return nextModels
      })
    }
  }, [t, performSave, models])

  const getModelsByType = useCallback((type: CustomModel['type']) => {
    return models.filter(m => m.type === type)
  }, [models])

  // Platform fee operations
  const setEnablePlatformFee = useCallback((enabled: boolean) => {
    setEnablePlatformFeeForUserApi(enabled)
    latestEnablePlatformFeeRef.current = enabled
    void performSave(undefined, true)
  }, [performSave])

  const updatePlatformFee = useCallback((type: string, value: number) => {
    setUserApiPlatformFee(prev => {
      const next = { ...prev, [type]: value }
      latestPlatformFeeRef.current = next
      void performSave(undefined, true)
      return next
    })
  }, [performSave])

  return {
    providers,
    models,
    defaultModels,
    workflowConcurrency,
    capabilityDefaults,
    enablePlatformFeeForUserApi,
    userApiPlatformFee,
    setEnablePlatformFee,
    updatePlatformFee,
    loading,
    saveStatus,
    flushConfig,
    updateProviderHidden,
    updateProviderApiKey,
    updateProviderBaseUrl,
    reorderProviders,
    addProvider,
    deleteProvider,
    updateProviderInfo,
    toggleModel,
    updateModel,
    addModel,
    deleteModel,
    updateDefaultModel,
    batchUpdateDefaultModels,
    updateWorkflowConcurrency,
    updateCapabilityDefault,
    getModelsByType,
  }
}
