import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { createScopedLogger } from '@/lib/logging/core'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import {
  assertTaskActive,
  resolveImageSourceFromGeneration,
  uploadImageSourceToCos,
} from '@/lib/workers/utils'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { buildPromptAsync, PROMPT_IDS } from '@/lib/prompt-i18n'
import { executeAiTextStep } from '@/lib/ai-runtime'

const logger = createScopedLogger({ module: 'worker.project-cover' })

export type CoverRatio = '1:1' | '16:9' | '9:16'
const VALID_RATIOS: CoverRatio[] = ['1:1', '16:9', '9:16']

export function normalizeRatio(value: unknown): CoverRatio {
  if (typeof value === 'string' && (VALID_RATIOS as string[]).includes(value)) {
    return value as CoverRatio
  }
  return '1:1'
}

interface CoverContext {
  projectId: string
  projectName: string
  description: string
  artStylePrompt: string | null
  artStyleId: string | null
  charactersSummary: string | null
  locationsSummary: string | null
  storySummary: string | null
  ratio: CoverRatio
  imageModel: string | null
  characterModel: string | null
  locationModel: string | null
  storyboardModel: string | null
  analysisModel: string | null
  imageResolution: string | null
}

async function collectProjectContext(
  projectId: string,
  ratio: CoverRatio,
): Promise<CoverContext> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      novelPromotionData: {
        include: {
          artStyleRef: true,
          characters: {
            take: 3,
            orderBy: { createdAt: 'asc' },
            include: {
              appearances: {
                where: { appearanceIndex: 0 },
                take: 1,
                orderBy: { appearanceIndex: 'asc' },
              },
            },
          },
          locations: {
            take: 3,
            orderBy: { createdAt: 'asc' },
          },
          episodes: {
            take: 1,
            orderBy: { episodeNumber: 'asc' },
          },
        },
      },
    },
  })

  if (!project) throw new Error(`Project not found: ${projectId}`)
  const np = project.novelPromotionData
  if (!np) throw new Error(`NovelPromotionProject not found for project: ${projectId}`)

  const charactersSummary = np.characters.length
    ? np.characters
        .map((c) => {
          const desc = c.appearances?.[0]?.description || ''
          return `- ${c.name}${desc ? `: ${desc}` : ''}`
        })
        .join('\n')
    : null

  const locationsSummary = np.locations.length
    ? np.locations.map((l) => `- ${l.name}${l.summary ? `: ${l.summary}` : ''}`).join('\n')
    : null

  const storySummary = np.episodes[0]?.novelText
    ? np.episodes[0].novelText.slice(0, 500)
    : null

  const artStylePrompt = np.artStylePrompt || np.artStyleRef?.prompt || null

  return {
    projectId,
    projectName: project.name,
    description: project.description || '',
    artStylePrompt,
    artStyleId: np.artStyleId,
    charactersSummary,
    locationsSummary,
    storySummary,
    ratio,
    imageModel: np.imageModel || null,
    characterModel: np.characterModel || null,
    locationModel: np.locationModel || null,
    storyboardModel: np.storyboardModel || null,
    analysisModel: np.analysisModel || null,
    imageResolution: np.imageResolution || null,
  }
}

export interface CoverPromptPlan {
  imagePrompt: string
  negativePrompt: string
}

export function buildFallbackPrompt(ctx: CoverContext): CoverPromptPlan {
  const core = [ctx.projectName, ctx.description].filter(Boolean).join(' ')
  return {
    imagePrompt: `${core}, novel cover poster style, high quality illustration, beautiful composition, cinematic lighting, no text`,
    negativePrompt: 'text, watermark, logo, signature, low quality, blurry, deformed, ugly',
  }
}

async function buildCoverPromptViaLLM(
  job: Job<TaskJobData>,
  ctx: CoverContext,
): Promise<CoverPromptPlan> {
  if (!ctx.analysisModel) {
    logger.warn({ message: 'analysisModel not configured, using fallback prompt', projectId: ctx.projectId })
    return buildFallbackPrompt(ctx)
  }

  let renderedTemplate: string
  try {
    renderedTemplate = await buildPromptAsync({
      promptId: PROMPT_IDS.NP_PROJECT_COVER_GENERATION,
      locale: job.data.locale,
      projectId: ctx.projectId,
      variables: {
        ratio: ctx.ratio,
        project_name: ctx.projectName,
        description: ctx.description || '（无）',
        art_style_prompt: ctx.artStylePrompt || '（无）',
        characters_summary: ctx.charactersSummary || '（无）',
        locations_summary: ctx.locationsSummary || '（无）',
        story_summary: ctx.storySummary || '（无）',
      },
    })
  } catch (error) {
    logger.warn({ message: 'buildPromptAsync failed, fallback', details: { error: String(error) } })
    return buildFallbackPrompt(ctx)
  }

  await assertTaskActive(job, 'project_cover_llm')
  await reportTaskProgress(job, 15, { stage: 'llm_prompt' })

  try {
    const result = await executeAiTextStep({
      userId: job.data.userId,
      model: ctx.analysisModel,
      projectId: ctx.projectId,
      action: 'project_cover_prompt',
      meta: {
        stepId: 'project_cover_prompt',
        stepTitle: '封面提示词生成',
        stepIndex: 1,
        stepTotal: 1,
      },
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that outputs only valid JSON with no markdown wrapping, no code fences, and no prose. Respond in the language the prompt asks for.',
        },
        { role: 'user', content: renderedTemplate },
      ],
      temperature: 0.7,
    })

    const raw = result.text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const sceneConcept = typeof parsed.sceneConcept === 'string' ? parsed.sceneConcept.trim() : ''
    const styleGuide = typeof parsed.styleGuide === 'string' ? parsed.styleGuide.trim() : ''
    const composition = typeof parsed.composition === 'string' ? parsed.composition.trim() : ''
    const mood = typeof parsed.mood === 'string' ? parsed.mood.trim() : ''
    const negativePrompt = typeof parsed.negativePrompt === 'string' ? parsed.negativePrompt.trim() : ''

    if (!styleGuide && !sceneConcept) {
      logger.warn({ message: 'LLM returned empty prompt fields, fallback' })
      return buildFallbackPrompt(ctx)
    }

    const imagePrompt = [styleGuide, sceneConcept, composition, mood].filter(Boolean).join(', ')
    return {
      imagePrompt,
      negativePrompt: negativePrompt || 'text, watermark, logo, low quality, blurry, deformed',
    }
  } catch (error) {
    logger.warn({ message: 'LLM call/JSON parse failed, fallback', details: { error: String(error) } })
    return buildFallbackPrompt(ctx)
  }
}

export async function handleProjectCoverImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId
  const ratio = normalizeRatio(payload.ratio)

  await reportTaskProgress(job, 5, { stage: 'collect_context', ratio })
  await assertTaskActive(job, 'collect_context')
  const ctx = await collectProjectContext(projectId, ratio)

  const hasContent = !!(ctx.description || ctx.charactersSummary || ctx.storySummary)
  if (!hasContent) {
    throw new Error('Project has no description or content to generate a cover from')
  }

  await reportTaskProgress(job, 10, { stage: 'build_prompt' })
  const { imagePrompt, negativePrompt } = await buildCoverPromptViaLLM(job, ctx)

  const resolvedImageModel =
    ctx.imageModel || ctx.storyboardModel || ctx.characterModel || ctx.locationModel
  if (!resolvedImageModel) {
    throw new Error('No image model configured for project cover')
  }

  await assertTaskActive(job, 'generate_image')
  await reportTaskProgress(job, 30, { stage: 'generate_image', model: resolvedImageModel })

  const finalPrompt = negativePrompt
    ? `${imagePrompt}. Negative prompt: ${negativePrompt}`
    : imagePrompt

  const imageUrl = await resolveImageSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: resolvedImageModel,
    prompt: finalPrompt,
    options: {
      aspectRatio: ratio,
      ...(ctx.imageResolution ? { resolution: ctx.imageResolution } : {}),
    },
    pollProgress: { start: 30, end: 85 },
  })

  await assertTaskActive(job, 'upload')
  await reportTaskProgress(job, 90, { stage: 'upload' })

  const storageKey = await uploadImageSourceToCos(imageUrl, 'project-cover', projectId)
  const mediaRef = await ensureMediaObjectFromStorageKey(storageKey, { mimeType: 'image/jpeg' })

  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { coverMediaId: mediaRef.id },
    }),
    prisma.novelPromotionProject.update({
      where: { projectId },
      data: { coverImageRatio: ratio },
    }),
  ])

  await reportTaskProgress(job, 100, { stage: 'completed', mediaId: mediaRef.id })
  logger.info({ message: 'project cover generated', projectId, details: { mediaId: mediaRef.id, ratio } })

  return {
    projectId,
    mediaId: mediaRef.id,
    ratio,
  }
}
