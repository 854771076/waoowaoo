import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultDirectorProject } from '@/lib/director-desk/schema'
import { saveDirectorDesk } from '@/app/[locale]/workspace/[projectId]/director-desk/editor/io/save'
import { useDirectorStore } from '@/app/[locale]/workspace/[projectId]/director-desk/editor/store/directorStore'

describe('director desk client save', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useDirectorStore.setState({
      project: createDefaultDirectorProject(),
      selectedId: null,
      selectedIds: [],
      viewMode: 'director',
      transformMode: 'translate',
      viewportPanelsCollapsed: false,
      viewportRuleOfThirdsEnabled: true,
      isDirty: false,
      history: [],
      future: [],
      clipboard: [],
      clipboardPasteCount: 0,
      panelId: 'panel-1',
      projectId: 'project-1',
      videoRatio: '9:16',
      loaded: true,
      glCanvas: null,
      viewportCamera: null,
      cameraCaptures: {},
    })
  })

  it('clears uploaded snapshot image data urls after server returns persisted urls', async () => {
    useDirectorStore.setState((state) => ({
      project: {
        ...state.project,
        directorSnapshots: [
          {
            id: 'snap-1',
            name: '低模快照',
            capturedAt: 1,
            project: createDefaultDirectorProject(),
            cameraId: 'cam-1',
            camera: {
              fov: 50,
              position: [0, 1.55, 5.4],
              target: [0, 1.05, 0],
            },
            imageDataUrl: 'data:image/jpeg;base64,snapshot',
          },
        ],
      },
    }))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        snapshotImages: [{ snapshotId: 'snap-1', imageUrl: 'images/director-snapshot-panel-1.jpg' }],
      }),
    })))

    await saveDirectorDesk()

    const snapshot = useDirectorStore.getState().project.directorSnapshots?.[0]
    expect(snapshot?.imageUrl).toBe('images/director-snapshot-panel-1.jpg')
    expect(snapshot?.imageDataUrl).toBeUndefined()
  })

  it('applies uploaded imported asset urls to snapshot projects after saving', async () => {
    const project = createDefaultDirectorProject()
    project.importedAssets = [
      {
        id: 'asset-1',
        kind: 'model',
        sourceType: 'model',
        fileName: 'chair.glb',
        name: 'chair',
        url: 'data:model/gltf-binary;base64,AAAA',
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
              url: 'data:model/gltf-binary;base64,AAAA',
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
    useDirectorStore.setState({ project })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        importedAssets: [{ assetId: 'asset-1', url: 'images/director-assets-panel-1.glb' }],
      }),
    })))

    await saveDirectorDesk()

    const savedProject = useDirectorStore.getState().project
    expect(savedProject.importedAssets?.[0].url).toBe('images/director-assets-panel-1.glb')
    expect(savedProject.directorSnapshots?.[0].project.importedAssets?.[0].url).toBe('images/director-assets-panel-1.glb')
  })
})
