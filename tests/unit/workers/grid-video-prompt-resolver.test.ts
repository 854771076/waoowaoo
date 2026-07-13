import { describe, expect, it, vi } from 'vitest'
import { resolveGridVideoPrompt } from '@/lib/workers/grid-video-prompt-resolver'
import { buildPreImageGridGenerationContext } from '@/lib/storyboard-images/grid-generation-context'
import { rewriteGridVideoPrompt } from '@/lib/storyboard-images/grid-video-prompt'

vi.mock('@/lib/storyboard-images/grid-video-prompt', () => ({
  rewriteGridVideoPrompt: vi.fn(async () => {
    throw new Error('rewrite should not be called when pre-image prompt exists')
  }),
}))

describe('resolveGridVideoPrompt', () => {
  it('uses pre-image grid video prompt without calling rewrite fallback', async () => {
    const context = buildPreImageGridGenerationContext({
      panelGridSize: 4,
      imagePrompt: '四格分镜图提示词',
      baseVideoPrompt: '角色依次拔剑、转身、冲刺、定格',
      shotType: '中景',
      cameraMove: '连续推进',
      panelContext: {
        panel: {
          description: '角色发起攻击',
          location: '山门',
          characters: ['主角'],
        },
      },
    })

    const result = await resolveGridVideoPrompt({
      basePrompt: '旧视频提示词',
      panelContext: {},
      gridSize: 4,
      shotType: '中景',
      cameraMove: '连续推进',
      locale: 'zh',
      projectId: 'project-1',
      userId: 'user-1',
      alreadyRewritten: false,
      gridGenerationContextJson: JSON.stringify(context),
    })

    expect(result).toEqual({
      prompt: context.preImageGridPrompt.aggregateVideoPrompt,
      rewritten: false,
      usage: null,
      duration: 4,
      source: 'pre_image_grid_prompt',
    })
    expect(rewriteGridVideoPrompt).not.toHaveBeenCalled()
  })
})
