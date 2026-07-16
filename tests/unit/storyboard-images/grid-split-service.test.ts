import { beforeEach, describe, expect, it, vi } from 'vitest'

const updatePanelMock = vi.fn()
const updateManyPanelMock = vi.fn()
const findUniquePanelMock = vi.fn()
const uploadImageSourceToCosMock = vi.fn()
const cropAllGridImageBuffersForVideoMock = vi.fn()
const generateImageMock = vi.fn()
const buildPromptAsyncMock = vi.fn(async () => 'rendered grid enhance prompt')
const normalizeReferenceImagesForGenerationMock = vi.fn(async (inputs: string[]) =>
  inputs.map((input) => `normalized:${input}`),
)
const toFetchableUrlMock = vi.fn((value: string) =>
  value.startsWith('/') ? `http://localhost:3000${value}` : value,
)

vi.mock('@/lib/prisma', () => ({
  prisma: {
    novelPromotionPanel: {
      findUnique: findUniquePanelMock,
      update: updatePanelMock,
      updateMany: updateManyPanelMock,
    },
  },
}))

vi.mock('@/lib/workers/utils', () => ({
  toSignedUrlIfCos: (value: string | null | undefined) =>
    value ? `/api/storage/sign?key=${encodeURIComponent(value)}&expires=3600` : null,
  uploadImageSourceToCos: uploadImageSourceToCosMock,
}))

vi.mock('@/lib/storage', () => ({
  toFetchableUrl: toFetchableUrlMock,
}))

vi.mock('@/lib/generator-api', () => ({
  generateImage: generateImageMock,
}))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeReferenceImagesForGeneration: normalizeReferenceImagesForGenerationMock,
}))

vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: {
    NP_PANEL_GRID_ENHANCE: 'np_panel_grid_enhance',
  },
  buildPromptAsync: buildPromptAsyncMock,
}))

vi.mock('@/lib/storyboard-images/grid-split', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storyboard-images/grid-split')>()
  return {
    ...actual,
    cropAllGridImageBuffersForVideo: cropAllGridImageBuffersForVideoMock,
  }
})

const {
  enhanceGridSplitImagesForPanel,
  ensureGridSplitImagesForPanel,
} = await import('@/lib/storyboard-images/grid-split-service')

describe('ensureGridSplitImagesForPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findUniquePanelMock.mockReset()
    updateManyPanelMock.mockReset()
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })) as unknown as typeof fetch
    uploadImageSourceToCosMock.mockImplementation(async (_buffer, _prefix, targetId: string) => `images/${targetId}.jpg`)
    generateImageMock.mockResolvedValue({ success: true, imageUrl: 'https://generated.example/enhanced.jpg' })
    findUniquePanelMock.mockResolvedValue(null)
    updateManyPanelMock.mockResolvedValue({ count: 1 })
    cropAllGridImageBuffersForVideoMock.mockResolvedValue([
      { cellIndex: 1, buffer: Buffer.from('one') },
      { cellIndex: 2, buffer: Buffer.from('two') },
    ])
  })

  it('reuses cached split images for the same source grid image', async () => {
    const context = JSON.stringify({
      gridSplitMetadata: { panelGridSize: 2, sourceGridImageUrl: 'images/grid.jpg' },
      gridSplitImages: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', panelGridSize: 2 },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', panelGridSize: 2 },
      ],
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', videoPrompt: '镜头一' },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', videoPrompt: '镜头二' },
      ],
    })

    const result = await ensureGridSplitImagesForPanel({
      panel: { id: 'panel-1', imageUrl: 'images/grid.jpg', gridGenerationContext: context },
      panelGridSize: 2,
    })

    expect(result.reused).toBe(true)
    expect(result.images).toHaveLength(2)
    expect(result.frames.map((frame) => frame.videoPrompt)).toEqual(['镜头一', '镜头二'])
    expect(global.fetch).not.toHaveBeenCalled()
    expect(updatePanelMock).not.toHaveBeenCalled()
  })

  it('force-splits, uploads cells, and persists grid context', async () => {
    const result = await ensureGridSplitImagesForPanel({
      panel: {
        id: 'panel-2',
        imageUrl: 'images/grid.jpg',
        gridGenerationContext: JSON.stringify({
          preImageGridPrompt: {
            gridCells: [
              { cellIndex: 1, videoPrompt: '镜头一' },
              { cellIndex: 2, videoPrompt: '镜头二' },
            ],
          },
        }),
      },
      panelGridSize: 2,
      force: true,
    })

    expect(result.reused).toBe(false)
    expect(toFetchableUrlMock).toHaveBeenCalledWith('/api/storage/sign?key=images%2Fgrid.jpg&expires=3600')
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/storage/sign?key=images%2Fgrid.jpg&expires=3600')
    expect(cropAllGridImageBuffersForVideoMock).toHaveBeenCalledWith({
      imageBuffer: Buffer.from([1, 2, 3]),
      panelGridSize: 2,
      minOutputWidth: 768,
    })
    expect(uploadImageSourceToCosMock).toHaveBeenCalledTimes(2)
    expect(result.images.map((image) => image.imageUrl)).toEqual([
      'images/panel-2-1.jpg',
      'images/panel-2-2.jpg',
    ])
    expect(result.frames.map((frame) => frame.videoPrompt)).toEqual(['镜头一', '镜头二'])
    expect(updatePanelMock).toHaveBeenCalledWith({
      where: { id: 'panel-2' },
      data: { gridGenerationContext: expect.stringContaining('gridSplitImages') },
    })
  })

  it('enhances split images with generation references and updates video frames', async () => {
    const context = JSON.stringify({
      gridSplitMetadata: { panelGridSize: 2, sourceGridImageUrl: 'images/grid.jpg' },
      gridSplitImages: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', panelGridSize: 2 },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', panelGridSize: 2 },
      ],
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', videoPrompt: '镜头一' },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', videoPrompt: '镜头二' },
      ],
    })

    const result = await enhanceGridSplitImagesForPanel({
      panel: {
        id: 'panel-3',
        imageUrl: 'images/grid.jpg',
        gridGenerationContext: context,
        characters: null,
        location: null,
      },
      projectData: { videoRatio: '16:9', characters: [], locations: [] },
      panelGridSize: 2,
      userId: 'user-1',
      modelId: 'edit-model',
    })

    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(buildPromptAsyncMock).toHaveBeenCalledWith({
      promptId: 'np_panel_grid_enhance',
      locale: 'zh',
      projectId: undefined,
      variables: {
        cell_index: '1',
        panel_grid_size: '2',
        image_prompt: '',
        video_prompt: '镜头一',
        description: '',
        location: '',
      },
    })
    expect(generateImageMock).toHaveBeenCalledWith(
      'user-1',
      'edit-model',
      'rendered grid enhance prompt',
      expect.objectContaining({
        referenceImages: expect.arrayContaining(['normalized:/api/storage/sign?key=images%2Fcell-1.jpg&expires=3600']),
        aspectRatio: '16:9',
        resolution: '1080p',
      }),
    )
    expect(generateImageMock.mock.calls[0][3]).not.toHaveProperty('keepOriginalAspectRatio')
    expect(normalizeReferenceImagesForGenerationMock).toHaveBeenCalledWith(
      ['/api/storage/sign?key=images%2Fcell-1.jpg&expires=3600'],
      expect.objectContaining({
        context: expect.objectContaining({ source: 'grid_split_image_enhance', cellIndex: 1 }),
      }),
    )
    expect(result.images.map((image) => image.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
    expect(result.images.map((image) => image.enhancedImageUrl)).toEqual([
      'images/panel-3-1.jpg',
      'images/panel-3-2.jpg',
    ])
    expect(result.frames.map((frame) => frame.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
    expect(result.frames.map((frame) => frame.enhancedImageUrl)).toEqual([
      'images/panel-3-1.jpg',
      'images/panel-3-2.jpg',
    ])
    expect(result.gridGenerationContext).toContain('gridEnhanceMetadata')
    expect(updateManyPanelMock).toHaveBeenLastCalledWith({
      where: { id: 'panel-3', gridGenerationContext: context },
      data: { gridGenerationContext: expect.stringContaining('grid_split_image_enhance') },
    })
  })

  it('enhances only the requested grid cell when cellIndex is provided', async () => {
    const context = JSON.stringify({
      gridSplitMetadata: { panelGridSize: 2, sourceGridImageUrl: 'images/grid.jpg' },
      gridSplitImages: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', panelGridSize: 2 },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', panelGridSize: 2 },
      ],
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', videoPrompt: '镜头一' },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', videoPrompt: '镜头二' },
      ],
    })
    const onProgress = vi.fn()

    const result = await enhanceGridSplitImagesForPanel({
      panel: {
        id: 'panel-4',
        imageUrl: 'images/grid.jpg',
        gridGenerationContext: context,
        characters: null,
        location: null,
      },
      projectData: { videoRatio: '16:9', characters: [], locations: [] },
      panelGridSize: 2,
      userId: 'user-1',
      modelId: 'edit-model',
      cellIndex: 2,
      onProgress,
    })

    expect(generateImageMock).toHaveBeenCalledTimes(1)
    expect(normalizeReferenceImagesForGenerationMock).toHaveBeenCalledWith(
      ['/api/storage/sign?key=images%2Fcell-2.jpg&expires=3600'],
      expect.objectContaining({
        context: expect.objectContaining({ cellIndex: 2 }),
      }),
    )
    expect(result.enhancedCount).toBe(1)
    expect(result.images.map((image) => image.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
    expect(result.images.map((image) => image.enhancedImageUrl || null)).toEqual([
      null,
      'images/panel-4-2.jpg',
    ])
    expect(result.frames.map((frame) => frame.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
    expect(result.frames.map((frame) => frame.enhancedImageUrl || null)).toEqual([
      null,
      'images/panel-4-2.jpg',
    ])
    expect(onProgress).toHaveBeenCalledWith({ completed: 1, total: 1, cellIndex: 2 })
  })

  it('adds grid split enhance context to provider failures', async () => {
    const context = JSON.stringify({
      gridSplitMetadata: { panelGridSize: 2, sourceGridImageUrl: 'images/grid.jpg' },
      gridSplitImages: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', panelGridSize: 2 },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', panelGridSize: 2 },
      ],
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', videoPrompt: '镜头一' },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', videoPrompt: '镜头二' },
      ],
    })
    generateImageMock.mockResolvedValueOnce({ success: false, error: 'fetch failed' })

    await expect(enhanceGridSplitImagesForPanel({
      panel: {
        id: 'panel-context',
        imageUrl: 'images/grid.jpg',
        gridGenerationContext: context,
        characters: null,
        location: null,
      },
      projectData: { videoRatio: '16:9', characters: [], locations: [] },
      panelGridSize: 2,
      userId: 'user-1',
      modelId: 'edit-model',
      cellIndex: 2,
    })).rejects.toThrow('GRID_SPLIT_ENHANCE_FAILED: cellIndex=2 model=edit-model referenceImageCount=1 reason=fetch failed')
  })

  it('merges single-cell enhance into the latest grid context before persisting', async () => {
    const staleContext = JSON.stringify({
      gridSplitMetadata: { panelGridSize: 2, sourceGridImageUrl: 'images/grid.jpg' },
      gridSplitImages: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', panelGridSize: 2 },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', panelGridSize: 2 },
      ],
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', videoPrompt: '镜头一' },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', videoPrompt: '镜头二' },
      ],
    })
    const latestContext = JSON.stringify({
      gridSplitMetadata: { panelGridSize: 2, sourceGridImageUrl: 'images/grid.jpg' },
      gridSplitImages: [
        {
          cellIndex: 1,
          imageUrl: 'images/enhanced-cell-1.jpg',
          originalImageUrl: 'images/cell-1.jpg',
          panelGridSize: 2,
        },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', panelGridSize: 2 },
      ],
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'images/enhanced-cell-1.jpg', videoPrompt: '镜头一' },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', videoPrompt: '镜头二' },
      ],
    })
    findUniquePanelMock.mockResolvedValueOnce({ gridGenerationContext: latestContext })

    const result = await enhanceGridSplitImagesForPanel({
      panel: {
        id: 'panel-merge',
        imageUrl: 'images/grid.jpg',
        gridGenerationContext: staleContext,
        characters: null,
        location: null,
      },
      projectData: { videoRatio: '16:9', characters: [], locations: [] },
      panelGridSize: 2,
      userId: 'user-1',
      modelId: 'edit-model',
      cellIndex: 2,
    })

    const persisted = JSON.parse(updateManyPanelMock.mock.calls.at(-1)?.[0].data.gridGenerationContext)
    expect(persisted.gridSplitImages.map((image: { imageUrl: string }) => image.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
    expect(persisted.gridSplitImages.map((image: { enhancedImageUrl?: string }) => image.enhancedImageUrl)).toEqual([
      'images/enhanced-cell-1.jpg',
      'images/panel-merge-2.jpg',
    ])
    expect(persisted.gridVideoFrames.map((frame: { imageUrl: string }) => frame.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
    expect(persisted.gridVideoFrames.map((frame: { enhancedImageUrl?: string }) => frame.enhancedImageUrl)).toEqual([
      'images/enhanced-cell-1.jpg',
      'images/panel-merge-2.jpg',
    ])
    expect(result.images.map((image) => image.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
  })

  it('retries latest-context merge when another cell writes first', async () => {
    const staleContext = JSON.stringify({
      gridSplitMetadata: { panelGridSize: 2, sourceGridImageUrl: 'images/grid.jpg' },
      gridSplitImages: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', panelGridSize: 2 },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', panelGridSize: 2 },
      ],
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'images/cell-1.jpg', videoPrompt: '镜头一' },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', videoPrompt: '镜头二' },
      ],
    })
    const concurrentContext = JSON.stringify({
      gridSplitMetadata: { panelGridSize: 2, sourceGridImageUrl: 'images/grid.jpg' },
      gridSplitImages: [
        {
          cellIndex: 1,
          imageUrl: 'images/enhanced-cell-1.jpg',
          originalImageUrl: 'images/cell-1.jpg',
          panelGridSize: 2,
        },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', panelGridSize: 2 },
      ],
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'images/enhanced-cell-1.jpg', videoPrompt: '镜头一' },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', videoPrompt: '镜头二' },
      ],
    })
    findUniquePanelMock
      .mockResolvedValueOnce({ gridGenerationContext: staleContext })
      .mockResolvedValueOnce({ gridGenerationContext: concurrentContext })
    updateManyPanelMock
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })

    await enhanceGridSplitImagesForPanel({
      panel: {
        id: 'panel-retry',
        imageUrl: 'images/grid.jpg',
        gridGenerationContext: staleContext,
        characters: null,
        location: null,
      },
      projectData: { videoRatio: '16:9', characters: [], locations: [] },
      panelGridSize: 2,
      userId: 'user-1',
      modelId: 'edit-model',
      cellIndex: 2,
    })

    expect(updateManyPanelMock).toHaveBeenCalledTimes(2)
    const persisted = JSON.parse(updateManyPanelMock.mock.calls.at(-1)?.[0].data.gridGenerationContext)
    expect(persisted.gridSplitImages.map((image: { imageUrl: string }) => image.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
    expect(persisted.gridSplitImages.map((image: { enhancedImageUrl?: string }) => image.enhancedImageUrl)).toEqual([
      'images/enhanced-cell-1.jpg',
      'images/panel-retry-2.jpg',
    ])
  })

  it('skips already enhanced cells when enhancing all split images', async () => {
    const context = JSON.stringify({
      gridSplitMetadata: { panelGridSize: 2, sourceGridImageUrl: 'images/grid.jpg' },
      gridSplitImages: [
        {
          cellIndex: 1,
          imageUrl: 'images/grid-video-source-enhanced-panel-5-1.jpg',
          originalImageUrl: 'images/cell-1.jpg',
          panelGridSize: 2,
        },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', panelGridSize: 2 },
      ],
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'images/grid-video-source-enhanced-panel-5-1.jpg', videoPrompt: '镜头一' },
        { cellIndex: 2, imageUrl: 'images/cell-2.jpg', videoPrompt: '镜头二' },
      ],
    })
    const onProgress = vi.fn()

    const result = await enhanceGridSplitImagesForPanel({
      panel: {
        id: 'panel-5',
        imageUrl: 'images/grid.jpg',
        gridGenerationContext: context,
        characters: null,
        location: null,
      },
      projectData: { videoRatio: '16:9', characters: [], locations: [] },
      panelGridSize: 2,
      userId: 'user-1',
      modelId: 'edit-model',
      onProgress,
    })

    expect(generateImageMock).toHaveBeenCalledTimes(1)
    expect(normalizeReferenceImagesForGenerationMock).toHaveBeenCalledWith(
      ['/api/storage/sign?key=images%2Fcell-2.jpg&expires=3600'],
      expect.objectContaining({
        context: expect.objectContaining({ cellIndex: 2 }),
      }),
    )
    expect(result.enhancedCount).toBe(1)
    expect(result.images.map((image) => image.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
    expect(result.images.map((image) => image.enhancedImageUrl || null)).toEqual([
      'images/grid-video-source-enhanced-panel-5-1.jpg',
      'images/panel-5-2.jpg',
    ])
    expect(result.frames.map((frame) => frame.imageUrl)).toEqual([
      'images/cell-1.jpg',
      'images/cell-2.jpg',
    ])
    expect(result.frames.map((frame) => frame.enhancedImageUrl || null)).toEqual([
      'images/grid-video-source-enhanced-panel-5-1.jpg',
      'images/panel-5-2.jpg',
    ])
    expect(onProgress).toHaveBeenCalledWith({ completed: 1, total: 1, cellIndex: 2 })
  })
})
