'use client'

import { useMemo } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { toDisplayImageUrl } from '@/lib/media/image-url'
import { useSplitGridPanel } from '@/lib/query/hooks/useStoryboards'
import type { GridVideoFrame, VideoPanel } from '../types'

interface GridSplitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  episodeId?: string
  panel: VideoPanel
  t: (key: string, params?: Record<string, unknown>) => string
}

function getPromptForFrame(frame: GridVideoFrame | undefined): string {
  return frame?.videoPrompt || frame?.action || frame?.description || ''
}

export default function GridSplitDialog({
  open,
  onOpenChange,
  projectId,
  episodeId,
  panel,
  t,
}: GridSplitDialogProps) {
  const splitMutation = useSplitGridPanel(projectId, episodeId || null)
  const framesByIndex = useMemo(() => {
    const map = new Map<number, GridVideoFrame>()
    for (const frame of panel.gridVideoFrames || []) {
      map.set(frame.cellIndex, frame)
    }
    return map
  }, [panel.gridVideoFrames])

  if (!open) return null

  const images = panel.gridSplitImages || []
  const hasSplitImages = images.length > 0
  const originalGridImageUrl = toDisplayImageUrl(panel.imageUrl)
  const isEnhancing = splitMutation.isPending || !!panel.gridSplitEnhanceTaskRunning
  const handleSplit = (force: boolean) => {
    if (!panel.panelId) return
    void splitMutation.mutateAsync({ panelId: panel.panelId, force })
  }
  const handleEnhance = (cellIndex?: number) => {
    if (!panel.panelId) return
    void splitMutation.mutateAsync({ panelId: panel.panelId, enhance: true, ...(cellIndex ? { cellIndex } : {}) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6">
      <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('panelCard.gridSplitDialogTitle')}</h3>
            <p className="mt-0.5 text-xs text-[var(--glass-text-tertiary)]">{t('panelCard.gridSplitDialogDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1 text-[var(--glass-text-tertiary)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]"
          >
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="grid max-h-[calc(88vh-120px)] grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[320px_1fr]">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--glass-text-secondary)]">
              <AppIcon name="image" className="h-3.5 w-3.5" />
              {t('panelCard.originalGridImage')}
            </div>
            {originalGridImageUrl ? (
              <MediaImageWithLoading
                src={originalGridImageUrl}
                alt={t('panelCard.originalGridImage')}
                containerClassName="w-full rounded-lg border border-[var(--glass-stroke-base)] bg-black"
                className="w-full object-contain"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] text-xs text-[var(--glass-text-tertiary)]">
                {t('panelCard.noGridImage')}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSplit(false)}
                disabled={!panel.panelId || !panel.imageUrl || splitMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--glass-accent-from)] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {splitMutation.isPending ? <AppIcon name="loader" className="h-3.5 w-3.5 animate-spin" /> : <AppIcon name="scissors" className="h-3.5 w-3.5" />}
                {hasSplitImages ? t('panelCard.useCurrentSplit') : t('panelCard.startGridSplit')}
              </button>
              <button
                type="button"
                onClick={() => handleSplit(true)}
                disabled={!panel.panelId || !panel.imageUrl || splitMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--glass-stroke-base)] px-3 py-1.5 text-xs font-medium text-[var(--glass-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AppIcon name="refresh" className="h-3.5 w-3.5" />
                {t('panelCard.resplitGrid')}
              </button>
              <button
                type="button"
                onClick={() => handleEnhance()}
                disabled={!panel.panelId || !hasSplitImages || isEnhancing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)] px-3 py-1.5 text-xs font-medium text-[var(--glass-tone-info-fg)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isEnhancing ? <AppIcon name="loader" className="h-3.5 w-3.5 animate-spin" /> : <AppIcon name="sparklesAlt" className="h-3.5 w-3.5" />}
                {t('panelCard.enhanceAllSplitGrid')}
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--glass-text-secondary)]">{t('panelCard.splitGridCells')}</span>
              <span className="text-[var(--glass-text-tertiary)]">{t('panelCard.splitGridCount', { count: images.length })}</span>
            </div>

            {hasSplitImages ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {images.map((image) => {
                  const frame = framesByIndex.get(image.cellIndex)
                  const prompt = getPromptForFrame(frame)
                  const imageUrl = toDisplayImageUrl(image.imageUrl)
                  return (
                    <div key={`${image.cellIndex}-${image.imageUrl}`} className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-2">
                      <div className="mb-1.5 flex items-center justify-between text-[11px]">
                        <span className="font-medium text-[var(--glass-text-secondary)]">{t('panelCard.gridCellIndex', { index: image.cellIndex })}</span>
                        <span className="text-[var(--glass-text-tertiary)]">{image.panelGridSize}</span>
                      </div>
                      <MediaImageWithLoading
                        src={imageUrl || ''}
                        alt={t('panelCard.gridCellIndex', { index: image.cellIndex })}
                        containerClassName="aspect-video w-full rounded border border-[var(--glass-stroke-base)] bg-black"
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => handleEnhance(image.cellIndex)}
                        disabled={!panel.panelId || isEnhancing}
                        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-2 py-1.5 text-[11px] font-medium text-[var(--glass-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isEnhancing ? <AppIcon name="loader" className="h-3.5 w-3.5 animate-spin" /> : <AppIcon name="sparklesAlt" className="h-3.5 w-3.5" />}
                        {t('panelCard.enhanceSingleSplitGrid')}
                      </button>
                      <p className="mt-2 line-clamp-4 text-[10px] leading-4 text-[var(--glass-text-tertiary)]">
                        {prompt || t('panelCard.noGridCellPrompt')}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] text-center">
                <AppIcon name="scissors" className="mb-2 h-6 w-6 text-[var(--glass-text-tertiary)]" />
                <p className="text-xs text-[var(--glass-text-secondary)]">{t('panelCard.noSplitGridYet')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
