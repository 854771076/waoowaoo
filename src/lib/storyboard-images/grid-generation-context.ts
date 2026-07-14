import { buildStoryboardGridLayout } from './grid'
import { buildDirectorShotConstraintPrompt } from './director-shot-constraints'

export interface PreImageGridCellPrompt {
  cellIndex: number
  timeRange: string
  imagePrompt: string
  videoPrompt: string
  shotType: string
  cameraMove: string
  description: string
  location: string
  characters: unknown
  action: string
}

export interface PreImageGridGenerationContext extends Record<string, unknown> {
  source: 'pre_image_grid_prompt'
  gridMetadata: {
    panelGridSize: number
    generatedAt: string
  }
  preImageGridPrompt: {
    imagePrompt: string
    baseVideoPrompt: string
    aggregateVideoPrompt: string
    duration: number
    gridCells: PreImageGridCellPrompt[]
  }
}

const STORAGE_STRING_LIMIT = 4_000

function redactLargeStringForStorage(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('data:')) {
    return `[已省略 data-url，原始长度 ${value.length}]`
  }
  const withoutEmbeddedDataUrls = value.replace(
    /data:[^"'\s,]+(?:,[A-Za-z0-9+/=_-]+)/g,
    (match) => `[已省略 data-url，原始长度 ${match.length}]`,
  )
  if (withoutEmbeddedDataUrls.length <= STORAGE_STRING_LIMIT) return withoutEmbeddedDataUrls
  return `${withoutEmbeddedDataUrls.slice(0, STORAGE_STRING_LIMIT)}\n[已截断，原始长度 ${withoutEmbeddedDataUrls.length}]`
}

function compactForStorage(value: unknown): unknown {
  if (typeof value === 'string') return redactLargeStringForStorage(value)
  if (Array.isArray(value)) return value.map(compactForStorage)
  if (!value || typeof value !== 'object') return value

  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(input)) {
    if (key === 'imagePrompt' && typeof child === 'string') {
      // 生图提示词可能包含完整上下文 JSON；落库只需要可追踪摘要，视频重写依赖 aggregateVideoPrompt。
      output[key] = child.length <= STORAGE_STRING_LIMIT
        ? redactLargeStringForStorage(child)
        : `[已省略完整宫格生图提示词，原始长度 ${child.length}]`
      continue
    }
    output[key] = compactForStorage(child)
  }
  return output
}

interface BuildPreImageGridGenerationContextParams {
  panelGridSize: number
  imagePrompt: string
  baseVideoPrompt: string
  shotType: string
  cameraMove: string
  panelContext: Record<string, unknown>
  generatedAt?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeGridSize(value: number): number {
  return Math.max(2, Math.min(16, Number.isFinite(value) ? Math.floor(value) : 2))
}

function estimateDuration(panelGridSize: number): number {
  return Math.max(3, Math.min(panelGridSize, 15))
}

function buildTimeRange(index: number, panelGridSize: number, duration: number): string {
  const start = Math.floor(((index - 1) * duration) / panelGridSize)
  const end = index === panelGridSize
    ? duration
    : Math.max(start + 1, Math.floor((index * duration) / panelGridSize))
  return `${start}-${end}秒`
}

function buildCellAction(index: number, panelGridSize: number, baseVideoPrompt: string): string {
  const trimmed = baseVideoPrompt.trim()
  if (panelGridSize <= 1) return trimmed
  if (index === 1) return trimmed ? `起始关键帧：${trimmed}` : '起始关键帧：建立人物、场景和动作方向'
  if (index === panelGridSize) return trimmed ? `收束关键帧：延续并完成“${trimmed}”` : '收束关键帧：完成动作并保持镜头连续'
  return trimmed ? `过渡关键帧 ${index}：承接“${trimmed}”的中段动作` : `过渡关键帧 ${index}：保持动作和机位连续`
}

function buildCharacterConsistencyPrompt(panelContext: Record<string, unknown>): string {
  const context = asRecord(panelContext.context)
  const characterConsistency = asRecord(context.character_consistency)
  const characters = asArray(characterConsistency.characters)
  const lines = characters
    .map((item) => {
      const character = asRecord(item)
      const consistencyPrompt = pickText(character.consistencyPrompt)
      const forbiddenChanges = asArray(character.forbiddenChanges)
        .map(pickText)
        .filter(Boolean)
      if (!consistencyPrompt && forbiddenChanges.length === 0) return ''
      return [consistencyPrompt, ...forbiddenChanges].filter(Boolean).join('；')
    })
    .filter(Boolean)

  return lines.length > 0 ? `角色一致性：${lines.join('；')}` : ''
}

function formatCellVideoPrompt(cell: PreImageGridCellPrompt): string {
  return [
    `${cell.timeRange}（格 ${cell.cellIndex}关键帧）`,
    cell.shotType ? `镜头：${cell.shotType}` : '',
    cell.cameraMove ? `运镜：${cell.cameraMove}` : '',
    cell.location ? `场景：${cell.location}` : '',
    cell.description ? `画面：${cell.description}` : '',
    cell.action ? `动作：${cell.action}` : '',
  ].filter(Boolean).join('；')
}

export function buildPreImageGridGenerationContext(
  params: BuildPreImageGridGenerationContextParams,
): PreImageGridGenerationContext {
  const panelGridSize = normalizeGridSize(params.panelGridSize)
  const panelContext = asRecord(params.panelContext)
  const panel = asRecord(panelContext.panel)
  const description = pickText(panel.description) || params.baseVideoPrompt || params.imagePrompt
  const location = pickText(panel.location)
  const characters = panel.characters ?? []
  const shotType = params.shotType || pickText(panel.shot_type)
  const cameraMove = params.cameraMove || pickText(panel.camera_move)
  const characterConsistencyPrompt = buildCharacterConsistencyPrompt(panelContext)
  const directorShotConstraintPrompt = buildDirectorShotConstraintPrompt(panelContext)
  const layout = buildStoryboardGridLayout('grid_auto', panelGridSize)
  const duration = estimateDuration(panelGridSize)

  const gridCells = Array.from({ length: layout.panelCount }, (_, index) => {
    const cellIndex = index + 1
    const action = buildCellAction(cellIndex, layout.panelCount, params.baseVideoPrompt)
    const timeRange = buildTimeRange(cellIndex, layout.panelCount, duration)
    const imagePrompt = [
      `宫格 ${cellIndex}/${layout.panelCount}`,
      description,
      location ? `场景：${location}` : '',
      shotType ? `镜头：${shotType}` : '',
      cameraMove ? `运镜：${cameraMove}` : '',
      characterConsistencyPrompt,
      directorShotConstraintPrompt,
      action,
    ].filter(Boolean).join('，')

    const cell: PreImageGridCellPrompt = {
      cellIndex,
      timeRange,
      imagePrompt,
      videoPrompt: '',
      shotType,
      cameraMove,
      description,
      location,
      characters,
      action,
    }
    cell.videoPrompt = [
      formatCellVideoPrompt(cell),
      characterConsistencyPrompt,
      directorShotConstraintPrompt,
    ].filter(Boolean).join('；')
    return cell
  })

  const aggregateVideoPrompt = [
    '电影级画质，高清锐利，细节清晰，4K 质感，专业电影摄影感，光影统一，动作连贯。',
    params.baseVideoPrompt || description,
    characterConsistencyPrompt,
    directorShotConstraintPrompt,
    `将 ${panelGridSize} 个宫格作为同一连续镜头的关键帧序列处理，视频时长约 ${duration} 秒。成片必须是铺满全屏的单一连续镜头。`,
    '绝对不要出现宫格、分格、拼贴、分屏、边框、编号、字幕、水印或 UI 元素；宫格只代表时间顺序关键帧，不是视频画面形式。',
    '按以下时间段补全关键帧之间的中间动作、表情、口型、走位和运镜，使画面从第 1 格自然演变到最后 1 格。',
    ...gridCells.map(formatCellVideoPrompt),
  ].filter(Boolean).join('\n')

  return {
    ...panelContext,
    source: 'pre_image_grid_prompt',
    gridMetadata: {
      ...asRecord(panelContext.gridMetadata),
      panelGridSize,
      generatedAt: params.generatedAt || new Date().toISOString(),
    },
    preImageGridPrompt: {
      imagePrompt: params.imagePrompt,
      baseVideoPrompt: params.baseVideoPrompt,
      aggregateVideoPrompt,
      duration,
      gridCells,
    },
  }
}

export function extractPreImageGridVideoPrompt(
  gridGenerationContextJson: string | null | undefined,
): { prompt: string; duration: number | null } | null {
  if (!gridGenerationContextJson) return null
  try {
    const parsed = JSON.parse(gridGenerationContextJson)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    if (record.source !== 'pre_image_grid_prompt') return null
    const preImageGridPrompt = asRecord(record.preImageGridPrompt)
    const prompt = pickText(preImageGridPrompt.aggregateVideoPrompt)
    if (!prompt) return null
    const duration = typeof preImageGridPrompt.duration === 'number' && Number.isFinite(preImageGridPrompt.duration)
      ? Math.round(preImageGridPrompt.duration)
      : null
    return { prompt, duration }
  } catch {
    return null
  }
}

export function hasPreImageGridPromptContext(gridGenerationContextJson: string | null | undefined): boolean {
  return extractPreImageGridVideoPrompt(gridGenerationContextJson) !== null
}

export function serializeGridGenerationContextForStorage(context: Record<string, unknown>): string {
  return JSON.stringify(compactForStorage(context), null, 2)
}
