import { describe, expect, it } from 'vitest'
import { buildPreImageGridGenerationContext } from '@/lib/storyboard-images/grid-generation-context'
import {
  buildGridVideoFramesContext,
  extractGridVideoFrames,
  selectGridVideoFrameImages,
  shouldUseGridFirstLastFrame,
} from '@/lib/storyboard-images/grid-video-frames'

describe('grid video frames', () => {
  it('maps split images to pre-image grid cell prompts by cellIndex', () => {
    const context = buildPreImageGridGenerationContext({
      panelGridSize: 3,
      imagePrompt: '三格分镜图提示词',
      baseVideoPrompt: '角色拔剑后冲向宫门',
      shotType: '中景',
      cameraMove: '推进',
      panelContext: {
        panel: {
          description: '角色准备战斗',
          location: '宫门',
          characters: ['帝俊'],
        },
      },
    })

    const contextJson = buildGridVideoFramesContext(JSON.stringify(context), [
      { imageUrl: 'images/grid-cell-1.jpg', cellIndex: 1, panelGridSize: 3 },
      { imageUrl: 'images/grid-cell-2.jpg', cellIndex: 2, panelGridSize: 3 },
      { imageUrl: 'images/grid-cell-3.jpg', cellIndex: 3, panelGridSize: 3 },
    ])

    expect(extractGridVideoFrames(contextJson)).toEqual([
      expect.objectContaining({
        cellIndex: 1,
        imageUrl: 'images/grid-cell-1.jpg',
        imagePrompt: expect.stringContaining('宫格 1/3'),
        videoPrompt: expect.stringContaining('格 1'),
        action: expect.stringContaining('起始关键帧'),
      }),
      expect.objectContaining({
        cellIndex: 2,
        imageUrl: 'images/grid-cell-2.jpg',
        videoPrompt: expect.stringContaining('格 2'),
      }),
      expect.objectContaining({
        cellIndex: 3,
        imageUrl: 'images/grid-cell-3.jpg',
        action: expect.stringContaining('收束关键帧'),
      }),
    ])
  })

  it('selects first and last available frame images for video generation', () => {
    const selection = selectGridVideoFrameImages([
      { cellIndex: 2, imageUrl: 'images/grid-cell-2.jpg', videoPrompt: 'frame 2' },
      { cellIndex: 4, imageUrl: 'images/grid-cell-4.jpg', videoPrompt: 'frame 4' },
      { cellIndex: 3, imageUrl: 'images/grid-cell-3.jpg', videoPrompt: 'frame 3' },
    ])

    expect(selection).toEqual({
      firstImageUrl: 'images/grid-cell-2.jpg',
      lastImageUrl: 'images/grid-cell-4.jpg',
      aggregatePrompt: ['frame 2', 'frame 3', 'frame 4'].join('\n'),
    })
  })

  it('uses grid first-last-frame only when model supports it and both frame images exist', () => {
    expect(shouldUseGridFirstLastFrame({
      supportsFirstLastFrame: true,
      selection: {
        firstImageUrl: 'images/grid-cell-1.jpg',
        lastImageUrl: 'images/grid-cell-4.jpg',
        aggregatePrompt: 'prompt',
      },
    })).toBe(true)

    expect(shouldUseGridFirstLastFrame({
      supportsFirstLastFrame: false,
      selection: {
        firstImageUrl: 'images/grid-cell-1.jpg',
        lastImageUrl: 'images/grid-cell-4.jpg',
        aggregatePrompt: 'prompt',
      },
    })).toBe(false)

    expect(shouldUseGridFirstLastFrame({
      supportsFirstLastFrame: true,
      selection: {
        firstImageUrl: 'images/grid-cell-1.jpg',
        lastImageUrl: null,
        aggregatePrompt: 'prompt',
      },
    })).toBe(false)
  })
})
