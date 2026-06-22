import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({ audioModel: '' })),
  },
  novelPromotionProject: {
    findUnique: vi.fn<() => Promise<{
      id: string
      audioModel: string | null
      characters: Array<{ name: string; customVoiceUrl: string | null; voiceId: string | null; voiceType: string | null }>
    } | null>>(async () => ({
      id: 'np-1',
      audioModel: null,
      characters: [
        // 角色绑定 OmniVoice 设计音色
        { name: 'Narrator', customVoiceUrl: null, voiceId: 'ov-profile-1', voiceType: 'omnivoice-design' },
      ],
    })),
  },
  novelPromotionEpisode: {
    findFirst: vi.fn(async () => ({
      id: 'episode-1',
      speakerVoices: '{}',
    })),
  },
  novelPromotionVoiceLine: {
    findFirst: vi.fn(async () => ({
      id: 'line-1',
      speaker: 'Narrator',
      content: 'hello world',
    })),
    findMany: vi.fn(async () => []),
  },
}))

const submitTaskMock = vi.hoisted(() => vi.fn<typeof import('@/lib/task/submitter').submitTask>(async () => ({
  success: true,
  async: true,
  taskId: 'task-1',
  runId: null,
  status: 'queued',
  deduped: false,
})))

const apiConfigMock = vi.hoisted(() => ({
  resolveModelSelectionOrSingle: vi.fn(async (_userId: string, model: string | null | undefined) => ({
    provider: model?.split('::')[0] || 'fal',
    modelId: model?.split('::')[1] || 'fal-ai/index-tts-2/text-to-speech',
    modelKey: model || 'fal::fal-ai/index-tts-2/text-to-speech',
    mediaType: 'audio',
  })),
  getProviderKey: vi.fn((providerId: string) => (providerId.includes('::') ? providerId.split('::')[0] : providerId)),
  getModelsByType: vi.fn(async () => [] as Array<{ provider: string; modelKey: string }>),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/api-config', () => apiConfigMock)
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))
vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))
vi.mock('@/lib/task/has-output', () => ({
  hasVoiceLineAudioOutput: vi.fn(async () => false),
}))

function getSubmittedAudioModel(): string | undefined {
  const submitCall = submitTaskMock.mock.calls[0] as [{ payload?: Record<string, unknown> }] | undefined
  return submitCall?.[0]?.payload?.audioModel as string | undefined
}

describe('api specific - voice generate engine follows voice provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('auto mode: omnivoice-bound character resolves to omnivoice TTS model, ignoring project/preference defaults', async () => {
    // 即使 project/preference 默认是百炼，自动模式也应跟随角色音色 provider（omnivoice）
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-1',
      audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
      characters: [
        { name: 'Narrator', customVoiceUrl: null, voiceId: 'ov-profile-1', voiceType: 'omnivoice-design' },
      ],
    })

    const mod = await import('@/app/api/novel-promotion/[projectId]/voice-generate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/voice-generate',
      method: 'POST',
      body: { episodeId: 'episode-1', lineId: 'line-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    // 全局引擎解析在自动模式下不应被调用
    expect(apiConfigMock.resolveModelSelectionOrSingle).not.toHaveBeenCalled()
    expect(getSubmittedAudioModel()).toBe('omnivoice::omnivoice-tts-v1')
  })

  it('auto mode: bailian-bound character resolves to bailian TTS model', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-1',
      audioModel: null,
      characters: [
        { name: 'Narrator', customVoiceUrl: null, voiceId: 'qwen-voice-1', voiceType: 'qwen-designed' },
      ],
    })

    const mod = await import('@/app/api/novel-promotion/[projectId]/voice-generate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/voice-generate',
      method: 'POST',
      body: { episodeId: 'episode-1', lineId: 'line-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(getSubmittedAudioModel()).toBe('bailian::qwen3-tts-vd-2026-01-26')
  })

  it('explicit request audioModel overrides voice provider and forces the chosen engine', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/voice-generate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/voice-generate',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        lineId: 'line-1',
        audioModel: 'omnivoice::omnivoice-tts-v1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(apiConfigMock.resolveModelSelectionOrSingle).toHaveBeenCalledWith(
      'user-1',
      'omnivoice::omnivoice-tts-v1',
      'audio',
    )
    expect(getSubmittedAudioModel()).toBe('omnivoice::omnivoice-tts-v1')
  })

  it('auto mode: fal-bound character resolves to user-configured fal audio model', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-1',
      audioModel: null,
      characters: [
        { name: 'Narrator', customVoiceUrl: 'https://voice.example/narrator.wav', voiceId: null, voiceType: 'uploaded' },
      ],
    })
    apiConfigMock.getModelsByType.mockResolvedValueOnce([
      { provider: 'fal', modelKey: 'fal::fal-ai/index-tts-2/text-to-speech' },
    ])

    const mod = await import('@/app/api/novel-promotion/[projectId]/voice-generate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/voice-generate',
      method: 'POST',
      body: { episodeId: 'episode-1', lineId: 'line-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(getSubmittedAudioModel()).toBe('fal::fal-ai/index-tts-2/text-to-speech')
  })

  it('auto mode: returns INVALID_PARAMS when the speaker has no voice binding', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-1',
      audioModel: null,
      characters: [
        { name: 'Narrator', customVoiceUrl: null, voiceId: null, voiceType: null },
      ],
    })

    const mod = await import('@/app/api/novel-promotion/[projectId]/voice-generate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/voice-generate',
      method: 'POST',
      body: { episodeId: 'episode-1', lineId: 'line-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(400)
    expect(submitTaskMock).not.toHaveBeenCalled()
  })
})
