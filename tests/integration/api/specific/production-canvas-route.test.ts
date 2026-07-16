import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, PATCH } from '@/app/api/projects/[projectId]/canvas/route'
import { POST as POST_ACTION } from '@/app/api/projects/[projectId]/canvas/actions/route'
import { POST as POST_SNAPSHOT } from '@/app/api/projects/[projectId]/canvas/snapshot/route'
import { callRoute } from '../helpers/call-route'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const serviceMock = vi.hoisted(() => ({
  getOrCreateProductionCanvas: vi.fn(async () => ({
    id: 'canvas-1',
    projectId: 'project-1',
    userId: 'user-1',
    title: '短剧生产画布',
    description: null,
    status: 'active',
    version: 1,
    viewport: null,
    settings: null,
    nodes: [],
    edges: [],
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  })),
  saveProductionCanvasLayout: vi.fn(async () => ({
    id: 'canvas-1',
    projectId: 'project-1',
    userId: 'user-1',
    title: '短剧生产画布',
    description: null,
    status: 'active',
    version: 2,
    viewport: { x: 1, y: 2, zoom: 0.8 },
    settings: null,
    nodes: [],
    edges: [],
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  })),
  executeProductionCanvasAction: vi.fn(async () => ({
    handled: true,
    message: '节点任务已提交',
    task: {
      taskId: 'task-1',
      runId: 'run-1',
      status: 'queued',
      deduped: false,
    },
  })),
  createProductionCanvasSnapshot: vi.fn(async () => ({
    id: 'snapshot-1',
    canvasId: 'canvas-1',
    version: 2,
    reason: 'manual',
    createdBy: 'user-1',
    createdAt: '2026-07-16T00:00:00.000Z',
  })),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/production-canvas/service', () => serviceMock)

describe('production canvas api routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
  })

  it('gets or creates the project canvas for the owning user', async () => {
    const response = await callRoute(GET, 'GET', undefined, {
      params: { projectId: 'project-1' },
    })

    expect(response.status).toBe(200)
    expect(serviceMock.getOrCreateProductionCanvas).toHaveBeenCalledWith('project-1', 'user-1')
  })

  it('saves layout for the owning user', async () => {
    const response = await callRoute(PATCH, 'PATCH', {
      canvasId: 'canvas-1',
      layout: {
        viewport: { x: 1, y: 2, zoom: 0.8 },
        nodes: [{ id: 'node-1', x: 10, y: 20 }],
      },
    }, {
      params: { projectId: 'project-1' },
    })

    expect(response.status).toBe(200)
    expect(serviceMock.saveProductionCanvasLayout).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      canvasId: 'canvas-1',
      input: {
        viewport: { x: 1, y: 2, zoom: 0.8 },
        nodes: [{ id: 'node-1', x: 10, y: 20 }],
      },
    })
  })

  it('executes node actions through the canvas action dispatcher', async () => {
    const response = await callRoute(POST_ACTION, 'POST', {
      canvasId: 'canvas-1',
      nodeId: 'node-1',
      actionKey: 'generate',
      locale: 'zh',
    }, {
      params: { projectId: 'project-1' },
    })

    expect(response.status).toBe(200)
    expect(serviceMock.executeProductionCanvasAction).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      canvasId: 'canvas-1',
      nodeId: 'node-1',
      actionKey: 'generate',
      locale: 'zh',
    })
  })

  it('creates manual snapshots through the snapshot route', async () => {
    const response = await callRoute(POST_SNAPSHOT, 'POST', {
      canvasId: 'canvas-1',
      reason: 'manual',
    }, {
      params: { projectId: 'project-1' },
    })

    expect(response.status).toBe(200)
    expect(serviceMock.createProductionCanvasSnapshot).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      canvasId: 'canvas-1',
      reason: 'manual',
    })
  })

  it('rejects unauthenticated callers', async () => {
    authState.authenticated = false

    const response = await callRoute(GET, 'GET', undefined, {
      params: { projectId: 'project-1' },
    })

    expect(response.status).toBe(401)
  })
})
