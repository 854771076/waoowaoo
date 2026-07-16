'use client'

import { AppIcon } from '@/components/ui/icons'
import { useDirectorStore } from '../store/directorStore'

function ToolButton({
  label,
  active,
  disabled,
  children,
  onClick,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded border text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? 'border-blue-300/40 bg-blue-500/25 text-blue-100' : 'border-white/10 bg-black/35'
      }`}
    >
      {children}
    </button>
  )
}

export function ViewportToolbar() {
  const transformMode = useDirectorStore((s) => s.transformMode)
  const setTransformMode = useDirectorStore((s) => s.setTransformMode)
  const viewMode = useDirectorStore((s) => s.viewMode)
  const setViewMode = useDirectorStore((s) => s.setViewMode)
  const viewportPanelsCollapsed = useDirectorStore((s) => s.viewportPanelsCollapsed)
  const toggleViewportPanelsCollapsed = useDirectorStore((s) => s.toggleViewportPanelsCollapsed)
  const viewportRuleOfThirdsEnabled = useDirectorStore((s) => s.viewportRuleOfThirdsEnabled)
  const setViewportRuleOfThirdsEnabled = useDirectorStore((s) => s.setViewportRuleOfThirdsEnabled)
  const selectedId = useDirectorStore((s) => s.selectedId)
  const selectedIds = useDirectorStore((s) => s.selectedIds)
  const clipboard = useDirectorStore((s) => s.clipboard)
  const history = useDirectorStore((s) => s.history)
  const future = useDirectorStore((s) => s.future)
  const copySelectedObjects = useDirectorStore((s) => s.copySelectedObjects)
  const pasteClipboardObjects = useDirectorStore((s) => s.pasteClipboardObjects)
  const undo = useDirectorStore((s) => s.undo)
  const redo = useDirectorStore((s) => s.redo)
  const hasSelection = selectedIds.length > 0 || !!selectedId

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded border border-white/10 bg-[#10141a]/88 p-1 shadow-2xl shadow-black/35 backdrop-blur">
        <ToolButton label="平移 (Q/W)" active={transformMode === 'translate'} onClick={() => setTransformMode('translate')}>
          <AppIcon name="move3d" size={17} />
        </ToolButton>
        <ToolButton label="旋转 (E)" active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')}>
          <AppIcon name="rotate3d" size={17} />
        </ToolButton>
        <ToolButton label="缩放 (R)" active={transformMode === 'scale'} onClick={() => setTransformMode('scale')}>
          <AppIcon name="scale3d" size={17} />
        </ToolButton>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <ToolButton label="复制选中对象" disabled={!hasSelection} onClick={copySelectedObjects}>
          <AppIcon name="copy" size={17} />
        </ToolButton>
        <ToolButton label="粘贴对象" disabled={clipboard.length === 0} onClick={pasteClipboardObjects}>
          <AppIcon name="clipboard" size={17} />
        </ToolButton>
        <ToolButton label="撤销" disabled={history.length === 0} onClick={undo}>
          <AppIcon name="undo" size={17} />
        </ToolButton>
        <ToolButton label="重做" disabled={future.length === 0} onClick={redo}>
          <AppIcon name="redo" size={17} />
        </ToolButton>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <ToolButton label="导演视角" active={viewMode === 'director'} onClick={() => setViewMode('director')}>
          <AppIcon name="eye" size={17} />
        </ToolButton>
        <ToolButton label="机位视角" active={viewMode === 'camera'} onClick={() => setViewMode('camera')}>
          <AppIcon name="monitor" size={17} />
        </ToolButton>
        <ToolButton
          label={viewportRuleOfThirdsEnabled ? '隐藏构图辅助线' : '显示构图辅助线'}
          active={viewportRuleOfThirdsEnabled}
          onClick={() => setViewportRuleOfThirdsEnabled(!viewportRuleOfThirdsEnabled)}
        >
          {viewportRuleOfThirdsEnabled ? <AppIcon name="grid" size={17} /> : <AppIcon name="eyeOff" size={17} />}
        </ToolButton>
        <ToolButton
          label={viewportPanelsCollapsed ? '展开侧栏' : '折叠侧栏'}
          active={viewportPanelsCollapsed}
          onClick={toggleViewportPanelsCollapsed}
        >
          {viewportPanelsCollapsed ? <AppIcon name="panelLeftOpen" size={17} /> : <AppIcon name="panelLeftClose" size={17} />}
        </ToolButton>
      </div>
    </div>
  )
}
