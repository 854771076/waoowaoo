import { rewriteGridVideoPrompt } from '@/lib/storyboard-images/grid-video-prompt'

export interface ResolveGridVideoPromptParams {
  basePrompt: string
  panelContext: Record<string, unknown>
  gridSize: number
  shotType: string
  cameraMove: string
  locale: 'zh' | 'en'
  projectId: string | null
  userId: string
  model: string
  alreadyRewritten: boolean
}

export interface ResolveGridVideoPromptResult {
  prompt: string
  rewritten: boolean
  usage: { promptTokens: number; completionTokens: number } | null
}

/**
 * 决定宫格视频提示词：已重写过则复用 basePrompt（缓存命中）；否则调 LLM 重写，失败回退 basePrompt。
 */
export async function resolveGridVideoPrompt(
  params: ResolveGridVideoPromptParams,
): Promise<ResolveGridVideoPromptResult> {
  if (params.alreadyRewritten) {
    return { prompt: params.basePrompt, rewritten: false, usage: null }
  }
  const result = await rewriteGridVideoPrompt({
    panelContext: params.panelContext,
    basePrompt: params.basePrompt,
    gridSize: params.gridSize,
    shotType: params.shotType,
    cameraMove: params.cameraMove,
    locale: params.locale,
    projectId: params.projectId,
    userId: params.userId,
    model: params.model,
  })
  if (!result) {
    return { prompt: params.basePrompt, rewritten: false, usage: null }
  }
  return {
    prompt: result.prompt,
    rewritten: true,
    usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
  }
}
