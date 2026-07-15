import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROP_IMAGE_RATIO, getArtStylePrompt } from '@/lib/constants'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({
    locationModel: 'location-model-1',
    artStyle: 'japanese-anime',
    artStylePrompt: null as string | null,
  })),
  toSignedUrlIfCos: vi.fn((value: string | null | undefined) =>
    value?.startsWith('images/') ? `/api/storage/sign?key=${encodeURIComponent(value)}&expires=3600` : value || null,
  ),
}))

const outboundMock = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async (inputs: string[]) =>
    inputs.map((input) => `normalized:${input}`),
  ),
}))

const prismaMock = vi.hoisted(() => ({
  locationImage: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  novelPromotionLocation: {
    findUnique: vi.fn(),
    findMany: vi.fn(async () => []),
    update: vi.fn(async () => ({})),
  },
}))

const sharedMock = vi.hoisted(() => ({
  generateProjectLabeledImageToStorage: vi.fn(async () => 'cos/location-generated-1.png'),
}))

vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    generateProjectLabeledImageToStorage: sharedMock.generateProjectLabeledImageToStorage,
  }
})

import { handleLocationImageTask } from '@/lib/workers/handlers/location-image-task-handler'

function buildJob(payload: Record<string, unknown>, targetId = 'location-image-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-location-image-1',
      type: TASK_TYPE.IMAGE_LOCATION,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'LocationImage',
      targetId,
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker location-image-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.locationImage.findUnique.mockResolvedValue({
      id: 'location-image-1',
      locationId: 'location-1',
      imageIndex: 0,
      description: '雨夜街道',
      availableSlots: JSON.stringify([
        '街道左侧靠墙的留白位置',
      ]),
      location: { name: 'Old Town' },
    })

    prismaMock.novelPromotionLocation.findUnique.mockResolvedValue({
      id: 'location-1',
      name: 'Old Town',
      images: [
        {
          id: 'location-image-1',
          locationId: 'location-1',
          imageIndex: 0,
          description: '雨夜街道',
          availableSlots: JSON.stringify([
            '街道左侧靠墙的留白位置',
          ]),
        },
      ],
    })
  })

  it('locationModel missing -> explicit error', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({ locationModel: '', artStyle: 'japanese-anime', artStylePrompt: null })
    await expect(handleLocationImageTask(buildJob({}))).rejects.toThrow('Location model not configured')
  })

  it('success path -> generates and persists concrete location image url', async () => {
    const result = await handleLocationImageTask(buildJob({ imageIndex: 0 }))
    const animeStylePrompt = getArtStylePrompt('japanese-anime', 'zh')

    expect(result).toEqual({
      updated: 1,
      locationIds: ['location-1'],
    })

    expect(sharedMock.generateProjectLabeledImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('雨夜街道'),
        label: 'Old Town',
        targetId: 'location-image-1',
        options: expect.objectContaining({ aspectRatio: '16:9' }),
      }),
    )
    expect(sharedMock.generateProjectLabeledImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('可站位置：'),
      }),
    )
    expect(sharedMock.generateProjectLabeledImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('街道左侧靠墙的留白位置'),
      }),
    )
    expect(sharedMock.generateProjectLabeledImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('必须使用宽广完整的场景全景构图'),
      }),
    )
    const generationCall = sharedMock.generateProjectLabeledImageToStorage.mock.calls[0] as unknown as [{ prompt: string }] | undefined
    expect(generationCall).toBeTruthy()
    if (!generationCall) throw new Error('expected generateProjectLabeledImageToStorage call')
    const generationInput = generationCall[0]
    expect(generationInput.prompt.split(animeStylePrompt).length - 1).toBe(1)

    expect(prismaMock.locationImage.update).toHaveBeenCalledWith({
      where: { id: 'location-image-1' },
      data: { imageUrl: 'cos/location-generated-1.png', isSelected: true },
    })
    expect(prismaMock.novelPromotionLocation.update).toHaveBeenCalledWith({
      where: { id: 'location-1' },
      data: { selectedImageId: 'location-image-1' },
    })
  })

  it('payload artStyle overrides project artStyle in prompt', async () => {
    await handleLocationImageTask(buildJob({ imageIndex: 0, artStyle: 'realistic' }))

    expect(sharedMock.generateProjectLabeledImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(getArtStylePrompt('realistic', 'zh')),
      }),
    )
  })

  it('uses resolved artStylePrompt when payload artStyle is not provided', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({
      locationModel: 'location-model-1',
      artStyle: 'japanese-anime',
      artStylePrompt: 'custom location gouache style',
    })

    await handleLocationImageTask(buildJob({ imageIndex: 0 }))

    const generationCall = sharedMock.generateProjectLabeledImageToStorage.mock.calls[0] as unknown as [{ prompt: string }] | undefined
    expect(generationCall).toBeTruthy()
    if (!generationCall) throw new Error('expected generateProjectLabeledImageToStorage call')
    expect(generationCall[0].prompt).toContain('custom location gouache style')
    expect(generationCall[0].prompt).not.toContain(getArtStylePrompt('japanese-anime', 'zh'))
  })

  it('uses parent macro selected image as reference when generating micro scene image', async () => {
    prismaMock.locationImage.findUnique.mockResolvedValueOnce({
      id: 'micro-image-1',
      locationId: 'micro-location-1',
      imageIndex: 0,
      description: '「大殿入口」汉白玉台阶连接广场与殿门',
      availableSlots: JSON.stringify(['大殿门前台阶下方的留白位置']),
      location: { name: '大殿入口' },
    })
    prismaMock.novelPromotionLocation.findMany.mockResolvedValueOnce([
      {
        id: 'micro-location-1',
        name: '大殿入口',
        sceneType: 'micro',
        parentId: 'macro-location-1',
        images: [],
        selectedImage: null,
        parent: {
          id: 'macro-location-1',
          name: '紫霄宫',
          sceneType: 'macro',
          parentId: null,
          selectedImage: { imageUrl: 'images/zixiao-palace-selected.png' },
          images: [
            { id: 'macro-image-1', locationId: 'macro-location-1', imageIndex: 0, imageUrl: 'images/zixiao-palace-fallback.png' },
          ],
        },
      },
    ] as never)

    await handleLocationImageTask(buildJob({ imageIndex: 0 }, 'micro-image-1'))

    expect(sharedMock.generateProjectLabeledImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        label: '大殿入口',
        prompt: expect.stringContaining('父级大场景参考图：紫霄宫'),
        options: expect.objectContaining({
          aspectRatio: '16:9',
          referenceImages: ['normalized:/api/storage/sign?key=images%2Fzixiao-palace-selected.png&expires=3600'],
        }),
      }),
    )
    expect(outboundMock.normalizeReferenceImagesForGeneration).toHaveBeenCalledWith(
      ['/api/storage/sign?key=images%2Fzixiao-palace-selected.png&expires=3600'],
      expect.objectContaining({
        context: expect.objectContaining({
          source: 'location_parent_reference',
          locationId: 'micro-location-1',
          parentId: 'macro-location-1',
        }),
      }),
    )
    expect(prismaMock.novelPromotionLocation.update).toHaveBeenCalledWith({
      where: { id: 'micro-location-1' },
      data: { selectedImageId: 'micro-image-1' },
    })
  })

  it('waits for parent macro image when micro scene starts before parent generation finishes', async () => {
    prismaMock.locationImage.findUnique.mockResolvedValueOnce({
      id: 'micro-image-1',
      locationId: 'micro-location-1',
      imageIndex: 0,
      description: '「大殿入口」汉白玉台阶连接广场与殿门',
      availableSlots: JSON.stringify(['大殿门前台阶下方的留白位置']),
      location: { name: '大殿入口' },
    })
    prismaMock.novelPromotionLocation.findMany.mockResolvedValueOnce([
      {
        id: 'micro-location-1',
        name: '大殿入口',
        sceneType: 'micro',
        parentId: 'macro-location-1',
        images: [],
        selectedImage: null,
        parent: {
          id: 'macro-location-1',
          name: '紫霄宫',
          sceneType: 'macro',
          parentId: null,
          selectedImage: null,
          images: [],
        },
      },
    ] as never)
    prismaMock.novelPromotionLocation.findUnique.mockResolvedValueOnce({
      id: 'macro-location-1',
      name: '紫霄宫',
      sceneType: 'macro',
      parentId: null,
      selectedImage: null,
      images: [
        {
          id: 'macro-image-1',
          locationId: 'macro-location-1',
          imageIndex: 0,
          imageUrl: 'images/zixiao-palace-ready.png',
          isSelected: true,
        },
      ],
    } as never)

    await handleLocationImageTask(buildJob({ imageIndex: 0 }, 'micro-image-1'))

    expect(prismaMock.novelPromotionLocation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'macro-location-1' },
      }),
    )
    expect(sharedMock.generateProjectLabeledImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        label: '大殿入口',
        options: expect.objectContaining({
          referenceImages: ['normalized:/api/storage/sign?key=images%2Fzixiao-palace-ready.png&expires=3600'],
        }),
      }),
    )
  })

  it('invalid payload artStyle -> explicit error', async () => {
    await expect(handleLocationImageTask(buildJob({ imageIndex: 0, artStyle: 'anime' }))).rejects.toThrow(
      'Invalid artStyle in IMAGE_LOCATION payload',
    )
  })

  it('honors requested count when location already has more slots', async () => {
    prismaMock.locationImage.findUnique.mockResolvedValueOnce(null)
    prismaMock.novelPromotionLocation.findUnique.mockResolvedValueOnce({
      id: 'location-1',
      name: 'Old Town',
      images: [
        { id: 'location-image-1', locationId: 'location-1', imageIndex: 0, description: '雨夜街道 A' },
        { id: 'location-image-2', locationId: 'location-1', imageIndex: 1, description: '雨夜街道 B' },
        { id: 'location-image-3', locationId: 'location-1', imageIndex: 2, description: '雨夜街道 C' },
      ],
    })

    const result = await handleLocationImageTask(buildJob({ locationId: 'location-1', count: 1 }, 'location-1'))

    expect(result).toEqual({
      updated: 1,
      locationIds: ['location-1'],
    })
    expect(sharedMock.generateProjectLabeledImageToStorage).toHaveBeenCalledTimes(1)
    expect(prismaMock.locationImage.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.locationImage.update).toHaveBeenCalledWith({
      where: { id: 'location-image-1' },
      data: { imageUrl: 'cos/location-generated-1.png', isSelected: true },
    })
  })

  it('does not override existing selected location image', async () => {
    prismaMock.novelPromotionLocation.findMany.mockResolvedValueOnce([
      {
        id: 'location-1',
        name: 'Old Town',
        sceneType: 'macro',
        selectedImageId: 'existing-selected',
        selectedImage: { imageUrl: 'images/existing-selected.png' },
        images: [
          { id: 'existing-selected', imageIndex: 1, imageUrl: 'images/existing-selected.png', isSelected: true },
        ],
      },
    ] as never)

    await handleLocationImageTask(buildJob({ imageIndex: 0 }))

    expect(prismaMock.locationImage.update).toHaveBeenCalledWith({
      where: { id: 'location-image-1' },
      data: { imageUrl: 'cos/location-generated-1.png' },
    })
    expect(prismaMock.novelPromotionLocation.update).not.toHaveBeenCalled()
  })

  it('uses the same aspect ratio as character generation for prop images', async () => {
    await handleLocationImageTask(buildJob({ type: 'prop', imageIndex: 0 }))

    expect(sharedMock.generateProjectLabeledImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ aspectRatio: PROP_IMAGE_RATIO }),
      }),
    )
  })
})
