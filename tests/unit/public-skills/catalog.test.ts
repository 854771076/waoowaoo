import { describe, expect, it } from 'vitest'
import {
  PUBLIC_SKILLS,
  getPublicSkill,
  getPublicSkillPrompt,
  listPublicSkillSummaries,
  selectPublicSkillForIntent,
} from '@/lib/public-skills'

describe('public skills catalog', () => {
  it('publishes stable official skills with prompts and CLI contracts', () => {
    expect(PUBLIC_SKILLS.map((skill) => skill.manifest.id)).toEqual([
      'platform-agent',
      'platform-workflow-creator',
      'platform-asset-pipeline',
      'platform-debugger',
      'platform-publisher',
    ])

    for (const skill of PUBLIC_SKILLS) {
      expect(skill.systemPrompt.length).toBeGreaterThan(30)
      expect(skill.cliContract.binary).toBe('platform')
      expect(skill.cliContract.requiredGlobalFlags).toContain('--json')
      expect(skill.manifest.entrypoints.length).toBeGreaterThan(0)
      expect(skill.schemas.length).toBeGreaterThan(0)
      expect(skill.examples.length).toBeGreaterThan(0)
    }
  })

  it('exposes summaries with detail and prompt URLs', () => {
    const summaries = listPublicSkillSummaries()

    expect(summaries).toHaveLength(PUBLIC_SKILLS.length)
    expect(summaries.find((skill) => skill.id === 'platform-workflow-creator')).toMatchObject({
      detailUrl: '/api/skills/platform-workflow-creator',
      promptUrl: '/api/skills/platform-workflow-creator/prompt',
    })
  })

  it('returns full skill and direct prompt without project context', () => {
    const skill = getPublicSkill('platform-workflow-creator')
    const prompt = getPublicSkillPrompt('platform-workflow-creator')

    expect(skill?.manifest.title).toBe('平台工作流创作')
    expect(prompt).toContain('平台工作流创作 Skill')
    expect(prompt).toContain('platform template list/get/explain')
  })

  it('routes user intent to concrete skills and falls back to router', () => {
    expect(selectPublicSkillForIntent('帮我创建一个商品图工作流')?.manifest.id).toBe('platform-workflow-creator')
    expect(selectPublicSkillForIntent('run_123 为什么失败了')?.manifest.id).toBe('platform-debugger')
    expect(selectPublicSkillForIntent('把这个流程发布到线上')?.manifest.id).toBe('platform-publisher')
    expect(selectPublicSkillForIntent('我想用平台做点东西')?.manifest.id).toBe('platform-agent')
  })
})
