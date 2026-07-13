import { describe, expect, it } from 'vitest'
import {
  buildVideoReferenceImageChoices,
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
    appearances: [],
  },
]

const locations: Location[] = [
  {
    id: 'loc-yard',
    name: '竹院',
    summary: '有竹林的小院',
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

    expect(choices.map((choice) => [choice.id, choice.kind, choice.url, choice.required])).toEqual([
      ['source', 'source', 'images/source.png', true],
      ['character:char-hero:appearance-main:0', 'character', 'images/hero-b.png', false],
      ['character:char-hero:appearance-main:1', 'character', 'images/hero-a.png', false],
      ['character-sheet:char-hero:appearance-sheet', 'characterSheet', 'images/hero-sheet.png', false],
      ['location:loc-yard', 'location', 'images/location-selected.png', false],
    ])
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
      'location:loc-yard',
    ]))

    expect(selected).toEqual([
      'images/source.png',
      'images/hero-a.png',
      'images/location-selected.png',
    ])
  })
})
