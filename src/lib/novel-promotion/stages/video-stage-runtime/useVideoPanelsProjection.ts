'use client'

import { useMemo } from 'react'
import type {
  Clip,
  GridSplitImage,
  GridVideoFrame,
  Storyboard,
  VideoPanel,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'

interface TaskStateLike {
  phase?: string | null
  lastError?: { code?: string; message?: string } | null
}

interface TaskPresentationLike {
  getTaskState: (key: string) => TaskStateLike | null
}

interface UseVideoPanelsProjectionParams {
  storyboards: Storyboard[]
  clips: Clip[]
  panelVideoStates: TaskPresentationLike
  panelLipStates: TaskPresentationLike
  gridVideoPromptStates?: TaskPresentationLike
  gridSplitEnhanceStates?: TaskPresentationLike
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseGridGenerationContext(value: unknown): {
  gridSplitImages: GridSplitImage[]
  gridVideoFrames: GridVideoFrame[]
} {
  if (typeof value !== 'string' || !value.trim()) {
    return { gridSplitImages: [], gridVideoFrames: [] }
  }
  try {
    const context = asRecord(JSON.parse(value))
    const splitImages = Array.isArray(context.gridSplitImages) ? context.gridSplitImages : []
    const frames = Array.isArray(context.gridVideoFrames) ? context.gridVideoFrames : []
    return {
      gridSplitImages: splitImages
        .map((item) => {
          const record = asRecord(item)
          const imageUrl = pickText(record.imageUrl)
          const cellIndex = typeof record.cellIndex === 'number' ? Math.floor(record.cellIndex) : 0
          const panelGridSize = typeof record.panelGridSize === 'number' ? Math.floor(record.panelGridSize) : 0
          return imageUrl && cellIndex > 0 && panelGridSize > 1
            ? { imageUrl, cellIndex, panelGridSize }
            : null
        })
        .filter((item): item is GridSplitImage => item !== null)
        .sort((left, right) => left.cellIndex - right.cellIndex),
      gridVideoFrames: frames
        .map((item): GridVideoFrame | null => {
          const record = asRecord(item)
          const imageUrl = pickText(record.imageUrl)
          const videoPrompt = pickText(record.videoPrompt)
          const cellIndex = typeof record.cellIndex === 'number' ? Math.floor(record.cellIndex) : 0
          return imageUrl && videoPrompt && cellIndex > 0
            ? {
              cellIndex,
              imageUrl,
              videoPrompt,
              imagePrompt: pickText(record.imagePrompt) || undefined,
              action: pickText(record.action) || undefined,
              shotType: pickText(record.shotType) || undefined,
              cameraMove: pickText(record.cameraMove) || undefined,
              description: pickText(record.description) || undefined,
              location: pickText(record.location) || undefined,
            }
            : null
        })
        .filter((item): item is GridVideoFrame => item !== null)
        .sort((left, right) => left.cellIndex - right.cellIndex),
    }
  } catch {
    return { gridSplitImages: [], gridVideoFrames: [] }
  }
}

export function useVideoPanelsProjection({
  storyboards,
  clips,
  panelVideoStates,
  panelLipStates,
  gridVideoPromptStates,
  gridSplitEnhanceStates,
}: UseVideoPanelsProjectionParams) {
  const sortedStoryboards = useMemo(() => {
    return [...storyboards].sort((left, right) => {
      const leftIndex = clips.findIndex((clip) => clip.id === left.clipId)
      const rightIndex = clips.findIndex((clip) => clip.id === right.clipId)
      return leftIndex - rightIndex
    })
  }, [clips, storyboards])

  const allPanels = useMemo<VideoPanel[]>(() => {
    const panels: VideoPanel[] = []
    sortedStoryboards.forEach((storyboard) => {
      const storyboardPanels = storyboard.panels || []
      storyboardPanels.forEach((panel, index) => {
        const actualPanelIndex = panel.panelIndex ?? index
        let charactersArray: string[] = []
        if (panel.characters) {
          try {
            const parsed = typeof panel.characters === 'string' ? JSON.parse(panel.characters) : panel.characters
            charactersArray = Array.isArray(parsed) ? parsed : []
          } catch {
            charactersArray = []
          }
        }

        const panelId = panel.id
        const panelVideoState = panelId ? panelVideoStates.getTaskState(`panel-video:${panelId}`) : null
        const panelLipState = panelId ? panelLipStates.getTaskState(`panel-lip:${panelId}`) : null
        const gridVideoPromptState = panelId && gridVideoPromptStates
          ? gridVideoPromptStates.getTaskState(`grid-video-prompt:${panelId}`)
          : null
        const gridSplitEnhanceState = panelId && gridSplitEnhanceStates
          ? gridSplitEnhanceStates.getTaskState(`grid-split-enhance:${panelId}`)
          : null
        const gridContext = parseGridGenerationContext(panel.gridGenerationContext)

        panels.push({
          panelId,
          storyboardId: storyboard.id,
          panelIndex: actualPanelIndex,
          textPanel: {
            panel_number: panel.panelNumber || actualPanelIndex + 1,
            shot_type: panel.shotType || '',
            camera_move: panel.cameraMove || '',
            description: panel.description || '',
            characters: charactersArray,
            location: panel.location || '',
            text_segment: panel.srtSegment || '',
            duration: panel.duration || undefined,
            imagePrompt: panel.imagePrompt || undefined,
            video_prompt: panel.videoPrompt || undefined,
            videoModel: panel.videoModel || undefined,
          },
          imageUrl: panel.imageUrl || undefined,
          imageLayout: (panel.imageLayout as 'single' | 'grid' | undefined) || undefined,
          gridGenerationContext: panel.gridGenerationContext || undefined,
          gridSplitImages: gridContext.gridSplitImages,
          gridVideoFrames: gridContext.gridVideoFrames,
          firstLastFramePrompt: panel.firstLastFramePrompt || undefined,
          videoUrl: panel.videoUrl || undefined,
          videoHistory: panel.videoHistory ?? undefined,
          videoGenerationMode: panel.videoGenerationMode || undefined,
          videoTaskRunning: panelVideoState?.phase === 'queued' || panelVideoState?.phase === 'processing',
          videoErrorCode:
            panelVideoState?.phase === 'failed'
              ? panelVideoState.lastError?.code || panel.videoErrorCode || undefined
              : panel.videoErrorCode || undefined,
          videoErrorMessage:
            panelVideoState?.phase === 'failed'
              ? panelVideoState.lastError?.message || panel.videoErrorMessage || undefined
              : panel.videoErrorMessage || undefined,
          videoModel: panel.videoModel || undefined,
          linkedToNextPanel: panel.linkedToNextPanel || false,
          lipSyncVideoUrl: panel.lipSyncVideoUrl || undefined,
          lipSyncTaskRunning: panelLipState?.phase === 'queued' || panelLipState?.phase === 'processing',
          lipSyncErrorCode:
            panelLipState?.phase === 'failed'
              ? panelLipState.lastError?.code || panel.lipSyncErrorCode || undefined
              : panel.lipSyncErrorCode || undefined,
          lipSyncErrorMessage:
            panelLipState?.phase === 'failed'
              ? panelLipState.lastError?.message || panel.lipSyncErrorMessage || undefined
              : panel.lipSyncErrorMessage || undefined,
          gridVideoPromptTaskRunning:
            gridVideoPromptState?.phase === 'queued' || gridVideoPromptState?.phase === 'processing',
          gridSplitEnhanceTaskRunning:
            gridSplitEnhanceState?.phase === 'queued' || gridSplitEnhanceState?.phase === 'processing',
        })
      })
    })
    return panels
  }, [panelLipStates, panelVideoStates, gridVideoPromptStates, gridSplitEnhanceStates, sortedStoryboards])

  return {
    sortedStoryboards,
    allPanels,
  }
}
