'use client'

import { useMemo } from 'react'
import type {
  Clip,
  DirectorStoryboardAsset,
  DirectorStoryboardBoard,
  GridSplitImage,
  GridVideoFrame,
  Storyboard,
  VideoPanel,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'

interface TaskStateLike {
  phase?: string | null
  runningPayload?: Record<string, unknown> | null
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

function pickPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null
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

function parseDirectorStoryboardAssets(value: unknown): DirectorStoryboardAsset[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const project = asRecord(JSON.parse(value))
    const assets = Array.isArray(project.directorStoryboardAssets) ? project.directorStoryboardAssets : []
    return assets
      .map((item): DirectorStoryboardAsset | null => {
        const record = asRecord(item)
        const id = pickText(record.id)
        const name = pickText(record.name)
        const imageUrl = pickText(record.imageUrl)
        if (!id || record.type !== 'rendered_snapshot' || !name || !imageUrl) return null
        const layout = asRecord(record.layout)
        return {
          id,
          type: 'rendered_snapshot',
          name,
          createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0,
          imageUrl,
          sourceSnapshotId: pickText(record.sourceSnapshotId) || undefined,
          sourceCameraId: pickText(record.sourceCameraId) || undefined,
          note: pickText(record.note) || undefined,
          layout: {
            x: typeof layout.x === 'number' ? layout.x : 0,
            y: typeof layout.y === 'number' ? layout.y : 0,
            width: typeof layout.width === 'number' ? layout.width : 1,
            height: typeof layout.height === 'number' ? layout.height : 1,
            rotation: typeof layout.rotation === 'number' ? layout.rotation : 0,
          },
        }
      })
      .filter((item): item is DirectorStoryboardAsset => item !== null)
  } catch {
    return []
  }
}

function parseDirectorStoryboardBoards(value: unknown): DirectorStoryboardBoard[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const project = asRecord(JSON.parse(value))
    const boards = Array.isArray(project.directorStoryboardBoards) ? project.directorStoryboardBoards : []
    return boards
      .map((item): DirectorStoryboardBoard | null => {
        const record = asRecord(item)
        const id = pickText(record.id)
        const name = pickText(record.name)
        const coverImageUrl = pickText(record.coverImageUrl)
        const assetIds = Array.isArray(record.assetIds)
          ? record.assetIds.filter((assetId): assetId is string => typeof assetId === 'string' && assetId.length > 0)
          : []
        const items = Array.isArray(record.items)
          ? record.items.map((rawItem) => {
              const item = asRecord(rawItem)
              const assetId = pickText(item.assetId)
              if (!assetId) return null
              return {
                assetId,
                x: typeof item.x === 'number' ? item.x : 0,
                y: typeof item.y === 'number' ? item.y : 0,
                width: typeof item.width === 'number' ? item.width : 1,
                height: typeof item.height === 'number' ? item.height : 1,
                rotation: typeof item.rotation === 'number' ? item.rotation : 0,
              }
            }).filter((entry): entry is DirectorStoryboardBoard['items'][number] => entry !== null)
          : []
        if (!id || !name || !coverImageUrl || assetIds.length === 0 || items.length === 0) return null
        return {
          id,
          name,
          createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0,
          coverImageUrl,
          assetIds,
          items,
          note: pickText(record.note) || undefined,
        }
      })
      .filter((item): item is DirectorStoryboardBoard => item !== null)
  } catch {
    return []
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
        const gridSplitEnhanceRunning =
          gridSplitEnhanceState?.phase === 'queued' || gridSplitEnhanceState?.phase === 'processing'
        const gridSplitEnhanceRunningCellIndex = gridSplitEnhanceRunning
          ? pickPositiveInteger(gridSplitEnhanceState?.runningPayload?.cellIndex)
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
          directorStoryboardAssets: parseDirectorStoryboardAssets(panel.directorLayout),
          directorStoryboardBoards: parseDirectorStoryboardBoards(panel.directorLayout),
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
          gridSplitEnhanceTaskRunning: gridSplitEnhanceRunning,
          gridSplitEnhanceRunningCellIndex,
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
