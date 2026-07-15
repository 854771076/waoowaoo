// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import VideoPanelCardHeader from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardHeader'
import type { VideoPanelRuntime } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/hooks/useVideoPanelActions'

vi.mock('@/components/task/TaskStatusOverlay', () => ({
  default: () => React.createElement('div', null, 'task-overlay'),
}))

vi.mock('@/components/media/MediaImageWithLoading', () => ({
  MediaImageWithLoading: ({ src, alt }: { src: string; alt: string }) => React.createElement('img', { src, alt }),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { name: string }) => React.createElement('span', null, name),
}))

function createRuntime(overrides: Partial<VideoPanelRuntime> = {}): VideoPanelRuntime {
  const runtime = {
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'panelCard.shot') return `镜头 ${String(values?.number ?? '')}`
      return key
    },
    panel: {
      storyboardId: 'sb-1',
      panelIndex: 2,
      panelId: 'panel-2',
      imageUrl: 'https://example.com/panel-source.jpg',
      videoUrl: null,
      videoGenerationMode: null,
      lipSyncVideoUrl: null,
      directorStoryboardBoards: [
        {
          id: 'board-1',
          name: '导演分镜图',
          createdAt: 1,
          coverImageUrl: 'https://example.com/director-board.jpg',
          assetIds: [],
          items: [],
        },
      ],
    },
    panelIndex: 2,
    panelKey: 'sb-1-2',
    layout: {
      isLinked: false,
      isLastFrame: false,
      nextPanel: null,
      prevPanel: null,
      hasNext: false,
    },
    media: {
      showLipSyncVideo: false,
      onToggleLipSyncVideo: () => undefined,
      onPreviewImage: () => undefined,
      baseVideoUrl: undefined,
      currentVideoUrl: undefined,
    },
    taskStatus: {
      isVideoTaskRunning: false,
      isLipSyncTaskRunning: false,
      taskRunningVideoLabel: '生成中',
      overlayPresentation: null,
      panelErrorDisplay: null,
    },
    videoModel: {
      selectedModel: 'model-1',
      generationOptions: {},
      missingCapabilityFields: [],
    },
    player: {
      cssAspectRatio: '16 / 9',
      isPlaying: false,
      videoRef: { current: null },
      handlePlayClick: () => undefined,
      handlePreviewImage: () => undefined,
      setIsPlaying: () => undefined,
    },
    actions: {
      onToggleLink: () => undefined,
      onGenerateVideo: () => undefined,
    },
    duration: {
      withDuration: (options = {}) => options,
    },
    videoReference: {
      selectedImages: [],
    },
    computed: {
      gridVideoSource: 'original',
      directorStoryboardBoardId: 'board-1',
    },
  }

  return {
    ...runtime,
    ...overrides,
  } as unknown as VideoPanelRuntime
}

describe('VideoPanelCardHeader', () => {
  it('uses the selected director storyboard board cover as the shot thumbnail', () => {
    render(React.createElement(VideoPanelCardHeader, { runtime: createRuntime() }))

    expect(screen.getByAltText('镜头 3')).toHaveAttribute('src', 'https://example.com/director-board.jpg')
  })
})
