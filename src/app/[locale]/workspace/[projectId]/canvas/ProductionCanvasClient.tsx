'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type OnNodesChange,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import {
  AppIcon,
  type AppIconName,
} from '@/components/ui/icons'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'
import type {
  ProductionCanvasDTO,
  ProductionCanvasActionResult,
  ProductionCanvasNodeDTO,
  ProductionCanvasNodeStatus,
  ProductionCanvasSaveInput,
  ProductionCanvasSnapshotDTO,
} from '@/lib/production-canvas/types'
import styles from './production-canvas.module.css'

interface ProductionCanvasClientProps {
  projectId: string
}

type FlowNodeData = ProductionCanvasNodeDTO['data'] & Record<string, unknown> & {
  title: string
  status: ProductionCanvasNodeStatus
  refType: string | null
  refId: string | null
  locked: boolean
  node: ProductionCanvasNodeDTO
  onSelectNode: (node: ProductionCanvasNodeDTO) => void
}

type ProductionFlowNode = Node<FlowNodeData, 'productionNode'>

const statusLabel: Record<ProductionCanvasNodeStatus, string> = {
  idle: '未开始',
  ready: '可执行',
  running: '运行中',
  done: '已完成',
  failed: '失败',
  stale: '需重建',
  blocked: '受阻',
}

const statusIcon = {
  idle: 'clock',
  ready: 'play',
  running: 'loader',
  done: 'badgeCheck',
  failed: 'alert',
  stale: 'refresh',
  blocked: 'lock',
} satisfies Record<ProductionCanvasNodeStatus, AppIconName>

const nodeLayoutOrder = [
  'project-settings',
  'source-text',
  'episode-split',
  'episode',
  'character-library',
  'location-library',
  'script',
  'storyboard',
  'panel-image',
  'voice',
  'video',
  'editor-timeline',
  'export',
]

const nodeLayoutRows: Record<string, number> = {
  'character-library': -1,
  'location-library': 1,
  voice: -1,
  video: 1,
}

function ProductionNodeCard({ data, selected }: NodeProps<ProductionFlowNode>) {
  const iconName = statusIcon[data.status]

  return (
    <button
      type="button"
      className={`${styles.nodeCard} ${styles[`status_${data.status}`]} ${selected ? styles.nodeSelected : ''}`}
      onClick={() => data.onSelectNode(data.node)}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} />
      <div className={styles.nodeHeader}>
        <div className={styles.nodeIcon}>
          <AppIcon name={iconName} size={16} className={data.status === 'running' ? styles.spin : ''} />
        </div>
        <div className={styles.nodeTitleWrap}>
          <div className={styles.nodeTitle}>{data.title}</div>
          <div className={styles.nodeStatus}>{statusLabel[data.status]}</div>
        </div>
      </div>
      <p className={styles.nodeSummary}>{data.summary}</p>
      <div className={styles.nodeMetrics}>
        {data.metrics.slice(0, 2).map((item) => (
          <span key={item.label}>
            <strong>{item.value}</strong>
            {item.label}
          </span>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className={styles.handle} />
    </button>
  )
}

const nodeTypes = {
  productionNode: ProductionNodeCard,
}

function toFlowNodes(canvas: ProductionCanvasDTO, onSelectNode: (node: ProductionCanvasNodeDTO) => void): ProductionFlowNode[] {
  return canvas.nodes.map((node) => ({
    id: node.id,
    type: 'productionNode',
    position: { x: node.x, y: node.y },
    width: node.width || undefined,
    height: node.height || undefined,
    draggable: !node.locked,
    data: {
      ...node.data,
      title: node.title,
      status: node.status,
      refType: node.refType,
      refId: node.refId,
      locked: node.locked,
      node,
      onSelectNode,
    },
  }))
}

function toFlowEdges(canvas: ProductionCanvasDTO): Edge[] {
  return canvas.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label || undefined,
    type: 'smoothstep',
    animated: edge.kind === 'execution',
    data: edge.data || undefined,
  }))
}

function findSelectedNode(canvas: ProductionCanvasDTO | null, selectedNodeId: string | null) {
  if (!canvas || !selectedNodeId) return null
  return canvas.nodes.find((node) => node.id === selectedNodeId) || null
}

function autoLayoutNodes(currentNodes: ProductionFlowNode[]): ProductionFlowNode[] {
  const orderIndex = new Map(nodeLayoutOrder.map((kind, index) => [kind, index]))
  return currentNodes.map((node) => {
    const kind = node.data.node.kind
    const column = orderIndex.get(kind) ?? orderIndex.size
    const row = nodeLayoutRows[kind] || 0
    return {
      ...node,
      position: {
        x: column * 360,
        y: row * 190,
      },
    }
  })
}

async function readCanvas(projectId: string): Promise<ProductionCanvasDTO> {
  const response = await apiFetch(`/api/projects/${projectId}/canvas`)
  if (!response.ok) {
    throw new Error('读取节点画布失败')
  }
  const payload = await response.json() as { data?: { canvas?: ProductionCanvasDTO } }
  if (!payload.data?.canvas) {
    throw new Error('节点画布响应缺少 canvas')
  }
  return payload.data.canvas
}

async function saveCanvas(projectId: string, canvasId: string, layout: ProductionCanvasSaveInput): Promise<ProductionCanvasDTO> {
  const response = await apiFetch(`/api/projects/${projectId}/canvas`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ canvasId, layout }),
  })
  if (!response.ok) {
    throw new Error('保存节点画布失败')
  }
  const payload = await response.json() as { data?: { canvas?: ProductionCanvasDTO } }
  if (!payload.data?.canvas) {
    throw new Error('节点画布保存响应缺少 canvas')
  }
  return payload.data.canvas
}

async function executeCanvasAction(params: {
  projectId: string
  canvasId: string
  nodeId: string
  actionKey: string
  locale?: string
}): Promise<ProductionCanvasActionResult> {
  const response = await apiFetch(`/api/projects/${params.projectId}/canvas/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      canvasId: params.canvasId,
      nodeId: params.nodeId,
      actionKey: params.actionKey,
      locale: params.locale,
    }),
  })
  if (!response.ok) {
    throw new Error('执行节点动作失败')
  }
  const payload = await response.json() as { data?: ProductionCanvasActionResult }
  if (!payload.data) {
    throw new Error('节点动作响应缺少 data')
  }
  return payload.data
}

async function createSnapshot(projectId: string, canvasId: string): Promise<ProductionCanvasSnapshotDTO> {
  const response = await apiFetch(`/api/projects/${projectId}/canvas/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      canvasId,
      reason: 'manual',
    }),
  })
  if (!response.ok) {
    throw new Error('创建快照失败')
  }
  const payload = await response.json() as { data?: { snapshot?: ProductionCanvasSnapshotDTO } }
  if (!payload.data?.snapshot) {
    throw new Error('快照响应缺少 snapshot')
  }
  return payload.data.snapshot
}

export default function ProductionCanvasClient({ projectId }: ProductionCanvasClientProps) {
  const routeParams = useParams<{ locale?: string }>()
  const [canvas, setCanvas] = useState<ProductionCanvasDTO | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<ProductionFlowNode, Edge> | null>(null)

  const selectedNode = findSelectedNode(canvas, selectedNodeId)
  const selectNode = useCallback((node: ProductionCanvasNodeDTO) => {
    setSelectedNodeId(node.id)
  }, [])

  const initialNodes = useMemo(() => canvas ? toFlowNodes(canvas, selectNode) : [], [canvas, selectNode])
  const initialEdges = useMemo(() => canvas ? toFlowEdges(canvas) : [], [canvas])
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<ProductionFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    readCanvas(projectId)
      .then((nextCanvas) => {
        if (cancelled) return
        setCanvas(nextCanvas)
        setSelectedNodeId(nextCanvas.nodes[0]?.id || null)
      })
      .catch((nextError: unknown) => {
        if (cancelled) return
        setError(nextError instanceof Error ? nextError.message : '读取节点画布失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialEdges, initialNodes, setEdges, setNodes])

  const onNodesChange = useCallback<OnNodesChange<ProductionFlowNode>>((changes) => {
    onNodesChangeBase(changes)
  }, [onNodesChangeBase])

  const saveLayout = useCallback(async () => {
    if (!canvas) return
    setSaving(true)
    setError(null)
    try {
      const saved = await saveCanvas(projectId, canvas.id, {
        viewport: flowInstance?.getViewport() || canvas.viewport,
        nodes: nodes.map((node) => ({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width: typeof node.width === 'number' ? node.width : undefined,
          height: typeof node.height === 'number' ? node.height : undefined,
        })),
      })
      setCanvas(saved)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存节点画布失败')
    } finally {
      setSaving(false)
    }
  }, [canvas, flowInstance, nodes, projectId])

  const applyAutoLayout = useCallback(() => {
    setNodes((currentNodes) => autoLayoutNodes(currentNodes))
    setNotice('已应用自动布局，点击保存布局后写入数据库')
  }, [setNodes])

  const refreshCanvas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextCanvas = await readCanvas(projectId)
      setCanvas(nextCanvas)
      setNotice('节点状态已刷新')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '读取节点画布失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const runNodeAction = useCallback(async (nodeId: string, actionKey: string) => {
    if (!canvas) return
    setActing(true)
    setError(null)
    setNotice(null)
    try {
      const result = await executeCanvasAction({
        projectId,
        canvasId: canvas.id,
        nodeId,
        actionKey,
        locale: routeParams?.locale,
      })
      if (result.canvas) {
        setCanvas(result.canvas)
      }
      setNotice(result.task?.taskId ? `${result.message}：${result.task.taskId}` : result.message)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '执行节点动作失败')
    } finally {
      setActing(false)
    }
  }, [canvas, projectId, routeParams?.locale])

  const createManualSnapshot = useCallback(async () => {
    if (!canvas) return
    setActing(true)
    setError(null)
    setNotice(null)
    try {
      const snapshot = await createSnapshot(projectId, canvas.id)
      setNotice(`已创建快照 v${snapshot.version}`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '创建快照失败')
    } finally {
      setActing(false)
    }
  }, [canvas, projectId])

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <Link
            className={styles.iconButton}
            href={{
              pathname: `/workspace/${projectId}`,
            }}
            title="返回旧版流程"
          >
            <AppIcon name="chevronLeft" size={18} />
          </Link>
          <div>
            <h1>短剧节点画布</h1>
            <p>新链路：节点化查看、编排和触发现有短剧生产能力</p>
          </div>
        </div>
        <div className={styles.topbarActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => void refreshCanvas()} disabled={loading}>
            <AppIcon name="refresh" size={16} />
            刷新
          </button>
          <button type="button" className={styles.secondaryButton} onClick={applyAutoLayout} disabled={loading || !canvas}>
            <AppIcon name="slidersHorizontal" size={16} />
            自动布局
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => void createManualSnapshot()} disabled={acting || loading || !canvas}>
            <AppIcon name="bookmark" size={16} />
            快照
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => void saveLayout()} disabled={saving || loading || !canvas}>
            <AppIcon name="check" size={16} />
            {saving ? '保存中' : '保存布局'}
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.errorBar}>
          <AppIcon name="alert" size={16} />
          {error}
        </div>
      )}
      {notice && !error && (
        <div className={styles.noticeBar}>
          <AppIcon name="badgeCheck" size={16} />
          {notice}
        </div>
      )}

      <section className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.panelHeader}>
            <AppIcon name="shuffle" size={18} />
            流程节点
          </div>
          <div className={styles.nodeList}>
            {(canvas?.nodes || []).map((node) => (
              <button
                key={node.id}
                type="button"
                className={`${styles.nodeListItem} ${selectedNodeId === node.id ? styles.nodeListItemActive : ''}`}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <span>{node.title}</span>
                <em>{statusLabel[node.status]}</em>
              </button>
            ))}
          </div>
        </aside>

        <div className={styles.canvasStage}>
          {loading ? (
            <div className={styles.loadingState}>
              <AppIcon name="loader" size={22} className={styles.spin} />
              正在加载节点画布
            </div>
          ) : (
            <ReactFlow<ProductionFlowNode, Edge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onInit={setFlowInstance}
              defaultViewport={canvas?.viewport || { x: 40, y: 40, zoom: 0.72 }}
              minZoom={0.25}
              maxZoom={1.35}
              fitView={!canvas?.viewport}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
            >
              <Background gap={24} size={1} color="#d7dde8" />
              <Controls position="bottom-left" />
              <MiniMap pannable zoomable nodeStrokeWidth={3} position="bottom-right" />
            </ReactFlow>
          )}
        </div>

        <aside className={styles.inspector}>
          {selectedNode ? (
            <>
              <div className={styles.inspectorTitle}>
                <div className={styles.inspectorIcon}>
                  <AppIcon name="cube" size={18} />
                </div>
                <div>
                  <h2>{selectedNode.title}</h2>
                  <p>{statusLabel[selectedNode.status]}</p>
                </div>
              </div>
              <p className={styles.inspectorSummary}>{selectedNode.data.summary}</p>

              <div className={styles.metricGrid}>
                {selectedNode.data.metrics.map((item) => (
                  <div key={item.label} className={styles.metricCard}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              <div className={styles.refBox}>
                <span>引用对象</span>
                <code>{selectedNode.refType || 'None'} / {selectedNode.refId || 'None'}</code>
              </div>

              <div className={styles.actionStack}>
                {selectedNode.data.actions.map((action) => (
                  action.disabled ? (
                    <button
                      key={action.key}
                      type="button"
                      className={`${styles.actionButton} ${styles.actionDisabled}`}
                      disabled
                      title={action.disabledReason}
                    >
                      <AppIcon name={action.href ? 'externalLink' : 'lock'} size={15} />
                      {action.label}
                    </button>
                  ) : action.href ? (
                    <Link
                      key={action.key}
                      href={action.href}
                      className={styles.actionButton}
                    >
                      <AppIcon name="externalLink" size={15} />
                      {action.label}
                    </Link>
                  ) : (
                    <button
                      key={action.key}
                      type="button"
                      className={styles.actionButton}
                      disabled={action.disabled || acting}
                      onClick={() => void runNodeAction(selectedNode.id, action.key)}
                    >
                      <AppIcon name="play" size={15} />
                      {action.label}
                    </button>
                  )
                ))}
              </div>
            </>
          ) : (
            <div className={styles.emptyInspector}>选择一个节点查看详情</div>
          )}
        </aside>
      </section>
    </main>
  )
}
