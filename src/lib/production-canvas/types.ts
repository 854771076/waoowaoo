export type ProductionCanvasNodeKind =
  | 'project-settings'
  | 'source-text'
  | 'episode-split'
  | 'episode'
  | 'character-library'
  | 'location-library'
  | 'script'
  | 'storyboard'
  | 'panel-image'
  | 'voice'
  | 'video'
  | 'editor-timeline'
  | 'export'

export type ProductionCanvasNodeStatus =
  | 'idle'
  | 'ready'
  | 'running'
  | 'done'
  | 'failed'
  | 'stale'
  | 'blocked'

export type ProductionCanvasNodeCategory =
  | 'project'
  | 'story'
  | 'asset'
  | 'generation'
  | 'editing'
  | 'delivery'

export interface ProductionCanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface ProductionCanvasNodeData {
  summary: string
  category: ProductionCanvasNodeCategory
  metrics: Array<{
    label: string
    value: string | number
  }>
  actions: Array<{
    key: string
    label: string
    kind: 'open' | 'run' | 'refresh' | 'regenerate' | 'configure'
    href?: string
    disabled?: boolean
    disabledReason?: string
  }>
}

export interface ProductionCanvasNodeDTO {
  id: string
  nodeKey: string
  kind: ProductionCanvasNodeKind
  templateKey: string | null
  title: string
  x: number
  y: number
  width: number | null
  height: number | null
  refType: string | null
  refId: string | null
  data: ProductionCanvasNodeData
  status: ProductionCanvasNodeStatus
  errorCode: string | null
  errorMessage: string | null
  locked: boolean
  collapsed: boolean
  version: number
  updatedAt: string
}

export interface ProductionCanvasEdgeDTO {
  id: string
  edgeKey: string
  sourceNodeId: string
  targetNodeId: string
  sourceHandle: string | null
  targetHandle: string | null
  kind: string
  label: string | null
  data: Record<string, unknown> | null
}

export interface ProductionCanvasDTO {
  id: string
  projectId: string
  userId: string
  title: string
  description: string | null
  status: string
  version: number
  viewport: ProductionCanvasViewport | null
  settings: Record<string, unknown> | null
  nodes: ProductionCanvasNodeDTO[]
  edges: ProductionCanvasEdgeDTO[]
  createdAt: string
  updatedAt: string
}

export interface ProductionCanvasSaveInput {
  viewport?: ProductionCanvasViewport | null
  nodes?: Array<{
    id: string
    x: number
    y: number
    width?: number | null
    height?: number | null
    collapsed?: boolean
  }>
}

export interface ProductionCanvasSnapshotDTO {
  id: string
  canvasId: string
  version: number
  reason: string | null
  createdBy: string | null
  createdAt: string
}

export interface ProductionCanvasActionResult {
  handled: boolean
  message: string
  canvas?: ProductionCanvasDTO
  node?: ProductionCanvasNodeDTO
  href?: string
  snapshot?: ProductionCanvasSnapshotDTO
  task?: {
    taskId: string
    runId?: string | null
    status: string
    deduped?: boolean
  }
}
