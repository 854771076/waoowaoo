'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'
import { GlassModalShell } from '@/components/ui/primitives'

interface PricingModel {
  key: string
  provider: string
  modelId: string
  apiType: 'text' | 'image' | 'video' | 'voice' | 'voice-design' | 'lip-sync'
  mode: 'flat' | 'capability'
  flatAmount?: number
  tiers?: Array<{ when: Record<string, string | number | boolean>; amount: number }>
  isCustom: boolean
}

interface PricingFormData {
  provider: string
  modelId: string
  apiType: string
  mode: 'flat' | 'capability'
  flatAmount?: number
  tiers?: Array<{ when: Record<string, string | number | boolean>; amount: number }>
}

const API_TYPE_LABELS: Record<string, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  voice: '语音合成',
  'voice-design': '声音设计',
  'lip-sync': '唇形同步',
}

export default function PricingConfigEditor() {
  const t = useTranslations('admin')
  const [models, setModels] = useState<PricingModel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingModel, setEditingModel] = useState<PricingModel | null>(null)
  const [filter, setFilter] = useState('')
  const [apiTypeFilter, setApiTypeFilter] = useState<string>('all')

  const loadPricing = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/pricing')
      if (res.ok) {
        const data = await res.json()
        setModels(data.models || [])
      }
    } catch (error) {
      console.error('Failed to load pricing:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPricing()
  }, [loadPricing])

  const handleSaveModel = async (formData: PricingFormData) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/admin/pricing/model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        await loadPricing()
        setShowAddModal(false)
        setEditingModel(null)
      }
    } catch (error) {
      console.error('Failed to save pricing:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteModel = async (key: string) => {
    if (!confirm('确定要删除此定价配置吗？')) return
    try {
      const res = await apiFetch('/api/admin/pricing/model', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (res.ok) {
        await loadPricing()
      }
    } catch (error) {
      console.error('Failed to delete pricing:', error)
    }
  }

  const filteredModels = models.filter((m) => {
    const matchesSearch =
      m.provider.toLowerCase().includes(filter.toLowerCase()) ||
      m.modelId.toLowerCase().includes(filter.toLowerCase())
    const matchesType = apiTypeFilter === 'all' || m.apiType === apiTypeFilter
    return matchesSearch && matchesType
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--glass-text-secondary)]">{t('loading')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">模型定价配置</h2>
          <p className="text-sm text-[var(--glass-text-secondary)]">管理系统内置模型和自定义模型的计费价格</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="glass-btn-base glass-btn-primary flex items-center gap-2 px-4 py-2 text-sm font-medium"
        >
          <AppIcon name="plus" className="w-4 h-4" />
          添加定价
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="搜索模型或提供商..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="glass-input-base w-full px-3 py-2 text-sm"
          />
        </div>
        <select
          value={apiTypeFilter}
          onChange={(e) => setApiTypeFilter(e.target.value)}
          className="glass-input-base px-3 py-2 text-sm"
        >
          <option value="all">全部类型</option>
          {Object.entries(API_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="glass-surface-soft rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--glass-stroke-base)]">
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--glass-text-secondary)]">提供商</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--glass-text-secondary)]">模型 ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--glass-text-secondary)]">类型</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--glass-text-secondary)]">定价模式</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--glass-text-secondary)]">价格</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--glass-text-secondary)]">来源</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[var(--glass-text-secondary)]">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredModels.map((model) => (
              <tr key={model.key} className="border-b border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-muted)]/30">
                <td className="px-4 py-3 text-sm font-medium text-[var(--glass-text-primary)]">{model.provider}</td>
                <td className="px-4 py-3 text-sm font-mono text-[var(--glass-text-secondary)]">{model.modelId}</td>
                <td className="px-4 py-3 text-sm text-[var(--glass-text-secondary)]">{API_TYPE_LABELS[model.apiType] || model.apiType}</td>
                <td className="px-4 py-3 text-sm text-[var(--glass-text-secondary)]">
                  {model.mode === 'flat' ? '固定价格' : '能力分级'}
                </td>
                <td className="px-4 py-3 text-sm text-[var(--glass-text-primary)] font-medium">
                  {model.mode === 'flat'
                    ? `¥${model.flatAmount?.toFixed(4) || '0'}`
                    : `${model.tiers?.length || 0} 个分级`}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    model.isCustom
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-gray-500/10 text-gray-600 dark:text-gray-400'
                  }`}>
                    {model.isCustom ? '自定义' : '内置'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditingModel(model)}
                      className="glass-icon-btn-sm"
                      title="编辑"
                    >
                      <AppIcon name="edit" className="w-4 h-4" />
                    </button>
                    {model.isCustom && (
                      <button
                        onClick={() => handleDeleteModel(model.key)}
                        className="glass-icon-btn-sm text-[var(--glass-tone-danger-fg)]"
                        title="删除"
                      >
                        <AppIcon name="trash" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredModels.length === 0 && (
          <div className="text-center py-12 text-[var(--glass-text-tertiary)]">
            没有找到匹配的模型
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingModel) && (
        <PricingEditModal
          model={editingModel}
          onClose={() => { setShowAddModal(false); setEditingModel(null) }}
          onSave={handleSaveModel}
          saving={saving}
        />
      )}
    </div>
  )
}

function PricingEditModal({
  model,
  onClose,
  onSave,
  saving,
}: {
  model?: PricingModel | null
  onClose: () => void
  onSave: (data: PricingFormData) => Promise<void>
  saving: boolean
}) {
  const t = useTranslations('admin')
  const isEditing = !!model

  const [formData, setFormData] = useState<PricingFormData>(
    model || {
      provider: '',
      modelId: '',
      apiType: 'text',
      mode: 'flat',
      flatAmount: 0,
      tiers: [],
    }
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave(formData)
  }

  const addTier = () => {
    setFormData({
      ...formData,
      mode: 'capability',
      tiers: [...(formData.tiers || []), { when: {}, amount: 0 }],
    })
  }

  const updateTier = (index: number, field: 'when' | 'amount', keyOrValue: string | number, value?: string | number | boolean) => {
    const newTiers = [...(formData.tiers || [])]
    if (field === 'amount') {
      newTiers[index] = { ...newTiers[index], amount: Number(keyOrValue) }
    } else {
      const key = keyOrValue as string
      const when = { ...newTiers[index].when }
      if (value === undefined || value === '') {
        delete when[key]
      } else {
        when[key] = value
      }
      newTiers[index] = { ...newTiers[index], when }
    }
    setFormData({ ...formData, tiers: newTiers })
  }

  const removeTier = (index: number) => {
    const newTiers = [...(formData.tiers || [])]
    newTiers.splice(index, 1)
    setFormData({ ...formData, tiers: newTiers })
  }

  return (
    <GlassModalShell open={true} onClose={onClose} title={isEditing ? '编辑定价' : '添加定价'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">提供商</label>
            <input
              type="text"
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
              className="glass-input-base w-full px-3 py-2 text-sm"
              placeholder="如：openai"
              required
              disabled={isEditing}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">模型 ID</label>
            <input
              type="text"
              value={formData.modelId}
              onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
              className="glass-input-base w-full px-3 py-2 text-sm font-mono"
              placeholder="如：gpt-4"
              required
              disabled={isEditing}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">API 类型</label>
            <select
              value={formData.apiType}
              onChange={(e) => setFormData({ ...formData, apiType: e.target.value })}
              className="glass-input-base w-full px-3 py-2 text-sm"
              disabled={isEditing}
            >
              {Object.entries(API_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">定价模式</label>
            <select
              value={formData.mode}
              onChange={(e) => setFormData({ ...formData, mode: e.target.value as 'flat' | 'capability' })}
              className="glass-input-base w-full px-3 py-2 text-sm"
            >
              <option value="flat">固定价格</option>
              <option value="capability">能力分级</option>
            </select>
          </div>
        </div>

        {formData.mode === 'flat' ? (
          <div>
            <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">单次调用价格（元）</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={formData.flatAmount || ''}
              onChange={(e) => setFormData({ ...formData, flatAmount: Number(e.target.value) })}
              className="glass-input-base w-full px-3 py-2 text-sm"
              placeholder="0.01"
              required
            />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-[var(--glass-text-secondary)]">分级配置</label>
              <button
                type="button"
                onClick={addTier}
                className="glass-btn-base glass-btn-soft px-3 py-1 text-xs"
              >
                <AppIcon name="plus" className="w-3 h-3 mr-1" />
                添加分级
              </button>
            </div>
            <div className="space-y-3">
              {(formData.tiers || []).map((tier, index) => (
                <div key={index} className="glass-surface-soft rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-[var(--glass-text-secondary)]">分级 #{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeTier(index)}
                      className="glass-icon-btn-sm"
                    >
                      <AppIcon name="trash" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2 mb-3">
                    {Object.entries(tier.when).map(([key, value]) => (
                      <div key={key} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={key}
                          onChange={(e) => {
                            const newWhen = { ...tier.when }
                            delete (newWhen as Record<string, unknown>)[key]
                            ;(newWhen as Record<string, unknown>)[e.target.value] = value
                            updateTier(index, 'when', e.target.value, value)
                          }}
                          className="glass-input-base flex-1 px-2 py-1 text-xs"
                          placeholder="条件字段名"
                        />
                        <span className="text-[var(--glass-text-tertiary)]">=</span>
                        <input
                          type="text"
                          value={String(value)}
                          onChange={(e) => updateTier(index, 'when', key, e.target.value)}
                          className="glass-input-base flex-1 px-2 py-1 text-xs"
                          placeholder="条件值"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={tier.amount}
                      onChange={(e) => updateTier(index, 'amount', Number(e.target.value))}
                      className="glass-input-base flex-1 px-2 py-1 text-xs"
                      placeholder="此分级的价格（元）"
                    />
                  </div>
                </div>
              ))}
              {(formData.tiers || []).length === 0 && (
                <p className="text-xs text-[var(--glass-text-tertiary)] text-center py-4">
                  暂无分级配置，请点击上方按钮添加
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--glass-stroke-base)]">
          <button
            type="button"
            onClick={onClose}
            className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm font-medium"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium"
          >
            {saving ? t('saving') : t('saveConfig')}
          </button>
        </div>
      </form>
    </GlassModalShell>
  )
}
