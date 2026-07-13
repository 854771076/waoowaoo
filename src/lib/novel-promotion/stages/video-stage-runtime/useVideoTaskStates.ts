'use client'

import { useMemo } from 'react'
import type { Storyboard } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import { useVideoTaskPresentation } from '@/lib/query/hooks/useTaskPresentation'
import {
  buildPanelLipTargets,
  buildPanelVideoTargets,
  buildGridSplitEnhanceTargets,
  buildGridVideoPromptTargets,
} from './task-targets'

interface UseVideoTaskStatesParams {
  projectId: string
  storyboards: Storyboard[]
}

export function useVideoTaskStates({
  projectId,
  storyboards,
}: UseVideoTaskStatesParams) {
  const panelVideoTargets = useMemo(() => buildPanelVideoTargets(storyboards), [storyboards])
  const panelLipTargets = useMemo(() => buildPanelLipTargets(storyboards), [storyboards])
  const gridVideoPromptTargets = useMemo(
    () => buildGridVideoPromptTargets(storyboards),
    [storyboards],
  )
  const gridSplitEnhanceTargets = useMemo(
    () => buildGridSplitEnhanceTargets(storyboards),
    [storyboards],
  )

  const panelVideoStates = useVideoTaskPresentation(projectId, panelVideoTargets, {
    enabled: !!projectId && panelVideoTargets.length > 0,
  })
  const panelLipStates = useVideoTaskPresentation(projectId, panelLipTargets, {
    enabled: !!projectId && panelLipTargets.length > 0,
  })
  const gridVideoPromptStates = useVideoTaskPresentation(projectId, gridVideoPromptTargets, {
    enabled: !!projectId && gridVideoPromptTargets.length > 0,
  })
  const gridSplitEnhanceStates = useVideoTaskPresentation(projectId, gridSplitEnhanceTargets, {
    enabled: !!projectId && gridSplitEnhanceTargets.length > 0,
  })

  return {
    panelVideoStates,
    panelLipStates,
    gridVideoPromptStates,
    gridSplitEnhanceStates,
  }
}
