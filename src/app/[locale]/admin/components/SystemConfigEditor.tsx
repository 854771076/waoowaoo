'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { AppIcon } from '@/components/ui/icons'
import { GlassButton } from '@/components/ui/primitives'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

interface SystemConfig {
  llmBaseUrl: string | null
  llmApiKey: string | null
  falApiKey: string | null
  googleAiKey: string | null
  arkApiKey: string | null
  qwenApiKey: string | null
  newapiApiKey: string | null
  newapiBaseUrl: string | null
  customModels: string | null
  customProviders: string | null
}

export default function SystemConfigEditor() {
  const t = useTranslations('admin')
  const ta = useTranslations('apiConfig')
  const tc = useTranslations('common')
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  const fetchConfig = async () => {
    try {
      const res = await apiFetch('/api/admin/system-config')
      const data = await res.json()
      setConfig(data.config)
    } catch (error) {
      console.error('Failed to fetch system config:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setSaveStatus('saving')
    try {
      await apiFetch('/api/admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      console.error('Failed to save system config:', error)
      setSaveStatus('failed')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setSaving(false)
    }
  }

  const toggleShowSecret = (field: string) => {
    setShowSecrets({ ...showSecrets, [field]: !showSecrets[field] })
  }

  const updateConfig = (field: keyof SystemConfig, value: string | null) => {
    if (!config) return
    setConfig({ ...config, [field]: value })
  }

  const savingState = saveStatus === 'saving'
    ? resolveTaskPresentationState({
        phase: 'processing',
        intent: 'modify',
        resource: 'text',
        hasOutput: true,
      })
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--glass-text-secondary)]">
        {tc('loading')}
      </div>
    )
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--glass-text-secondary)]">
        {t('failedToLoadConfig')}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-[var(--glass-text-secondary)]">{t('systemConfigDescription')}</p>
      </div>

      <div className="space-y-6">
        {/* OpenRouter / LLM Configuration */}
        <div className="glass-surface rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
            <AppIcon name="menu" className="w-4 h-4" />
            {ta('defaultLlmProvider')}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                {ta('baseUrl')}
              </label>
              <input
                type="text"
                value={config.llmBaseUrl || ''}
                onChange={(e) => updateConfig('llmBaseUrl', e.target.value || null)}
                className="glass-input-base w-full px-3 py-2.5 text-sm font-mono"
                placeholder="https://openrouter.ai/api/v1"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                {ta('apiKeyLabel')}
              </label>
              <div className="relative">
                <input
                  type={showSecrets.llmApiKey ? 'text' : 'password'}
                  value={config.llmApiKey || ''}
                  onChange={(e) => updateConfig('llmApiKey', e.target.value || null)}
                  className="glass-input-base w-full px-3 py-2.5 pr-12 text-sm"
                  placeholder="API Key"
                />
                <button
                  onClick={() => toggleShowSecret('llmApiKey')}
                  className="glass-btn-base glass-btn-soft absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1"
                >
                  {showSecrets.llmApiKey ? (
                    <AppIcon name="eyeOff" className="w-4 h-4" />
                  ) : (
                    <AppIcon name="eye" className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Image Generation (Fal.ai) */}
        <div className="glass-surface rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
            <AppIcon name="image" className="w-4 h-4" />
            Fal.ai {ta('apiKeyLabel')}
          </h3>
          <div className="relative">
            <input
              type={showSecrets.falApiKey ? 'text' : 'password'}
              value={config.falApiKey || ''}
              onChange={(e) => updateConfig('falApiKey', e.target.value || null)}
              className="glass-input-base w-full px-3 py-2.5 pr-12 text-sm"
              placeholder="Fal.ai API Key"
            />
            <button
              onClick={() => toggleShowSecret('falApiKey')}
              className="glass-btn-base glass-btn-soft absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1"
            >
              {showSecrets.falApiKey ? (
                <AppIcon name="eyeOff" className="w-4 h-4" />
              ) : (
                <AppIcon name="eye" className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Google AI / Gemini */}
        <div className="glass-surface rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
            <AppIcon name="sparkles" className="w-4 h-4" />
            Google AI (Gemini) {ta('apiKeyLabel')}
          </h3>
          <div className="relative">
            <input
              type={showSecrets.googleAiKey ? 'text' : 'password'}
              value={config.googleAiKey || ''}
              onChange={(e) => updateConfig('googleAiKey', e.target.value || null)}
              className="glass-input-base w-full px-3 py-2.5 pr-12 text-sm"
              placeholder="Google AI API Key"
            />
            <button
              onClick={() => toggleShowSecret('googleAiKey')}
              className="glass-btn-base glass-btn-soft absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1"
            >
              {showSecrets.googleAiKey ? (
                <AppIcon name="eyeOff" className="w-4 h-4" />
              ) : (
                <AppIcon name="eye" className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* ByteDance Ark */}
        <div className="glass-surface rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
            <AppIcon name="sparkles" className="w-4 h-4" />
            ByteDance Ark API Key
          </h3>
          <div className="relative">
            <input
              type={showSecrets.arkApiKey ? 'text' : 'password'}
              value={config.arkApiKey || ''}
              onChange={(e) => updateConfig('arkApiKey', e.target.value || null)}
              className="glass-input-base w-full px-3 py-2.5 pr-12 text-sm"
              placeholder="Ark API Key"
            />
            <button
              onClick={() => toggleShowSecret('arkApiKey')}
              className="glass-btn-base glass-btn-soft absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1"
            >
              {showSecrets.arkApiKey ? (
                <AppIcon name="eyeOff" className="w-4 h-4" />
              ) : (
                <AppIcon name="eye" className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Alibaba Qwen */}
        <div className="glass-surface rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
            <AppIcon name="sparkles" className="w-4 h-4" />
            Alibaba Qwen API Key
          </h3>
          <div className="relative">
            <input
              type={showSecrets.qwenApiKey ? 'text' : 'password'}
              value={config.qwenApiKey || ''}
              onChange={(e) => updateConfig('qwenApiKey', e.target.value || null)}
              className="glass-input-base w-full px-3 py-2.5 pr-12 text-sm"
              placeholder="Qwen API Key"
            />
            <button
              onClick={() => toggleShowSecret('qwenApiKey')}
              className="glass-btn-base glass-btn-soft absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1"
            >
              {showSecrets.qwenApiKey ? (
                <AppIcon name="eyeOff" className="w-4 h-4" />
              ) : (
                <AppIcon name="eye" className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* NewAPI */}
        <div className="glass-surface rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
            <AppIcon name="sparkles" className="w-4 h-4" />
            NewAPI Configuration
          </h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                {ta('baseUrl')}
              </label>
              <input
                type="text"
                value={config.newapiBaseUrl || ''}
                onChange={(e) => updateConfig('newapiBaseUrl', e.target.value || null)}
                className="glass-input-base w-full px-3 py-2.5 text-sm font-mono"
                placeholder="https://api.newapi.com/v1"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                {ta('apiKeyLabel')}
              </label>
              <div className="relative">
                <input
                  type={showSecrets.newapiApiKey ? 'text' : 'password'}
                  value={config.newapiApiKey || ''}
                  onChange={(e) => updateConfig('newapiApiKey', e.target.value || null)}
                  className="glass-input-base w-full px-3 py-2.5 pr-12 text-sm"
                  placeholder="NewAPI API Key"
                />
                <button
                  onClick={() => toggleShowSecret('newapiApiKey')}
                  className="glass-btn-base glass-btn-soft absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1"
                >
                  {showSecrets.newapiApiKey ? (
                    <AppIcon name="eyeOff" className="w-4 h-4" />
                  ) : (
                    <AppIcon name="eye" className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Configuration (JSON fields) */}
        <div className="glass-surface rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
            <AppIcon name="fileText" className="w-4 h-4" />
            {t('customConfiguration')}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                Custom Models (JSON)
              </label>
              <textarea
                value={config.customModels || ''}
                onChange={(e) => updateConfig('customModels', e.target.value || null)}
                className="glass-input-base w-full px-3 py-2.5 text-sm font-mono h-24"
                placeholder='[{"id": "model-id", "name": "Model Name", ...}]'
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
                Custom Providers (JSON)
              </label>
              <textarea
                value={config.customProviders || ''}
                onChange={(e) => updateConfig('customProviders', e.target.value || null)}
                className="glass-input-base w-full px-3 py-2.5 text-sm font-mono h-24"
                placeholder='[{"id": "provider-id", "name": "Provider Name", ...}]'
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Status and Button */}
      <div className="mt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="text-sm text-[var(--glass-text-secondary)] flex items-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {ta('saving')}
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <AppIcon name="check" className="h-4 w-4" />
              {ta('saved')}
            </span>
          )}
          {saveStatus === 'failed' && (
            <span className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <AppIcon name="close" className="h-4 w-4" />
              {ta('saveFailed')}
            </span>
          )}
        </div>
        <GlassButton
          onClick={handleSave}
          variant="primary"
          disabled={saving}
        >
          {saving ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
              {tc('loading')}
            </>
          ) : (
            t('saveConfig')
          )}
        </GlassButton>
      </div>
    </div>
  )
}
