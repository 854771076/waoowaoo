import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { defaultLocale, type Locale } from '@/i18n/routing'
import { ApiError } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'
import { calculateEditorRenderBillingMinutes, calculateTwickTimelineDurationSeconds } from '@/lib/twick/caption-duration'
import {
  buildDefaultShortDramaCanvas,
  type DefaultCanvasNodeDraft,
  type ShortDramaFlowFacts,
} from './default-flow'
import type {
  ProductionCanvasActionResult,
  ProductionCanvasDTO,
  ProductionCanvasNodeData,
  ProductionCanvasSaveInput,
  ProductionCanvasSnapshotDTO,
  ProductionCanvasViewport,
} from './types'
import {
  shortDramaNodeTemplates,
  shortDramaWorkflowTemplate,
  toNodeTemplateUpsertData,
  toWorkflowTemplateUpsertData,
} from './templates'

type CanvasWithGraph = Prisma.ProductionCanvasGetPayload<{
  include: {
    nodes: true
    edges: true
  }
}>

type SnapshotRow = Prisma.ProductionCanvasSnapshotGetPayload<Record<string, never>>

type CanvasTaskResult = Awaited<ReturnType<typeof submitTask>>

const MIN_EDITOR_RENDER_BILLING_MINUTES = 0.01
const ACTIVE_TASK_STATUSES = [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toViewport(value: Prisma.JsonValue | null): ProductionCanvasViewport | null {
  if (!isRecord(value)) return null
  const x = typeof value.x === 'number' ? value.x : null
  const y = typeof value.y === 'number' ? value.y : null
  const zoom = typeof value.zoom === 'number' ? value.zoom : null
  if (x === null || y === null || zoom === null) return null
  return { x, y, zoom }
}

function toSettings(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function toNodeData(value: Prisma.JsonValue | null): ProductionCanvasNodeData {
  if (isRecord(value)) return value as unknown as ProductionCanvasNodeData
  return {
    category: 'project',
    summary: '',
    metrics: [],
    actions: [],
  }
}

function serializeSnapshot(snapshot: SnapshotRow): ProductionCanvasSnapshotDTO {
  return {
    id: snapshot.id,
    canvasId: snapshot.canvasId,
    version: snapshot.version,
    reason: snapshot.reason,
    createdBy: snapshot.createdBy,
    createdAt: snapshot.createdAt.toISOString(),
  }
}

function serializeCanvas(canvas: CanvasWithGraph): ProductionCanvasDTO {
  const nodes = [...canvas.nodes].sort((a, b) => a.x - b.x || a.y - b.y || a.createdAt.getTime() - b.createdAt.getTime())
  const edges = [...canvas.edges].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  return {
    id: canvas.id,
    projectId: canvas.projectId,
    userId: canvas.userId,
    title: canvas.title,
    description: canvas.description,
    status: canvas.status,
    version: canvas.version,
    viewport: toViewport(canvas.viewport),
    settings: toSettings(canvas.settings),
    nodes: nodes.map((node) => ({
      id: node.id,
      nodeKey: node.nodeKey,
      kind: node.kind as ProductionCanvasDTO['nodes'][number]['kind'],
      templateKey: node.templateKey,
      title: node.title,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      refType: node.refType,
      refId: node.refId,
      data: toNodeData(node.data),
      status: node.status as ProductionCanvasDTO['nodes'][number]['status'],
      errorCode: node.errorCode,
      errorMessage: node.errorMessage,
      locked: node.locked,
      collapsed: node.collapsed,
      version: node.version,
      updatedAt: node.updatedAt.toISOString(),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      edgeKey: edge.edgeKey,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      kind: edge.kind,
      label: edge.label,
      data: toSettings(edge.data),
    })),
    createdAt: canvas.createdAt.toISOString(),
    updatedAt: canvas.updatedAt.toISOString(),
  }
}

function pickActiveEpisode<T extends { id: string; episodeNumber: number }>(
  episodes: T[],
  lastEpisodeId?: string | null,
): T | null {
  if (lastEpisodeId) {
    const matched = episodes.find((episode) => episode.id === lastEpisodeId)
    if (matched) return matched
  }
  return [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)[0] || null
}

async function loadShortDramaFacts(projectId: string): Promise<ShortDramaFlowFacts> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      novelPromotionData: {
        select: {
          id: true,
          lastEpisodeId: true,
          characters: {
            select: {
              id: true,
              profileConfirmed: true,
            },
          },
          locations: {
            select: {
              id: true,
              selectedImageId: true,
            },
          },
          episodes: {
            orderBy: { episodeNumber: 'asc' },
            select: {
              id: true,
              episodeNumber: true,
              name: true,
              novelText: true,
              audioUrl: true,
              audioMediaId: true,
              srtContent: true,
              clips: {
                select: { id: true },
              },
              storyboards: {
                select: {
                  id: true,
                  panels: {
                    select: {
                      id: true,
                      imageUrl: true,
                      imageMediaId: true,
                      videoUrl: true,
                      videoMediaId: true,
                    },
                  },
                },
              },
              twickEditorProject: {
                select: {
                  id: true,
                  renderStatus: true,
                  renderOutputMediaObjectId: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!project) {
    throw new Error('Project not found')
  }

  const novelProject = project.novelPromotionData
  const activeEpisode = novelProject ? pickActiveEpisode(novelProject.episodes, novelProject.lastEpisodeId) : null
  const storyboards = activeEpisode?.storyboards || []
  const panels = storyboards.flatMap((storyboard) => storyboard.panels)
  const editorProject = activeEpisode?.twickEditorProject || null
  const activeTasks = await prisma.task.findMany({
    where: {
      projectId,
      status: { in: ACTIVE_TASK_STATUSES },
      type: {
        in: [
          TASK_TYPE.EPISODE_SPLIT_LLM,
          TASK_TYPE.STORY_TO_SCRIPT_RUN,
          TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
          TASK_TYPE.EDITOR_RENDER,
        ],
      },
    },
    select: {
      type: true,
      targetType: true,
      targetId: true,
      episodeId: true,
    },
  })

  const hasActiveTask = (type: string, targetType: string, targetId: string | null | undefined) => {
    if (!targetId) return false
    return activeTasks.some((task) => task.type === type && task.targetType === targetType && task.targetId === targetId)
  }

  return {
    projectId: project.id,
    projectName: project.name,
    novelPromotionProjectId: novelProject?.id || null,
    activeEpisodeId: activeEpisode?.id || null,
    activeEpisodeName: activeEpisode?.name || null,
    episodeCount: novelProject?.episodes.length || 0,
    characterCount: novelProject?.characters.length || 0,
    confirmedCharacterCount: novelProject?.characters.filter((character) => character.profileConfirmed).length || 0,
    locationCount: novelProject?.locations.length || 0,
    selectedLocationImageCount: novelProject?.locations.filter((location) => !!location.selectedImageId).length || 0,
    clipCount: activeEpisode?.clips.length || 0,
    storyboardCount: storyboards.length,
    panelCount: panels.length,
    panelImageCount: panels.filter((panel) => !!panel.imageMediaId || !!panel.imageUrl).length,
    panelVideoCount: panels.filter((panel) => !!panel.videoMediaId || !!panel.videoUrl).length,
    hasSourceText: !!activeEpisode?.novelText?.trim(),
    hasVoice: !!activeEpisode?.audioMediaId || !!activeEpisode?.audioUrl || !!activeEpisode?.srtContent?.trim(),
    editorProjectId: editorProject?.id || null,
    editorRenderStatus: editorProject?.renderStatus || null,
    editorRenderOutputMediaObjectId: editorProject?.renderOutputMediaObjectId || null,
    isEpisodeSplitRunning: activeTasks.some((task) => task.type === TASK_TYPE.EPISODE_SPLIT_LLM),
    isScriptRunning: hasActiveTask(TASK_TYPE.STORY_TO_SCRIPT_RUN, 'NovelPromotionEpisode', activeEpisode?.id),
    isStoryboardRunning: hasActiveTask(TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN, 'NovelPromotionEpisode', activeEpisode?.id),
    isEditorRenderRunning: hasActiveTask(TASK_TYPE.EDITOR_RENDER, 'NovelPromotionEditorProject', editorProject?.id),
  }
}

async function loadActionContext(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      novelPromotionData: {
        select: {
          id: true,
          lastEpisodeId: true,
          episodes: {
            orderBy: { episodeNumber: 'asc' },
            select: {
              id: true,
              episodeNumber: true,
              novelText: true,
              twickEditorProject: {
                select: {
                  id: true,
                  projectData: true,
                  renderStatus: true,
                  renderTaskId: true,
                },
              },
            },
          },
        },
      },
    },
  })
  if (!project?.novelPromotionData) {
    throw new ApiError('NOT_FOUND', { message: 'Novel promotion data not found' })
  }

  const activeEpisode = pickActiveEpisode(project.novelPromotionData.episodes, project.novelPromotionData.lastEpisodeId)
  if (!activeEpisode) {
    throw new ApiError('INVALID_PARAMS', { message: 'No episode available for this canvas action' })
  }

  return {
    novelPromotionProjectId: project.novelPromotionData.id,
    episode: activeEpisode,
    editorProject: activeEpisode.twickEditorProject,
  }
}

function requireContent(content: string | null | undefined, message: string): string {
  const normalized = content?.trim() || ''
  if (!normalized) {
    throw new ApiError('INVALID_PARAMS', { message })
  }
  return normalized
}

function toCanvasTaskResult(result: CanvasTaskResult) {
  return {
    taskId: result.taskId,
    runId: result.runId,
    status: result.status,
    deduped: result.deduped,
  }
}

async function submitCanvasTaskForAction(params: {
  projectId: string
  userId: string
  locale?: Locale
  nodeKey: string
  actionKey: string
}): Promise<CanvasTaskResult | null> {
  const locale = params.locale || defaultLocale
  const context = await loadActionContext(params.projectId)

  if (params.nodeKey === 'episode-split' && params.actionKey === 'split') {
    const content = requireContent(context.episode.novelText, '需要先在当前集填写可分集的原文')
    if (content.length < 100) {
      throw new ApiError('INVALID_PARAMS', { message: '分集原文至少需要 100 个字符' })
    }
    return await submitTask({
      userId: params.userId,
      locale,
      projectId: params.projectId,
      episodeId: context.episode.id,
      type: TASK_TYPE.EPISODE_SPLIT_LLM,
      targetType: 'NovelPromotionProject',
      targetId: params.projectId,
      payload: {
        content,
        route: 'production-canvas',
        meta: {
          route: 'production-canvas',
          nodeKey: params.nodeKey,
          actionKey: params.actionKey,
        },
      },
      dedupeKey: `canvas_episode_split:${params.projectId}:${content.length}`,
      priority: 2,
    })
  }

  if (params.nodeKey === 'script' && params.actionKey === 'generate') {
    const content = requireContent(context.episode.novelText, '需要先在当前集填写原文')
    return await submitTask({
      userId: params.userId,
      locale,
      projectId: params.projectId,
      episodeId: context.episode.id,
      type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
      targetType: 'NovelPromotionEpisode',
      targetId: context.episode.id,
      payload: {
        episodeId: context.episode.id,
        content,
        displayMode: 'detail',
        route: 'production-canvas',
        meta: {
          route: 'production-canvas',
          nodeKey: params.nodeKey,
          actionKey: params.actionKey,
        },
      },
      priority: 2,
    })
  }

  if (params.nodeKey === 'storyboard' && params.actionKey === 'generate') {
    return await submitTask({
      userId: params.userId,
      locale,
      projectId: params.projectId,
      episodeId: context.episode.id,
      type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      targetType: 'NovelPromotionEpisode',
      targetId: context.episode.id,
      payload: {
        episodeId: context.episode.id,
        displayMode: 'detail',
        route: 'production-canvas',
        meta: {
          route: 'production-canvas',
          nodeKey: params.nodeKey,
          actionKey: params.actionKey,
        },
      },
      priority: 2,
    })
  }

  if (params.nodeKey === 'export' && params.actionKey === 'render') {
    const editorProject = context.editorProject
    if (!editorProject) {
      throw new ApiError('INVALID_PARAMS', { message: '需要先创建时间线项目' })
    }
    if (editorProject.renderStatus === 'PROCESSING') {
      throw new ApiError('CONFLICT', {
        message: 'Editor render task already in progress',
        taskId: editorProject.renderTaskId,
      })
    }

    const durationSeconds = calculateTwickTimelineDurationSeconds(editorProject.projectData)
    const durationMinutes = calculateEditorRenderBillingMinutes(editorProject.projectData, MIN_EDITOR_RENDER_BILLING_MINUTES)
    const settings = {
      width: 720,
      height: 1280,
      fps: 30,
      format: 'mp4',
      quality: 'high',
    }
    const result = await submitTask({
      userId: params.userId,
      locale,
      projectId: params.projectId,
      episodeId: context.episode.id,
      type: TASK_TYPE.EDITOR_RENDER,
      targetType: 'NovelPromotionEditorProject',
      targetId: editorProject.id,
      payload: {
        episodeId: context.episode.id,
        editorProjectId: editorProject.id,
        settings,
        durationSeconds,
        durationMinutes,
        quantity: durationMinutes,
        route: 'production-canvas',
        meta: {
          route: 'production-canvas',
          nodeKey: params.nodeKey,
          actionKey: params.actionKey,
        },
      },
      dedupeKey: `canvas_editor_render:${editorProject.id}`,
      priority: 1,
    })

    await prisma.novelPromotionEditorProject.update({
      where: { id: editorProject.id },
      data: {
        renderStatus: 'PROCESSING',
        renderTaskId: result.taskId,
        renderSettings: settings,
      },
    })
    return result
  }

  return null
}

async function createDefaultCanvas(projectId: string, userId: string): Promise<CanvasWithGraph> {
  const facts = await loadShortDramaFacts(projectId)
  const flow = buildDefaultShortDramaCanvas(facts)

  return await prisma.$transaction(async (tx) => {
    const canvas = await tx.productionCanvas.create({
      data: {
        projectId,
        userId,
        title: '短剧生产画布',
        description: '节点化的新生产链路；只引用现有短剧数据，不影响老流程。',
        viewport: { x: 40, y: 40, zoom: 0.72 },
        settings: {
          workflowType: 'short-drama',
          templateKey: 'short-drama.default.v1',
        },
      },
    })

    const createdNodes = new Map<string, string>()
    for (const draft of flow.nodes) {
      const created = await tx.productionCanvasNode.create({
        data: toNodeCreateInput(canvas.id, draft),
        select: { id: true, nodeKey: true },
      })
      createdNodes.set(created.nodeKey, created.id)
    }

    for (const draft of flow.edges) {
      const sourceNodeId = createdNodes.get(draft.sourceNodeKey)
      const targetNodeId = createdNodes.get(draft.targetNodeKey)
      if (!sourceNodeId || !targetNodeId) continue
      await tx.productionCanvasEdge.create({
        data: {
          canvasId: canvas.id,
          edgeKey: draft.edgeKey,
          sourceNodeId,
          targetNodeId,
          kind: draft.kind,
          label: draft.label || null,
        },
      })
    }

    return await tx.productionCanvas.findUniqueOrThrow({
      where: { id: canvas.id },
      include: {
        nodes: true,
        edges: true,
      },
    })
  })
}

function toNodeCreateInput(canvasId: string, draft: DefaultCanvasNodeDraft): Prisma.ProductionCanvasNodeUncheckedCreateInput {
  return {
    canvasId,
    nodeKey: draft.nodeKey,
    kind: draft.kind,
    templateKey: draft.templateKey,
    title: draft.title,
    x: draft.x,
    y: draft.y,
    width: draft.width,
    height: draft.height,
    refType: draft.refType,
    refId: draft.refId,
    status: draft.status,
    data: draft.data as unknown as Prisma.InputJsonValue,
  }
}

async function loadOwnedCanvas(params: {
  projectId: string
  userId: string
  canvasId: string
}): Promise<CanvasWithGraph> {
  return await prisma.productionCanvas.findFirstOrThrow({
    where: {
      id: params.canvasId,
      projectId: params.projectId,
      userId: params.userId,
      status: 'active',
    },
    include: {
      nodes: true,
      edges: true,
    },
  })
}

function buildSnapshotPayload(canvas: CanvasWithGraph): Prisma.InputJsonValue {
  return {
    canvas: {
      id: canvas.id,
      projectId: canvas.projectId,
      userId: canvas.userId,
      title: canvas.title,
      description: canvas.description,
      status: canvas.status,
      version: canvas.version,
      viewport: canvas.viewport,
      settings: canvas.settings,
    },
    nodes: canvas.nodes.map((node) => ({
      id: node.id,
      nodeKey: node.nodeKey,
      kind: node.kind,
      templateKey: node.templateKey,
      title: node.title,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      refType: node.refType,
      refId: node.refId,
      data: node.data,
      status: node.status,
      locked: node.locked,
      collapsed: node.collapsed,
      version: node.version,
    })),
    edges: canvas.edges.map((edge) => ({
      id: edge.id,
      edgeKey: edge.edgeKey,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      kind: edge.kind,
      label: edge.label,
      data: edge.data,
    })),
  } as Prisma.InputJsonValue
}

async function createCanvasSnapshotFromCanvas(params: {
  canvas: CanvasWithGraph
  reason?: string | null
  createdBy?: string | null
}): Promise<ProductionCanvasSnapshotDTO> {
  const snapshot = await prisma.$transaction(async (tx) => {
    const latestSnapshot = await tx.productionCanvasSnapshot.findFirst({
      where: { canvasId: params.canvas.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    })

    return await tx.productionCanvasSnapshot.create({
      data: {
        canvasId: params.canvas.id,
        version: (latestSnapshot?.version || 0) + 1,
        reason: params.reason || null,
        createdBy: params.createdBy || null,
        snapshot: buildSnapshotPayload(params.canvas),
      },
    })
  })
  return serializeSnapshot(snapshot)
}

async function syncCanvasFromCurrentFacts(params: {
  projectId: string
  userId: string
  canvasId: string
}): Promise<ProductionCanvasDTO> {
  const facts = await loadShortDramaFacts(params.projectId)
  const flow = buildDefaultShortDramaCanvas(facts)

  const saved = await prisma.$transaction(async (tx) => {
    const canvas = await tx.productionCanvas.findFirstOrThrow({
      where: {
        id: params.canvasId,
        projectId: params.projectId,
        userId: params.userId,
        status: 'active',
      },
      include: {
        nodes: true,
        edges: true,
      },
    })

    const existingNodes = new Map(canvas.nodes.map((node) => [node.nodeKey, node]))
    for (const draft of flow.nodes) {
      const existing = existingNodes.get(draft.nodeKey)
      if (existing) {
        await tx.productionCanvasNode.update({
          where: { id: existing.id },
          data: {
            kind: draft.kind,
            templateKey: draft.templateKey,
            title: draft.title,
            refType: draft.refType,
            refId: draft.refId,
            status: draft.status,
            data: draft.data as unknown as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        })
      } else {
        await tx.productionCanvasNode.create({
          data: toNodeCreateInput(canvas.id, draft),
        })
      }
    }

    const refreshedNodes = await tx.productionCanvasNode.findMany({
      where: { canvasId: canvas.id },
      select: { id: true, nodeKey: true },
    })
    const nodeIdByKey = new Map(refreshedNodes.map((node) => [node.nodeKey, node.id]))
    const existingEdgeKeys = new Set(canvas.edges.map((edge) => edge.edgeKey))
    for (const draft of flow.edges) {
      if (existingEdgeKeys.has(draft.edgeKey)) continue
      const sourceNodeId = nodeIdByKey.get(draft.sourceNodeKey)
      const targetNodeId = nodeIdByKey.get(draft.targetNodeKey)
      if (!sourceNodeId || !targetNodeId) continue
      await tx.productionCanvasEdge.create({
        data: {
          canvasId: canvas.id,
          edgeKey: draft.edgeKey,
          sourceNodeId,
          targetNodeId,
          kind: draft.kind,
          label: draft.label || null,
        },
      })
    }

    await tx.productionCanvas.update({
      where: { id: canvas.id },
      data: { version: { increment: 1 } },
    })

    return await tx.productionCanvas.findUniqueOrThrow({
      where: { id: canvas.id },
      include: {
        nodes: true,
        edges: true,
      },
    })
  })

  return serializeCanvas(saved)
}

export async function ensureProductionCanvasTemplates(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const template of shortDramaNodeTemplates) {
      await tx.productionNodeTemplate.upsert(toNodeTemplateUpsertData(template))
    }
    await tx.productionWorkflowTemplate.upsert(toWorkflowTemplateUpsertData(shortDramaWorkflowTemplate))
  })
}

export async function getOrCreateProductionCanvas(projectId: string, userId: string): Promise<ProductionCanvasDTO> {
  await ensureProductionCanvasTemplates()

  const existing = await prisma.productionCanvas.findFirst({
    where: {
      projectId,
      userId,
      status: 'active',
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      nodes: true,
      edges: true,
    },
  })

  if (existing) {
    return await syncCanvasFromCurrentFacts({
      projectId,
      userId,
      canvasId: existing.id,
    })
  }

  const created = await createDefaultCanvas(projectId, userId)
  return serializeCanvas(created)
}

export async function saveProductionCanvasLayout(params: {
  projectId: string
  userId: string
  canvasId: string
  input: ProductionCanvasSaveInput
}): Promise<ProductionCanvasDTO> {
  const canvas = await prisma.productionCanvas.findFirst({
    where: {
      id: params.canvasId,
      projectId: params.projectId,
      userId: params.userId,
      status: 'active',
    },
    select: { id: true },
  })

  if (!canvas) {
    throw new Error('Production canvas not found')
  }

  const saved = await prisma.$transaction(async (tx) => {
    if (params.input.nodes?.length) {
      for (const node of params.input.nodes) {
        await tx.productionCanvasNode.updateMany({
          where: {
            id: node.id,
            canvasId: params.canvasId,
          },
          data: {
            x: node.x,
            y: node.y,
            width: node.width ?? undefined,
            height: node.height ?? undefined,
            collapsed: node.collapsed ?? undefined,
            version: { increment: 1 },
          },
        })
      }
    }

    await tx.productionCanvas.update({
      where: { id: params.canvasId },
      data: {
        viewport: params.input.viewport === undefined ? undefined : params.input.viewport as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    })

    return await tx.productionCanvas.findUniqueOrThrow({
      where: { id: params.canvasId },
      include: {
        nodes: true,
        edges: true,
      },
    })
  })

  return serializeCanvas(saved)
}

export async function createProductionCanvasSnapshot(params: {
  projectId: string
  userId: string
  canvasId: string
  reason?: string | null
}): Promise<ProductionCanvasSnapshotDTO> {
  const canvas = await loadOwnedCanvas(params)
  return await createCanvasSnapshotFromCanvas({
    canvas,
    reason: params.reason || 'manual',
    createdBy: params.userId,
  })
}

export async function executeProductionCanvasAction(params: {
  projectId: string
  userId: string
  canvasId: string
  nodeId: string
  actionKey: string
  locale?: Locale
}): Promise<ProductionCanvasActionResult> {
  const canvas = await loadOwnedCanvas(params)
  const node = canvas.nodes.find((item) => item.id === params.nodeId)
  if (!node) {
    throw new Error('Production canvas node not found')
  }

  const nodeData = toNodeData(node.data)
  const action = nodeData.actions.find((item) => item.key === params.actionKey)
  if (!action) {
    throw new Error('Production canvas action not found')
  }
  if (action.disabled) {
    throw new ApiError('INVALID_PARAMS', {
      message: action.disabledReason || '该节点动作当前不可执行',
    })
  }

  const serialized = serializeCanvas(canvas)
  if (action.kind === 'open') {
    return {
      handled: true,
      message: '已解析跳转入口',
      href: action.href,
      node: serialized.nodes.find((item) => item.id === node.id),
    }
  }

  if (action.kind === 'refresh' || action.key === 'refresh') {
    const refreshed = await syncCanvasFromCurrentFacts(params)
    return {
      handled: true,
      message: '节点状态已根据当前短剧数据刷新',
      canvas: refreshed,
      node: refreshed.nodes.find((item) => item.id === node.id),
    }
  }

  const snapshot = await createCanvasSnapshotFromCanvas({
    canvas,
    reason: `before-action:${node.nodeKey}:${params.actionKey}`,
    createdBy: params.userId,
  })

  const task = await submitCanvasTaskForAction({
    projectId: params.projectId,
    userId: params.userId,
    locale: params.locale,
    nodeKey: node.nodeKey,
    actionKey: params.actionKey,
  })

  if (task) {
    const refreshed = await syncCanvasFromCurrentFacts(params)
    return {
      handled: true,
      message: task.deduped ? '已有相同任务在进行，已复用当前任务' : '节点任务已提交',
      canvas: refreshed,
      node: refreshed.nodes.find((item) => item.id === node.id),
      snapshot,
      task: toCanvasTaskResult(task),
    }
  }

  return {
    handled: false,
    message: '该节点动作已进入统一分发层，实际生成调用会在后续接入 Task / GraphRun。',
    href: action.href,
    snapshot,
    node: serialized.nodes.find((item) => item.id === node.id),
  }
}
