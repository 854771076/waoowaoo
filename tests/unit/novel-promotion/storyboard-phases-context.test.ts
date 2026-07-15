import { describe, expect, it } from 'vitest'
import {
  buildStoryboardLocationsLibName,
  mergeClipCharactersWithMentionedAssets,
} from '@/lib/storyboard-phases'

describe('storyboard phase asset context', () => {
  it('includes micro locations as full parent/child paths in the storyboard location library', () => {
    const text = buildStoryboardLocationsLibName([
      { id: 'macro-1', name: '紫霄宫_白天', sceneType: 'macro', parentId: null, images: [] },
      { id: 'micro-1', name: '宫殿广场', sceneType: 'micro', parentId: 'macro-1', images: [] },
      { id: 'micro-2', name: '大殿入口', sceneType: 'micro', parentId: 'macro-1', images: [] },
    ])

    expect(text).toContain('紫霄宫_白天（大场景）')
    expect(text).toContain('紫霄宫_白天/宫殿广场（局部）')
    expect(text).toContain('紫霄宫_白天/大殿入口（局部）')
  })

  it('adds asset characters mentioned in clip content even when clip.characters missed them', () => {
    const merged = mergeClipCharactersWithMentionedAssets({
      clipCharacters: [{ name: '帝俊' }],
      characters: [
        { name: '帝俊', appearances: [] },
        { name: '白泽', appearances: [] },
        { name: '东王公', appearances: [] },
      ],
      content: '帝俊侧眼抬眸看着擦身而过的东王公一行人，白泽站在旁边冷笑。',
    })

    expect(merged).toEqual([
      { name: '帝俊' },
      { name: '白泽' },
      { name: '东王公' },
    ])
  })

  it('adds asset characters mentioned only in parsed screenplay', () => {
    const merged = mergeClipCharactersWithMentionedAssets({
      clipCharacters: [],
      characters: [
        { name: '接引', appearances: [] },
        { name: '淮提', appearances: [] },
      ],
      content: '',
      screenplay: {
        scenes: [
          {
            content: [
              { type: 'action', text: '接引和淮提对视一眼。' },
            ],
          },
        ],
      },
    })

    expect(merged).toEqual([{ name: '接引' }, { name: '淮提' }])
  })
})
