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

export interface PanelGridImagePromptContext extends Record<string, unknown> {
  panel: Record<string, unknown>
  context: Record<string, unknown>
  grid_plan: {
    panelGridSize: number
    duration: number
    cells: Array<{
      cellIndex: number
      timeRange: string
      keyframe: string
    }>
  }
}

export interface PanelImagePromptContext extends Record<string, unknown> {
  panel: Record<string, unknown>
  context: Record<string, unknown>
  director_snapshot?: unknown
}

const STORAGE_STRING_LIMIT = 4_000
const GRID_CONTEXT_STORAGE_BYTE_LIMIT = 48_000

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

function compactGridCellForStorage(cell: unknown): Record<string, unknown> {
  const record = asRecord(cell)
  const cellIndex = typeof record.cellIndex === 'number' ? Math.floor(record.cellIndex) : 0
  const timeRange = pickText(record.timeRange)
  const shotType = pickText(record.shotType)
  const cameraMove = pickText(record.cameraMove)
  const description = pickText(record.description)
  const location = pickText(record.location)
  const action = pickText(record.action)
  const videoPrompt = [
    timeRange && cellIndex > 0 ? `${timeRange}（格 ${cellIndex}关键帧）` : '',
    shotType ? `镜头：${shotType}` : '',
    cameraMove ? `运镜：${cameraMove}` : '',
    location ? `场景：${location}` : '',
    description ? `画面：${description}` : '',
    action ? `动作：${action}` : '',
  ].filter(Boolean).join('；')

  return {
    ...(cellIndex > 0 ? { cellIndex } : {}),
    ...(timeRange ? { timeRange } : {}),
    ...(videoPrompt ? { videoPrompt } : {}),
    ...(action ? { action } : {}),
    ...(shotType ? { shotType } : {}),
    ...(cameraMove ? { cameraMove } : {}),
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
  }
}

function limitText(value: string, maxChars: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, maxChars)}…`
}

function buildCompactCharacterConsistencyLine(context: Record<string, unknown>): string {
  const characterConsistency = asRecord(asRecord(context.context).character_consistency)
  const characters = asArray(characterConsistency.characters)
    .map((item) => {
      const character = asRecord(item)
      const name = pickText(character.name)
      const appearance = pickText(character.resolvedAppearance) || pickText(character.requestedAppearance)
      const description = limitText(pickText(character.description), 180)
      if (!name && !appearance && !description) return ''
      return [
        name,
        appearance ? `外貌版本：${appearance}` : '',
        description ? `视觉特征：${description}` : '',
      ].filter(Boolean).join('，')
    })
    .filter(Boolean)
  return characters.length > 0 ? `角色一致性：${characters.join('；')}` : ''
}

function buildAggregateVideoPromptForStorage(
  context: Record<string, unknown>,
  gridCells: Record<string, unknown>[],
): string {
  const preImageGridPrompt = asRecord(context.preImageGridPrompt)
  const panel = asRecord(context.panel)
  const gridMetadata = asRecord(context.gridMetadata)
  const panelGridSize = typeof gridMetadata.panelGridSize === 'number'
    ? Math.floor(gridMetadata.panelGridSize)
    : gridCells.length
  const duration = typeof preImageGridPrompt.duration === 'number' && Number.isFinite(preImageGridPrompt.duration)
    ? Math.round(preImageGridPrompt.duration)
    : estimateDuration(panelGridSize || gridCells.length || 2)
  const baseVideoPrompt = pickText(preImageGridPrompt.baseVideoPrompt)
    || pickText(panel.video_prompt)
    || pickText(panel.description)
  const directorShotConstraintPrompt = buildDirectorShotConstraintPrompt(context)

  return [
    '电影级画质，高清锐利，细节清晰，4K 质感，专业电影摄影感，光影统一，动作连贯。',
    baseVideoPrompt,
    buildCompactCharacterConsistencyLine(context),
    directorShotConstraintPrompt,
    `将 ${panelGridSize} 个宫格作为同一连续镜头的关键帧序列处理，视频时长约 ${duration} 秒。成片必须是铺满全屏的单一连续镜头。`,
    '绝对不要出现宫格、分格、拼贴、分屏、边框、编号、字幕、水印或 UI 元素；宫格只代表时间顺序关键帧，不是视频画面形式。',
    '按以下时间段补全关键帧之间的中间动作、表情、口型、走位和运镜，使画面从第 1 格自然演变到最后 1 格。',
    ...gridCells.map((cell) => pickText(cell.videoPrompt)),
  ].filter(Boolean).join('\n')
}

function compactGridContextForStorage(context: Record<string, unknown>): Record<string, unknown> {
  const preImageGridPrompt = asRecord(context.preImageGridPrompt)
  const gridCells = asArray(preImageGridPrompt.gridCells).map(compactGridCellForStorage)
  const duration = typeof preImageGridPrompt.duration === 'number' && Number.isFinite(preImageGridPrompt.duration)
    ? Math.round(preImageGridPrompt.duration)
    : null

  return {
    source: context.source,
    gridMetadata: compactForStorage(context.gridMetadata),
    ...buildPanelImagePromptContext({ panelContext: context }),
    preImageGridPrompt: {
      imagePrompt: '[已省略宫格生图提示词，运行时视频链路不依赖该字段]',
      baseVideoPrompt: redactLargeStringForStorage(pickText(preImageGridPrompt.baseVideoPrompt)),
      aggregateVideoPrompt: buildAggregateVideoPromptForStorage(context, gridCells),
      ...(duration ? { duration } : {}),
      gridCells,
    },
  }
}

function stripContextForStorageFallback(context: Record<string, unknown>): Record<string, unknown> {
  const preImageGridPrompt = asRecord(context.preImageGridPrompt)
  const duration = typeof preImageGridPrompt.duration === 'number' && Number.isFinite(preImageGridPrompt.duration)
    ? Math.round(preImageGridPrompt.duration)
    : null

  return {
    source: context.source,
    gridMetadata: compactForStorage(context.gridMetadata),
    panel: {
      description: pickText(asRecord(context.panel).description),
      location: pickText(asRecord(context.panel).location),
      shot_type: pickText(asRecord(context.panel).shot_type),
      camera_move: pickText(asRecord(context.panel).camera_move),
    },
    preImageGridPrompt: {
      imagePrompt: '[已省略宫格生图提示词，运行时视频链路不依赖该字段]',
      baseVideoPrompt: redactLargeStringForStorage(pickText(preImageGridPrompt.baseVideoPrompt)),
      aggregateVideoPrompt: buildAggregateVideoPromptForStorage(context, asArray(preImageGridPrompt.gridCells).map(compactGridCellForStorage)),
      ...(duration ? { duration } : {}),
      gridCells: asArray(preImageGridPrompt.gridCells).map((cell) => {
        const record = compactGridCellForStorage(cell)
        return {
          cellIndex: record.cellIndex,
          timeRange: record.timeRange,
          videoPrompt: record.videoPrompt,
        }
      }),
    },
  }
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

function compactCharacterConsistency(panelContext: Record<string, unknown>): Record<string, unknown> | undefined {
  const context = asRecord(panelContext.context)
  const characterConsistency = asRecord(context.character_consistency)
  const characters = asArray(characterConsistency.characters)
    .map((item) => {
      const character = asRecord(item)
      const name = pickText(character.name)
      const appearance = pickText(character.resolvedAppearance) || pickText(character.requestedAppearance)
      const description = pickText(character.description)
      const forbiddenChanges = asArray(character.forbiddenChanges)
        .map(pickText)
        .filter(Boolean)
      if (!name && !appearance && !description && forbiddenChanges.length === 0) return null
      return {
        ...(name ? { name } : {}),
        ...(appearance ? { appearance } : {}),
        ...(description ? { visual_identity: description } : {}),
        ...(forbiddenChanges.length > 0 ? { forbidden_changes: forbiddenChanges } : {}),
      }
    })
    .filter((item): item is Record<string, unknown> => item !== null)

  return characters.length > 0
    ? {
        source: 'character_consistency_context',
        characters,
      }
    : undefined
}

function compactNeighborContinuity(panelContext: Record<string, unknown>): unknown[] | undefined {
  const context = asRecord(panelContext.context)
  const neighborPanels = asArray(context.neighbor_panels)
    .map((item) => {
      const neighbor = asRecord(item)
      const position = pickText(neighbor.position)
      const shotType = pickText(neighbor.shot_type)
      const cameraMove = pickText(neighbor.camera_move)
      if (!position && !shotType && !cameraMove) return null
      return {
        ...(position ? { position } : {}),
        ...(shotType ? { shot_type: shotType } : {}),
        ...(cameraMove ? { camera_move: cameraMove } : {}),
      }
    })
    .filter((item): item is Record<string, unknown> => item !== null)

  return neighborPanels.length > 0 ? neighborPanels : undefined
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

export function buildPanelGridImagePromptContext(params: {
  panelGridSize: number
  baseVideoPrompt: string
  shotType: string
  cameraMove: string
  panelContext: Record<string, unknown>
}): PanelGridImagePromptContext {
  const panelGridSize = normalizeGridSize(params.panelGridSize)
  const panelContext = asRecord(params.panelContext)
  const panel = asRecord(panelContext.panel)
  const description = pickText(panel.description) || params.baseVideoPrompt
  const location = pickText(panel.location)
  const shotType = params.shotType || pickText(panel.shot_type)
  const cameraMove = params.cameraMove || pickText(panel.camera_move)
  const layout = buildStoryboardGridLayout('grid_auto', panelGridSize)
  const duration = estimateDuration(panelGridSize)
  const imageContext = buildPanelImagePromptContext({ panelContext })

  return {
    ...imageContext,
    panel: {
      ...imageContext.panel,
      shot_type: shotType,
      camera_move: cameraMove,
      description,
      location,
    },
    grid_plan: {
      panelGridSize,
      duration,
      cells: Array.from({ length: layout.panelCount }, (_, index) => {
        const cellIndex = index + 1
        return {
          cellIndex,
          timeRange: buildTimeRange(cellIndex, layout.panelCount, duration),
          keyframe: buildCellAction(cellIndex, layout.panelCount, params.baseVideoPrompt || description),
        }
      }),
    },
  }
}

export function buildPanelImagePromptContext(params: {
  panelContext: Record<string, unknown>
}): PanelImagePromptContext {
  const panelContext = asRecord(params.panelContext)
  const panel = asRecord(panelContext.panel)
  const context = asRecord(panelContext.context)
  const compactConsistency = compactCharacterConsistency(panelContext)
  const compactNeighbors = compactNeighborContinuity(panelContext)
  const locationReference = context.location_reference ?? null

  return {
    panel: {
      image_prompt: pickText(panel.image_prompt),
      shot_type: pickText(panel.shot_type),
      camera_move: pickText(panel.camera_move),
      description: pickText(panel.description),
      location: pickText(panel.location),
      characters: panel.characters ?? [],
      source_text: pickText(panel.source_text),
      photography_rules: panel.photography_rules ?? null,
      acting_notes: panel.acting_notes ?? null,
      ...(panel.director_shot ? { director_shot: panel.director_shot } : {}),
    },
    context: {
      ...(compactConsistency ? { character_consistency: compactConsistency } : {}),
      ...(locationReference ? { location_reference: locationReference } : {}),
      ...(compactNeighbors ? {
        neighbor_panel_continuity: compactNeighbors,
        neighbor_panel_instruction: '仅用于镜头语言衔接，不要绘制相邻镜头的剧情内容。',
      } : {}),
    },
    ...(panelContext.director_snapshot ? { director_snapshot: panelContext.director_snapshot } : {}),
  }
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
  const compact = compactGridContextForStorage(context)
  const serialized = JSON.stringify(compact, null, 2)
  if (Buffer.byteLength(serialized, 'utf8') <= GRID_CONTEXT_STORAGE_BYTE_LIMIT) {
    return serialized
  }

  const fallback = JSON.stringify(stripContextForStorageFallback(context), null, 2)
  if (Buffer.byteLength(fallback, 'utf8') <= GRID_CONTEXT_STORAGE_BYTE_LIMIT) {
    return fallback
  }

  const preImageGridPrompt = asRecord(context.preImageGridPrompt)
  const duration = typeof preImageGridPrompt.duration === 'number' && Number.isFinite(preImageGridPrompt.duration)
    ? Math.round(preImageGridPrompt.duration)
    : null
  return JSON.stringify({
    source: context.source,
    gridMetadata: compactForStorage(context.gridMetadata),
    preImageGridPrompt: {
      imagePrompt: '[已省略宫格生图提示词，运行时视频链路不依赖该字段]',
      baseVideoPrompt: redactLargeStringForStorage(pickText(preImageGridPrompt.baseVideoPrompt)),
      aggregateVideoPrompt: buildAggregateVideoPromptForStorage(context, asArray(preImageGridPrompt.gridCells).map(compactGridCellForStorage)),
      ...(duration ? { duration } : {}),
    },
  }, null, 2)
}
