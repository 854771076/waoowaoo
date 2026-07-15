import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findUnique: vi.fn(),
    findMany: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
    update: vi.fn<(_args?: unknown) => Promise<Record<string, never>>>(async () => ({})),
  },
}))

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({
    storyboardModel: 'storyboard-model-1',
    artStyle: 'realistic',
    artStylePrompt: null as string | null,
  })),
  resolveImageSourceFromGeneration: vi.fn(),
  uploadImageSourceToCos: vi.fn(),
}))

const sharedMock = vi.hoisted(() => ({
  collectPanelReferenceImages: vi.fn(async () => ['https://signed.example/ref-1.png']),
  resolveNovelData: vi.fn(async () => ({
    videoRatio: '16:9',
    characters: [],
    locations: [
      {
        name: 'Old Town',
        images: [
          {
            isSelected: true,
            description: '雨夜街道',
            availableSlots: JSON.stringify([
              '街道左侧靠墙的留白位置',
            ]),
          },
        ],
      },
    ],
  })),
}))

const outboundMock = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async () => ['normalized-ref-1']),
}))

const promptMock = vi.hoisted(() => ({
  buildPrompt: vi.fn(() => 'panel-image-prompt'),
  buildPromptAsync: vi.fn<(_args?: unknown) => Promise<string>>(async () => 'panel-image-prompt'),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/logging/core', () => ({
  logInfo: vi.fn(),
  createScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
    child: vi.fn(),
  })),
}))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    collectPanelReferenceImages: sharedMock.collectPanelReferenceImages,
    resolveNovelData: sharedMock.resolveNovelData,
  }
})
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: {
    NP_SINGLE_PANEL_IMAGE: 'np_single_panel_image',
    NP_DIRECTOR_SNAPSHOT_RENDER: 'np_director_snapshot_render',
    NP_PANEL_GRID_IMAGE: 'np_panel_grid_image',
  },
  buildPrompt: promptMock.buildPrompt,
  buildPromptAsync: promptMock.buildPromptAsync,
}))

import { handlePanelImageTask } from '@/lib/workers/handlers/panel-image-task-handler'

function buildJob(payload: Record<string, unknown>, targetId = 'panel-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-panel-image-1',
      type: TASK_TYPE.IMAGE_PANEL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionPanel',
      targetId,
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker panel-image-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: 'panel anchor prompt',
      videoPrompt: 'dramatic',
      location: 'Old Town',
      characters: JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }]),
      srtSegment: '台词片段',
      photographyRules: null,
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: null,
    })

    utilsMock.resolveImageSourceFromGeneration
      .mockResolvedValueOnce('generated-source-1')
      .mockResolvedValueOnce('generated-source-2')

    utilsMock.uploadImageSourceToCos
      .mockResolvedValueOnce('cos/panel-candidate-1.png')
      .mockResolvedValueOnce('cos/panel-candidate-2.png')
  })

  it('missing panelId -> explicit error', async () => {
    const job = buildJob({}, '')
    await expect(handlePanelImageTask(job)).rejects.toThrow('panelId missing')
  })

  it('first generation -> persists main image and candidate list', async () => {
    const job = buildJob({ candidateCount: 2 })
    const result = await handlePanelImageTask(job)

    expect(result).toEqual({
      panelId: 'panel-1',
      candidateCount: 2,
      imageUrl: 'cos/panel-candidate-1.png',
    })

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'storyboard-model-1',
        prompt: 'panel-image-prompt',
        allowTaskExternalIdResume: false,
        options: expect.objectContaining({
          referenceImages: ['normalized-ref-1'],
          aspectRatio: '16:9',
        }),
      }),
    )
    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      variables: expect.objectContaining({
        storyboard_text_json_input: expect.stringContaining('"slot": "街道左侧靠墙的留白位置"'),
      }),
    }))
    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      variables: expect.objectContaining({
        storyboard_text_json_input: expect.stringContaining('"available_slots"'),
      }),
    }))

    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        imageUrl: 'cos/panel-candidate-1.png',
        candidateImages: JSON.stringify(['cos/panel-candidate-1.png', 'cos/panel-candidate-2.png']),
        imageLayout: 'single',
      },
    })
  })

  it('uses resolved artStylePrompt when building panel image prompt', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({
      storyboardModel: 'storyboard-model-1',
      artStyle: 'realistic',
      artStylePrompt: 'custom noir storyboard style',
    })

    await handlePanelImageTask(buildJob({ candidateCount: 1 }))

    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      variables: expect.objectContaining({
        style: 'custom noir storyboard style',
      }),
    }))
  })

  it('regeneration branch -> keeps old image in previousImageUrl and stores candidates only', async () => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: null,
      videoPrompt: 'dramatic',
      location: 'Old Town',
      characters: '[]',
      srtSegment: null,
      photographyRules: null,
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: 'cos/panel-old.png',
    })

    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('generated-source-regen')
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/panel-regenerated.png')

    const job = buildJob({ candidateCount: 1 })
    const result = await handlePanelImageTask(job)

    expect(result).toEqual({
      panelId: 'panel-1',
      candidateCount: 1,
      imageUrl: null,
    })

    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: expect.objectContaining({
        previousImageUrl: 'cos/panel-old.png',
        candidateImages: JSON.stringify(['cos/panel-regenerated.png']),
        imageLayout: 'single',
      }),
    })
  })

  it('panelGridSize=1 -> uses single panel prompt (regression)', async () => {
    await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 1 }))
    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptId: 'np_single_panel_image' }),
    )
  })

  it('uses director snapshot prompt and reference image when rendering a snapshot', async () => {
    const snapshot = {
      id: 'snap-1',
      name: '快照一',
      capturedAt: Date.now(),
      cameraId: 'cam-snap',
      camera: {
        fov: 38,
        position: [1, 2, 3],
        target: [0, 1, 0],
      },
      imageDataUrl: 'data:image/jpeg;base64,snapshot',
      note: '低角度构图',
      project: {
        version: 1,
        scene: {
          backgroundColor: '#111111',
          showGround: true,
          groundOpacity: 0.5,
          showLabels: true,
          showGrid: true,
          backdropAssetId: null,
          backdropOpacity: 0.6,
          backdropYaw: 0,
        },
        objects: [
          {
            id: 'char-1',
            kind: 'character',
            name: 'Hero',
            refId: null,
            visible: true,
            locked: false,
            color: '#ffffff',
            mode: 'mannequin',
            transform: { position: [2, 0, -1], rotation: [0, 0, 0], scale: [1, 1, 1] },
            posePresetId: 'stand',
          },
        ],
        cameras: [{
          id: 'cam-snap',
          name: '快照机位',
          fov: 38,
          position: [1, 2, 3],
          target: [0, 1, 0],
          visible: true,
        }],
        activeCameraId: 'cam-snap',
      },
    }

    await handlePanelImageTask(buildJob({
      candidateCount: 1,
      panelGridSize: 1,
      source: 'director_snapshot',
      directorSnapshot: snapshot,
    }))

    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: 'np_director_snapshot_render',
        variables: expect.objectContaining({
          storyboard_text_json_input: expect.stringContaining('"director_snapshot"'),
        }),
      }),
    )
    expect(sharedMock.collectPanelReferenceImages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        directorShotUrls: expect.arrayContaining(['data:image/jpeg;base64,snapshot']),
      }),
    )
  })

  it('persists rendered director snapshot as a director storyboard asset without replacing panel image', async () => {
    const directorLayout = {
      version: 1,
      scene: {
        backgroundColor: '#111111',
        showGround: true,
        groundOpacity: 0.5,
        showLabels: true,
        showGrid: true,
        backdropAssetId: null,
        backdropOpacity: 0.6,
        backdropYaw: 0,
      },
      objects: [],
      cameras: [{
        id: 'cam-snap',
        name: '快照机位',
        fov: 38,
        position: [1, 2, 3],
        target: [0, 1, 0],
        visible: true,
      }],
      activeCameraId: 'cam-snap',
    }
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: null,
      videoPrompt: 'dramatic',
      location: 'Old Town',
      characters: '[]',
      srtSegment: null,
      photographyRules: null,
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: 'cos/panel-original.png',
      directorLayout: JSON.stringify(directorLayout),
      directorShots: [],
    })

    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('generated-director-source')
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/director-storyboard.png')

    const snapshot = {
      id: 'snap-asset-1',
      name: '导演分镜 1',
      capturedAt: 1710000000000,
      cameraId: 'cam-snap',
      camera: { fov: 38, position: [1, 2, 3], target: [0, 1, 0] },
      imageDataUrl: 'data:image/jpeg;base64,snapshot',
      note: '低角度构图',
      project: directorLayout,
    }

    await handlePanelImageTask(buildJob({
      candidateCount: 1,
      panelGridSize: 1,
      source: 'director_snapshot',
      directorSnapshot: snapshot,
    }))

    const updateArg = prismaMock.novelPromotionPanel.update.mock.calls[0]?.[0] as {
      where?: { id?: string }
      data?: { directorLayout?: string; previousImageUrl?: string; candidateImages?: string }
    }
    expect(updateArg.where).toEqual({ id: 'panel-1' })
    expect(updateArg.data?.previousImageUrl).toBeUndefined()
    expect(updateArg.data?.candidateImages).toBeUndefined()
    expect(updateArg.data?.directorLayout).toBeTruthy()

    const nextLayout = JSON.parse(updateArg.data?.directorLayout || '{}') as {
      directorStoryboardAssets?: Array<{ imageUrl?: string; sourceSnapshotId?: string; type?: string }>
    }
    expect(nextLayout.directorStoryboardAssets).toEqual([
      expect.objectContaining({
        type: 'rendered_snapshot',
        imageUrl: 'cos/director-storyboard.png',
        sourceSnapshotId: 'snap-asset-1',
      }),
    ])
  })

  it('panelGridSize=6 -> switches to grid prompt with grid_layout + panel_grid_size', async () => {
    await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 6 }))
    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: 'np_panel_grid_image',
        variables: expect.objectContaining({
          grid_layout: '3 列 x 2 行',
          panel_grid_size: '6',
          aspect_ratio: '16:9',
        }),
      }),
    )
  })

  it('panelGridSize clamped to [1,16]', async () => {
    await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 99 }))
    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: 'np_panel_grid_image',
        variables: expect.objectContaining({ panel_grid_size: '16' }),
      }),
    )

    promptMock.buildPromptAsync.mockClear()
    await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 0 }))
    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptId: 'np_single_panel_image' }),
    )
  })

  it('panelGridSize=6 with candidateCount=2 -> still produces 2 candidates', async () => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.resolveImageSourceFromGeneration
      .mockResolvedValueOnce('src-grid-1')
      .mockResolvedValueOnce('src-grid-2')
    utilsMock.uploadImageSourceToCos
      .mockResolvedValueOnce('cos/grid-1.png')
      .mockResolvedValueOnce('cos/grid-2.png')

    const result = await handlePanelImageTask(buildJob({ candidateCount: 2, panelGridSize: 6 }))
    expect(result.candidateCount).toBe(2)
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'panel-1' },
        data: expect.objectContaining({
          imageUrl: 'cos/grid-1.png',
          candidateImages: JSON.stringify(['cos/grid-1.png', 'cos/grid-2.png']),
          imageLayout: 'grid',
          gridVideoPromptAt: null,
          gridGenerationContext: expect.stringContaining('"panelGridSize": 6'),
        }),
      }),
    )
  })

  it('stores compact gridGenerationContext without the full nested grid image prompt', async () => {
    const largePrompt = `grid prompt ${'x'.repeat(90_000)} data:image/jpeg;base64,${'a'.repeat(20_000)}`
    promptMock.buildPromptAsync.mockImplementation(async (args: unknown) => {
      const input = args as { promptId?: string }
      return input.promptId === 'np_panel_grid_image' ? largePrompt : 'panel-image-prompt'
    })

    await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 4 }))

    const updateArg = prismaMock.novelPromotionPanel.update.mock.calls[0]?.[0] as unknown as {
      data?: { gridGenerationContext?: string }
    }
    const gridGenerationContext = updateArg.data?.gridGenerationContext || ''
    expect(gridGenerationContext.length).toBeLessThan(20_000)
    expect(gridGenerationContext).not.toContain(largePrompt)
    expect(gridGenerationContext).not.toContain('data:image/jpeg;base64')
    expect(gridGenerationContext).toContain('"panelGridSize": 4')
    expect(gridGenerationContext).toContain('"aggregateVideoPrompt"')
  })

  it('sets imageLayout to grid when panelGridSize > 1', async () => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('src-grid')
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/grid.png')

    await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 4 }))
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageLayout: 'grid',
        }),
      }),
    )
  })

  it('sets imageLayout to single when panelGridSize = 1', async () => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('src-single')
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/single.png')

    await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 1 }))
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageLayout: 'single',
        }),
      }),
    )
  })

  it('injects same-scene neighbor panels into prompt context', async () => {
    prismaMock.novelPromotionPanel.findMany.mockResolvedValueOnce([
      { panelIndex: 1, shotType: 'medium', cameraMove: 'pan', description: 'next shot', location: 'Old Town' },
    ])

    await handlePanelImageTask(buildJob({ candidateCount: 1 }))

    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          storyboard_text_json_input: expect.stringContaining('"neighbor_panels"'),
        }),
      }),
    )
    const call = promptMock.buildPromptAsync.mock.calls.find((args) => {
      const first = (args as unknown as Array<{ variables?: { storyboard_text_json_input?: unknown } }>)[0]
      const text = first?.variables?.storyboard_text_json_input
      return typeof text === 'string' && text.includes('neighbor_panels')
    }) as unknown as Array<{ variables: { storyboard_text_json_input: string } }> | undefined
    expect(call?.[0].variables.storyboard_text_json_input).toContain('"position": "next"')
  })

  it('filters out cross-scene neighbor panels', async () => {
    prismaMock.novelPromotionPanel.findMany.mockResolvedValueOnce([
      { panelIndex: 1, shotType: 'wide', cameraMove: 'static', description: 'different place', location: 'Forest' },
    ])

    await handlePanelImageTask(buildJob({ candidateCount: 1 }))

    const call = promptMock.buildPromptAsync.mock.calls.find((args) => {
      const first = (args as unknown as Array<{ variables?: { storyboard_text_json_input?: unknown } }>)[0]
      return typeof first?.variables?.storyboard_text_json_input === 'string'
    }) as unknown as Array<{ variables: { storyboard_text_json_input: string } }> | undefined
    // 跨场景邻镜应被过滤，neighbor_panels 不出现
    expect(call?.[0].variables.storyboard_text_json_input).not.toContain('neighbor_panels')
  })
})
