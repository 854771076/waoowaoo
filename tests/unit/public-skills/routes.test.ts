import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getSkillList } from '@/app/api/skills/route'
import { GET as getSkillDetail } from '@/app/api/skills/[skillId]/route'
import { GET as getSkillPrompt } from '@/app/api/skills/[skillId]/prompt/route'

describe('public skills API routes', () => {
  it('lists public skills and can select by intent', async () => {
    const response = await getSkillList(new NextRequest('http://localhost/api/skills?intent=创建一个工作流'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.version).toBe('1.0.0')
    expect(body.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'platform-workflow-creator',
        promptUrl: '/api/skills/platform-workflow-creator/prompt',
      }),
    ]))
    expect(body.selected).toMatchObject({
      id: 'platform-workflow-creator',
      detailUrl: '/api/skills/platform-workflow-creator',
    })
  })

  it('returns full public skill details', async () => {
    const response = await getSkillDetail(new Request('http://localhost/api/skills/platform-workflow-creator'), {
      params: Promise.resolve({ skillId: 'platform-workflow-creator' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.skill.manifest.id).toBe('platform-workflow-creator')
    expect(body.skill.systemPrompt).toContain('不要从零猜测不存在的节点')
    expect(body.skill.cliContract.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'workflow-dry-run' }),
    ]))
  })

  it('returns prompt directly for clients that only need skill instructions', async () => {
    const response = await getSkillPrompt(new Request('http://localhost/api/skills/platform-agent/prompt'), {
      params: Promise.resolve({ skillId: 'platform-agent' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.skillId).toBe('platform-agent')
    expect(body.prompt).toContain('平台 Skill 路由器')
  })

  it('returns 404 for unknown skills', async () => {
    const response = await getSkillDetail(new Request('http://localhost/api/skills/nope'), {
      params: Promise.resolve({ skillId: 'nope' }),
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.code).toBe('SKILL_NOT_FOUND')
  })
})
