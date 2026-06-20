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

  it('submits CHARACTER_VOICE_RECOMMEND task with characterId in payload', async () => {
    const res = await POST(buildRequest({}) as never, ctx('p1', 'c1') as never)
    expect(res.status).toBe(200)
    expect(submitTask).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'p1',
      type: 'character_voice_recommend',
      payload: expect.objectContaining({ characterId: 'c1' }),
    }))
  })

  it('rejects when characterId is missing in route params', async () => {
    const res = await POST(buildRequest({}) as never, ctx('p1', '') as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(submitTask).not.toHaveBeenCalled()
  })
})
