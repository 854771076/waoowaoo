'use client'

import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import VideoEditor, {
  DEFAULT_ELEMENT_COLORS,
  DEFAULT_TIMELINE_TICK_CONFIGS,
  DEFAULT_TIMELINE_ZOOM_CONFIG,
  useTimelineControl,
} from '@twick/video-editor'
import '@twick/video-editor/dist/video-editor.css'
import './twick-overrides.css'
import { LivePlayerProvider, PLAYER_STATE, useLivePlayerContext } from '@twick/live-player'
import { TimelineProvider, useTimelineContext } from '@twick/timeline'
import { useTranslations } from 'next-intl'
import { useEditorStageRuntime } from '@/lib/novel-promotion/stages/editor-stage-runtime-core'
import type { TwickTimelineProject } from '@/lib/twick/types'
import { AssetPanel } from './left-panel/AssetPanel'
import {
  ASSET_DND_MIME,
  addVideoPanelToTimeline,
  addVoiceLineToTimeline,
  readAssetDragPayload,
} from './left-panel/asset-timeline-actions'
import { useWorkspaceProvider } from '../../WorkspaceProvider'
import { RightPanel } from './right-panel/RightPanel'

/**
 * 捕获 Twick 编辑器内部的运行时错误，避免整个页面白屏
 */
class TwickErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[TwickEditor] Caught error:', error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

interface TwickEditorProps {
  videoWidth: number
  videoHeight: number
}

interface TimelineRuntimeSyncProps {
  onProjectChange: (data: TwickTimelineProject) => void
}

function TimelineRuntimeSync({ onProjectChange }: TimelineRuntimeSyncProps) {
  const { present } = useTimelineContext()
  const { playerState } = useLivePlayerContext()
  // ponytail: seed the diff key from Twick's first hydrated `present`, not from the
  // upstream projectData serialization. Twick normalizes key ordering / injects defaults,
  // so a plain JSON.stringify of the upstream data never matches the first present and
  // triggered a spurious autosave PUT on every load → version churn → full editor remount.
  const lastSyncedRef = useRef<string | null>(null)
  const pendingWhilePlayingRef = useRef<TwickTimelineProject | null>(null)

  useEffect(() => {
    if (!present) return

    const nextSerialized = JSON.stringify(present)
    if (lastSyncedRef.current === null) {
      lastSyncedRef.current = nextSerialized
      return
    }
    if (nextSerialized === lastSyncedRef.current) return

    // ponytail: during playback Twick pushes a fresh `present` on every animation tick.
    // Feeding those back up as project edits caused React re-renders per frame → the
    // <video> element was thrashed and playback flickered / went black. Defer sync while
    // playing; flush the latest snapshot when playback stops.
    if (playerState === PLAYER_STATE.PLAYING) {
      pendingWhilePlayingRef.current = present as TwickTimelineProject
      return
    }

    lastSyncedRef.current = nextSerialized
    pendingWhilePlayingRef.current = null
    onProjectChange(present as TwickTimelineProject)
  }, [onProjectChange, playerState, present])

  useEffect(() => {
    if (playerState === PLAYER_STATE.PLAYING) return
    const pending = pendingWhilePlayingRef.current
    if (!pending) return
    pendingWhilePlayingRef.current = null
    lastSyncedRef.current = JSON.stringify(pending)
    onProjectChange(pending)
  }, [onProjectChange, playerState])

  return null
}

/**
 * 素材拖拽落入时间轴：在 `.twick-editor-timeline-section` 上挂原生 drag 事件，
 * 收到 asset 载荷后走跟点击一致的 add-to-timeline 流程。
 *
 * ponytail: Twick 自己的 canvas drop 只处理内部拖拽（fabric），不接受来自外部
 * 面板的 dataTransfer。用 native listeners 而不是包一层 <div> 是因为
 * VideoEditor 已经把 timeline section 渲染到自己的 DOM 里,套一层会破坏它的
 * flex 度量。
 */
function TimelineDropZone({ hostRef }: { hostRef: React.RefObject<HTMLDivElement | null> }) {
  const { editor, present } = useTimelineContext()
  const { panelVideos, voiceLineSources } = useEditorStageRuntime()
  const { projectId } = useWorkspaceProvider()
  const t = useTranslations('novelPromotion.editor.assets')

  // 用 refs 保证 listener 拿到最新的数据/上下文而不用重挂事件。
  const stateRef = useRef({ editor, present, panelVideos, voiceLineSources, projectId, t })
  stateRef.current = { editor, present, panelVideos, voiceLineSources, projectId, t }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const findTimelineSection = () =>
      host.querySelector<HTMLElement>('.twick-editor-timeline-section')

    const isAssetDrag = (event: DragEvent): boolean => {
      const types = event.dataTransfer?.types
      if (!types) return false
      for (let i = 0; i < types.length; i++) {
        if (types[i] === ASSET_DND_MIME) return true
      }
      return false
    }

    const handleDragOver = (event: DragEvent) => {
      if (!isAssetDrag(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = async (event: DragEvent) => {
      const payload = readAssetDragPayload(event.dataTransfer)
      if (!payload) return
      event.preventDefault()
      const state = stateRef.current
      if (payload.kind === 'video-panel') {
        const panel = state.panelVideos.find((item) => item.panelId === payload.id)
        if (!panel) return
        await addVideoPanelToTimeline({
          source: panel,
          editor: state.editor,
          present: state.present,
          projectId: state.projectId,
          trackLabel: state.t('tracks.video'),
        })
      } else if (payload.kind === 'voice-line') {
        const voiceLine = state.voiceLineSources.find((item) => item.voiceLineId === payload.id)
        if (!voiceLine) return
        await addVoiceLineToTimeline({
          source: voiceLine,
          editor: state.editor,
          present: state.present,
          projectId: state.projectId,
          trackLabel: state.t('tracks.audio'),
        })
      }
    }

    // Twick 的 timeline section 是 VideoEditor mount 后才出现,轮询一次挂载即可。
    let cleanup: (() => void) | null = null
    const attach = () => {
      const section = findTimelineSection()
      if (!section) return false
      section.addEventListener('dragover', handleDragOver)
      section.addEventListener('drop', handleDrop)
      cleanup = () => {
        section.removeEventListener('dragover', handleDragOver)
        section.removeEventListener('drop', handleDrop)
      }
      return true
    }

    if (!attach()) {
      const observer = new MutationObserver(() => {
        if (attach()) observer.disconnect()
      })
      observer.observe(host, { childList: true, subtree: true })
      return () => {
        observer.disconnect()
        cleanup?.()
      }
    }
    return () => { cleanup?.() }
  }, [hostRef])

  return null
}

/**
 * 键盘快捷键：Delete / Backspace 删除当前选中的一个或多个片段。
 *
 * ponytail: Twick 自身没绑 Delete 键。它的 useTimelineControl().deleteItem() 无参调用
 * 时已经会解析 selectedIds 走多选删除（resolveIds → Track/TrackElement），我们只加键盘转发。
 */
function KeyboardShortcuts() {
  const { deleteItem } = useTimelineControl()
  const { selectedIds } = useTimelineContext()
  const selectedIdsRef = useRef(selectedIds)
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      if (selectedIdsRef.current.size === 0) return
      event.preventDefault()
      deleteItem()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteItem])

  return null
}

export function TwickEditor({ videoWidth, videoHeight }: TwickEditorProps) {
  const t = useTranslations('novelPromotion.editor')
  const {
    editorProjectId,
    projectData,
    projectReloadRevision,
    isLoadingData,
    isLoadingProject,
    dataError,
    saveError,
    updateProjectData,
  } = useEditorStageRuntime()

  // ponytail: key on the reload revision (increments only on explicit reloadFromServer),
  // NOT on projectVersion — the latter bumps on every save and would unmount everything.
  const timelineKey = `${editorProjectId ?? 'new'}-${projectReloadRevision}-${videoWidth}x${videoHeight}`

  // ponytail: TimelineProvider's `initialData` is only meaningful at mount / key change.
  // Passing a new projectData reference on every edit made Twick re-hydrate its internal
  // state → the video element re-mounts → black frame / flicker. Snapshot the current
  // projectData for the lifetime of this timelineKey.
  const [initialDataSnapshot, setInitialDataSnapshot] = useState<TwickTimelineProject | null>(projectData ?? null)
  const currentKeyRef = useRef(timelineKey)
  if (currentKeyRef.current !== timelineKey) {
    currentKeyRef.current = timelineKey
    setInitialDataSnapshot(projectData ?? null)
  }
  useEffect(() => {
    if (initialDataSnapshot === null && projectData) {
      setInitialDataSnapshot(projectData)
    }
  }, [initialDataSnapshot, projectData])

  // ponytail: memoize the config trees so VideoEditor sees stable references. Without
  // this, every TwickEditor re-render (status flip / autosave / present sync) produced
  // fresh objects and VideoEditor's internal player treated it as a config change → the
  // <video> element remounted mid-playback → black frame / flicker.
  const backgroundColor = initialDataSnapshot?.backgroundColor || projectData?.backgroundColor || '#ffffff'
  const videoProps = useMemo(() => ({
    width: videoWidth,
    height: videoHeight,
    backgroundColor,
  }), [backgroundColor, videoHeight, videoWidth])
  const playerProps = useMemo(() => ({ maxWidth: 480, maxHeight: 620 }), [])
  const editorConfig = useMemo(() => ({
    videoProps,
    canvasMode: true,
    playerProps,
    timelineTickConfigs: DEFAULT_TIMELINE_TICK_CONFIGS,
    timelineZoomConfig: DEFAULT_TIMELINE_ZOOM_CONFIG,
    elementColors: DEFAULT_ELEMENT_COLORS,
  }), [playerProps, videoProps])

  // ponytail: same reason — inline React elements are new every render.
  const leftPanel = useMemo(() => <AssetPanel />, [])
  const rightPanel = useMemo(() => <RightPanel />, [])

  // ponytail: Chrome blocks autoplay without a user gesture — Twick tries to .play() the
  // <video> on mount so the first frame paints, and the block leaves a black canvas.
  // Force-mute every <video> in the editor subtree until the user interacts (any
  // pointerdown/keydown counts as a gesture), which satisfies the autoplay policy.
  // After the first gesture we clear the mute so audio plays normally.
  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const [hasUserGesture, setHasUserGesture] = useState(false)
  useEffect(() => {
    if (hasUserGesture) return
    const host = editorHostRef.current
    if (!host) return

    const forceMute = () => {
      host.querySelectorAll('video').forEach((video) => {
        if (!video.muted) video.muted = true
      })
    }
    forceMute()
    const observer = new MutationObserver(forceMute)
    observer.observe(host, { childList: true, subtree: true })

    const markGesture = () => setHasUserGesture(true)
    window.addEventListener('pointerdown', markGesture, { once: true, capture: true })
    window.addEventListener('keydown', markGesture, { once: true, capture: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('pointerdown', markGesture, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('keydown', markGesture, { capture: true } as AddEventListenerOptions)
    }
  }, [hasUserGesture])

  if (isLoadingData || isLoadingProject) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950/5 text-sm text-[var(--glass-text-secondary)]">
        {t('loading')}
      </div>
    )
  }

  if (dataError || !projectData) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950/5 p-6 text-center text-sm text-[var(--glass-text-secondary)]">
        <div>
          <div className="font-medium text-[var(--glass-text-primary)]">{t('emptyTitle')}</div>
          <div className="mt-2 max-w-md text-xs leading-5">
            {dataError ? dataError.message : t('emptyDescription')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <TwickErrorBoundary
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-slate-950/5 p-6 text-center text-sm text-[var(--glass-text-secondary)]">
          <div>
            <div className="font-medium text-[var(--glass-text-primary)]">{t('errorBoundaryTitle')}</div>
            <div className="mt-2 max-w-md text-xs leading-5">
              {t('errorBoundaryDescription')}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-[var(--glass-accent-from)] px-4 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--glass-accent-to)]"
            >
              {t('errorBoundaryReload')}
            </button>
          </div>
        </div>
      }
    >
      <div ref={editorHostRef} className="flex h-full w-full flex-col">
      <LivePlayerProvider>
        <TimelineProvider
          key={timelineKey}
          contextId={`editor-stage-${timelineKey}`}
          initialData={initialDataSnapshot ?? projectData}
          resolution={{ width: videoWidth, height: videoHeight }}
          analytics={{ enabled: false }}
        >
          <TimelineRuntimeSync onProjectChange={updateProjectData} />
          <KeyboardShortcuts />
          <TimelineDropZone hostRef={editorHostRef} />
          <VideoEditor
            leftPanel={leftPanel}
            rightPanel={rightPanel}
            defaultPlayControls
            editorConfig={editorConfig}
          />
          {saveError ? <span className="sr-only">{saveError}</span> : null}
        </TimelineProvider>
      </LivePlayerProvider>
      </div>
    </TwickErrorBoundary>
  )
}
