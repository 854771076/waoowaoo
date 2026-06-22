import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { BILLING_ITEM } from '@/lib/billing/items'
import { createEditorAiRoute, readCaptionBillingMinutes } from '../_shared'

const CAPTION_NO_VOICE_LINES_ERROR = 'CAPTION_NO_VOICE_LINES'
const DEFAULT_VOICE_DURATION_SECONDS = 2
const MIN_BILLING_MINUTES = 0.01

function durationMsToSeconds(value: number | null | undefined, fallbackSeconds: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallbackSeconds
  return value / 1000
}

export const POST = createEditorAiRoute({
  taskType: TASK_TYPE.EDITOR_AI_CAPTION,
  action: 'caption',
  billingItem: BILLING_ITEM.EDITOR_CAPTION_GENERATE,
  billingQuantity: readCaptionBillingMinutes,
  beforeSubmit: async ({ episodeId }) => {
    const voiceLines = await prisma.novelPromotionVoiceLine.findMany({
      where: { episodeId },
      select: {
        content: true,
        audioDuration: true,
        audioMedia: {
          select: {
            durationMs: true,
          },
        },
      },
    })
    const usableVoiceLines = voiceLines.filter((line) => (
      typeof line.content === 'string' && line.content.trim().length > 0
    ))

    if (usableVoiceLines.length === 0) {
      throw new ApiError('INVALID_PARAMS', {
        message: CAPTION_NO_VOICE_LINES_ERROR,
      })
    }

    const totalDurationSeconds = usableVoiceLines.reduce((sum, line) => sum + durationMsToSeconds(
      line.audioDuration,
      durationMsToSeconds(line.audioMedia?.durationMs, DEFAULT_VOICE_DURATION_SECONDS),
    ), 0)

    return {
      body: {
        durationMinutes: Math.max(MIN_BILLING_MINUTES, totalDurationSeconds / 60),
      },
    }
  },
})
