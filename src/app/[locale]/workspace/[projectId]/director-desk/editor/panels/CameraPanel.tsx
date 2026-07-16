'use client'
import { useEffect, useRef, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useDirectorStore } from '../store/directorStore'
import { useSelectedCamera, useSelectedObject } from '../store/directorSelectors'
import { captureCameraScreenshot } from '../io/screenshot'
import type { CameraCapture } from '../store/directorStore'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-white/70">
      <span className="w-16 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </label>
  )
}

function Triplet({ value, onChange }: { value: [number, number, number]; onChange: (v: [number, number, number]) => void }) {
  const cls = 'w-full rounded border border-white/10 bg-white/5 px-1.5 py-1 text-xs outline-none focus:border-white/30'
  return (
    <div className="grid grid-cols-3 gap-1">
      {(['X', 'Y', 'Z'] as const).map((lbl, i) => (
        <label key={lbl} className="flex items-center gap-1">
          <span className="w-3 text-[10px] text-white/40">{lbl}</span>
          <input
            type="number"
            step={0.1}
            value={value[i]}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isFinite(n)) return
              const next: [number, number, number] = [value[0], value[1], value[2]]
              next[i] = n
              onChange(next)
            }}
            className={cls}
          />
        </label>
      ))}
    </div>
  )
}

export function CameraPanel() {
  const cam = useSelectedCamera()
  const cameras = useDirectorStore((s) => s.project.cameras)
  const objects = useDirectorStore((s) => s.project.objects)
  const activeId = useDirectorStore((s) => s.project.activeCameraId)
  const select = useDirectorStore((s) => s.select)
  const addCamera = useDirectorStore((s) => s.addCamera)
  const addCameraFromViewport = useDirectorStore((s) => s.addCameraFromViewport)
  const duplicateCamera = useDirectorStore((s) => s.duplicateCamera)
  const removeCamera = useDirectorStore((s) => s.removeCamera)
  const setCameraField = useDirectorStore((s) => s.setCameraField)
  const setCameraTargetObject = useDirectorStore((s) => s.setCameraTargetObject)
  const updateCameraFromViewport = useDirectorStore((s) => s.updateCameraFromViewport)
  const setActiveCamera = useDirectorStore((s) => s.setActiveCamera)
  const viewportCamera = useDirectorStore((s) => s.viewportCamera)
  const cameraCaptures = useDirectorStore((s) => s.cameraCaptures)
  const addCameraCapture = useDirectorStore((s) => s.addCameraCapture)
  const toggleCaptureBound = useDirectorStore((s) => s.toggleCaptureBound)
  const toggleCaptureActive = useDirectorStore((s) => s.toggleCaptureActive)
  const setCaptureName = useDirectorStore((s) => s.setCaptureName)
  const setCaptureNote = useDirectorStore((s) => s.setCaptureNote)
  const removeCameraCapture = useDirectorStore((s) => s.removeCameraCapture)
  const restoreCameraCapturePose = useDirectorStore((s) => s.restoreCameraCapturePose)
  const createCameraFromCapturePose = useDirectorStore((s) => s.createCameraFromCapturePose)
  const bindAllCapturesForCamera = useDirectorStore((s) => s.bindAllCapturesForCamera)
  const unbindAllCapturesForCamera = useDirectorStore((s) => s.unbindAllCapturesForCamera)
  const bindAllCaptures = useDirectorStore((s) => s.bindAllCaptures)
  const clearBoundCaptures = useDirectorStore((s) => s.clearBoundCaptures)
  const videoRatio = useDirectorStore((s) => s.videoRatio)
  const selectedObject = useSelectedObject()
  const [tab, setTab] = useState<'props' | 'shots'>('props')
  const [capturing, setCapturing] = useState(false)
  const [viewerCapture, setViewerCapture] = useState<CameraCapture | null>(null)
  const [viewerScale, setViewerScale] = useState(1)
  const [viewerOffset, setViewerOffset] = useState({ x: 0, y: 0 })
  const [viewerDragging, setViewerDragging] = useState(false)
  const viewerDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  useEffect(() => {
    if (!viewerCapture) {
      setViewerScale(1)
      setViewerOffset({ x: 0, y: 0 })
      setViewerDragging(false)
      viewerDragRef.current = null
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewerCapture(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [viewerCapture])

  useEffect(() => {
    if (!viewerDragging) return
    const onMouseMove = (event: MouseEvent) => {
      const drag = viewerDragRef.current
      if (!drag) return
      setViewerOffset({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      })
    }
    const onMouseUp = () => {
      setViewerDragging(false)
      viewerDragRef.current = null
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [viewerDragging])

  if (!cam) return null
  const captures = cameraCaptures[cam.id] ?? []
  const allCaptures = Object.values(cameraCaptures).flat()
  const hasUnboundCapture = allCaptures.some((cap) => !cap.isBound)
  const hasBoundCapture = allCaptures.some((cap) => cap.isBound)
  const targetableObjects = objects.filter((object) => object.visible && !object.locked)

  const doCapture = async () => {
    if (capturing) return
    setCapturing(true)
    try {
      const dataUrl = await captureCameraScreenshot(videoRatio, cam.id)
      addCameraCapture(cam.id, dataUrl, cam.name, {
        fov: cam.fov,
        position: cam.position,
        target: cam.target,
      })
    } catch (err) {
      alert(`截图失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCapturing(false)
    }
  }

  const updateViewerScale = (delta: number) => {
    setViewerScale((current) => {
      const next = Math.min(5, Math.max(1, Number((current + delta).toFixed(2))))
      if (next <= 1) setViewerOffset({ x: 0, y: 0 })
      return next
    })
  }

  const downloadCapture = (cap: CameraCapture) => {
    const a = document.createElement('a')
    a.href = cap.dataUrl
    a.download = `${cap.name || 'shot'}.jpg`
    a.click()
  }

  const renderViewer = () => {
    if (!viewerCapture) return null
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
        role="dialog"
        aria-label="机位截图查看器"
        onClick={() => setViewerCapture(null)}
      >
        <div
          className="absolute right-5 top-5 flex gap-2 rounded border border-white/10 bg-black/55 p-1 backdrop-blur"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" aria-label="放大" title="放大" onClick={() => updateViewerScale(0.25)} className="rounded p-2 text-white/75 hover:bg-white/10 hover:text-white">
            <AppIcon name="zoomIn" size={18} />
          </button>
          <button type="button" aria-label="缩小" title="缩小" onClick={() => updateViewerScale(-0.25)} className="rounded p-2 text-white/75 hover:bg-white/10 hover:text-white">
            <AppIcon name="zoomOut" size={18} />
          </button>
          <button type="button" aria-label="下载" title="下载" onClick={() => downloadCapture(viewerCapture)} className="rounded p-2 text-white/75 hover:bg-white/10 hover:text-white">
            <AppIcon name="download" size={18} />
          </button>
          <button type="button" aria-label="关闭" title="关闭" onClick={() => setViewerCapture(null)} className="rounded p-2 text-white/75 hover:bg-white/10 hover:text-white">
            <AppIcon name="close" size={18} />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={viewerCapture.dataUrl}
          alt={viewerCapture.name}
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          onWheel={(event) => {
            event.preventDefault()
            updateViewerScale(event.deltaY < 0 ? 0.25 : -0.25)
          }}
          onMouseDown={(event) => {
            if (viewerScale <= 1) return
            event.preventDefault()
            viewerDragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              originX: viewerOffset.x,
              originY: viewerOffset.y,
            }
            setViewerDragging(true)
          }}
          className={`max-h-[88vh] max-w-[92vw] rounded border border-white/10 object-contain shadow-2xl ${viewerScale > 1 ? 'cursor-grab' : 'cursor-zoom-in'} ${viewerDragging ? 'cursor-grabbing' : ''}`}
          style={{ transform: `translate(${viewerOffset.x}px, ${viewerOffset.y}px) scale(${viewerScale})` }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 text-xs text-white/80">
      <div className="text-sm font-medium">机位 · {cam.name}</div>
      <div className="inline-flex overflow-hidden rounded border border-white/10 text-xs">
        <button
          onClick={() => setTab('props')}
          className={`flex-1 px-3 py-1 ${tab === 'props' ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/5'}`}
        >
          属性
        </button>
        <button
          onClick={() => setTab('shots')}
          className={`flex-1 px-3 py-1 ${tab === 'shots' ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/5'}`}
        >
          截图
        </button>
      </div>

      {tab === 'props' && (
        <div className="flex flex-col gap-3">
          <Row label="切换">
            <select
              value={cam.id}
              onChange={(e) => select(e.target.value)}
              className="w-full rounded border border-white/10 bg-white/5 px-1.5 py-1 text-xs outline-none focus:border-white/30"
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id} className="text-black">
                  {c.name}
                  {c.id === activeId ? ' ★' : ''}
                </option>
              ))}
            </select>
          </Row>
          <Row label="名称">
            <input
              value={cam.name}
              onChange={(e) => setCameraField(cam.id, 'name', e.target.value)}
              className="w-full rounded border border-white/10 bg-white/5 px-1.5 py-1 text-xs outline-none focus:border-white/30"
            />
          </Row>
          <Row label="焦距">
            <input
              type="range"
              min={10}
              max={120}
              step={1}
              value={cam.fov}
              onChange={(e) => setCameraField(cam.id, 'fov', Number(e.target.value))}
              className="w-full"
            />
            <div className="text-[10px] text-white/40">{cam.fov}°</div>
          </Row>
          <Row label="位置">
            <Triplet value={cam.position} onChange={(v) => setCameraField(cam.id, 'position', v)} />
          </Row>
          <Row label="目标对象">
            <select
              value={cam.targetMode === 'object' ? cam.targetObjectId ?? '' : ''}
              onChange={(e) => setCameraTargetObject(cam.id, e.target.value || null)}
              className="w-full rounded border border-white/10 bg-white/5 px-1.5 py-1 text-xs outline-none focus:border-white/30"
            >
              <option value="" className="text-black">手动坐标</option>
              {targetableObjects.map((object) => (
                <option key={object.id} value={object.id} className="text-black">
                  {object.name}
                </option>
              ))}
            </select>
          </Row>
          <Row label="目标坐标">
            <Triplet value={cam.target} onChange={(v) => setCameraField(cam.id, 'target', v)} />
          </Row>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (selectedObject) setCameraTargetObject(cam.id, selectedObject.id)
              }}
              disabled={!selectedObject}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
            >
              绑定选中对象
            </button>
            <button
              onClick={() => addCamera()}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            >
              添加机位
            </button>
            <button
              onClick={() => addCameraFromViewport()}
              disabled={!viewportCamera}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
            >
              从当前视角新建
            </button>
            <button
              onClick={() => duplicateCamera(cam.id)}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            >
              复制机位
            </button>
            <button
              onClick={() => updateCameraFromViewport(cam.id)}
              disabled={!viewportCamera}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
            >
              更新为当前视角
            </button>
            <button
              onClick={() => removeCamera(cam.id)}
              disabled={cameras.length <= 1}
              className="rounded border border-red-400/30 bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25 disabled:opacity-40"
            >
              删除机位
            </button>
            <button
              onClick={() => setActiveCamera(cam.id)}
              disabled={cam.id === activeId}
              className="rounded border border-amber-400/40 bg-amber-500/20 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
            >
              设为激活
            </button>
          </div>
        </div>
      )}

      {tab === 'shots' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => void doCapture()}
                disabled={capturing}
                className="flex-1 rounded bg-blue-500/80 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {capturing ? '截取中…' : '截取当前机位'}
              </button>
              <button
                type="button"
                onClick={() => bindAllCapturesForCamera(cam.id)}
                disabled={captures.length === 0 || captures.every((cap) => cap.isBound)}
                className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40"
              >
                <AppIcon name="pin" size={12} />
                全部绑定
              </button>
              <button
                type="button"
                onClick={() => unbindAllCapturesForCamera(cam.id)}
                disabled={captures.length === 0 || !captures.some((cap) => cap.isBound)}
                className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40"
              >
                <AppIcon name="pin" size={12} />
                取消绑定
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => bindAllCaptures()}
                disabled={!hasUnboundCapture}
                className="inline-flex items-center gap-1 rounded border border-emerald-300/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-40"
              >
                <AppIcon name="pin" size={12} />
                全部机位绑定
              </button>
              <button
                type="button"
                onClick={() => clearBoundCaptures()}
                disabled={!hasBoundCapture}
                className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40"
              >
                <AppIcon name="close" size={12} />
                清空绑定
              </button>
            </div>
          </div>
          {captures.length === 0 ? (
            <div className="text-xs text-white/40">暂无截图，点击上方按钮截取当前机位</div>
          ) : (
            <div className="flex flex-col gap-2">
              {captures.map((cap) => (
                <div key={cap.id} className={`rounded border bg-white/5 p-2 ${cap.isBound ? 'border-emerald-400/30' : 'border-white/10'}`}>
                  <button
                    type="button"
                    onClick={() => setViewerCapture(cap)}
                    className="group relative mb-1 block w-full overflow-hidden rounded border border-white/10 bg-black/20"
                    aria-label={`查看截图 ${cap.name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cap.dataUrl} alt={cap.name} className="max-h-32 w-full object-contain transition group-hover:opacity-80" />
                    <span className="absolute right-1 top-1 rounded bg-black/55 p-1 text-white/75 opacity-0 transition group-hover:opacity-100">
                      <AppIcon name="eye" size={13} />
                    </span>
                  </button>
                  <input
                    value={cap.name}
                    onChange={(e) => setCaptureName(cam.id, cap.id, e.target.value)}
                    className="mb-1 w-full rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[11px] outline-none focus:border-white/30"
                  />
                  <input
                    placeholder="备注"
                    value={cap.note ?? ''}
                    onChange={(e) => setCaptureNote(cam.id, cap.id, e.target.value)}
                    className="mb-1 w-full rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[11px] outline-none focus:border-white/30"
                  />
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => toggleCaptureBound(cam.id, cap.id)}
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${cap.isBound ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}
                    >
                      <AppIcon name="pin" size={11} />
                      {cap.isBound ? '已绑定' : '绑定'}
                    </button>
                    <button
                      onClick={() => toggleCaptureActive(cam.id, cap.id)}
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${cap.isActiveStar ? 'border-amber-400/50 bg-amber-500/25 text-amber-200' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}
                    >
                      <AppIcon name="star" size={11} />
                      {cap.isActiveStar ? '主机位' : '设为主机位'}
                    </button>
                    <button
                      type="button"
                      onClick={() => restoreCameraCapturePose(cam.id, cap.id)}
                      className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10"
                    >
                      <AppIcon name="rotate3d" size={11} />
                      恢复机位
                    </button>
                    <button
                      type="button"
                      onClick={() => createCameraFromCapturePose(cam.id, cap.id)}
                      className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10"
                    >
                      <AppIcon name="plus" size={11} />
                      新建机位
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadCapture(cap)}
                      className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10"
                    >
                      <AppIcon name="download" size={11} />
                      下载
                    </button>
                    <button
                      onClick={() => removeCameraCapture(cam.id, cap.id)}
                      className="inline-flex items-center gap-1 rounded border border-red-400/30 bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/25"
                    >
                      <AppIcon name="trash" size={11} />
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] leading-relaxed text-white/40">
            提示：绑定的截图会随保存发送到 AI 出图，设为主机位的作为构图最优先参考。每个机位可绑定多张不同角度的截图。
          </p>
        </div>
      )}
      {renderViewer()}
    </div>
  )
}
