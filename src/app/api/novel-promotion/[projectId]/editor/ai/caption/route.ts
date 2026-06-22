import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { BILLING_ITEM } from '@/lib/billing/items'
import { createEditorAiRoute, readCaptionBillingMinutes } from '../_shared'

const CAPTION_NO_VOICE_LINES_ERROR = 'CAPTION_NO_VOICE_LINES'

export const POST = createEditorAiRoute({
  taskType: TASK_TYPE.EDITOR_AI_CAPTION,
  action: 'caption',
  billingItem: BILLING_ITEM.EDITOR_CAPTION_GENERATE,
  billingQuantity: readCaptionBillingMinutes,
  beforeSubmit: async ({ episodeId }) => {
    const voiceLines = await prisma.novelPromotionVoiceLine.findMany({
      where: { episodeId },
      select: { content: true },
    })
    const hasCaptionText = voiceLines.some((line) => line.content.trim().length > 0)

    if (!hasCaptionText) {
      throw new ApiError('INVALID_PARAMS', {
        message: CAPTION_NO_VOICE_LINES_ERROR,
      })
    }
  },
})
