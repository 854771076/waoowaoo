'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useEditorStageRuntime } from '@/lib/novel-promotion/stages/editor-stage-runtime-core'
import { useEditorExport } from '@/lib/novel-promotion/stages/editor-stage-runtime/useEditorExport'
import { ExportPanel } from './ExportPanel'
import { SaveStatusIndicator } from './SaveStatusIndicator'
import { TwickEditor } from './TwickEditor'
import { useWorkspaceProvider } from '../../WorkspaceProvider'
import { useRouter } from '@/i18n/navigation'

interface EditorStageShellProps {
  videoWidth: number
  videoHeight: number
  /** Fullscreen route mode: fixed inset-0 + back button. */
  fullscreen?: boolean
}

/**
 * 抑制来自 Twick 编辑器内部的可预期错误(如元素在挂载/卸载时的 null 引用)
 * 只做 console 静音,不阻止事件传播 —— 否则会屏蔽全站的真实错误监控。
 */
function useSuppressTwickErrors() {
  useEffect(() => {
    const suppressedPatterns = [
      'Cannot read properties of null',
      'Cannot read properties of undefined',
      'ELEMENT_NOT_ADDED',
      'getBoundingClientRect',
    ]

    const suppress = (event: PromiseRejectionEvent | ErrorEvent) => {
      const message = 'reason' in event
        ? (event.reason?.message || event.reason?.toString() || '')
        : (event.error?.message || event.message || '')

      if (suppressedPatterns.some(pattern => String(message).includes(pattern))) {
        // ponytail: don't preventDefault — that hides everything from Sentry / DevTools
        // globally, not just Twick. Stop propagation only.
        event.stopImmediatePropagation?.()
      }
    }

    window.addEventListener('unhandledrejection', suppress)
    window.addEventListener('error', suppress)
    return () => {
      window.removeEventListener('unhandledrejection', suppress)
      window.removeEventListener('error', suppress)
    }
  }, [])
}

export function EditorStageShell({ videoWidth, videoHeight, fullscreen }: EditorStageShellProps) {
  const t = useTranslations('novelPromotion.editor')
  const tc = useTranslations('common')
  const exportT = useTranslations('novelPromotion.editor.export')
  const router = useRouter()
  const { projectId, episodeId, subscribeTaskEvents } = useWorkspaceProvider()
  const { editorProjectId, editorProjectRender, isLoadingData, isLoadingProject, isSaving, flushProjectSave, resetToInitial } = useEditorStageRuntime()
  const [isExportPanelOpen, setIsExportPanelOpen] = useState(false)
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const handleReset = async () => {
    setIsResetting(true)
    setIsResetConfirmOpen(false)
    try {
      await resetToInitial()
    } finally {
      setIsResetting(false)
    }
  }

  useSuppressTwickErrors()

  const exportRuntime = useEditorExport({
    projectId,
    episodeId: episodeId || null,
    editorProjectId,
    flushProjectSave,
    subscribeTaskEvents,
    initialRenderState: editorProjectRender,
    t: (key) => exportT(key as never),
  })

  const exportDisabledReason = useMemo(() => {
    if (!episodeId || !editorProjectId) return exportT('missingContext')
    if (isLoadingData || isLoadingProject) return exportT('loading')
    return null
  }, [editorProjectId, episodeId, exportT, isLoadingData, isLoadingProject])

  const rootClassName = fullscreen
    // ponytail: overflow-y-auto tolerates short viewports (browser zoom / laptop screens).
    ? 'fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col overflow-y-auto bg-[var(--glass-bg)]'
    : 'relative -mx-4 flex h-[calc(100vh-96px)] w-[calc(100%+2rem)] flex-col overflow-hidden border-y border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-xl backdrop-blur-xl sm:-mx-6 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:w-[calc(100%+4rem)]'

  const handleBack = () => {
    router.push({
      pathname: `/workspace/${projectId}`,
      query: episodeId ? { stage: 'videos', episode: episodeId } : { stage: 'videos' },
    })
  }

  return (
    <div className={rootClassName}>
      <div className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--glass-border)] bg-gradient-to-r from-white/60 via-white/40 to-white/60 px-5">
        <div className="flex min-w-0 items-center gap-3">
          {fullscreen && (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--glass-text-primary)] shadow-sm transition hover:bg-white/90"
            >
              <AppIcon name="chevronRight" className="h-3.5 w-3.5 rotate-180" strokeWidth={2.4} aria-hidden />
              {tc('back')}
            </button>
          )}
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--glass-accent-from)] to-[var(--glass-accent-to)] text-white shadow-md">
            <AppIcon name="clapperboard" className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--glass-text-primary)]">{t('title')}</div>
            <div className="truncate text-[11px] text-[var(--glass-text-tertiary)]">
              {t('subtitle', { width: videoWidth, height: videoHeight })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatusIndicator />
          <button
            type="button"
            onClick={() => setIsResetConfirmOpen(true)}
            disabled={isResetting || isSaving || isLoadingData || isLoadingProject}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-xs font-medium text-[var(--glass-text-primary)] shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AppIcon name="refresh" className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            {t('reset.button')}
          </button>
          <button
            type="button"
            onClick={() => setIsExportPanelOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[var(--glass-accent-from)] to-[var(--glass-accent-to)] px-4 py-2 text-xs font-medium text-white shadow-md transition hover:shadow-lg hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--glass-accent-from)]/60"
          >
            <AppIcon name="download" className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            {t('export.openButton')}
          </button>
        </div>
      </div>

      {/* ponytail: Twick .twick-editor-container 硬编码 height:80dvh (预览区),
          外加控件 + 时间轴 ~360px。全屏时给足最小高度,不够就外层滚动。 */}
      <div className={fullscreen ? 'flex flex-1 min-h-[calc(80dvh+360px)]' : 'flex min-h-0 flex-1 overflow-hidden'}>
        <TwickEditor videoWidth={videoWidth} videoHeight={videoHeight} />
      </div>

      {isExportPanelOpen ? (
        <ExportPanel
          exportRuntime={exportRuntime}
          disabledReason={exportDisabledReason}
          onClose={() => setIsExportPanelOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        show={isResetConfirmOpen}
        type="warning"
        title={t('reset.confirmTitle')}
        message={t('reset.confirmMessage')}
        confirmText={t('reset.confirmButton')}
        cancelText={t('reset.cancelButton')}
        onConfirm={handleReset}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  )
}
