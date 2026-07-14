'use client'
import { useState } from 'react'
import type { DirectorSnapshot } from '@/lib/director-desk/schema'
import { useDirectorStore } from '../store/directorStore'
import { captureCameraScreenshot } from '../io/screenshot'

const EMPTY_DIRECTOR_SNAPSHOTS: DirectorSnapshot[] = []

function formatSnapshotTime(value: number) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return ''
  }
}

export function SnapshotPanel() {
  const snapshots = useDirectorStore((s) => s.project.directorSnapshots ?? EMPTY_DIRECTOR_SNAPSHOTS)
  const videoRatio = useDirectorStore((s) => s.videoRatio)
  const projectId = useDirectorStore((s) => s.projectId)
  const panelId = useDirectorStore((s) => s.panelId)
  const addDirectorSnapshot = useDirectorStore((s) => s.addDirectorSnapshot)
  const restoreDirectorSnapshot = useDirectorStore((s) => s.restoreDirectorSnapshot)
  const setDirectorSnapshotName = useDirectorStore((s) => s.setDirectorSnapshotName)
  const setDirectorSnapshotNote = useDirectorStore((s) => s.setDirectorSnapshotNote)
  const removeDirectorSnapshot = useDirectorStore((s) => s.removeDirectorSnapshot)
  const [capturing, setCapturing] = useState(false)
  const [renderingId, setRenderingId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function captureSnapshot() {
    if (capturing) return
    setCapturing(true)
    setStatus(null)
    try {
      const dataUrl = await captureCameraScreenshot(videoRatio)
      addDirectorSnapshot({ dataUrl })
      setStatus('已保存快照')
    } catch (error) {
      setStatus(`快照失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setCapturing(false)
    }
  }

  async function renderSnapshot(snapshot: DirectorSnapshot) {
    if (!projectId || !panelId || renderingId) return
    setRenderingId(snapshot.id)
    setStatus(null)
    try {
      const response = await fetch(`/api/novel-promotion/${projectId}/director-desk/render-snapshot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          panelId,
          snapshot,
        }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `HTTP ${response.status}`)
      }
      setStatus('已提交渲染任务')
    } catch (error) {
      setStatus(`渲染失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRenderingId(null)
    }
  }

  return (
    <section className="mt-3 border-t border-white/10 pt-3 text-xs text-white/80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-white/70">快照列表</div>
        <button
          type="button"
          onClick={() => void captureSnapshot()}
          disabled={capturing}
          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          {capturing ? '拍摄中…' : '咔嚓快照'}
        </button>
      </div>
      {status ? <div className="mb-2 rounded bg-white/5 px-2 py-1 text-[10px] text-white/55">{status}</div> : null}
      {snapshots.length === 0 ? (
        <div className="rounded border border-dashed border-white/10 px-2 py-3 text-[10px] text-white/35">
          暂无快照
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="rounded border border-white/10 bg-white/5 p-2">
              {snapshot.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={snapshot.imageDataUrl} alt={snapshot.name} className="mb-2 max-h-24 w-full rounded object-contain" />
              ) : null}
              <input
                value={snapshot.name}
                onChange={(event) => setDirectorSnapshotName(snapshot.id, event.target.value)}
                className="mb-1 w-full rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[11px] outline-none focus:border-white/30"
              />
              <input
                placeholder="备注"
                value={snapshot.note ?? ''}
                onChange={(event) => setDirectorSnapshotNote(snapshot.id, event.target.value)}
                className="mb-1 w-full rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[11px] outline-none focus:border-white/30"
              />
              <div className="mb-1 text-[10px] text-white/35">{formatSnapshotTime(snapshot.capturedAt)}</div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => restoreDirectorSnapshot(snapshot.id)}
                  className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10"
                >
                  回溯
                </button>
                <button
                  type="button"
                  onClick={() => void renderSnapshot(snapshot)}
                  disabled={renderingId === snapshot.id}
                  className="rounded border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  {renderingId === snapshot.id ? '提交中…' : '渲染分镜'}
                </button>
                <button
                  type="button"
                  onClick={() => removeDirectorSnapshot(snapshot.id)}
                  className="rounded border border-red-400/30 bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/25"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
