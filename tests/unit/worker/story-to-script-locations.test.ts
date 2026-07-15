import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSeedSlots = vi.hoisted(() => vi.fn<(args: unknown) => Promise<void>>(async () => undefined))

vi.mock('@/lib/assets/services/location-backed-assets', () => ({
  seedProjectLocationBackedImageSlots: (args: unknown) => mockSeedSlots(args),
}))

vi.mock('@/lib/location-available-slots', () => ({
  normalizeLocationAvailableSlots: (value: unknown) => (Array.isArray(value) ? value : []),
}))

vi.mock('@/lib/constants', () => ({
  removeLocationPromptSuffix: (value: string) => value,
}))

import { persistAnalyzedLocations } from '@/lib/workers/handlers/story-to-script-helpers'

function createDbMock() {
  const create = vi.fn(async ({ data }: { data: { name: string; parentId?: string | null } }) => ({
    id: `${data.parentId ? 'micro' : 'macro'}-${data.name}`,
    name: data.name,
  }))
  const findFirst = vi.fn(async () => null)
  return {
    create,
    findFirst,
    db: {
      novelPromotionLocation: { create, findFirst },
      locationImage: {},
    },
  }
}

describe('persistAnalyzedLocations hierarchy for story-to-script', () => {
  beforeEach(() => {
    mockSeedSlots.mockClear()
  })

  it('persists sub_locations as micro scenes under the created macro', async () => {
    const { create, db } = createDbMock()

    const created = await persistAnalyzedLocations({
      projectInternalId: 'project-1',
      existingNames: new Set(),
      analyzedLocations: [
        {
          name: '紫霄宫',
          summary: '讲道宫殿',
          descriptions: ['宏伟宫殿'],
          sub_locations: [
            { name: '宫殿广场', summary: '众仙集会处', descriptions: ['广场全貌'] },
            { name: '大殿入口', summary: '入殿台阶', descriptions: ['台阶与殿门'] },
          ],
        },
      ],
      db: db as never,
    })

    expect(created.map((item) => item.name)).toEqual(['紫霄宫', '宫殿广场', '大殿入口'])
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ name: '紫霄宫', sceneType: 'macro', parentId: null }),
      }),
    )
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ name: '宫殿广场', sceneType: 'micro', parentId: 'macro-紫霄宫' }),
      }),
    )
    expect(create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({ name: '大殿入口', sceneType: 'micro', parentId: 'macro-紫霄宫' }),
      }),
    )
    expect(mockSeedSlots).toHaveBeenCalledTimes(3)
  })

  it('attaches new local scenes under an existing macro', async () => {
    const { create, db } = createDbMock()

    const created = await persistAnalyzedLocations({
      projectInternalId: 'project-1',
      existingNames: new Set(['紫霄宫']),
      existingMacroLocations: [{ id: 'macro-existing', name: '紫霄宫' }],
      existingChildPaths: new Set(['紫霄宫/宫殿广场']),
      analyzedLocations: [
        {
          name: '紫霄宫',
          local_scenes: [
            { name: '宫殿广场', descriptions: ['已存在'] },
            { name: '大殿入口', descriptions: ['新局部'] },
          ],
        },
      ],
      db: db as never,
    })

    expect(created.map((item) => item.name)).toEqual(['大殿入口'])
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: '大殿入口', sceneType: 'micro', parentId: 'macro-existing' }),
      }),
    )
  })
})
