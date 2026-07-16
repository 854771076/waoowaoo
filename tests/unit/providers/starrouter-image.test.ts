import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateStarRouterImage } from '@/lib/providers/starrouter/image'

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'test-starrouter-key' })),
}))

const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lF6c6QAAAABJRU5ErkJggg=='

describe('generateStarRouterImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes edit submit network failures to a stable error code', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await expect(generateStarRouterImage({
      userId: 'user-1',
      prompt: '高清化当前宫格画面',
      referenceImages: [ONE_PIXEL_PNG_DATA_URL],
      options: {
        provider: 'starrouter',
        modelId: 'gpt-image-2',
        modelKey: 'starrouter::gpt-image-2',
        size: '1024x1024',
      },
    })).rejects.toThrow('STARSTONE_IMAGE_SUBMIT_NETWORK_ERROR: fetch failed')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://starrouter.io/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-starrouter-key',
        },
      }),
    )
  })
})
