import { describe, expect, it } from 'vitest'
import { buildCharacterConsistencyContext } from '@/lib/storyboard-images/character-consistency-context'

describe('character consistency context', () => {
  const projectCharacters = [
    {
      name: '顾娘子/顾盼之',
      appearances: [
        {
          changeReason: '常服',
          description: '青色常服，发髻简洁，神情克制',
          descriptions: JSON.stringify(['青色常服，发髻简洁，神情克制']),
          imageUrls: JSON.stringify(['cos://characters/gu-casual-a.png', 'cos://characters/gu-casual-b.png']),
          imageUrl: 'cos://characters/gu-casual-legacy.png',
          selectedIndex: 1,
        },
        {
          changeReason: '夜行',
          description: '黑色夜行衣，束发，动作利落',
          descriptions: JSON.stringify(['黑色夜行衣，束发，动作利落']),
          imageUrls: JSON.stringify(['cos://characters/gu-night.png']),
          imageUrl: null,
          selectedIndex: 0,
        },
      ],
    },
  ]

  it('resolves an explicitly requested appearance with the matching selected reference image', () => {
    const context = buildCharacterConsistencyContext({
      panelCharacters: [{ name: '顾盼之', appearance: '夜行', slot: 'left' }],
      projectCharacters,
    })

    expect(context.characters).toEqual([
      expect.objectContaining({
        name: '顾娘子/顾盼之',
        requestedAppearance: '夜行',
        resolvedAppearance: '夜行',
        slot: 'left',
        description: '黑色夜行衣，束发，动作利落',
        referenceImageUrl: 'cos://characters/gu-night.png',
        fallbackReason: null,
      }),
    ])
    expect(context.characters[0]?.consistencyPrompt).toContain('顾娘子/顾盼之')
    expect(context.characters[0]?.consistencyPrompt).toContain('黑色夜行衣')
    expect(context.characters[0]?.forbiddenChanges).toContain('不要改变角色年龄、脸型、发型、服装主色和标志性配饰')
  })

  it('falls back to the default appearance when the requested appearance does not exist', () => {
    const context = buildCharacterConsistencyContext({
      panelCharacters: [{ name: '顾盼之', appearance: '礼服' }],
      projectCharacters,
    })

    expect(context.characters[0]).toMatchObject({
      name: '顾娘子/顾盼之',
      requestedAppearance: '礼服',
      resolvedAppearance: '常服',
      referenceImageUrl: 'cos://characters/gu-casual-b.png',
      fallbackReason: 'requested_appearance_not_found',
    })
  })

  it('returns a stable missing-data context when the character cannot be resolved', () => {
    const context = buildCharacterConsistencyContext({
      panelCharacters: [{ name: '路人甲', appearance: '常服' }],
      projectCharacters,
    })

    expect(context.characters[0]).toMatchObject({
      name: '路人甲',
      requestedAppearance: '常服',
      resolvedAppearance: null,
      description: '无角色外貌数据',
      referenceImageUrl: null,
      fallbackReason: 'character_not_found',
    })
  })
})
