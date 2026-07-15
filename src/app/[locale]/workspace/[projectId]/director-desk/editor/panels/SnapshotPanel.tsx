'use client'
import { useState } from 'react'
import type { DirectorSnapshot, DirectorStoryboardAsset, DirectorStoryboardBoard } from '@/lib/director-desk/schema'
import { toDisplayImageUrl } from '@/lib/media/image-url'
import { useDirectorStore } from '../store/directorStore'
import { captureActiveCameraScreenshot } from '../io/screenshot'
import { notifyDirectorDeskSaved, saveDirectorDesk } from '../io/save'

const EMPTY_DIRECTOR_SNAPSHOTS: DirectorSnapshot[] = []
const EMPTY_DIRECTOR_STORYBOARD_ASSETS: DirectorStoryboardAsset[] = []
const EMPTY_DIRECTOR_STORYBOARD_BOARDS: DirectorStoryboardBoard[] = []

function formatSnapshotTime(value: number) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return ''
  }
}

export function SnapshotPanel() {
  const snapshots = useDirectorStore((s) => s.project.directorSnapshots ?? EMPTY_DIRECTOR_SNAPSHOTS)
  const storyboardAssets = useDirectorStore((s) => s.project.directorStoryboardAssets ?? EMPTY_DIRECTOR_STORYBOARD_ASSETS)
  const storyboardBoards = useDirectorStore((s) => s.project.directorStoryboardBoards ?? EMPTY_DIRECTOR_STORYBOARD_BOARDS)
  const videoRatio = useDirectorStore((s) => s.videoRatio)
  const viewMode = useDirectorStore((s) => s.viewMode)
  const viewportCamera = useDirectorStore((s) => s.viewportCamera)
  const projectId = useDirectorStore((s) => s.projectId)
  const panelId = useDirectorStore((s) => s.panelId)
  const addDirectorSnapshot = useDirectorStore((s) => s.addDirectorSnapshot)
  const restoreDirectorSnapshot = useDirectorStore((s) => s.restoreDirectorSnapshot)
  const setDirectorSnapshotName = useDirectorStore((s) => s.setDirectorSnapshotName)
  const setDirectorSnapshotNote = useDirectorStore((s) => s.setDirectorSnapshotNote)
  const removeDirectorSnapshot = useDirectorStore((s) => s.removeDirectorSnapshot)
  const createDirectorStoryboardBoard = useDirectorStore((s) => s.createDirectorStoryboardBoard)
  const [capturing, setCapturing] = useState(false)
  const [renderingId, setRenderingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [creatingBoard, setCreatingBoard] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const busy = capturing || !!renderingId || !!restoringId || !!deletingId || creatingBoard

  async function persistSnapshotState(successText: string) {
    const result = await saveDirectorDesk()
    setStatus(result.warning ? `${successText}，但截图保存提示: ${result.warning}` : successText)
  }

  async function captureSnapshot() {
    if (busy) return
    setCapturing(true)
    setStatus(null)
    try {
      const dataUrl = await captureActiveCameraScreenshot(videoRatio)
      const snapshotId = addDirectorSnapshot({
        dataUrl,
        camera: viewMode === 'director' ? viewportCamera ?? undefined : undefined,
      })
      if (!snapshotId) throw new Error('没有可用机位')
      await persistSnapshotState('快照已保存到数据库')
    } catch (error) {
      setStatus(`快照失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setCapturing(false)
    }
  }

  async function renderSnapshot(snapshot: DirectorSnapshot) {
    if (!projectId || !panelId || busy) return
    setRenderingId(snapshot.id)
    setStatus(null)
    try {
      await saveDirectorDesk()
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
      notifyDirectorDeskSaved(panelId)
      setStatus('已提交渲染任务，完成后会生成导演台分镜资产')
    } catch (error) {
      setStatus(`渲染失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRenderingId(null)
    }
  }

  async function restoreSnapshot(snapshotId: string) {
    if (busy) return
    setRestoringId(snapshotId)
    setStatus(null)
    try {
      restoreDirectorSnapshot(snapshotId)
      await persistSnapshotState('已回溯并保存')
    } catch (error) {
      setStatus(`回溯失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRestoringId(null)
    }
  }

  async function deleteSnapshot(snapshotId: string) {
    if (busy) return
    setDeletingId(snapshotId)
    setStatus(null)
    try {
      removeDirectorSnapshot(snapshotId)
      await persistSnapshotState('快照已删除并保存')
    } catch (error) {
      setStatus(`删除失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setDeletingId(null)
    }
  }

  async function createStoryboardBoard() {
    if (busy || storyboardAssets.length === 0) return
    setCreatingBoard(true)
    setStatus(null)
    try {
      const boardId = createDirectorStoryboardBoard()
      if (!boardId) throw new Error('没有可用分镜资产')
      await persistSnapshotState('导演台分镜板已生成并保存')
    } catch (error) {
      setStatus(`生成分镜板失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setCreatingBoard(false)
    }
  }

  return (
    <section className="mt-3 border-t border-white/10 pt-3 text-xs text-white/80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-white/70">快照列表</div>
        <button
          type="button"
          onClick={() => void captureSnapshot()}
          disabled={busy}
          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          {capturing ? '保存中…' : '咔嚓快照'}
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
                  onClick={() => void restoreSnapshot(snapshot.id)}
                  disabled={busy}
                  className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10 disabled:opacity-40"
                >
                  {restoringId === snapshot.id ? '回溯中…' : '回溯'}
                </button>
                <button
                  type="button"
                  onClick={() => void renderSnapshot(snapshot)}
                  disabled={busy}
                  className="rounded border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  {renderingId === snapshot.id ? '提交中…' : '渲染分镜'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSnapshot(snapshot.id)}
                  disabled={busy}
                  className="rounded border border-red-400/30 bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/25 disabled:opacity-40"
                >
                  {deletingId === snapshot.id ? '删除中…' : '删除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-white/70">分镜资产</div>
          <button
            type="button"
            onClick={() => void createStoryboardBoard()}
            disabled={busy || storyboardAssets.length === 0}
            className="rounded border border-sky-400/30 bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-200 hover:bg-sky-500/25 disabled:opacity-40"
          >
            {creatingBoard ? '生成中…' : '生成分镜板'}
          </button>
        </div>
        {storyboardAssets.length === 0 ? (
          <div className="rounded border border-dashed border-white/10 px-2 py-3 text-[10px] text-white/35">
            暂无分镜资产
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {storyboardAssets.map((asset) => {
              const displayUrl = toDisplayImageUrl(asset.imageUrl)
              return (
                <div key={asset.id} className="rounded border border-white/10 bg-white/5 p-2">
                  {displayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayUrl} alt={asset.name} className="mb-1 max-h-24 w-full rounded object-contain" />
                  ) : null}
                  <div className="truncate text-[11px] text-white/70">{asset.name}</div>
                  {asset.note ? <div className="mt-0.5 line-clamp-2 text-[10px] text-white/40">{asset.note}</div> : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="mb-2 text-[11px] font-medium text-white/70">导演台分镜板</div>
        {storyboardBoards.length === 0 ? (
          <div className="rounded border border-dashed border-white/10 px-2 py-3 text-[10px] text-white/35">
            暂无导演台分镜板
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {storyboardBoards.map((board) => {
              const displayUrl = toDisplayImageUrl(board.coverImageUrl)
              return (
                <div key={board.id} className="rounded border border-white/10 bg-white/5 p-2">
                  {displayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayUrl} alt={board.name} className="mb-1 max-h-24 w-full rounded object-contain" />
                  ) : null}
                  <div className="truncate text-[11px] text-white/70">{board.name}</div>
                  <div className="text-[10px] text-white/40">{board.items.length} 个资产</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
