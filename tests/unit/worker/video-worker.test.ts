import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type WorkerProcessor = (job: Job<TaskJobData>) => Promise<unknown>

type PanelRow = {
  id: string
  videoUrl: string | null
  imageUrl: string | null
  imageLayout?: string | null
  gridGenerationContext?: string | null
  gridVideoPromptAt?: Date | null
  videoPrompt: string | null
  description: string | null
  firstLastFramePrompt: string | null
  duration: number | null
  directorLayout?: string | null
}

const workerState = vi.hoisted(() => ({
  processor: null as WorkerProcessor | null,
}))

const reportTaskProgressMock = vi.hoisted(() => vi.fn(async () => undefined))
const withTaskLifecycleMock = vi.hoisted(() =>
  vi.fn(async (job: Job<TaskJobData>, handler: WorkerProcessor) => await handler(job)),
)

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ videoRatio: '16:9' })),
  resolveLipSyncVideoSource: vi.fn(async () => 'https://provider.example/lipsync.mp4'),
  resolveVideoSourceFromGeneration: vi.fn<(...args: unknown[]) => Promise<{ url: string; actualVideoTokens?: number; downloadHeaders?: Record<string, string> }>>(async () => ({ url: 'https://provider.example/video.mp4' })),
  toSignedUrlIfCos: vi.fn((url: string | null) => (url ? `https://signed.example/${url}` : null)),
  uploadImageSourceToCos: vi.fn(async (_source: string, _prefix: string, targetId: string) => `images/${targetId}.png`),
  uploadVideoSourceToCos: vi.fn(async () => 'cos/lip-sync/video.mp4'),
}))
const configServiceMock = vi.hoisted(() => ({
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({
    analysis: 5,
    image: 5,
    video: 5,
  })),
}))
const modelConfigMock = vi.hoisted(() => ({
  parseModelKeyStrict: vi.fn(() => ({ provider: 'fal' })),
}))
const outboundImageMock = vi.hoisted(() => ({
  normalizeToBase64ForGeneration: vi.fn(async (input: string) => input),
  normalizeToOriginalMediaUrl: vi.fn(async (input: string) => input),
}))
const gridSplitMock = vi.hoisted(() => ({
  ensureGridSplitImagesForPanel: vi.fn<() => Promise<{
    images: Array<{ cellIndex: number; panelGridSize: number; imageUrl: string }>
    gridGenerationContext: string | null
  }>>(async () => ({
    images: [],
    gridGenerationContext: null,
  })),
}))
const concurrencyGateMock = vi.hoisted(() => ({
  withUserConcurrencyGate: vi.fn(async <T>(input: {
    run: () => Promise<T>
  }) => await input.run()),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  novelPromotionVoiceLine: {
    findUnique: vi.fn(),
  },
}))

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string) {
      void name
    }

    async add() {
      return { id: 'job-1' }
    }

    async getJob() {
      return null
    }
  },
  Worker: class {
    constructor(name: string, processor: WorkerProcessor) {
      void name
      workerState.processor = processor
    }
  },
}))

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
  withTaskLifecycle: withTaskLifecycleMock,
}))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: outboundImageMock.normalizeToBase64ForGeneration,
  normalizeToOriginalMediaUrl: outboundImageMock.normalizeToOriginalMediaUrl,
}))
vi.mock('@/lib/model-capabilities/lookup', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({ video: { firstlastframe: true } })),
}))
vi.mock('@/lib/model-config-contract', () => modelConfigMock)
vi.mock('@/lib/api-config', () => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'api-key' })),
}))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/workers/user-concurrency-gate', () => concurrencyGateMock)
vi.mock('@/lib/storyboard-images/grid-split-service', () => gridSplitMock)

function buildPanel(overrides?: Partial<PanelRow>): PanelRow {
  return {
    id: 'panel-1',
    videoUrl: 'cos/base-video.mp4',
    imageUrl: 'cos/panel-image.png',
    videoPrompt: 'panel prompt',
    description: 'panel description',
    firstLastFramePrompt: null,
    duration: 5,
    directorLayout: null,
    ...(overrides || {}),
  }
}

function buildJob(params: {
  type: TaskJobData['type']
  payload?: Record<string, unknown>
  targetType?: string
  targetId?: string
}): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type: params.type,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: params.targetType ?? 'NovelPromotionPanel',
      targetId: params.targetId ?? 'panel-1',
      payload: params.payload ?? {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker video processor behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    workerState.processor = null
    modelConfigMock.parseModelKeyStrict.mockReturnValue({ provider: 'fal' })
    outboundImageMock.normalizeToBase64ForGeneration.mockImplementation(async (input: string) => input)
    outboundImageMock.normalizeToOriginalMediaUrl.mockImplementation(async (input: string) => input)
    gridSplitMock.ensureGridSplitImagesForPanel.mockResolvedValue({
      images: [],
      gridGenerationContext: null,
    })

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue(buildPanel())
    prismaMock.novelPromotionPanel.findFirst.mockResolvedValue(buildPanel())
    prismaMock.novelPromotionVoiceLine.findUnique.mockResolvedValue({
      id: 'line-1',
      audioUrl: 'cos/line-1.mp3',
      audioDuration: 1200,
    })

    const mod = await import('@/lib/workers/video.worker')
    mod.createVideoWorker()
  })

  it('VIDEO_PANEL: 缺少 payload.videoModel 时显式失败', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {},
    })

    await expect(processor!(job)).rejects.toThrow('VIDEO_MODEL_REQUIRED: payload.videoModel is required')
  })

  it('VIDEO_PANEL: 透传异步轮询返回的下载头到 COS 上传', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    utilsMock.resolveVideoSourceFromGeneration.mockResolvedValueOnce({
      url: 'https://provider.example/video.mp4',
      downloadHeaders: {
        Authorization: 'Bearer oa-key',
      },
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'openai-compatible:oa-1::sora-2',
        generationOptions: {
          duration: 8,
          resolution: '720p',
        },
      },
    })

    await processor!(job)

    expect(utilsMock.uploadVideoSourceToCos).toHaveBeenCalledWith(
      'https://provider.example/video.mp4',
      'panel-video',
      'panel-1',
      {
        Authorization: 'Bearer oa-key',
      },
    )
  })

  it('VIDEO_PANEL: 将 Ark 返回的实际视频 token 用量透传到任务结果', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    utilsMock.resolveVideoSourceFromGeneration.mockResolvedValueOnce({
      url: 'https://provider.example/video.mp4',
      actualVideoTokens: 108000,
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'ark::doubao-seedance-2-0-260128',
        generationOptions: {
          duration: 5,
          resolution: '720p',
        },
      },
    })

    const result = await processor!(job) as { panelId: string; videoUrl: string; actualVideoTokens: number }
    expect(result).toEqual({
      panelId: 'panel-1',
      videoUrl: 'cos/lip-sync/video.mp4',
      actualVideoTokens: 108000,
    })
  })

  it('VIDEO_PANEL: 使用导演台分镜板里的每张渲染分镜图生成视频并标记生成方式', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({
      directorLayout: JSON.stringify({
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
          id: 'cam-1',
          name: '主机位',
          fov: 50,
          position: [0, 1.55, 5.4],
          target: [0, 1.05, 0],
          visible: true,
        }],
        activeCameraId: 'cam-1',
        directorStoryboardAssets: [
          {
            id: 'asset-1',
            type: 'rendered_snapshot',
            name: '分镜 1',
            createdAt: 1710000000001,
            imageUrl: 'cos/director-render-1.png',
            layout: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          },
          {
            id: 'asset-2',
            type: 'rendered_snapshot',
            name: '分镜 2',
            createdAt: 1710000000002,
            imageUrl: 'cos/director-render-2.png',
            layout: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          },
        ],
        directorStoryboardBoards: [{
          id: 'director-board-1',
          name: '导演台分镜板 1',
          createdAt: 1710000000000,
          coverImageUrl: 'cos/director-board-cover.png',
          assetIds: ['asset-1', 'asset-2'],
          items: [
            { assetId: 'asset-1', x: 0, y: 0, width: 1, height: 1, rotation: 0 },
            { assetId: 'asset-2', x: 1, y: 0, width: 1, height: 1, rotation: 0 },
          ],
        }],
      }),
    }))

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'openai-compatible:oa-1::sora-2',
        gridVideoSource: 'director_storyboard',
        directorStoryboardBoardId: 'director-board-1',
      },
    })

    await processor!(job)

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        imageUrl: 'https://signed.example/cos/director-render-1.png',
        options: expect.objectContaining({
          generationMode: 'normal',
          videoReferenceImages: [
            'https://signed.example/cos/director-render-1.png',
            'https://signed.example/cos/director-render-2.png',
          ],
        }),
      }),
    )
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        videoGenerationMode: 'director_storyboard',
      }),
    }))
  })

  it('VIDEO_PANEL: 拆分格视频使用每一张拆分单图作为视频输入', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const gridContext = JSON.stringify({
      gridMetadata: { panelGridSize: 3 },
      gridVideoFrames: [
        { cellIndex: 1, imageUrl: 'cos/split-1.png', videoPrompt: '格 1' },
        { cellIndex: 2, imageUrl: 'cos/split-2.png', videoPrompt: '格 2' },
        { cellIndex: 3, imageUrl: 'cos/split-3.png', videoPrompt: '格 3' },
      ],
    })
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({
      imageLayout: 'grid',
      gridGenerationContext: gridContext,
    }))
    gridSplitMock.ensureGridSplitImagesForPanel.mockResolvedValueOnce({
      images: [
        { cellIndex: 1, panelGridSize: 3, imageUrl: 'cos/split-1.png' },
        { cellIndex: 2, panelGridSize: 3, imageUrl: 'cos/split-2.png' },
        { cellIndex: 3, panelGridSize: 3, imageUrl: 'cos/split-3.png' },
      ],
      gridGenerationContext: gridContext,
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'starrouter::dreamina-seedance-2-0-fast-260128',
        imageLayout: 'grid',
        gridVideoSource: 'split',
      },
    })

    await processor!(job)

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        imageUrl: 'https://signed.example/cos/split-1.png',
        options: expect.objectContaining({
          videoReferenceImages: [
            'https://signed.example/cos/split-1.png',
            'https://signed.example/cos/split-2.png',
            'https://signed.example/cos/split-3.png',
          ],
        }),
      }),
    )
  })

  it('VIDEO_PANEL: 显式选择超过 9 张参考图时按用户顺序截断到 9 张', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const gridFrames = Array.from({ length: 9 }, (_, index) => ({
      cellIndex: index + 1,
      imageUrl: `cos/split-${index + 1}.png`,
      videoPrompt: `格 ${index + 1}`,
    }))
    const gridContext = JSON.stringify({
      gridMetadata: { panelGridSize: 9 },
      gridVideoFrames: gridFrames,
    })
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({
      imageLayout: 'grid',
      gridGenerationContext: gridContext,
    }))
    gridSplitMock.ensureGridSplitImagesForPanel.mockResolvedValueOnce({
      images: gridFrames.map((frame) => ({
        cellIndex: frame.cellIndex,
        panelGridSize: 9,
        imageUrl: frame.imageUrl,
      })),
      gridGenerationContext: gridContext,
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'starrouter::dreamina-seedance-2-0-fast-260128',
        imageLayout: 'grid',
        gridVideoSource: 'split',
        videoReferenceImages: [
          ...gridFrames.map((frame) => frame.imageUrl),
          'cos/character-1.png',
          'cos/character-2.png',
          'cos/location-1.png',
        ],
      },
    })

    await processor!(job)

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          videoReferenceImages: gridFrames.map((frame) => `https://signed.example/${frame.imageUrl}`),
        }),
      }),
    )
  })

  it('VIDEO_PANEL: 新前端已传用户选择参考图时不再隐式追加拆分格参考图', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const gridFrames = Array.from({ length: 9 }, (_, index) => ({
      cellIndex: index + 1,
      imageUrl: `cos/split-${index + 1}.png`,
      videoPrompt: `格 ${index + 1}`,
    }))
    const gridContext = JSON.stringify({
      gridMetadata: { panelGridSize: 9 },
      gridVideoFrames: gridFrames,
    })
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({
      imageLayout: 'grid',
      gridGenerationContext: gridContext,
    }))
    gridSplitMock.ensureGridSplitImagesForPanel.mockResolvedValueOnce({
      images: gridFrames.map((frame) => ({
        cellIndex: frame.cellIndex,
        panelGridSize: 9,
        imageUrl: frame.imageUrl,
      })),
      gridGenerationContext: gridContext,
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'starrouter::dreamina-seedance-2-0-fast-260128',
        imageLayout: 'grid',
        gridVideoSource: 'split',
        videoReferenceImages: ['cos/character-1.png'],
      },
    })

    await processor!(job)

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          videoReferenceImages: ['https://signed.example/cos/character-1.png'],
        }),
      }),
    )
  })

  it('VIDEO_PANEL: StarRouter 视频使用可公网拉取的签名 URL', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()
    modelConfigMock.parseModelKeyStrict.mockReturnValue({ provider: 'starrouter' })
    outboundImageMock.normalizeToBase64ForGeneration.mockImplementation(async (input: string) => `data:image/png;base64,${Buffer.from(input).toString('base64')}`)

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'starrouter::dreamina-seedance-2-0-fast-260128',
        videoReferenceImages: ['cos/source.png', 'cos/character.png'],
      },
    })

    await processor!(job)

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        imageUrl: 'https://signed.example/cos/panel-image.png',
        options: expect.objectContaining({
          videoReferenceImages: [
            'https://signed.example/cos/source.png',
            'https://signed.example/cos/character.png',
          ],
        }),
      }),
    )
    expect(outboundImageMock.normalizeToBase64ForGeneration).not.toHaveBeenCalled()
  })

  it('VIDEO_PANEL: StarRouter 视频会先上传 base64 参考图再传公网 URL', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()
    modelConfigMock.parseModelKeyStrict.mockReturnValue({ provider: 'starrouter' })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'starrouter::dreamina-seedance-2-0-fast-260128',
        videoReferenceImages: ['data:image/png;base64,AAAA'],
      },
    })

    await processor!(job)

    expect(utilsMock.uploadImageSourceToCos).toHaveBeenCalledWith(
      'data:image/png;base64,AAAA',
      'video-source-image',
      'panel-1-ref-0',
    )
    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          videoReferenceImages: [
            'https://signed.example/images/panel-1-ref-0.png',
          ],
        }),
      }),
    )
  })

  it('LIP_SYNC: 缺少 panel 时显式失败', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(null)
    const job = buildJob({
      type: TASK_TYPE.LIP_SYNC,
      payload: { voiceLineId: 'line-1' },
      targetId: 'panel-missing',
    })

    await expect(processor!(job)).rejects.toThrow('Lip-sync panel not found')
  })

  it('LIP_SYNC: 正常路径写回 lipSyncVideoUrl 并清理 lipSyncTaskId', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.LIP_SYNC,
      payload: {
        voiceLineId: 'line-1',
        lipSyncModel: 'fal::lipsync-model',
      },
      targetId: 'panel-1',
    })

    const result = await processor!(job) as { panelId: string; voiceLineId: string; lipSyncVideoUrl: string }
    expect(result).toEqual({
      panelId: 'panel-1',
      voiceLineId: 'line-1',
      lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
    })

    expect(utilsMock.resolveLipSyncVideoSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        modelKey: 'fal::lipsync-model',
        audioDurationMs: 1200,
        videoDurationMs: 5000,
      }),
    )

    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
        lipSyncTaskId: null,
      },
    })
  })

  it('未知任务类型: 显式报错', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const unsupportedJob = buildJob({
      type: TASK_TYPE.AI_CREATE_CHARACTER,
    })

    await expect(processor!(unsupportedJob)).rejects.toThrow('Unsupported video task type')
  })
})
