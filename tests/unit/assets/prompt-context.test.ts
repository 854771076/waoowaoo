import { describe, expect, it } from 'vitest'
import { buildPromptAssetContext, compileAssetPromptFragments } from '@/lib/assets/services/asset-prompt-context'

describe('asset prompt context', () => {
  it('compiles subject, environment, and prop prompt fragments from the centralized asset context', () => {
    const context = buildPromptAssetContext({
      characters: [
        {
          name: '小雨/雨',
          appearances: [
            {
              changeReason: '初始形象',
              descriptions: ['黑色短发，校服，冷静表情'],
              selectedIndex: 0,
              description: 'fallback description',
            },
          ],
        },
      ],
      locations: [
        {
          name: '天台',
          images: [
            {
              isSelected: true,
              description: '夜晚天台，冷风，霓虹远景',
              availableSlots: JSON.stringify([
                '天台栏杆左侧靠近边缘的位置',
              ]),
            },
          ],
        },
      ],
      props: [
        {
          name: '青铜匕首',
          summary: '古旧短刃，雕纹手柄',
        },
      ],
      clipCharacters: [{ name: '雨' }],
      clipLocation: '天台',
      clipProps: ['青铜匕首'],
    })

    expect(compileAssetPromptFragments(context)).toEqual({
      appearanceListText: '小雨/雨: ["初始形象"]',
      fullDescriptionText: '【小雨/雨 - 初始形象】黑色短发，校服，冷静表情',
      locationDescriptionText: '夜晚天台，冷风，霓虹远景\n\n可站位置：\n- 天台栏杆左侧靠近边缘的位置',
      propsDescriptionText: '【青铜匕首】古旧短刃，雕纹手柄',
      charactersIntroductionText: '暂无角色介绍',
    })
  })
})

describe('buildPromptAssetContext with hierarchy', () => {
  const locations = [
    {
      id: 'macro1',
      name: '林家老宅',
      sceneType: 'macro' as const,
      parentId: null,
      images: [{ isSelected: true, description: '民国江南大宅院', availableSlots: null }],
    },
    {
      id: 'micro1',
      name: '正堂',
      sceneType: 'micro' as const,
      parentId: 'macro1',
      images: [
        {
          isSelected: true,
          description: '红木桌椅，字画中堂',
          availableSlots: JSON.stringify(['主位旁']),
        },
      ],
    },
  ]

  it('micro location clips include parent description first', () => {
    const result = buildPromptAssetContext({
      characters: [],
      locations,
      props: [],
      clipCharacters: [],
      clipLocation: '林家老宅/正堂',
      clipProps: [],
      locale: 'zh',
    })
    expect(result.locationDescriptionText).toContain('林家老宅')
    expect(result.locationDescriptionText).toContain('民国江南大宅院')
    expect(result.locationDescriptionText).toContain('正堂')
    expect(result.locationDescriptionText).toContain('红木桌椅')
    expect(result.locationDescriptionText.indexOf('林家老宅')).toBeLessThan(
      result.locationDescriptionText.indexOf('正堂'),
    )
  })

  it('macro location clip uses own description only', () => {
    const result = buildPromptAssetContext({
      characters: [],
      locations,
      props: [],
      clipCharacters: [],
      clipLocation: '林家老宅',
      clipProps: [],
    })
    expect(result.locationDescriptionText).toContain('民国江南大宅院')
    expect(result.locationDescriptionText).not.toContain('红木桌椅')
  })

  it('unmatched location returns 无', () => {
    const result = buildPromptAssetContext({
      characters: [],
      locations,
      props: [],
      clipCharacters: [],
      clipLocation: '不存在地点',
      clipProps: [],
    })
    expect(result.locationDescriptionText).toBe('无')
  })

  it('legacy location input without sceneType is treated as macro', () => {
    const result = buildPromptAssetContext({
      characters: [],
      locations: [
        {
          name: '天台',
          images: [{ isSelected: true, description: '夜晚天台', availableSlots: null }],
        },
      ],
      props: [],
      clipCharacters: [],
      clipLocation: '天台',
      clipProps: [],
    })
    expect(result.locationDescriptionText).toBe('夜晚天台')
  })
})
