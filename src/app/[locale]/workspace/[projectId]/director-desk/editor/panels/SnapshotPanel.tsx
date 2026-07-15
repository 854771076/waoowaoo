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

interface BoardEditorState {
  boardId: string | null
  name: string
  assetIds: string[]
}

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
  const saveDirectorStoryboardBoard = useDirectorStore((s) => s.saveDirectorStoryboardBoard)
  const removeDirectorStoryboardBoard = useDirectorStore((s) => s.removeDirectorStoryboardBoard)
  const [capturing, setCapturing] = useState(false)
  const [renderingId, setRenderingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [savingBoard, setSavingBoard] = useState(false)
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null)
  const [boardEditor, setBoardEditor] = useState<BoardEditorState | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const busy = capturing || !!renderingId || !!restoringId || !!deletingId || savingBoard || !!deletingBoardId

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

  function createStoryboardBoard() {
    if (busy || storyboardAssets.length === 0) return
    setStatus(null)
    setBoardEditor({
      boardId: null,
      name: `导演台分镜板 ${storyboardBoards.length + 1}`,
      assetIds: storyboardAssets.map((asset) => asset.id),
    })
  }

  function editStoryboardBoard(board: DirectorStoryboardBoard) {
    if (busy) return
    setStatus(null)
    const existingAssetIds = new Set(storyboardAssets.map((asset) => asset.id))
    const assetIds = board.assetIds.filter((assetId) => existingAssetIds.has(assetId))
    setBoardEditor({
      boardId: board.id,
      name: board.name,
      assetIds,
    })
  }

  function toggleBoardAsset(assetId: string) {
    setBoardEditor((current) => {
      if (!current) return current
      return current.assetIds.includes(assetId)
        ? { ...current, assetIds: current.assetIds.filter((id) => id !== assetId) }
        : { ...current, assetIds: [...current.assetIds, assetId] }
    })
  }

  function moveBoardAsset(assetId: string, direction: -1 | 1) {
    setBoardEditor((current) => {
      if (!current) return current
      const index = current.assetIds.indexOf(assetId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.assetIds.length) return current
      const assetIds = [...current.assetIds]
      ;[assetIds[index], assetIds[target]] = [assetIds[target], assetIds[index]]
      return { ...current, assetIds }
    })
  }

  async function saveStoryboardBoard() {
    if (busy || !boardEditor) return
    setSavingBoard(true)
    setStatus(null)
    try {
      const boardId = saveDirectorStoryboardBoard({
        boardId: boardEditor.boardId ?? undefined,
        name: boardEditor.name,
        assetIds: boardEditor.assetIds,
      })
      if (!boardId) throw new Error('没有可用分镜资产')
      await persistSnapshotState(boardEditor.boardId ? '导演台分镜板已更新并保存' : '导演台分镜板已生成并保存')
      setBoardEditor(null)
    } catch (error) {
      setStatus(`保存分镜板失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSavingBoard(false)
    }
  }

  async function deleteStoryboardBoard(boardId: string) {
    if (busy) return
    if (!window.confirm('确定删除这个导演台分镜板吗？')) return
    setDeletingBoardId(boardId)
    setStatus(null)
    try {
      removeDirectorStoryboardBoard(boardId)
      await persistSnapshotState('导演台分镜板已删除并保存')
      if (boardEditor?.boardId === boardId) setBoardEditor(null)
    } catch (error) {
      setStatus(`删除分镜板失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setDeletingBoardId(null)
    }
  }

  const boardEditorSelectedAssets = boardEditor
    ? boardEditor.assetIds
      .map((assetId) => storyboardAssets.find((asset) => asset.id === assetId))
      .filter((asset): asset is DirectorStoryboardAsset => !!asset)
    : []

  return (
    <>
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
          {snapshots.map((snapshot) => {
            const snapshotImageUrl = snapshot.imageDataUrl || toDisplayImageUrl(snapshot.imageUrl ?? null)
            return (
            <div key={snapshot.id} className="rounded border border-white/10 bg-white/5 p-2">
              {snapshotImageUrl ? (
                <div className="mb-2">
                  <div className="mb-1 text-[10px] text-white/35">低模快照</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={snapshotImageUrl} alt={snapshot.name} className="max-h-24 w-full rounded object-contain" />
                </div>
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
                  {restoringId === snapshot.id ? '回溯中…' : '回溯低模'}
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
            )
          })}
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
            生成分镜板
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
                    <div className="mb-1">
                      <div className="mb-1 text-[10px] text-white/35">渲染资产</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={displayUrl} alt={asset.name} className="max-h-24 w-full rounded object-contain" />
                    </div>
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
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => editStoryboardBoard(board)}
                      disabled={busy}
                      className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10 disabled:opacity-40"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteStoryboardBoard(board.id)}
                      disabled={busy}
                      className="rounded border border-red-400/30 bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/25 disabled:opacity-40"
                    >
                      {deletingBoardId === board.id ? '删除中…' : '删除'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
    {boardEditor ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 text-xs text-white/80">
        <div className="max-h-full w-full max-w-md overflow-hidden rounded-lg border border-white/10 bg-[#12161c] shadow-2xl">
          <div className="border-b border-white/10 px-3 py-2">
            <div className="text-sm font-medium text-white/85">{boardEditor.boardId ? '编辑导演台分镜板' : '生成导演台分镜板'}</div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-3">
            <label className="mb-3 block">
              <span className="mb-1 block text-[10px] text-white/45">分镜板名称</span>
              <input
                value={boardEditor.name}
                onChange={(event) => setBoardEditor((current) => current ? { ...current, name: event.target.value } : current)}
                className="w-full rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] outline-none focus:border-white/30"
              />
            </label>
            <div className="mb-2 text-[11px] font-medium text-white/70">选择分镜资产</div>
            <div className="mb-3 flex flex-col gap-2">
              {storyboardAssets.map((asset) => {
                const selected = boardEditor.assetIds.includes(asset.id)
                const displayUrl = toDisplayImageUrl(asset.imageUrl)
                return (
                  <label
                    key={asset.id}
                    className={`flex gap-2 rounded border p-2 ${selected ? 'border-sky-400/40 bg-sky-500/10' : 'border-white/10 bg-white/5'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleBoardAsset(asset.id)}
                      className="mt-1"
                    />
                    {displayUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={displayUrl} alt={asset.name} className="h-12 w-16 flex-shrink-0 rounded object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] text-white/75">{asset.name}</div>
                      {asset.note ? <div className="line-clamp-2 text-[10px] text-white/40">{asset.note}</div> : null}
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="mb-2 text-[11px] font-medium text-white/70">分镜顺序</div>
            {boardEditorSelectedAssets.length === 0 ? (
              <div className="rounded border border-dashed border-white/10 px-2 py-3 text-[10px] text-white/35">请选择至少一个分镜资产</div>
            ) : (
              <div className="flex flex-col gap-2">
                {boardEditorSelectedAssets.map((asset, index) => {
                  const displayUrl = toDisplayImageUrl(asset.imageUrl)
                  return (
                    <div key={asset.id} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 p-2">
                      <div className="w-4 text-center text-[10px] text-white/35">{index + 1}</div>
                      {displayUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={displayUrl} alt={asset.name} className="h-10 w-14 flex-shrink-0 rounded object-cover" />
                      ) : null}
                      <div className="min-w-0 flex-1 truncate text-[11px] text-white/70">{asset.name}</div>
                      <button
                        type="button"
                        onClick={() => moveBoardAsset(asset.id, -1)}
                        disabled={index === 0}
                        className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 disabled:opacity-30"
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBoardAsset(asset.id, 1)}
                        disabled={index === boardEditorSelectedAssets.length - 1}
                        className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 disabled:opacity-30"
                      >
                        下移
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-white/10 px-3 py-2">
            <button
              type="button"
              onClick={() => setBoardEditor(null)}
              disabled={savingBoard}
              className="rounded border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60 hover:bg-white/10 disabled:opacity-40"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void saveStoryboardBoard()}
              disabled={savingBoard || boardEditor.assetIds.length === 0}
              className="rounded border border-sky-400/30 bg-sky-500/20 px-3 py-1 text-[11px] text-sky-100 hover:bg-sky-500/30 disabled:opacity-40"
            >
              {savingBoard ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}
