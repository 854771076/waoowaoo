import { executeAiTextStep, executeAiVisionStep } from '@/lib/ai-runtime'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { buildPromptAsync, PROMPT_IDS } from '@/lib/prompt-i18n'
import { buildStoryboardGridLayout } from './grid'

function formatGridLayoutText(
  layout: ReturnType<typeof buildStoryboardGridLayout>,
  locale: 'zh' | 'en' = 'zh',
): string {
  const empty = layout.capacity - layout.panelCount
  if (locale === 'zh') {
    if (empty > 0) {
      return `${layout.columns} 列 × ${layout.rows} 行排列，实际 ${layout.panelCount} 格（末 ${empty} 格为空）`
    }
    return `${layout.columns} 列 × ${layout.rows} 行排列，共 ${layout.panelCount} 格`
  }
  if (empty > 0) {
    return `arranged as ${layout.columns} columns × ${layout.rows} rows, ${layout.panelCount} cells used (last ${empty} empty)`
  }
  return `${layout.columns} columns × ${layout.rows} rows, ${layout.panelCount} cells`
}

/**
 * 判断面板是否为宫格布局。
 * 兼容多种来源：imageLayout 字段、gridSize 参数等。
 */
export function isGridLayout(imageLayout: string | null | undefined): boolean {
  return imageLayout === 'grid'
}

export interface RewriteGridVideoPromptParams {
  basePrompt: string
  gridSize: number
  shotType: string
  cameraMove: string
  locale: 'zh' | 'en'
  projectId: string | null
  userId: string
  // Text path (fallback)
  model?: string
  panelContext?: Record<string, unknown> // legacy: for panels without gridGenerationContext
  // Vision path (preferred when available)
  visionModel?: string
  imageUrl?: string
  gridGenerationContextJson?: string // saved context from image generation time
}

/** 去掉 markdown 代码块包裹并 trim。 */
export function parseRewrittenPrompt(raw: string): string {
  const trimmed = (raw || '').trim()
  const fenced = trimmed.match(/^```[a-zA-Z]*\n?([\s\S]*?)\n?```$/)
  return (fenced ? fenced[1] : trimmed).trim()
}

/**
 * Normalize context for prompt template: prefer saved gridGenerationContextJson,
 * fall back to legacy panelContext assembly for older panels.
 */
function getStoryboardContextJson(
  gridGenerationContextJson: string | undefined,
  panelContext: Record<string, unknown> | undefined,
): string {
  if (gridGenerationContextJson) {
    return gridGenerationContextJson
  }
  // Legacy backward compat: assemble from individual fields
  return JSON.stringify(panelContext || {}, null, 2)
}

/**
 * 用 LLM 把宫格分镜理解为同一连续镜头的关键帧序列，按 Seedance 规范重写成一条视频提示词。
 *
 * 双路径：
 * - Vision 优先：当 visionModel + imageUrl 同时存在时，直接看宫格图重写（更精准）；任何失败回退文本路径。
 * - Text 兜底：仅基于上下文文本重写。
 *
 * 失败/空返回 null，调用方应回退到原 basePrompt。
 */
export async function rewriteGridVideoPrompt(
  params: RewriteGridVideoPromptParams,
): Promise<{ prompt: string; promptTokens: number; completionTokens: number } | null> {
  const {
    basePrompt,
    gridSize,
    shotType,
    cameraMove,
    locale,
    projectId,
    userId,
    model,
    panelContext,
    visionModel,
    imageUrl,
    gridGenerationContextJson,
  } = params
  if (gridSize <= 1) return null

  const textModel = model || visionModel
  // 没有任何可用模型则无法重写
  if (!textModel && !visionModel) return null

  const layout = buildStoryboardGridLayout('grid_auto', gridSize)
  const gridLayoutText = formatGridLayoutText(layout, locale)
  const promptCommonVariables = {
    storyboard_context_json: getStoryboardContextJson(gridGenerationContextJson, panelContext),
    base_prompt: basePrompt || '',
    grid_layout: gridLayoutText,
    panel_grid_size: String(gridSize),
    shot_type: shotType || (locale === 'zh' ? '中景' : 'medium shot'),
    camera_move: cameraMove || (locale === 'zh' ? '平滑连贯运镜' : 'smooth continuous camera move'),
  }

  // Vision path (preferred)
  if (visionModel && imageUrl) {
    try {
      const base64Image = await normalizeToBase64ForGeneration(imageUrl)
      const filledPrompt = await buildPromptAsync({
        promptId: PROMPT_IDS.NP_PANEL_GRID_VIDEO_VISION,
        locale,
        projectId,
        variables: promptCommonVariables,
      })

      const completion = await executeAiVisionStep({
        userId,
        model: visionModel,
        prompt: filledPrompt,
        imageUrls: [base64Image],
        temperature: 0.7,
        projectId: projectId || undefined,
        action: 'grid_video_prompt_rewrite',
        meta: {
          stepId: 'grid_video_prompt_rewrite',
          stepTitle: locale === 'zh' ? '宫格视频提示词重写（视觉）' : 'Grid video prompt rewrite (vision)',
          stepIndex: 1,
          stepTotal: 1,
        },
      })

      const prompt = parseRewrittenPrompt(completion.text || '')
      if (prompt) {
        return {
          prompt,
          promptTokens: completion.usage?.promptTokens || 0,
          completionTokens: completion.usage?.completionTokens || 0,
        }
      }
      // 视觉路径空返回，回退文本路径
    } catch (error) {
      if (typeof console !== 'undefined') {
        console.warn('[rewriteGridVideoPrompt] vision path failed, falling back to text path:', error)
      }
    }
  }

  // Text path (fallback)
  if (!textModel) return null
  try {
    const filledPrompt = await buildPromptAsync({
      promptId: PROMPT_IDS.NP_PANEL_GRID_VIDEO,
      locale,
      projectId,
      variables: promptCommonVariables,
    })

    const completion = await executeAiTextStep({
      userId,
      model: textModel,
      messages: [{ role: 'user', content: filledPrompt }],
      temperature: 0.7,
      projectId: projectId || undefined,
      action: 'grid_video_prompt_rewrite',
      meta: {
        stepId: 'grid_video_prompt_rewrite',
        stepTitle: locale === 'zh' ? '宫格视频提示词重写' : 'Grid video prompt rewrite',
        stepIndex: 1,
        stepTotal: 1,
      },
    })

    const prompt = parseRewrittenPrompt(completion.text || '')
    if (!prompt) return null
    return {
      prompt,
      promptTokens: completion.usage?.promptTokens || 0,
      completionTokens: completion.usage?.completionTokens || 0,
    }
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.warn('[rewriteGridVideoPrompt] failed, caller should fall back:', error)
    }
    return null
  }
}
