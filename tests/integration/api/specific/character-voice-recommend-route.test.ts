import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

vi.mock('@/lib/api-auth', () => ({
  requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'u1' } } })),
  isErrorResponse: vi.fn(() => false),
}))
vi.mock('@/lib/task/submitter', () => ({
  submitTask: vi.fn(async () => ({ taskId: 't1', status: 'queued' })),
}))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({ analysisModel: 'ark::doubao-analysis' })),
}))

import { POST } from '@/app/api/novel-promotion/[projectId]/character/[characterId]/recommend-voice-instruct/route'
import { submitTask } from '@/lib/task/submitter'

function buildRequest(body: unknown) {
  return buildMockRequest({
    path: '/api/novel-promotion/p1/character/c1/recommend-voice-instruct',
    method: 'POST',
    body: body ?? {},
  })
}

function ctx(projectId: string, characterId: string) {
  return { params: Promise.resolve({ projectId, characterId }) }
}

describe('POST recommend-voice-instruct', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('submits CHARACTER_VOICE_RECOMMEND task with characterId and analysisModel for billing', async () => {
    const res = await POST(buildRequest({}) as never, ctx('p1', 'c1') as never)
    expect(res.status).toBe(200)
    expect(submitTask).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'p1',
      type: 'character_voice_recommend',
      payload: expect.objectContaining({
        characterId: 'c1',
        analysisModel: 'ark::doubao-analysis',
      }),
      billingInfo: expect.objectContaining({
        billable: true,
        apiType: 'text',
        model: 'ark::doubao-analysis',
      }),
    }))
  })

  it('rejects when characterId is missing in route params', async () => {
    const res = await POST(buildRequest({}) as never, ctx('p1', '') as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(submitTask).not.toHaveBeenCalled()
  })
})
