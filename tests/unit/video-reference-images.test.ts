import { describe, expect, it } from 'vitest'
import {
  buildVideoReferenceImageChoices,
  getDefaultSelectedVideoReferenceImageIds,
  resolveSelectedVideoReferenceImages,
} from '@/lib/novel-promotion/video-reference-images'
import type { Character, Location } from '@/types/project'

const characters: Character[] = [
  {
    id: 'char-hero',
    name: '阿青',
    appearances: [
      {
        id: 'appearance-main',
        appearanceIndex: 0,
        changeReason: '主形象',
        description: '青衣少年',
        descriptions: null,
        imageUrl: 'images/hero-selected.png',
        imageUrls: ['images/hero-a.png', 'images/hero-b.png', 'images/hero-c.png'],
        previousImageUrl: null,
        previousImageUrls: [],
        previousDescription: null,
        previousDescriptions: null,
        selectedIndex: 1,
      },
      {
        id: 'appearance-sheet',
        appearanceIndex: 1,
        changeReason: '三视图',
        description: '阿青标准三视图',
        descriptions: null,
        imageUrl: 'images/hero-sheet.png',
        imageUrls: ['images/hero-sheet.png'],
        previousImageUrl: null,
        previousImageUrls: [],
        previousDescription: null,
        previousDescriptions: null,
        selectedIndex: 0,
      },
    ],
  },
  {
    id: 'char-other',
    name: '旁白',
    appearances: [
      {
        id: 'appearance-other',
        appearanceIndex: 0,
        changeReason: '主形象',
        description: '旁白角色',
        descriptions: null,
        imageUrl: 'images/other.png',
        imageUrls: ['images/other.png'],
        previousImageUrl: null,
        previousImageUrls: [],
        previousDescription: null,
        previousDescriptions: null,
        selectedIndex: 0,
      },
    ],
  },
]

const locations: Location[] = [
  {
    id: 'loc-yard',
    name: '竹院',
    summary: '有竹林的小院',
    sceneType: 'macro',
    parentId: null,
    selectedImageId: 'loc-img-selected',
    images: [
      {
        id: 'loc-img-0',
        imageIndex: 0,
        description: null,
        imageUrl: 'images/location-fallback.png',
        previousImageUrl: null,
        previousDescription: null,
        isSelected: false,
      },
      {
        id: 'loc-img-selected',
        imageIndex: 1,
        description: null,
        imageUrl: 'images/location-selected.png',
        previousImageUrl: null,
        previousDescription: null,
        isSelected: true,
      },
    ],
  },
]

describe('video reference image selection', () => {
  it('keeps source image required and limits character references to the current panel', () => {
    const choices = buildVideoReferenceImageChoices({
      panel: {
        imageUrl: 'images/source.png',
        textPanel: {
          panel_number: 1,
          shot_type: '近景',
          description: '阿青在竹院回头',
          characters: ['阿青'],
          location: '竹院',
        },
      },
      characters,
      locations,
      includeCharacterSheet: true,
    })

    expect(choices.map((choice) => [choice.id, choice.kind, choice.url, choice.required, choice.selectedByDefault])).toEqual([
      ['source', 'source', 'images/source.png', true, true],
      ['character:char-hero:appearance-main:0', 'character', 'images/hero-b.png', false, true],
      ['character:char-hero:appearance-main:1', 'character', 'images/hero-a.png', false, false],
      ['character:char-hero:appearance-main:2', 'character', 'images/hero-c.png', false, false],
      ['character-sheet:char-hero:appearance-sheet:0', 'characterSheet', 'images/hero-sheet.png', false, true],
      ['location:loc-yard:1', 'location', 'images/location-selected.png', false, true],
      ['location:loc-yard:0', 'location', 'images/location-fallback.png', false, false],
    ])
  })

  it('uses the selected director storyboard board as the required source when the panel image is missing', () => {
    const choices = buildVideoReferenceImageChoices({
      panel: {
        imageUrl: '',
        directorStoryboardBoards: [
          {
            id: 'board-1',
            name: '导演分镜图',
            createdAt: 1,
            coverImageUrl: 'images/director-board.png',
            assetIds: [],
            items: [],
          },
        ],
        textPanel: {
          panel_number: 3,
          shot_type: '近景',
          description: '阿青回头',
          characters: [],
        },
      },
      characters: [],
      locations: [],
    })

    expect(choices[0]).toMatchObject({
      id: 'source:director-storyboard:board-1',
      kind: 'source',
      url: 'images/director-board.png',
      label: '导演分镜图',
      required: true,
      selectedByDefault: true,
    })
  })

  it('uses the selected director storyboard board by default when director storyboard video source is selected', () => {
    const choices = buildVideoReferenceImageChoices({
      panel: {
        imageUrl: 'images/panel-source.png',
        directorStoryboardBoards: [
          {
            id: 'board-1',
            name: '导演分镜图',
            createdAt: 1,
            coverImageUrl: 'images/director-board.png',
            assetIds: [],
            items: [],
          },
        ],
        textPanel: {
          panel_number: 3,
          shot_type: '近景',
          description: '阿青回头',
          characters: ['阿青'],
          location: '竹院',
        },
      },
      characters,
      locations,
      gridVideoSource: 'director_storyboard',
    })

    expect(choices[0]).toMatchObject({
      id: 'source:director-storyboard:board-1',
      kind: 'source',
      url: 'images/director-board.png',
      required: true,
      selectedByDefault: true,
    })
    expect(getDefaultSelectedVideoReferenceImageIds(choices)).toEqual(new Set(['source:director-storyboard:board-1']))
  })

  it('returns only required and user-selected images in stable order', () => {
    const choices = buildVideoReferenceImageChoices({
      panel: {
        imageUrl: 'images/source.png',
        textPanel: {
          panel_number: 1,
          shot_type: '近景',
          description: '阿青在竹院回头',
          characters: ['阿青'],
          location: '竹院',
        },
      },
      characters,
      locations,
      includeCharacterSheet: false,
    })

    const selected = resolveSelectedVideoReferenceImages(choices, new Set([
      'character:char-hero:appearance-main:1',
      'location:loc-yard:1',
    ]))

    expect(selected).toEqual([
      'images/source.png',
      'images/hero-a.png',
      'images/location-selected.png',
    ])
  })

  it('matches character and location aliases with loose name comparison', () => {
    const choices = buildVideoReferenceImageChoices({
      panel: {
        imageUrl: 'images/source.png',
        textPanel: {
          panel_number: 1,
          shot_type: '近景',
          description: '青在竹院一角回头',
          characters: ['青'],
          location: '竹院一角',
        },
      },
      characters: [
        {
          ...characters[0],
          name: '阿青/青',
        },
        characters[1],
      ],
      locations,
      includeCharacterSheet: false,
    })

    expect(choices.some((choice) => choice.id === 'character:char-hero:appearance-main:0')).toBe(true)
    expect(choices.find((choice) => choice.id === 'character:char-hero:appearance-main:0')?.selectedByDefault).toBe(true)
    expect(choices.find((choice) => choice.id === 'location:loc-yard:1')?.selectedByDefault).toBe(true)
  })

  it('keeps unmatched project assets visible for manual inspection without selecting them by default', () => {
    const choices = buildVideoReferenceImageChoices({
      panel: {
        imageUrl: 'images/source.png',
        textPanel: {
          panel_number: 1,
          shot_type: '近景',
          description: '陌生人在未知场所回头',
          characters: ['陌生人'],
          location: '未知场所',
        },
      },
      characters,
      locations,
      includeCharacterSheet: true,
    })

    const fallbackCharacter = choices.find((choice) => choice.id === 'character:char-hero:appearance-main:0')
    const fallbackSheet = choices.find((choice) => choice.id === 'character-sheet:char-hero:appearance-sheet:0')
    const fallbackLocation = choices.find((choice) => choice.id === 'location:loc-yard:1')
    expect(fallbackCharacter?.selectedByDefault).toBe(false)
    expect(fallbackSheet?.selectedByDefault).toBe(false)
    expect(fallbackLocation?.selectedByDefault).toBe(false)
    expect(choices.some((choice) => choice.id === 'character:char-other:appearance-other:0')).toBe(true)
  })

  it('adds enhanced grid frames as default video references before raw assets and caps defaults at 9', () => {
    const choices = buildVideoReferenceImageChoices({
      panel: {
        imageUrl: 'images/source-grid.png',
        imageLayout: 'grid',
        gridVideoFrames: Array.from({ length: 10 }, (_, index) => ({
          cellIndex: index + 1,
          imageUrl: `images/grid-frame-${index + 1}.png`,
          enhancedImageUrl: index === 0 ? 'images/grid-frame-1-hd.png' : undefined,
          videoPrompt: `格 ${index + 1}`,
        })),
        textPanel: {
          panel_number: 1,
          shot_type: '中景',
          description: '阿青在竹院回头',
          characters: ['阿青'],
          location: '竹院',
        },
      },
      characters,
      locations,
      gridVideoSource: 'split',
    })

    expect(choices.slice(0, 3).map((choice) => [choice.id, choice.kind, choice.url, choice.label, choice.selectedByDefault])).toEqual([
      ['grid-frame:1', 'gridFrame', 'images/grid-frame-1-hd.png', '高清分镜 1', true],
      ['grid-frame:2', 'gridFrame', 'images/grid-frame-2.png', '分镜格 2', true],
      ['grid-frame:3', 'gridFrame', 'images/grid-frame-3.png', '分镜格 3', true],
    ])
    const defaultIds = getDefaultSelectedVideoReferenceImageIds(choices)
    expect(defaultIds.size).toBe(9)
    expect(defaultIds.has('grid-frame:9')).toBe(true)
    expect(defaultIds.has('grid-frame:10')).toBe(false)
    expect(defaultIds.has('source')).toBe(false)
    expect(defaultIds.has('character:char-hero:appearance-main:0')).toBe(false)
  })

  it('uses only the original grid image by default when the original grid video source is selected', () => {
    const choices = buildVideoReferenceImageChoices({
      panel: {
        imageUrl: 'images/source-grid.png',
        imageLayout: 'grid',
        gridSplitImages: [
          { cellIndex: 1, panelGridSize: 2, imageUrl: 'images/split-1.png', enhancedImageUrl: 'images/split-1-hd.png' },
          { cellIndex: 2, panelGridSize: 2, imageUrl: 'images/split-2.png' },
        ],
        textPanel: {
          panel_number: 1,
          shot_type: '中景',
          description: '阿青在竹院回头',
          characters: ['阿青'],
          location: '竹院',
        },
      },
      characters,
      locations,
      gridVideoSource: 'original',
    })

    expect(getDefaultSelectedVideoReferenceImageIds(choices)).toEqual(new Set(['source']))
  })

  it('caps resolved selected reference images at 9 even if more ids are selected', () => {
    const choices = Array.from({ length: 12 }, (_, index) => ({
      id: `choice-${index + 1}`,
      kind: 'gridFrame' as const,
      url: `images/ref-${index + 1}.png`,
      label: `分镜格 ${index + 1}`,
      required: false,
      selectedByDefault: false,
    }))

    const selected = resolveSelectedVideoReferenceImages(
      choices,
      new Set(choices.map((choice) => choice.id)),
    )

    expect(selected).toEqual(Array.from({ length: 9 }, (_, index) => `images/ref-${index + 1}.png`))
  })
})
