import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { applyCaptionsToProject } from '@/lib/twick/project-builder'
import type { CaptionVoiceLineSource } from '@/lib/twick/types'

const DEFAULT_VOICE_DURATION_SECONDS = 2
const MIN_BILLING_MINUTES = 0.01

export const CAPTION_NO_VOICE_LINES_ERROR = 'CAPTION_NO_VOICE_LINES'

type JsonRecord = Record<string, unknown>
type VoiceLineRecord = Awaited<ReturnType<typeof loadEpisodeVoiceLines>>[number]

function asJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function durationMsToSeconds(value: number | null | undefined, fallbackSeconds: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallbackSeconds
  return value / 1000
}

function parseCaptionPayload(job: Job<TaskJobData>) {
  const payload = asJsonRecord(job.data.payload) || {}
  const episodeId = readString(payload.episodeId) || readString(job.data.episodeId) || null
  const editorProjectId = readString(payload.editorProjectId)
    || (job.data.targetType === 'NovelPromotionEditorProject' ? readString(job.data.targetId) : null)

  if (!episodeId) throw new Error('episodeId is required')
  if (!editorProjectId) throw new Error('editorProjectId is required')

  return { episodeId, editorProjectId }
}

async function loadEditorProject(editorProjectId: string, episodeId: string) {
  return await prisma.novelPromotionEditorProject.findFirst({
    where: {
      id: editorProjectId,
      episodeId,
    },
    select: {
      id: true,
      projectData: true,
      version: true,
    },
  })
}

async function loadEpisodeVoiceLines(episodeId: string) {
  return await prisma.novelPromotionVoiceLine.findMany({
    where: { episodeId },
    select: {
      id: true,
      lineIndex: true,
      speaker: true,
      content: true,
      audioDuration: true,
      audioMediaId: true,
      audioMedia: {
        select: {
          id: true,
          durationMs: true,
        },
      },
    },
    orderBy: { lineIndex: 'asc' },
  })
}

function mapVoiceLinesToCaptionSources(voiceLines: VoiceLineRecord[]): CaptionVoiceLineSource[] {
  return voiceLines
    .map((line) => ({
      voiceLineId: line.id,
      duration: durationMsToSeconds(
        line.audioDuration,
        durationMsToSeconds(line.audioMedia?.durationMs, DEFAULT_VOICE_DURATION_SECONDS),
      ),
      text: line.content || '',
      speaker: line.speaker || undefined,
    }))
    .filter((line) => line.duration > 0)
}

export async function buildCaptionedProject(params: {
  currentProjectData: unknown
  voiceLines: VoiceLineRecord[]
}) {
  const captionSources = mapVoiceLinesToCaptionSources(params.voiceLines)
  const { projectData, captionCount, totalDurationSeconds } = applyCaptionsToProject(
    params.currentProjectData as Parameters<typeof applyCaptionsToProject>[0],
    captionSources,
  )

  return {
    projectData,
    captionCount,
    voiceLineCount: captionSources.length,
    totalDurationSeconds,
  }
}

export async function handleEditorCaptionTask(job: Job<TaskJobData>) {
  const { episodeId, editorProjectId } = parseCaptionPayload(job)

  await reportTaskProgress(job, 15, { stage: 'caption_load_voice_lines' })

  const editorProject = await loadEditorProject(editorProjectId, episodeId)
  if (!editorProject) throw new Error('EDITOR_PROJECT_NOT_FOUND')

  const voiceLines = await loadEpisodeVoiceLines(episodeId)

  await reportTaskProgress(job, 55, {
    stage: 'caption_build_track',
    voiceLineCount: voiceLines.length,
  })

  const { projectData, captionCount, voiceLineCount, totalDurationSeconds } = await buildCaptionedProject({
    currentProjectData: editorProject.projectData,
    voiceLines,
  })

  if (captionCount === 0) {
    throw new Error(CAPTION_NO_VOICE_LINES_ERROR)
  }

  await assertTaskActive(job, 'caption_persist_editor_project')
  await prisma.novelPromotionEditorProject.update({
    where: { id: editorProjectId },
    data: {
      projectData: projectData as unknown as object,
      version: { increment: 1 },
    },
  })

  const actualQuantity = Math.max(MIN_BILLING_MINUTES, totalDurationSeconds / 60)

  await reportTaskProgress(job, 90, {
    stage: 'caption_completed',
    captionCount,
    voiceLineCount,
    totalDurationSeconds,
    actualQuantity,
  })

  return {
    success: true,
    editorProjectId,
    episodeId,
    captionCount,
    voiceLineCount,
    totalDurationSeconds,
    actualQuantity,
  }
}
