import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/storage', () => ({
  getSignedUrl: vi.fn((key: string) => `https://signed.example/${key}`),
}))

import { callRoute } from '../helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../../../helpers/auth'
import { resetSystemState } from '../../../helpers/db-reset'
import { prisma } from '../../../helpers/prisma'
import { seedMinimalDomainState } from '../../../system/helpers/seed'

describe('director-desk load route', () => {
  beforeEach(async () => {
    await resetSystemState()
    installAuthMocks()
  })

  it('returns null directorLayout and empty shots for a fresh panel', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)

    const mod = await import('@/app/api/novel-promotion/[projectId]/director-desk/load/route')
    const response = await callRoute(
      mod.GET,
      'GET',
      undefined,
      {
        params: { projectId: seeded.project.id },
        query: { panelId: seeded.panel.id },
      },
    )

    expect(response.status).toBe(200)
    const body = await response.json() as {
      panel: {
        id: string
        directorLayout: unknown
        directorShots: unknown[]
        characters: unknown[]
        props: unknown[]
      }
      project: { videoRatio: string }
    }
    expect(body.panel.id).toBe(seeded.panel.id)
    expect(body.panel.directorLayout).toBeNull()
    expect(Array.isArray(body.panel.directorShots)).toBe(true)
    expect(body.panel.directorShots).toHaveLength(0)
    expect(Array.isArray(body.panel.characters)).toBe(true)
    expect(Array.isArray(body.panel.props)).toBe(true)
    expect(body.project.videoRatio).toBe('9:16')

    resetAuthMockState()
  })

  it('rejects cross-user access with 403', async () => {
    const seeded = await seedMinimalDomainState()
    // Simulate a session for a different user AND flip the project-auth mock to forbidden,
    // which is how the real requireProjectAuthLight would react to a non-owner.
    mockAuthenticated('other-user-id')
    const { mockProjectAuth } = await import('../../../helpers/auth')
    mockProjectAuth('forbidden')

    const mod = await import('@/app/api/novel-promotion/[projectId]/director-desk/load/route')
    const response = await callRoute(
      mod.GET,
      'GET',
      undefined,
      {
        params: { projectId: seeded.project.id },
        query: { panelId: seeded.panel.id },
      },
    )
    expect(response.status).toBe(403)

    resetAuthMockState()
  })

  it('returns 400 when panelId is missing', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)

    const mod = await import('@/app/api/novel-promotion/[projectId]/director-desk/load/route')
    const response = await callRoute(
      mod.GET,
      'GET',
      undefined,
      { params: { projectId: seeded.project.id } },
    )
    expect(response.status).toBe(400)

    resetAuthMockState()
  })

  it('signs imported asset urls in current layout and snapshot projects', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    const directorLayout = {
      version: 1,
      scene: {
        backgroundColor: '#1a1d23',
        showGround: true,
        groundOpacity: 0.8,
        showLabels: true,
        showGrid: true,
        backdropAssetId: null,
        backdropOpacity: 0.6,
        backdropYaw: 0,
      },
      objects: [],
      cameras: [
        {
          id: 'cam-1',
          name: '主机位',
          fov: 50,
          position: [0, 1.55, 5.4],
          target: [0, 1.05, 0],
          visible: true,
        },
      ],
      activeCameraId: 'cam-1',
      importedAssets: [
        {
          id: 'asset-1',
          kind: 'model',
          sourceType: 'model',
          fileName: 'chair.glb',
          name: 'chair',
          url: 'director-assets-panel-1.glb',
        },
      ],
      directorSnapshots: [
        {
          id: 'snap-1',
          name: '带模型快照',
          capturedAt: 1,
          project: {
            version: 1,
            scene: {
              backgroundColor: '#1a1d23',
              showGround: true,
              groundOpacity: 0.8,
              showLabels: true,
              showGrid: true,
              backdropAssetId: null,
              backdropOpacity: 0.6,
              backdropYaw: 0,
            },
            objects: [],
            cameras: [
              {
                id: 'cam-1',
                name: '主机位',
                fov: 50,
                position: [0, 1.55, 5.4],
                target: [0, 1.05, 0],
                visible: true,
              },
            ],
            activeCameraId: 'cam-1',
            importedAssets: [
              {
                id: 'asset-1',
                kind: 'model',
                sourceType: 'model',
                fileName: 'chair.glb',
                name: 'chair',
                url: 'director-assets-panel-1.glb',
              },
            ],
          },
          cameraId: 'cam-1',
          camera: {
            fov: 50,
            position: [0, 1.55, 5.4],
            target: [0, 1.05, 0],
          },
        },
      ],
    }
    await prisma.novelPromotionPanel.update({
      where: { id: seeded.panel.id },
      data: { directorLayout: JSON.stringify(directorLayout) },
    })

    const mod = await import('@/app/api/novel-promotion/[projectId]/director-desk/load/route')
    const response = await callRoute(
      mod.GET,
      'GET',
      undefined,
      {
        params: { projectId: seeded.project.id },
        query: { panelId: seeded.panel.id },
      },
    )

    expect(response.status).toBe(200)
    const body = await response.json() as {
      panel: {
        directorLayout: {
          importedAssets?: Array<{ url: string }>
          directorSnapshots?: Array<{ project: { importedAssets?: Array<{ url: string }> } }>
        }
      }
    }
    expect(body.panel.directorLayout.importedAssets?.[0].url).toBe('https://signed.example/director-assets-panel-1.glb')
    expect(body.panel.directorLayout.directorSnapshots?.[0].project.importedAssets?.[0].url).toBe('https://signed.example/director-assets-panel-1.glb')

    resetAuthMockState()
  })
})
