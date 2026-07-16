'use client'
import { useMemo, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useDirectorStore } from '../store/directorStore'
import type { DirectorObject } from '@/lib/director-desk/schema'

interface RowProps {
  id: string
  name: string
  color: string
  visible: boolean
  locked?: boolean
  selected: boolean
  multiSelected?: boolean
  showLock?: boolean
  onSelect: (event: MouseEvent<HTMLDivElement>) => void
  onToggleVisible: () => void
  onToggleLock?: () => void
  onRename: (v: string) => void
  trailingActions?: ReactNode
}

function Row({ id, name, color, visible, locked, selected, multiSelected, showLock, onSelect, onToggleVisible, onToggleLock, onRename, trailingActions }: RowProps) {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation()
        const next = window.prompt('重命名', name)
        if (next && next.trim()) onRename(next.trim())
      }}
      className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs cursor-pointer ${selected ? 'bg-blue-500/20 ring-1 ring-blue-300/30' : multiSelected ? 'bg-white/10' : 'hover:bg-white/5'}`}
      title={id}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className={`flex-1 truncate ${visible ? '' : 'text-white/40'}`}>{name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleVisible()
        }}
        className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
        title={visible ? '隐藏' : '显示'}
      >
        {visible ? <AppIcon name="eye" size={13} /> : <AppIcon name="eyeOff" size={13} />}
      </button>
      {showLock && onToggleLock && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleLock()
          }}
          className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
          title={locked ? '解锁' : '锁定'}
      >
        {locked ? <AppIcon name="lock" size={13} /> : <AppIcon name="unlock" size={13} />}
      </button>
      )}
      {trailingActions}
    </div>
  )
}

export function ObjectTreePanel() {
  const objects = useDirectorStore((s) => s.project.objects)
  const cameras = useDirectorStore((s) => s.project.cameras)
  const activeCameraId = useDirectorStore((s) => s.project.activeCameraId)
  const selectedId = useDirectorStore((s) => s.selectedId)
  const selectedIds = useDirectorStore((s) => s.selectedIds)
  const clipboard = useDirectorStore((s) => s.clipboard)
  const select = useDirectorStore((s) => s.select)
  const toggleObjectSelection = useDirectorStore((s) => s.toggleObjectSelection)
  const setObjectField = useDirectorStore((s) => s.setObjectField)
  const duplicateObject = useDirectorStore((s) => s.duplicateObject)
  const removeObject = useDirectorStore((s) => s.removeObject)
  const setCameraField = useDirectorStore((s) => s.setCameraField)
  const duplicateCamera = useDirectorStore((s) => s.duplicateCamera)
  const removeCamera = useDirectorStore((s) => s.removeCamera)
  const setActiveCamera = useDirectorStore((s) => s.setActiveCamera)
  const setSelectedObjectsVisibility = useDirectorStore((s) => s.setSelectedObjectsVisibility)
  const setSelectedObjectsLocked = useDirectorStore((s) => s.setSelectedObjectsLocked)
  const copySelectedObjects = useDirectorStore((s) => s.copySelectedObjects)
  const pasteClipboardObjects = useDirectorStore((s) => s.pasteClipboardObjects)
  const removeSelectedObjects = useDirectorStore((s) => s.removeSelectedObjects)
  const [q, setQ] = useState('')
  const selectedObjects = useMemo(
    () => objects.filter((object) => selectedIds.includes(object.id)),
    [objects, selectedIds],
  )
  const hasHiddenSelection = selectedObjects.some((object) => !object.visible)
  const hasUnlockedSelection = selectedObjects.some((object) => !object.locked)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const match = (name: string) => !term || name.toLowerCase().includes(term)
    const characters = objects.filter((o) => o.kind === 'character' && match(o.name))
    const crowds = objects.filter((o) => o.kind === 'crowd' && match(o.name))
    const props = objects.filter((o) => o.kind === 'prop' && match(o.name))
    const cams = cameras.filter((c) => match(c.name))
    return { characters, crowds, props, cams }
  }, [objects, cameras, q])

  const renderGroup = (title: string, list: DirectorObject[]) => (
    <div className="mb-2">
      <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-white/40">{title}</div>
      {list.length === 0 ? (
        <div className="px-1.5 text-[10px] text-white/30">空</div>
      ) : (
        list.map((o) => (
          <Row
            key={o.id}
            id={o.id}
            name={o.name}
            color={o.color}
            visible={o.visible}
            locked={o.locked}
            selected={selectedId === o.id}
            multiSelected={selectedIds.includes(o.id)}
            showLock
            onSelect={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) {
                toggleObjectSelection(o.id)
                return
              }
              select(o.id)
            }}
            onToggleVisible={() => setObjectField(o.id, 'visible', !o.visible)}
            onToggleLock={() => setObjectField(o.id, 'locked', !o.locked)}
            onRename={(v) => setObjectField(o.id, 'name', v)}
            trailingActions={(
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    duplicateObject(o.id)
                  }}
                  className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label={`复制对象 ${o.name}`}
                  title="复制对象"
                >
                  <AppIcon name="copy" size={13} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    removeObject(o.id)
                  }}
                  className="rounded p-0.5 text-red-300/70 hover:bg-red-500/20 hover:text-red-200"
                  aria-label={`删除对象 ${o.name}`}
                  title="删除对象"
                >
                  <AppIcon name="trash" size={13} />
                </button>
              </>
            )}
          />
        ))
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-2 text-white/80">
      <label className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs focus-within:border-white/30">
        <AppIcon name="search" size={13} className="text-white/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索..."
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
      {selectedIds.length > 1 && (
        <div className="flex flex-col gap-1 rounded border border-blue-300/20 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-100">
          <div>已选择 {selectedIds.length} 个对象，可复制、粘贴或删除</div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setSelectedObjectsVisibility(hasHiddenSelection)}
              className="inline-flex items-center gap-1 rounded border border-blue-200/20 bg-white/5 px-1.5 py-0.5 text-blue-50 hover:bg-white/10"
            >
              <AppIcon name={hasHiddenSelection ? 'eye' : 'eyeOff'} size={11} />
              {hasHiddenSelection ? '显示选中' : '隐藏选中'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedObjectsLocked(hasUnlockedSelection)}
              className="inline-flex items-center gap-1 rounded border border-blue-200/20 bg-white/5 px-1.5 py-0.5 text-blue-50 hover:bg-white/10"
            >
              <AppIcon name={hasUnlockedSelection ? 'lock' : 'unlock'} size={11} />
              {hasUnlockedSelection ? '锁定选中' : '解锁选中'}
            </button>
            <button
              type="button"
              onClick={copySelectedObjects}
              className="inline-flex items-center gap-1 rounded border border-blue-200/20 bg-white/5 px-1.5 py-0.5 text-blue-50 hover:bg-white/10"
            >
              <AppIcon name="copy" size={11} />
              复制选中
            </button>
            <button
              type="button"
              onClick={pasteClipboardObjects}
              disabled={clipboard.length === 0}
              className="inline-flex items-center gap-1 rounded border border-blue-200/20 bg-white/5 px-1.5 py-0.5 text-blue-50 hover:bg-white/10 disabled:opacity-40"
            >
              <AppIcon name="clipboard" size={11} />
              粘贴对象
            </button>
            <button
              type="button"
              onClick={removeSelectedObjects}
              className="inline-flex items-center gap-1 rounded border border-red-300/25 bg-red-500/10 px-1.5 py-0.5 text-red-100 hover:bg-red-500/20"
            >
              <AppIcon name="trash" size={11} />
              删除选中
            </button>
          </div>
        </div>
      )}
      {renderGroup('角色', filtered.characters)}
      {renderGroup('群演', filtered.crowds)}
      {renderGroup('道具', filtered.props)}
      <div className="mb-2">
        <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-white/40">机位</div>
        {filtered.cams.length === 0 ? (
          <div className="px-1.5 text-[10px] text-white/30">空</div>
        ) : (
          filtered.cams.map((c) => (
            <Row
              key={c.id}
              id={c.id}
              name={c.name}
              color="#A9D8FF"
              visible={c.visible !== false}
              selected={selectedId === c.id}
              onSelect={() => select(c.id)}
              onToggleVisible={() => setCameraField(c.id, 'visible', !(c.visible !== false))}
              onRename={(v) => setCameraField(c.id, 'name', v)}
              trailingActions={(
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      duplicateCamera(c.id)
                    }}
                    className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
                    aria-label={`复制机位 ${c.name}`}
                    title="复制机位"
                  >
                    <AppIcon name="copy" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setActiveCamera(c.id)
                    }}
                    disabled={c.id === activeCameraId}
                    className="rounded p-0.5 text-amber-200/70 hover:bg-amber-500/20 hover:text-amber-100 disabled:opacity-40"
                    aria-label={`设为激活 ${c.name}`}
                    title={c.id === activeCameraId ? '当前激活机位' : '设为激活'}
                  >
                    <AppIcon name="star" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeCamera(c.id)
                    }}
                    disabled={cameras.length <= 1}
                    className="rounded p-0.5 text-red-300/70 hover:bg-red-500/20 hover:text-red-200 disabled:opacity-40"
                    aria-label={`删除机位 ${c.name}`}
                    title={cameras.length <= 1 ? '至少保留一个机位' : '删除机位'}
                  >
                    <AppIcon name="trash" size={13} />
                  </button>
                </>
              )}
            />
          ))
        )}
      </div>
      <div className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/40">
        Q/W 平移 · E 旋转 · R 缩放
        <br />
        Del 删除 · Ctrl+Z 撤销
      </div>
    </div>
  )
}
