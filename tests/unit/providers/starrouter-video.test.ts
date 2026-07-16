import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateStarRouterVideo } from '@/lib/providers/starrouter/video'
import { getSignedObjectUrl } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'test-starrouter-key' })),
}))

vi.mock('@/lib/storage', () => ({
  getSignedObjectUrl: vi.fn(async (key: string, ttl: number) => `https://oss.example/${key}?expires=${ttl}`),
}))

vi.mock('@/lib/media/service', () => ({
  resolveStorageKeyFromMediaValue: vi.fn(async (value: unknown) => {
    if (value === '/m/media-1') return 'images/from-media.jpg'
    return null
  }),
}))

describe('generateStarRouterVideo', () => {
  const getSignedObjectUrlMock = vi.mocked(getSignedObjectUrl)
  const resolveStorageKeyFromMediaValueMock = vi.mocked(resolveStorageKeyFromMediaValue)

  beforeEach(() => {
    vi.restoreAllMocks()
    getSignedObjectUrlMock.mockImplementation(async (key: string, ttl?: number) => `https://oss.example/${key}?expires=${ttl ?? 3600}`)
    resolveStorageKeyFromMediaValueMock.mockImplementation(async (value: unknown) => {
      if (value === '/m/media-1') return 'images/from-media.jpg'
      return null
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ task_id: 'task-123' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
  })

  it('passes duration as a top-level StarRouter video field', async () => {
    await generateStarRouterVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: 'single continuous story',
      options: {
        provider: 'starrouter',
        modelId: 'dreamina-seedance-2-0-fast-260128',
        modelKey: 'starrouter::dreamina-seedance-2-0-fast-260128',
        duration: 12,
        resolution: '720p',
      },
    })

    const fetchMock = vi.mocked(fetch)
    const request = fetchMock.mock.calls[0]?.[1]
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>

    expect(body.duration).toBe(12)
    expect(body.model).toBe('dreamina-seedance-2-0-fast-260128')
  })

  it('preserves StarRouter metadata extension fields in the request body', async () => {
    await generateStarRouterVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: 'single continuous story',
      options: {
        provider: 'starrouter',
        modelId: 'dreamina-seedance-2-0-fast-260128',
        modelKey: 'starrouter::dreamina-seedance-2-0-fast-260128',
        duration: 8,
        metadata: {
          negative_prompt: 'split screen, comic panels',
          style: 'cinematic',
          quality_level: 'high',
        },
      },
    })

    const fetchMock = vi.mocked(fetch)
    const request = fetchMock.mock.calls[0]?.[1]
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>

    expect(body.metadata).toEqual({
      negative_prompt: 'split screen, comic panels',
      style: 'cinematic',
      quality_level: 'high',
    })
  })

  it('builds content array with text and image_url for Volcengine Doubao API', async () => {
    await generateStarRouterVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: 'a cat running',
      options: {
        provider: 'starrouter',
        modelId: 'dreamina-seedance-2-0-fast-260128',
        modelKey: 'starrouter::dreamina-seedance-2-0-fast-260128',
        duration: 5,
        resolution: '1080p',
        aspectRatio: '16:9',
      },
    })

    const fetchMock = vi.mocked(fetch)
    const request = fetchMock.mock.calls[0]?.[1]
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>

    // Verify new Volcengine Doubao API structure
    expect(body.watermark).toBe(false)
    expect(body.resolution).toBe('1080p')
    expect(body.ratio).toBe('16:9')
    expect(Array.isArray(body.content)).toBe(true)

    const content = body.content as Array<Record<string, unknown>>
    expect(content.length).toBe(2)

    // Text content
    const textItem = content.find(c => c.type === 'text')
    expect(textItem).toBeDefined()
    expect(textItem?.text).toBe('a cat running')

    // Image content
    const imageItem = content.find(c => c.type === 'image_url')
    expect(imageItem).toBeDefined()
    expect(imageItem?.image_url).toEqual({ url: 'https://example.com/frame.png' })
    expect(imageItem?.role).toBe('first_frame')

    // Verify endpoint changed to the new Volcengine Doubao API
    const endpoint = fetchMock.mock.calls[0]?.[0] as string
    expect(endpoint).toBe('https://starrouter.io/volcengine/doubao/contents/generations/tasks')
  })

  it('uses reference_image role for every image when multiple images are submitted', async () => {
    await generateStarRouterVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: 'a cat running',
      options: {
        provider: 'starrouter',
        modelId: 'dreamina-seedance-2-0-fast-260128',
        modelKey: 'starrouter::dreamina-seedance-2-0-fast-260128',
        duration: 5,
        videoReferenceImages: [
          'https://example.com/frame.png',
          'https://example.com/character.png',
        ],
      },
    })

    const fetchMock = vi.mocked(fetch)
    const request = fetchMock.mock.calls[0]?.[1]
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>
    const imageItems = (body.content as Array<Record<string, unknown>>).filter(c => c.type === 'image_url')

    expect(imageItems).toHaveLength(2)
    expect(imageItems.map((item) => item.role)).toEqual(['reference_image', 'reference_image'])
    expect(imageItems[0]?.image_url).toEqual({ url: 'https://example.com/frame.png' })
    expect(imageItems[1]?.image_url).toEqual({ url: 'https://example.com/character.png' })
  })

  it('converts internal media routes to public signed object urls before submitting', async () => {
    await generateStarRouterVideo({
      userId: 'user-1',
      imageUrl: '/api/storage/sign?key=images%2Fframe.png&expires=3600',
      prompt: 'a cat running',
      options: {
        provider: 'starrouter',
        modelId: 'dreamina-seedance-2-0-fast-260128',
        modelKey: 'starrouter::dreamina-seedance-2-0-fast-260128',
        duration: 5,
        videoReferenceImages: [
          '/api/storage/sign?key=images%2Fframe.png&expires=3600',
          '/m/media-1',
          'images/character.png',
        ],
      },
    })

    const fetchMock = vi.mocked(fetch)
    const request = fetchMock.mock.calls[0]?.[1]
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>
    const imageItems = (body.content as Array<Record<string, unknown>>).filter(c => c.type === 'image_url')

    expect(imageItems.map((item) => item.image_url)).toEqual([
      { url: 'https://oss.example/images/frame.png?expires=3600' },
      { url: 'https://oss.example/images/from-media.jpg?expires=3600' },
      { url: 'https://oss.example/images/character.png?expires=3600' },
    ])
  })

  it('rejects internal-only signed urls before submitting to StarRouter', async () => {
    getSignedObjectUrlMock.mockResolvedValue('/api/files/images%2Fframe.png')

    await expect(generateStarRouterVideo({
      userId: 'user-1',
      imageUrl: '/api/storage/sign?key=images%2Fframe.png&expires=3600',
      prompt: 'a cat running',
      options: {
        provider: 'starrouter',
        modelId: 'dreamina-seedance-2-0-fast-260128',
        modelKey: 'starrouter::dreamina-seedance-2-0-fast-260128',
        duration: 5,
      },
    })).rejects.toThrow('STARSTONE_VIDEO_IMAGE_URL_PUBLIC_REQUIRED')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects data url image inputs before submitting to StarRouter', async () => {
    await expect(generateStarRouterVideo({
      userId: 'user-1',
      imageUrl: 'data:image/png;base64,AAAA',
      prompt: 'a cat running',
      options: {
        provider: 'starrouter',
        modelId: 'dreamina-seedance-2-0-fast-260128',
        modelKey: 'starrouter::dreamina-seedance-2-0-fast-260128',
        duration: 5,
      },
    })).rejects.toThrow('STARSTONE_VIDEO_IMAGE_URL_FETCHABLE_REQUIRED')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects data url video reference images before submitting to StarRouter', async () => {
    await expect(generateStarRouterVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: 'a cat running',
      options: {
        provider: 'starrouter',
        modelId: 'dreamina-seedance-2-0-fast-260128',
        modelKey: 'starrouter::dreamina-seedance-2-0-fast-260128',
        duration: 5,
        videoReferenceImages: ['data:image/png;base64,AAAA'],
      },
    })).rejects.toThrow('STARSTONE_VIDEO_IMAGE_URL_FETCHABLE_REQUIRED')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('passes Volcengine official video fields through at the top level', async () => {
    await generateStarRouterVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: 'a cat running',
      options: {
        provider: 'starrouter',
        modelId: 'dreamina-seedance-2-0-fast-260128',
        modelKey: 'starrouter::dreamina-seedance-2-0-fast-260128',
        ratio: '9:16',
        duration: 5,
        seed: 12345,
        watermark: false,
        generate_audio: true,
        camerafixed: false,
      },
    })

    const fetchMock = vi.mocked(fetch)
    const request = fetchMock.mock.calls[0]?.[1]
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>

    expect(body.ratio).toBe('9:16')
    expect(body.duration).toBe(5)
    expect(body.seed).toBe(12345)
    expect(body.watermark).toBe(false)
    expect(body.generate_audio).toBe(true)
    expect(body.camerafixed).toBe(false)
  })
})
