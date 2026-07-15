import { beforeEach, describe, expect, it, vi } from 'vitest'

type CreateArgs = { data: { name: string; parentId?: string | null; sceneType?: string } }
const mockLocationCreate = vi.hoisted(() => vi.fn<(args: CreateArgs) => Promise<{ id: string }>>())
const mockLocationFindFirst = vi.hoisted(() => vi.fn<() => Promise<{ id: string; name: string } | null>>())
const mockCharacterCreate = vi.hoisted(() => vi.fn<(args: CreateArgs) => Promise<{ id: string }>>())
const mockSeedSlots = vi.hoisted(() => vi.fn<(args: unknown) => Promise<void>>(async () => undefined))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    novelPromotionCharacter: { create: (args: unknown) => mockCharacterCreate(args as CreateArgs) },
    novelPromotionLocation: {
      create: (args: unknown) => mockLocationCreate(args as CreateArgs),
      findFirst: () => mockLocationFindFirst(),
    },
  },
}))
vi.mock('@/lib/assets/services/location-backed-assets', () => ({
  seedProjectLocationBackedImageSlots: (args: unknown) => mockSeedSlots(args),
}))
vi.mock('@/lib/location-available-slots', () => ({
  normalizeLocationAvailableSlots: (value: unknown) => (Array.isArray(value) ? value : []),
}))
vi.mock('@/lib/constants', () => ({
  removeLocationPromptSuffix: (value: string) => value,
}))
vi.mock('@/lib/assets/prop-description', () => ({
  resolvePropVisualDescription: ({ description }: { description: string }) => description,
}))

import {
  createAnalyzeGlobalStats,
  persistAnalyzeGlobalChunk,
} from '@/lib/workers/handlers/analyze-global-persist'

describe('persistAnalyzeGlobalChunk locations with hierarchy', () => {
  beforeEach(() => {
    mockLocationCreate.mockReset()
    mockLocationFindFirst.mockReset()
    mockSeedSlots.mockClear()
  })

  it('creates macro first then children with parentId', async () => {
    mockLocationCreate.mockImplementation(async ({ data }: { data: { name: string } }) => {
      if (data.name === '林家老宅') return { id: 'macro1' }
      if (data.name === '正堂') return { id: 'micro1' }
      if (data.name === '花园') return { id: 'micro2' }
      return { id: 'x' }
    })

    const stats = createAnalyzeGlobalStats(1)
    await persistAnalyzeGlobalChunk({
      projectInternalId: 'proj1',
      charactersData: {},
      locationsData: {
        locations: [
          {
            name: '林家老宅',
            summary: '江南宅院',
            description: '青砖黛瓦',
            sub_locations: [
              { name: '正堂', summary: '会客厅', description: '红木桌椅', available_slots: ['主位旁'] },
              { name: '花园', summary: '后花园', description: '假山池塘' },
            ],
          },
        ],
      },
      propsData: {},
      existingCharacters: [],
      existingCharacterNames: [],
      existingLocationNames: [],
      existingLocationInfo: [],
      existingPropNames: [],
      stats,
    })

    expect(mockLocationCreate).toHaveBeenCalledTimes(3)
    expect(mockLocationCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ name: '林家老宅', sceneType: 'macro', parentId: null }),
      }),
    )
    const calls = mockLocationCreate.mock.calls
    const microCalls = calls.slice(1).map((c: unknown[]) => (c[0] as { data: unknown }).data)
    expect(microCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '正堂', sceneType: 'micro', parentId: 'macro1' }),
        expect.objectContaining({ name: '花园', sceneType: 'micro', parentId: 'macro1' }),
      ]),
    )
    expect(mockSeedSlots).toHaveBeenCalledTimes(3)
    expect(stats.newLocations).toBe(3)
  })

  it('dedupes sub-locations within same parent but allows same name across parents', async () => {
    mockLocationCreate.mockImplementation(async ({ data }: { data: { name: string; parentId?: string | null } }) => {
      if (data.name === '宅院A') return { id: 'a' }
      if (data.name === '宅院B') return { id: 'b' }
      if (data.name === '书房' && data.parentId === 'a') return { id: 'sa' }
      if (data.name === '书房' && data.parentId === 'b') return { id: 'sb' }
      return { id: 'x' }
    })
    const stats = createAnalyzeGlobalStats(1)
    await persistAnalyzeGlobalChunk({
      projectInternalId: 'proj1',
      charactersData: {},
      locationsData: {
        locations: [
          { name: '宅院A', summary: '', description: 'A', sub_locations: [{ name: '书房', description: 'A的书房' }] },
          { name: '宅院B', summary: '', description: 'B', sub_locations: [{ name: '书房', description: 'B的书房' }] },
        ],
      },
      propsData: {},
      existingCharacters: [],
      existingCharacterNames: [],
      existingLocationNames: [],
      existingLocationInfo: [],
      existingPropNames: [],
      stats,
    })
    expect(stats.newLocations).toBe(4)
  })

  it('skips sub-locations whose sibling already has same name (same parent dedupe)', async () => {
    mockLocationCreate.mockImplementation(async ({ data }: { data: { name: string } }) => {
      if (data.name === '宅院A') return { id: 'a' }
      if (data.name === '书房') return { id: 's' }
      return { id: 'x' }
    })
    const stats = createAnalyzeGlobalStats(1)
    await persistAnalyzeGlobalChunk({
      projectInternalId: 'proj1',
      charactersData: {},
      locationsData: {
        locations: [
          {
            name: '宅院A',
            description: 'A',
            sub_locations: [
              { name: '书房', description: '1' },
              { name: '书房', description: '2' },
            ],
          },
        ],
      },
      propsData: {},
      existingCharacters: [],
      existingCharacterNames: [],
      existingLocationNames: [],
      existingLocationInfo: [],
      existingPropNames: [],
      stats,
    })
    expect(mockLocationCreate).toHaveBeenCalledTimes(2)
    expect(stats.skippedSubLocations).toBe(1)
  })

  it('skips sub-locations already present in existingChildPaths across chunks', async () => {
    mockLocationCreate.mockImplementation(async ({ data }: { data: { name: string } }) => {
      if (data.name === '宅院A') return { id: 'a' }
      if (data.name === '花园') return { id: 'g' }
      return { id: 'x' }
    })
    const stats = createAnalyzeGlobalStats(1)
    const existingChildPaths = new Set<string>(['宅院a/书房'])
    await persistAnalyzeGlobalChunk({
      projectInternalId: 'proj1',
      charactersData: {},
      locationsData: {
        locations: [
          {
            name: '宅院A',
            description: 'A',
            sub_locations: [
              { name: '书房', description: '前一切片已建' },
              { name: '花园', description: '新的子场景' },
            ],
          },
        ],
      },
      propsData: {},
      existingCharacters: [],
      existingCharacterNames: [],
      existingLocationNames: [],
      existingLocationInfo: [],
      existingChildPaths,
      existingPropNames: [],
      stats,
    })
    // 宅院A + 花园 = 2 creates, 书房 skipped
    expect(mockLocationCreate).toHaveBeenCalledTimes(2)
    expect(stats.skippedSubLocations).toBe(1)
    expect(existingChildPaths.has('宅院a/花园')).toBe(true)
  })

  it('creates new sub-locations under an existing macro instead of skipping the whole branch', async () => {
    mockLocationCreate.mockImplementation(async ({ data }: { data: { name: string } }) => {
      if (data.name === '正堂') return { id: 'micro-existing-parent' }
      return { id: 'x' }
    })
    const stats = createAnalyzeGlobalStats(1)
    await persistAnalyzeGlobalChunk({
      projectInternalId: 'proj1',
      charactersData: {},
      locationsData: {
        locations: [
          {
            name: '林家老宅',
            summary: '已存在主场景',
            sub_locations: [
              { name: '正堂', summary: '会客正厅', description: '红木桌椅' },
            ],
          },
        ],
      },
      propsData: {},
      existingCharacters: [],
      existingCharacterNames: [],
      existingLocationNames: ['林家老宅'],
      existingMacroLocations: [{ id: 'macro-existing', name: '林家老宅' }],
      existingLocationInfo: ['林家老宅'],
      existingPropNames: [],
      stats,
    })

    expect(mockLocationCreate).toHaveBeenCalledTimes(1)
    expect(mockLocationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '正堂',
          sceneType: 'micro',
          parentId: 'macro-existing',
        }),
      }),
    )
    expect(stats.newLocations).toBe(1)
  })

  it('accepts local_scenes as an alias of sub_locations', async () => {
    mockLocationCreate.mockImplementation(async ({ data }: { data: { name: string } }) => {
      if (data.name === '林家老宅') return { id: 'macro1' }
      if (data.name === '偏厅') return { id: 'micro1' }
      return { id: 'x' }
    })
    const stats = createAnalyzeGlobalStats(1)
    await persistAnalyzeGlobalChunk({
      projectInternalId: 'proj1',
      charactersData: {},
      locationsData: {
        locations: [
          {
            name: '林家老宅',
            description: '宅院全貌',
            local_scenes: [
              { name: '偏厅', summary: '侧厅', description: '屏风与茶桌' },
            ],
          },
        ],
      },
      propsData: {},
      existingCharacters: [],
      existingCharacterNames: [],
      existingLocationNames: [],
      existingLocationInfo: [],
      existingPropNames: [],
      stats,
    })

    expect(mockLocationCreate).toHaveBeenCalledTimes(2)
    expect(mockLocationCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          name: '偏厅',
          sceneType: 'micro',
          parentId: 'macro1',
        }),
      }),
    )
  })
})
