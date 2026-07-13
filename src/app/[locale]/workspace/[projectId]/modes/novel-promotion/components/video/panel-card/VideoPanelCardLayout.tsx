'use client'

import React, { useState } from 'react'
import VideoPanelCardHeader from './VideoPanelCardHeader'
import VideoPanelCardBody from './VideoPanelCardBody'
import VideoPanelCardFooter from './VideoPanelCardFooter'
import PanelHistoryDrawer from '../../storyboard/PanelHistoryDrawer'
import { useVideoPanelActions, type VideoPanelCardShellProps } from './hooks/useVideoPanelActions'
import { parsePanelHistory } from '@/lib/novel-promotion/panel-history'
import GridSplitDialog from './GridSplitDialog'

export type { VideoPanelCardShellProps }

function VideoPanelCardLayout(props: VideoPanelCardShellProps) {
  const [gridSplitOpen, setGridSplitOpen] = useState(false)
  const runtime = useVideoPanelActions({
    ...props,
    onOpenGridSplit: () => setGridSplitOpen(true),
  })
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyCount = parsePanelHistory(runtime.panel.videoHistory ?? null).length
  const panelId = runtime.panel.panelId

  return (
    <div className="glass-surface-elevated overflow-visible">
      <VideoPanelCardHeader
        runtime={runtime}
        onOpenHistory={panelId ? () => setHistoryOpen(true) : undefined}
        historyCount={historyCount}
      />
      <VideoPanelCardBody runtime={runtime} />
      <VideoPanelCardFooter runtime={runtime} />
      {panelId && (
        <PanelHistoryDrawer
          projectId={props.projectId}
          panelId={panelId}
          mediaType="video"
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        />
      )}
      {runtime.panel.imageLayout === 'grid' && (
        <GridSplitDialog
          open={gridSplitOpen}
          onOpenChange={setGridSplitOpen}
          projectId={props.projectId}
          episodeId={props.episodeId}
          panel={runtime.panel}
          t={(key, params) => runtime.t(key as never, params as never)}
        />
      )}
    </div>
  )
}

export default React.memo(VideoPanelCardLayout)
