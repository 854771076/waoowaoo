import { describe, expect, it, vi } from 'vitest'
import { createDefaultDirectorProject } from '@/lib/director-desk/schema'
import { attachSignedImportedAssetUrls } from '@/app/api/novel-promotion/[projectId]/director-desk/load/route'

vi.mock('@/lib/storage', () => ({
  getSignedUrl: vi.fn((key: string) => `https://signed.example/${key}`),
}))

describe('director desk imported asset signing', () => {
  it('signs imported asset urls in the current project and snapshot projects', () => {
    const project = createDefaultDirectorProject()
    project.importedAssets = [
      {
        id: 'asset-1',
        kind: 'model',
        sourceType: 'model',
        fileName: 'chair.glb',
        name: 'chair',
        url: 'director-assets-panel-1.glb',
      },
    ]
    project.directorSnapshots = [
      {
        id: 'snap-1',
        name: '带模型快照',
        capturedAt: 1,
        project: {
          ...createDefaultDirectorProject(),
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
    ]

    const signed = attachSignedImportedAssetUrls(project)

    expect(signed?.importedAssets?.[0].url).toBe('https://signed.example/director-assets-panel-1.glb')
    expect(signed?.directorSnapshots?.[0].project.importedAssets?.[0].url).toBe('https://signed.example/director-assets-panel-1.glb')
  })
})
