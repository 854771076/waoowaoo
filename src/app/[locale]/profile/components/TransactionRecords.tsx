'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'

type TransactionType = 'all' | 'recharge' | 'consume'

interface BillingMeta {
  quantity?: number
  unit?: string
  model?: string
  apiType?: string
  resolution?: string
  duration?: number
  inputTokens?: number
  outputTokens?: number
  isPlatformFee?: boolean
  platformFeeRate?: number
}

interface Transaction {
  id: string
  type: 'recharge' | 'consume'
  amount: number
  balanceAfter: number
  description: string | null
  action: string | null
  projectId: string | null
  projectName: string | null
  episodeId: string | null
  episodeNumber: number | null
  episodeName: string | null
  billingMeta: BillingMeta | null
  createdAt: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatBillingDetail(
  billingMeta: BillingMeta | null,
  t: (key: string) => string
): string {
  if (!billingMeta) return ''

  const { quantity, unit, apiType, resolution, duration, inputTokens, outputTokens } = billingMeta

  if (unit === 'image' && quantity) {
    return resolution
      ? t('billingDetail.imageWithRes').replace('{count}', String(quantity)).replace('{resolution}', resolution)
      : t('billingDetail.image').replace('{count}', String(quantity))
  }

  if (unit === 'video' && quantity) {
    return resolution
      ? t('billingDetail.videoWithRes').replace('{count}', String(quantity)).replace('{resolution}', resolution)
      : t('billingDetail.video').replace('{count}', String(quantity))
  }

  if (unit === 'second' && duration) {
    return t('billingDetail.seconds').replace('{count}', String(duration))
  }

  if ((unit === 'token' || unit === 'tokens') && (inputTokens || outputTokens)) {
    const total = (inputTokens || 0) + (outputTokens || 0)
    return t('billingDetail.tokens').replace('{count}', String(total))
  }

  if (quantity) {
    return t('billingDetail.calls').replace('{count}', String(quantity))
  }

  return ''
}

function getActionLabel(
  action: string | null,
  billingMeta: BillingMeta | null,
  t: (key: string) => string
): string {
  // Try action key translation first
  if (action) {
    const actionKey = `actionTypes.${action}`
    const translated = t(actionKey)
    if (translated !== actionKey) return translated
  }

  // Fallback to apiType translation
  if (billingMeta?.apiType) {
    const apiTypeKey = `apiTypes.${billingMeta.apiType}`
    const translated = t(apiTypeKey)
    if (translated !== apiTypeKey) return translated
  }

  return action || billingMeta?.model || ''
}

export default function TransactionRecords() {
  const t = useTranslations('profile')
  const tc = useTranslations('common')

  const [activeType, setActiveType] = useState<TransactionType>('all')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0
  })
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchTransactions = async (page: number = 1, type: TransactionType = 'all') => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        type
      })
      const res = await apiFetch(`/api/user/transactions?${params.toString()}`)
      const data = await res.json()
      setTransactions(data.transactions || [])
      setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 })
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions(1, activeType)
  }, [activeType])

  const handlePageChange = (newPage: number) => {
    fetchTransactions(newPage, activeType)
  }

  const handleTypeChange = (type: TransactionType) => {
    setActiveType(type)
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with type filter tabs */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-stroke-base)]">
        <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('accountTransactions')}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleTypeChange('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeType === 'all'
              ? 'bg-[var(--glass-bg-accent)] text-[var(--glass-text-accent)]'
              : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
              }`}
          >
            {t('allTypes')}
          </button>
          <button
            onClick={() => handleTypeChange('consume')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeType === 'consume'
              ? 'bg-[var(--glass-bg-accent)] text-[var(--glass-text-accent)]'
              : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
              }`}
          >
            {t('consume')}
          </button>
          <button
            onClick={() => handleTypeChange('recharge')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeType === 'recharge'
              ? 'bg-[var(--glass-bg-accent)] text-[var(--glass-text-accent)]'
              : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
              }`}
          >
            {t('recharge')}
          </button>
        </div>
      </div>

      {/* Transaction list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40">
            <AppIcon name="receipt" className="mb-4 h-10 w-10 text-[var(--glass-text-tertiary)]" />
            <p className="text-[var(--glass-text-secondary)]">{t('noTransactions')}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--glass-stroke-base)]">
            {transactions.map((tx) => (
              <div key={tx.id} className="px-6 py-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleExpand(tx.id)}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Icon based on type */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tx.type === 'recharge' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'
                      }`}>
                      <AppIcon name={tx.type === 'recharge' ? 'plus' : 'arrowRight'} className="w-5 h-5" />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--glass-text-primary)] truncate">
                          {getActionLabel(tx.action, tx.billingMeta, t)}
                        </span>
                        {tx.billingMeta?.isPlatformFee && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500">
                            平台服务费
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-[var(--glass-text-secondary)]">
                        <span>{formatDate(tx.createdAt)}</span>
                        {formatBillingDetail(tx.billingMeta, t) && (
                          <span className="truncate">{formatBillingDetail(tx.billingMeta, t)}</span>
                        )}
                        {tx.billingMeta?.model && (
                          <span className="truncate max-w-[200px]">{tx.billingMeta.model}</span>
                        )}
                      </div>
                      {/* Project/episode context */}
                      {(tx.projectName || tx.episodeNumber) && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-[var(--glass-text-tertiary)]">
                          {tx.projectName && <span>项目: {tx.projectName}</span>}
                          {tx.projectName && tx.episodeNumber && <span>·</span>}
                          {tx.episodeNumber && (
                            <span>{t('episodeLabel').replace('{number}', String(tx.episodeNumber))}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Amount and expand icon */}
                  <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                    <div className="text-right">
                      <div className={`font-semibold ${tx.type === 'recharge' ? 'text-green-500' : 'text-red-500'}`}>
                        {tx.type === 'recharge' ? '+' : '-'}¥{Math.abs(tx.amount).toFixed(2)}
                      </div>
                      <div className="text-xs text-[var(--glass-text-tertiary)]">
                        {t('balanceAfter').replace('{amount}', `¥${tx.balanceAfter.toFixed(2)}`)}
                      </div>
                    </div>
                    <AppIcon
                      name={expandedId === tx.id ? 'chevronUp' : 'chevronDown'}
                      className="w-4 h-4 text-[var(--glass-text-tertiary)]"
                    />
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === tx.id && tx.billingMeta && (
                  <div className="mt-4 ml-14 p-4 rounded-xl bg-[var(--glass-bg-muted)]">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {tx.billingMeta.quantity && (
                        <div>
                          <span className="text-[var(--glass-text-tertiary)]">数量: </span>
                          <span className="text-[var(--glass-text-primary)]">{tx.billingMeta.quantity}</span>
                        </div>
                      )}
                      {tx.billingMeta.unit && (
                        <div>
                          <span className="text-[var(--glass-text-tertiary)]">单位: </span>
                          <span className="text-[var(--glass-text-primary)]">{tx.billingMeta.unit}</span>
                        </div>
                      )}
                      {tx.billingMeta.inputTokens !== undefined && (
                        <div>
                          <span className="text-[var(--glass-text-tertiary)]">输入 tokens: </span>
                          <span className="text-[var(--glass-text-primary)]">{tx.billingMeta.inputTokens}</span>
                        </div>
                      )}
                      {tx.billingMeta.outputTokens !== undefined && (
                        <div>
                          <span className="text-[var(--glass-text-tertiary)]">输出 tokens: </span>
                          <span className="text-[var(--glass-text-primary)]">{tx.billingMeta.outputTokens}</span>
                        </div>
                      )}
                      {tx.billingMeta.resolution && (
                        <div>
                          <span className="text-[var(--glass-text-tertiary)]">分辨率: </span>
                          <span className="text-[var(--glass-text-primary)]">{tx.billingMeta.resolution}</span>
                        </div>
                      )}
                      {tx.billingMeta.duration && (
                        <div>
                          <span className="text-[var(--glass-text-tertiary)]">时长: </span>
                          <span className="text-[var(--glass-text-primary)]">{tx.billingMeta.duration}秒</span>
                        </div>
                      )}
                      {tx.billingMeta.platformFeeRate !== undefined && (
                        <div className="col-span-2">
                          <span className="text-[var(--glass-text-tertiary)]">平台费率: </span>
                          <span className="text-[var(--glass-text-primary)]">{(tx.billingMeta.platformFeeRate * 100).toFixed(0)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination footer */}
      {!loading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--glass-stroke-base)]">
          <div className="text-sm text-[var(--glass-text-secondary)]">
            {t('pagination')
              .replace('{total}', String(pagination.total))
              .replace('{page}', String(pagination.page))
              .replace('{totalPages}', String(pagination.totalPages))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]"
            >
              {t('previousPage')}
            </button>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]"
            >
              {t('nextPage')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
