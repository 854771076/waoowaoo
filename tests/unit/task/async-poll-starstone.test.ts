import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'starrouter',
    apiKey: 'starrouter-key',
  })),
)

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getUserModels: vi.fn(),
}))

vi.mock('@/lib/async-submit', () => ({
  queryFalStatus: vi.fn(),
}))

vi.mock('@/lib/async-task-utils', () => ({
  queryGeminiBatchStatus: vi.fn(),
  queryGoogleVideoStatus: vi.fn(),
  querySeedanceVideoStatus: vi.fn(),
}))

import { pollAsyncTask } from '@/lib/async-poll'

describe('async poll starstone task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('marks StarStone query network errors as transient', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await pollAsyncTask('STARSTONE:VIDEO:cgt-1', 'user-1')

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'starrouter')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://starrouter.io/volcengine/doubao/contents/generations/tasks/cgt-1',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer starrouter-key',
        },
      }),
    )
    expect(result).toEqual({
      status: 'failed',
      error: 'StarStone: fetch failed',
      transient: true,
    })
  })

  it('keeps provider task failures non-transient', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'FAILED',
        message: 'provider rejected task',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await pollAsyncTask('STARSTONE:VIDEO:cgt-failed', 'user-1')

    expect(result).toEqual({
      status: 'failed',
      error: 'StarStone: provider rejected task',
    })
  })
})
