import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getProjectModelConfig } from '@/lib/config-service'
import type { TaskJobData } from '@/lib/task/types'
import { enhanceGridSplitImagesForPanel } from '@/lib/storyboard-images/grid-split-service'
import { resolveNovelData } from './image-task-handler-shared'
import { reportTaskProgress } from '../shared'

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null
}

export async function handleGridSplitEnhanceTask(job: Job<TaskJobData>) {
  const payload = job.data.payload || {}
  const panelId = job.data.targetId
  const panelGridSize = readNumber(payload.panelGridSize) || readNumber(payload.gridSize) || 4
  const cellIndex = readNumber(payload.cellIndex)

  await reportTaskProgress(job, 10, { stage: 'enhance_grid_split', cellIndex: cellIndex || null })

  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      id: panelId,
      storyboard: { episode: { novelPromotionProject: { projectId: job.data.projectId } } },
    },
    select: {
      id: true,
      imageUrl: true,
      imageLayout: true,
      gridGenerationContext: true,
      characters: true,
      location: true,
      sketchImageUrl: true,
      directorShots: {
        include: {
          imageMedia: { select: { storageKey: true } },
        },
      },
    },
  })
  if (!panel) throw new Error('GRID_SPLIT_ENHANCE_PANEL_NOT_FOUND')
  if (panel.imageLayout !== 'grid') throw new Error('GRID_SPLIT_ENHANCE_PANEL_NOT_GRID')

  const projectData = await resolveNovelData(job.data.projectId)
  const modelConfig = await getProjectModelConfig(job.data.projectId, job.data.userId)
  const imageModel = modelConfig.editModel || modelConfig.storyboardModel
  if (!imageModel) throw new Error('GRID_SPLIT_ENHANCE_MODEL_NOT_CONFIGURED')

  const result = await enhanceGridSplitImagesForPanel({
    panel: {
      ...panel,
      directorShotUrls: panel.directorShots
        .map((shot) => shot.imageMedia?.storageKey || null)
        .filter((url): url is string => !!url),
    },
    projectData,
    panelGridSize,
    userId: job.data.userId,
    modelId: imageModel,
    projectId: job.data.projectId,
    locale: job.data.locale,
    cellIndex,
    onProgress: async ({ completed, total, cellIndex: currentCellIndex }) => {
      const progress = 15 + Math.floor((completed / Math.max(total, 1)) * 75)
      await reportTaskProgress(job, progress, {
        stage: 'enhance_grid_split',
        cellIndex: currentCellIndex,
        completed,
        total,
      })
    },
  })

  await reportTaskProgress(job, 96, {
    stage: 'persist_grid_split_enhance',
    enhancedCount: result.enhancedCount,
  })

  return {
    panelId,
    enhancedCount: result.enhancedCount,
    cellIndex: cellIndex || null,
  }
}
