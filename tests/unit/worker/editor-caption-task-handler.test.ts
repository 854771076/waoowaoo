import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { withTaskLifecycle } from '@/lib/workers/shared'

const prismaMock = vi.hoisted(() => ({
  novelPromotionEditorProject: {
    findFirst: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  novelPromotionVoiceLine: {
    findMany: vi.fn(),
  },
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
  withTaskLifecycle: vi.fn(async (_job: unknown, handler: () => Promise<unknown>) => handler()),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: workerMock.reportTaskProgress,
  withTaskLifecycle: workerMock.withTaskLifecycle,
}))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))

import { buildCaptionedProject, handleEditorCaptionTask } from '@/lib/workers/handlers/editor-caption-task-handler'

function buildJob(payload: Record<string, unknown> = {}): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-caption-1',
      type: TASK_TYPE.EDITOR_AI_CAPTION,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionEditorProject',
      targetId: 'editor-project-1',
      payload: {
        episodeId: 'episode-1',
        editorProjectId: 'editor-project-1',
        ...payload,
      },
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function buildVoiceLines() {
  return [
    {
      id: 'voice-1',
      lineIndex: 0,
      speaker: 'A',
      content: 'hello',
      audioDuration: 4200,
      audioMediaId: 'audio-media-1',
      audioMedia: { id: 'audio-media-1', durationMs: 4200 },
    },
    {
      id: 'voice-2',
      lineIndex: 1,
      speaker: 'B',
      content: 'world',
      audioDuration: null,
      audioMediaId: null,
      audioMedia: { id: 'audio-media-2', durationMs: 2800 },
    },
  ]
}

describe('editor caption worker handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionEditorProject.findFirst.mockResolvedValue({
      id: 'editor-project-1',
      version: 3,
      projectData: {
        version: 1,
        metadata: {
          title: 'Existing editor project',
          custom: { width: 1080, height: 1920, fps: 24, duration: 8 },
        },
        tracks: [
          {
            id: 'track-video-main',
            name: '视频',
            type: 'video',
            elements: [
              { id: 'video-1', type: 'video', s: 0, e: 7, props: { src: 'mediaobj://video-media-1' } },
            ],
          },
          {
            id: 'track-captions',
            name: '旧字幕',
            type: 'caption',
            elements: [
              { id: 'old-caption', type: 'caption', t: 'old', s: 0, e: 1, props: {} },
            ],
          },
        ],
      },
    })
    prismaMock.novelPromotionVoiceLine.findMany.mockResolvedValue(buildVoiceLines())
  })

  it('buildCaptionedProject adds a new caption track while preserving existing non-caption tracks', async () => {
    const result = await buildCaptionedProject({
      currentProjectData: {
        version: 1,
        metadata: { custom: { width: 1080, height: 1920, fps: 24, duration: 10 } },
        tracks: [
          { id: 'track-video-main', name: '视频', type: 'video', elements: [{ id: 'v1', type: 'video', s: 0, e: 10, props: {} }] },
          { id: 'track-captions', name: '旧字幕', type: 'caption', elements: [{ id: 'old', type: 'caption', t: 'old', s: 0, e: 1, props: {} }] },
        ],
      },
      voiceLines: buildVoiceLines(),
    })

    expect(result.captionCount).toBe(2)
    expect(result.voiceLineCount).toBe(2)
    expect(result.totalDurationSeconds).toBe(7)
    expect(result.projectData.tracks.filter((track) => track.type === 'caption')).toHaveLength(1)
    expect(result.projectData.tracks.find((track) => track.type === 'video')?.elements).toHaveLength(1)
    const captionTrack = result.projectData.tracks.find((track) => track.type === 'caption')
    expect(captionTrack?.elements.map((element) => [element.t, element.s, element.e])).toEqual([
      ['hello', 0, 4.2],
      ['world', 4.2, 7],
    ])
  })

  it('updates editor project data, increments version, and settles billing using caption minutes', async () => {
    const result = await handleEditorCaptionTask(buildJob())

    expect(prismaMock.novelPromotionVoiceLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { episodeId: 'episode-1' },
      orderBy: { lineIndex: 'asc' },
    }))
    expect(workerMock.assertTaskActive).toHaveBeenCalledWith(expect.anything(), 'caption_persist_editor_project')
    expect(prismaMock.novelPromotionEditorProject.update).toHaveBeenCalledWith({
      where: { id: 'editor-project-1' },
      data: {
        projectData: expect.objectContaining({ tracks: expect.any(Array) }),
        version: { increment: 1 },
      },
    })
    expect(result).toEqual(expect.objectContaining({
      success: true,
      editorProjectId: 'editor-project-1',
      episodeId: 'episode-1',
      captionCount: 2,
      voiceLineCount: 2,
      totalDurationSeconds: 7,
      actualQuantity: 7 / 60,
    }))
  })

  it('throws when no usable voice-line text exists and does not overwrite projectData', async () => {
    prismaMock.novelPromotionVoiceLine.findMany.mockResolvedValueOnce([
      {
        id: 'voice-empty',
        lineIndex: 0,
        speaker: 'A',
        content: '   ',
        audioDuration: 2000,
        audioMediaId: null,
        audioMedia: null,
      },
    ])

    await expect(handleEditorCaptionTask(buildJob())).rejects.toThrow('CAPTION_NO_VOICE_LINES')
    expect(workerMock.assertTaskActive).not.toHaveBeenCalled()
    expect(prismaMock.novelPromotionEditorProject.update).not.toHaveBeenCalled()
  })

  it('propagates empty-caption failures through withTaskLifecycle so billing rollback path runs', async () => {
    prismaMock.novelPromotionVoiceLine.findMany.mockResolvedValueOnce([])

    await expect(withTaskLifecycle(buildJob(), () => handleEditorCaptionTask(buildJob()))).rejects.toThrow('CAPTION_NO_VOICE_LINES')
    expect(workerMock.withTaskLifecycle).toHaveBeenCalled()
    expect(prismaMock.novelPromotionEditorProject.update).not.toHaveBeenCalled()
  })

  it('throws explicit error when editor project does not belong to the episode', async () => {
    prismaMock.novelPromotionEditorProject.findFirst.mockResolvedValueOnce(null)

    await expect(handleEditorCaptionTask(buildJob())).rejects.toThrow('EDITOR_PROJECT_NOT_FOUND')
    expect(prismaMock.novelPromotionEditorProject.update).not.toHaveBeenCalled()
  })
})
