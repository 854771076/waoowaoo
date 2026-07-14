import { describe, expect, it } from 'vitest'
import {
  buildPreImageGridGenerationContext,
  extractPreImageGridVideoPrompt,
  serializeGridGenerationContextForStorage,
} from '@/lib/storyboard-images/grid-generation-context'

describe('grid generation context', () => {
  it('builds pre-image grid prompt context with traceable cells and an aggregate video prompt', () => {
    const context = buildPreImageGridGenerationContext({
      panelGridSize: 3,
      imagePrompt: '九宫格分镜图提示词',
      baseVideoPrompt: '角色从宫门前走向大殿，镜头平滑推进',
      shotType: '中景',
      cameraMove: '平滑推进',
      panelContext: {
        panel: {
          description: '帝俊进入紫霄宫',
          location: '紫霄宫外',
          characters: [{ name: '帝俊' }, { name: '白泽' }],
          source_text: '帝俊：此事必须立刻处理。',
        },
      },
    })

    expect(context.source).toBe('pre_image_grid_prompt')
    expect(context.gridMetadata.panelGridSize).toBe(3)
    expect(context.preImageGridPrompt.imagePrompt).toBe('九宫格分镜图提示词')
    expect(context.preImageGridPrompt.baseVideoPrompt).toBe('角色从宫门前走向大殿，镜头平滑推进')
	    expect(context.preImageGridPrompt.aggregateVideoPrompt).toContain('格 1')
	    expect(context.preImageGridPrompt.aggregateVideoPrompt).toContain('格 3')
	    expect(context.preImageGridPrompt.aggregateVideoPrompt).toContain('电影级画质，高清锐利，细节清晰，4K 质感')
	    expect(context.preImageGridPrompt.aggregateVideoPrompt).toContain('单一连续镜头')
	    expect(context.preImageGridPrompt.aggregateVideoPrompt).toContain('绝对不要出现宫格、分格、拼贴、分屏、边框')
	    expect(context.preImageGridPrompt.gridCells[0]?.videoPrompt).toContain('0-1秒')
	    expect(context.preImageGridPrompt.gridCells[2]?.videoPrompt).toContain('2-3秒')
	    expect(context.preImageGridPrompt.gridCells).toHaveLength(3)
    expect(context.preImageGridPrompt.gridCells[0]).toMatchObject({
      cellIndex: 1,
      shotType: '中景',
      cameraMove: '平滑推进',
      location: '紫霄宫外',
    })
  })

  it('extracts pre-image aggregate video prompt from saved gridGenerationContext JSON', () => {
    const context = buildPreImageGridGenerationContext({
      panelGridSize: 2,
      imagePrompt: '双格分镜图提示词',
      baseVideoPrompt: '两人对峙，镜头缓慢环绕',
      shotType: '近景',
      cameraMove: '环绕',
      panelContext: {
        panel: {
          description: '帝俊和伏羲对峙',
          location: '大殿',
          characters: ['帝俊', '伏羲'],
        },
      },
    })

    expect(extractPreImageGridVideoPrompt(JSON.stringify(context))).toEqual({
      prompt: context.preImageGridPrompt.aggregateVideoPrompt,
      duration: 3,
    })
  })

  it('preserves character consistency constraints in pre-image grid context', () => {
    const characterConsistency = {
      source: 'character_consistency_context',
      characters: [
        {
          name: '顾娘子/顾盼之',
          resolvedAppearance: '夜行',
          description: '黑色夜行衣，束发，动作利落',
          referenceImageUrl: 'images/gu-night.png',
          consistencyPrompt: '顾娘子/顾盼之 需要保持同一角色身份和外貌连续性。',
        },
      ],
    }

    const context = buildPreImageGridGenerationContext({
      panelGridSize: 3,
      imagePrompt: '三格分镜图提示词',
      baseVideoPrompt: '顾盼之夜行潜入宅院',
      shotType: '中景',
      cameraMove: '跟拍',
      panelContext: {
        panel: {
          description: '顾盼之翻过院墙',
          characters: [{ name: '顾盼之', appearance: '夜行' }],
        },
        context: {
          character_consistency: characterConsistency,
        },
      },
    })

    expect(context.context).toEqual({
      character_consistency: characterConsistency,
    })
  })

  it('injects character consistency into grid image and video prompts', () => {
    const context = buildPreImageGridGenerationContext({
      panelGridSize: 2,
      imagePrompt: '双格分镜图提示词',
      baseVideoPrompt: '顾盼之从暗巷进入宅院',
      shotType: '中景',
      cameraMove: '跟拍',
      panelContext: {
        panel: {
          description: '顾盼之夜行潜入',
          characters: [{ name: '顾盼之', appearance: '夜行' }],
        },
        context: {
          character_consistency: {
            source: 'character_consistency_context',
            characters: [
              {
                name: '顾娘子/顾盼之',
                resolvedAppearance: '夜行',
                description: '黑色夜行衣，束发，动作利落',
                consistencyPrompt: '顾娘子/顾盼之 需要保持同一角色身份和外貌连续性。外貌版本：夜行。固定外貌描述：黑色夜行衣，束发，动作利落。',
                forbiddenChanges: ['不要改变角色年龄、脸型、发型、服装主色和标志性配饰'],
              },
            ],
          },
        },
      },
    })

    expect(context.preImageGridPrompt.gridCells[0]?.imagePrompt).toContain('角色一致性')
    expect(context.preImageGridPrompt.gridCells[0]?.imagePrompt).toContain('黑色夜行衣')
    expect(context.preImageGridPrompt.gridCells[0]?.videoPrompt).toContain('不要改变角色年龄')
    expect(context.preImageGridPrompt.aggregateVideoPrompt).toContain('顾娘子/顾盼之 需要保持同一角色身份')
  })

  it('injects director shot placement constraints into grid image and video prompts', () => {
    const context = buildPreImageGridGenerationContext({
      panelGridSize: 2,
      imagePrompt: '双格分镜图提示词',
      baseVideoPrompt: '两人对峙后同时拔剑',
      shotType: '中景',
      cameraMove: '缓慢推进',
      panelContext: {
        panel: {
          description: '顾盼之和陆沉在庭院对峙',
          director_shot: {
            active_camera: {
              camera_fov: 35,
              camera_position: { x: 1.2, y: 1.6, z: 4.8 },
              camera_target: { x: 0, y: 1.2, z: 0 },
            },
            characters: [
              { name: '顾盼之', position: { x: -0.8, y: 0, z: 0.2 }, facing_deg: 35, posture: 'stand' },
              { name: '陆沉', position: { x: 0.9, y: 0, z: -0.1 }, facing_deg: -25, posture: 'lean' },
            ],
          },
        },
      },
    })

    expect(context.preImageGridPrompt.gridCells[0]?.imagePrompt).toContain('导演台站位约束')
    expect(context.preImageGridPrompt.gridCells[0]?.videoPrompt).toContain('顾盼之：位置 x=-0.8, y=0, z=0.2')
    expect(context.preImageGridPrompt.aggregateVideoPrompt).toContain('不得交换人物左右/前后站位')
  })

  it('returns null for invalid or non-pre-image contexts', () => {
    expect(extractPreImageGridVideoPrompt('{bad json')).toBeNull()
    expect(extractPreImageGridVideoPrompt(JSON.stringify({ gridMetadata: { panelGridSize: 3 } }))).toBeNull()
  })

  it('serializes a compact storage context without nested prompts or data URLs', () => {
    const hugeDataUrl = `data:image/jpeg;base64,${'a'.repeat(120_000)}`
    const context = buildPreImageGridGenerationContext({
      panelGridSize: 4,
      imagePrompt: `宫格提示词\n${JSON.stringify({ referenceImages: [hugeDataUrl] })}`,
      baseVideoPrompt: '主角穿过街道后回头',
      shotType: '中景',
      cameraMove: '跟拍',
      panelContext: {
        panel: {
          description: '主角穿过街道',
          characters: [{ name: '主角' }],
        },
        context: {
          character_consistency: {
            source: 'character_consistency_context',
            characters: [
              {
                name: '主角',
                referenceImageUrl: hugeDataUrl,
                consistencyPrompt: '主角外貌保持一致',
              },
            ],
          },
        },
      },
    })

    const serialized = serializeGridGenerationContextForStorage(context)
    const parsed = JSON.parse(serialized) as Record<string, unknown>
    const extracted = extractPreImageGridVideoPrompt(serialized)

    expect(serialized.length).toBeLessThan(20_000)
    expect(serialized).not.toContain(hugeDataUrl)
    expect(serialized).not.toContain('data:image/jpeg;base64')
    expect(parsed.gridMetadata).toMatchObject({ panelGridSize: 4 })
    expect(extracted?.prompt).toContain('单一连续镜头')
    expect(extracted?.duration).toBe(4)
  })
})
