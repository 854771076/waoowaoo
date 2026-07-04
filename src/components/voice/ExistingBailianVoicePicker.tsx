'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'

type BailianVoiceSource = 'cosyvoice' | 'qwen'

interface BailianVoice {
  voiceId: string
  prefix?: string
  targetModel?: string
  status?: string
  createTime?: string
  source: BailianVoiceSource
}

interface PickerProps {
  projectId: string
  open: boolean
  onClose: () => void
  onPick: (voiceId: string) => Promise<void> | void
}

export default function ExistingBailianVoicePicker({ projectId, open, onClose, onPick }: PickerProps) {
  const t = useTranslations('assets')
  const tv = useTranslations('voice.voiceCreate')
  const [voices, setVoices] = useState<BailianVoice[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bindingId, setBindingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setVoices(null)
    ;(async () => {
      try {
        const res = await apiFetch(`/api/novel-promotion/${projectId}/bailian-voices`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(data.error || 'load failed')
        }
        const data = await res.json() as { success: boolean; voices: BailianVoice[]; error?: string }
        if (cancelled) return
        if (!data.success) throw new Error(data.error || 'load failed')
        setVoices(data.voices)
      } catch (err: unknown) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, projectId])

  if (!open || typeof document === 'undefined') return null

  const handlePick = async (voiceId: string) => {
    setBindingId(voiceId)
    try {
      await onPick(voiceId)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'bind failed')
    } finally {
      setBindingId(null)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] glass-overlay" onClick={onClose} />
      <div
        className="fixed z-[9999] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 glass-surface-modal w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] shrink-0">
          <div className="flex items-center gap-2">
            <AppIcon name="mic" className="w-5 h-5 text-[var(--glass-tone-info-fg)]" />
            <h2 className="font-semibold text-[var(--glass-text-primary)]">{tv('existingVoicesTitle')}</h2>
          </div>
          <button onClick={onClose} className="glass-btn-base glass-btn-soft p-1 text-[var(--glass-text-tertiary)]">
            <AppIcon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2">
          {loading && <div className="text-sm text-[var(--glass-text-secondary)] text-center py-6">{tv('loadingVoices')}…</div>}
          {error && (
            <div className="text-sm text-[var(--glass-tone-danger-fg)] bg-[var(--glass-tone-danger-bg)] px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          {voices && voices.length === 0 && !loading && (
            <div className="text-sm text-[var(--glass-text-tertiary)] text-center py-6">{tv('noExistingVoices')}</div>
          )}
          {voices && voices.map((v) => {
            const isReady = !v.status || v.status === 'OK'
            return (
              <button
                key={v.voiceId}
                type="button"
                onClick={() => { void handlePick(v.voiceId) }}
                disabled={bindingId !== null || !isReady}
                title={!isReady ? `status: ${v.status}` : undefined}
                className="w-full text-left glass-surface-soft border border-[var(--glass-stroke-base)] rounded-lg px-3 py-2 hover:border-[var(--glass-stroke-focus)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-mono text-[var(--glass-text-primary)] truncate">{v.voiceId}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    v.source === 'cosyvoice'
                      ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                      : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
                  }`}>
                    {v.source === 'cosyvoice' ? 'CosyVoice' : 'Qwen'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--glass-text-tertiary)]">
                  {v.targetModel && <span>{v.targetModel}</span>}
                  {v.prefix && <span>prefix: {v.prefix}</span>}
                  {v.status && <span className={!isReady ? 'text-[var(--glass-tone-warning-fg)]' : ''}>{v.status}</span>}
                  {bindingId === v.voiceId && <span className="text-[var(--glass-tone-info-fg)]">{tv('binding')}…</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </>,
    document.body,
  )
}
