import { describe, expect, it } from 'vitest'
import {
  enrichPromptWithKnowledge,
  formatKnowledgePromptBlock,
  selectKnowledgeForPrompt,
  type KnowledgeCandidate,
} from '@/lib/cinema-knowledge/prompt-enrichment'

const candidates: KnowledgeCandidate[] = [
  {
    id: 'low-angle',
    title: '低角度镜头',
    category: '镜头',
    promptPhrase: '使用低角度镜头强化角色压迫感',
    usageRule: '适合权力感、压迫感或反派登场',
    shotTags: ['仰拍'],
    moodTags: ['压迫'],
    craftTags: ['镜头'],
    priority: 2,
  },
  {
    id: 'soft-backlight',
    title: '柔和逆光',
    category: '灯光',
    promptPhrase: '使用柔和逆光勾勒人物轮廓',
    sceneTags: ['室内'],
    moodTags: ['温柔'],
    craftTags: ['灯光'],
    priority: 5,
  },
  {
    id: 'dutch-angle',
    title: '倾斜构图',
    category: '构图',
    promptPhrase: '使用倾斜构图制造不安和失衡',
    moodTags: ['紧张'],
    craftTags: ['构图'],
    priority: 1,
  },
]

describe('cinema knowledge prompt enrichment', () => {
  it('selects knowledge by matched tags and priority', () => {
    const selected = selectKnowledgeForPrompt({
      candidates,
      context: {
        promptKind: 'image',
        shotTags: ['仰拍'],
        moodTags: ['压迫'],
        craftTags: ['镜头'],
      },
    })

    expect(selected.map((item) => item.id)).toEqual(['low-angle'])
    expect(selected[0].matchedTags).toEqual(['仰拍', '压迫', '镜头'])
  })

  it('honors force include and force exclude bindings', () => {
    const selected = selectKnowledgeForPrompt({
      candidates: [
        { ...candidates[0], bindingMode: 'force_exclude' },
        { ...candidates[1], bindingMode: 'force_include' },
      ],
      context: {
        promptKind: 'video',
        moodTags: ['压迫'],
      },
    })

    expect(selected.map((item) => item.id)).toEqual(['soft-backlight'])
  })

  it('does not inject a prompt phrase that already exists', () => {
    const selected = selectKnowledgeForPrompt({
      candidates,
      context: {
        promptKind: 'image',
        existingPrompt: '画面使用低角度镜头强化角色压迫感，背景阴暗',
        shotTags: ['仰拍'],
        moodTags: ['压迫'],
      },
    })

    expect(selected.some((item) => item.id === 'low-angle')).toBe(false)
  })

  it('formats a bounded knowledge block', () => {
    const selected = selectKnowledgeForPrompt({
      candidates,
      context: {
        promptKind: 'image',
        sceneTags: ['室内'],
        moodTags: ['温柔', '压迫'],
        craftTags: ['灯光', '镜头'],
      },
      maxItems: 2,
    })

    const block = formatKnowledgePromptBlock(selected, 'image', 80)
    expect(block).toContain('【影视专业知识约束】')
    expect(block).toContain('柔和逆光')
    expect(block.length).toBeLessThanOrEqual(130)
  })

  it('appends the knowledge block to the base prompt', () => {
    const result = enrichPromptWithKnowledge({
      basePrompt: '角色站在雨夜街头，神情紧张。',
      candidates,
      context: {
        promptKind: 'image',
        moodTags: ['紧张'],
        craftTags: ['构图'],
      },
    })

    expect(result.prompt).toContain('角色站在雨夜街头')
    expect(result.injectedText).toContain('倾斜构图')
    expect(result.selectedItems.map((item) => item.id)).toEqual(['dutch-angle'])
  })
})
