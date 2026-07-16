'use client'
import { useEffect } from 'react'
import { useDirectorStore } from './store/directorStore'
import { TopBar } from './TopBar'
import { DirectorCanvas } from './canvas/DirectorCanvas'
import { ObjectTreePanel } from './panels/ObjectTreePanel'
import { RightPanel } from './panels/RightPanel'
import { SnapshotPanel } from './panels/SnapshotPanel'

export function DirectorDeskShell() {
  const undo = useDirectorStore((s) => s.undo)
  const redo = useDirectorStore((s) => s.redo)
  const selectedId = useDirectorStore((s) => s.selectedId)
  const selectedIds = useDirectorStore((s) => s.selectedIds)
  const removeSelectedObjects = useDirectorStore((s) => s.removeSelectedObjects)
  const setTransformMode = useDirectorStore((s) => s.setTransformMode)
  const copySelectedObjects = useDirectorStore((s) => s.copySelectedObjects)
  const pasteClipboardObjects = useDirectorStore((s) => s.pasteClipboardObjects)
  const clipboard = useDirectorStore((s) => s.clipboard)
  const viewportPanelsCollapsed = useDirectorStore((s) => s.viewportPanelsCollapsed)
  const isDirty = useDirectorStore((s) => s.isDirty)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if ((ctrl && e.key.toLowerCase() === 'y') || (ctrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault()
        redo()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'c' && selectedId) {
        e.preventDefault()
        copySelectedObjects()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'v' && clipboard.length > 0) {
        e.preventDefault()
        pasteClipboardObjects()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedId || selectedIds.length > 0)) {
        e.preventDefault()
        removeSelectedObjects()
        return
      }
      if (e.key === 'q' || e.key === 'Q' || e.key === 'w' || e.key === 'W') {
        setTransformMode('translate')
      } else if (e.key === 'e' || e.key === 'E') {
        setTransformMode('rotate')
      } else if (e.key === 'r' || e.key === 'R') {
        setTransformMode('scale')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selectedId, selectedIds.length, clipboard.length, removeSelectedObjects, setTransformMode, copySelectedObjects, pasteClipboardObjects])

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0f1216] text-gray-100">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        {!viewportPanelsCollapsed && (
          <aside className="w-[240px] shrink-0 overflow-auto border-r border-white/10 p-2">
            <ObjectTreePanel />
            <SnapshotPanel />
          </aside>
        )}
        <main className="relative flex-1 min-w-0">
          <DirectorCanvas />
        </main>
        {!viewportPanelsCollapsed && (
          <aside className="w-[320px] shrink-0 overflow-auto border-l border-white/10 p-2">
            <RightPanel />
          </aside>
        )}
      </div>
    </div>
  )
}
