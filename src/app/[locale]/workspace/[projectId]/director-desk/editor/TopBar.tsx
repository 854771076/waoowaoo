'use client'
import { useRef, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useDirectorStore } from './store/directorStore'
import { getActiveCameraSnapshot } from './store/directorSelectors'
import { captureCameraScreenshot } from './io/screenshot'
import { saveDirectorDesk } from './io/save'
import { downloadProjectJson, parseProjectJson } from './io/projectJson'

export function TopBar() {
  const viewMode = useDirectorStore((s) => s.viewMode)
  const setViewMode = useDirectorStore((s) => s.setViewMode)
  const panelId = useDirectorStore((s) => s.panelId)
  const projectId = useDirectorStore((s) => s.projectId)
  const project = useDirectorStore((s) => s.project)
  const videoRatio = useDirectorStore((s) => s.videoRatio)
  const reset = useDirectorStore((s) => s.reset)
  const replaceProject = useDirectorStore((s) => s.replaceProject)
  const isDirty = useDirectorStore((s) => s.isDirty)
  const [saving, setSaving] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const doSave = async (): Promise<boolean> => {
    if (!panelId || !projectId) return false
    setSaving(true)
    try {
      const data = await saveDirectorDesk({ autoCaptureIfNoShots: true })
      if (data.warning) alert(data.warning)
      return true
    } catch (error) {
      alert(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  const onReset = () => {
    if (!confirm('确定要重置为上次保存的布局吗？未保存的改动将丢失。')) return
    void reset()
  }

  const onClose = () => {
    if (isDirty && !confirm('有未保存的布局，是否放弃？')) return
    window.close()
  }

  const onSaveAndClose = async () => {
    const ok = await doSave()
    if (ok) window.close()
  }

  const onRenderToStoryboard = async () => {
    // 渲染为分镜 = 自动截图当前主机位 → 保存 → 通知父页面刷新 → 关闭
    const active = getActiveCameraSnapshot()
    if (active) {
      const store = useDirectorStore.getState()
      const captures = store.cameraCaptures[active.id] ?? []
      // If no capture exists yet for the active cam, take one now.
      if (captures.length === 0) {
        try {
          const dataUrl = await captureCameraScreenshot(videoRatio, active.id)
          const capId = store.addCameraCapture(active.id, dataUrl, active.name, {
            fov: active.fov,
            position: active.position,
            target: active.target,
          })
          store.toggleCaptureBound(active.id, capId)
          store.toggleCaptureActive(active.id, capId)
        } catch (err) {
          console.error('[TopBar] auto-capture failed', err)
        }
      } else {
        // Ensure at least one bound capture exists.
        const hasBound = captures.some((c) => c.isBound)
        if (!hasBound) store.toggleCaptureBound(active.id, captures[0].id)
        const hasActive = Object.values(store.cameraCaptures).some((list) => list.some((c) => c.isActiveStar))
        if (!hasActive) store.toggleCaptureActive(active.id, captures.find((c) => c.isBound)?.id ?? captures[0].id)
      }
    }
    const ok = await doSave()
    if (ok) window.close()
  }

  const onExportJson = () => {
    downloadProjectJson(project, `director-desk-${panelId || 'layout'}.json`)
  }

  const onImportJson = async (file: File) => {
    try {
      const text = await file.text()
      const nextProject = parseProjectJson(text)
      replaceProject(nextProject)
    } catch (error) {
      alert(`导入失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div className="flex h-12 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4">
      <div className="text-sm font-medium">3D 导演台</div>
      <div className="inline-flex overflow-hidden rounded border border-white/10 text-xs">
        <button
          onClick={() => setViewMode('director')}
          className={`px-3 py-1 ${viewMode === 'director' ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/5'}`}
        >
          导演视角
        </button>
        <button
          onClick={() => setViewMode('camera')}
          className={`px-3 py-1 ${viewMode === 'camera' ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/5'}`}
        >
          机位视角
        </button>
      </div>
      <div className="flex-1" />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const input = event.currentTarget
          const file = input.files?.[0]
          if (file) void onImportJson(file)
          input.value = ''
        }}
      />
      <button
        onClick={onExportJson}
        disabled={saving}
        title="导出导演台 JSON"
        className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
      >
        <AppIcon name="download" size={13} />
        导出
      </button>
      <button
        onClick={() => importInputRef.current?.click()}
        disabled={saving}
        title="导入导演台 JSON"
        className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
      >
        <AppIcon name="upload" size={13} />
        导入
      </button>
      <button
        onClick={onReset}
        disabled={saving}
        className="rounded border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
      >
        重置
      </button>
      <button
        onClick={() => void doSave()}
        disabled={saving}
        className="rounded bg-blue-500/80 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? '保存中…' : '保存'}
      </button>
      <button
        onClick={() => void onSaveAndClose()}
        disabled={saving}
        className="rounded border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/5 disabled:opacity-50"
      >
        保存并关闭
      </button>
      <button
        onClick={() => void onRenderToStoryboard()}
        disabled={saving}
        className="rounded bg-emerald-500/80 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {saving ? '渲染中…' : '渲染为分镜'}
      </button>
      <button
        onClick={onClose}
        className="rounded px-2 py-1 text-lg leading-none text-white/60 hover:bg-white/5 hover:text-white"
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  )
}
