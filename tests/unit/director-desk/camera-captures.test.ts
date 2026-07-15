import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultDirectorProject } from '@/lib/director-desk/schema'
import { collectBoundShotsForSave } from '@/app/[locale]/workspace/[projectId]/director-desk/editor/store/directorSelectors'
import { useDirectorStore } from '@/app/[locale]/workspace/[projectId]/director-desk/editor/store/directorStore'

describe('director-desk camera captures', () => {
  beforeEach(() => {
    useDirectorStore.setState({
      project: createDefaultDirectorProject(),
      selectedId: null,
      viewMode: 'director',
      transformMode: 'translate',
      isDirty: false,
      history: [],
      future: [],
      panelId: 'panel-1',
      projectId: 'project-1',
      videoRatio: '9:16',
      loaded: true,
      glCanvas: null,
      cameraCaptures: {},
    })
  })

  it('saves the camera pose from the moment a screenshot was captured', () => {
    const store = useDirectorStore.getState()
    const capId = store.addCameraCapture('cam-1', 'data:image/jpeg;base64,a', '主机位快照', {
      fov: 35,
      position: [1, 2, 3],
      target: [4, 5, 6],
    })
    store.toggleCaptureBound('cam-1', capId)
    store.setCameraField('cam-1', 'fov', 70)
    store.setCameraField('cam-1', 'position', [7, 8, 9])
    store.setCameraField('cam-1', 'target', [10, 11, 12])

    expect(collectBoundShotsForSave()).toEqual([
      {
        cameraId: 'cam-1',
        name: '主机位快照',
        isActive: true,
        fov: 35,
        position: [1, 2, 3],
        target: [4, 5, 6],
        note: undefined,
        snapshotDataUrl: 'data:image/jpeg;base64,a',
      },
    ])
  })

  it('adds new characters as mannequins by default', () => {
    const id = useDirectorStore.getState().addObject({
      kind: 'character',
      name: '新角色',
    })

    const object = useDirectorStore.getState().project.objects.find((item) => item.id === id)
    expect(object?.mode).toBe('mannequin')
    expect(object?.bodyType).toBeUndefined()
  })

  it('stores a recoverable director snapshot with the current layout and camera', () => {
    const store = useDirectorStore.getState()
    const characterId = store.addObject({
      kind: 'character',
      name: '快照角色',
      transform: { position: [2, 0, -1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })
    store.setCameraField('cam-1', 'fov', 42)
    const snapshotId = useDirectorStore.getState().addDirectorSnapshot({
      name: '构图 A',
      dataUrl: 'data:image/jpeg;base64,snapshot',
    })
    expect(snapshotId).toBeTruthy()

    useDirectorStore.getState().setObjectTransform(characterId, {
      position: [8, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
    useDirectorStore.getState().restoreDirectorSnapshot(snapshotId as string)

    const state = useDirectorStore.getState()
    const restored = state.project.objects.find((item) => item.id === characterId)
    expect(restored?.transform.position).toEqual([2, 0, -1])
    expect(state.project.cameras[0].fov).toBe(42)
    expect(state.project.directorSnapshots).toHaveLength(1)
  })

  it('restores the original low-poly snapshot without dropping rendered storyboard assets or boards', () => {
    const store = useDirectorStore.getState()
    const characterId = store.addObject({
      kind: 'character',
      name: '快照角色',
      transform: { position: [2, 0, -1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })
    const snapshotId = useDirectorStore.getState().addDirectorSnapshot({
      name: '低模构图',
      dataUrl: 'data:image/jpeg;base64,snapshot',
    })
    expect(snapshotId).toBeTruthy()

    useDirectorStore.setState((state) => ({
      project: {
        ...state.project,
        directorStoryboardAssets: [{
          id: 'asset-1',
          type: 'rendered_snapshot',
          name: '低模构图渲染',
          createdAt: 1,
          imageUrl: 'cos/rendered.png',
          sourceSnapshotId: snapshotId as string,
          layout: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
        }],
        directorStoryboardBoards: [{
          id: 'board-1',
          name: '导演台分镜板 1',
          createdAt: 2,
          coverImageUrl: 'cos/rendered.png',
          assetIds: ['asset-1'],
          items: [{ assetId: 'asset-1', x: 0, y: 0, width: 1, height: 1, rotation: 0 }],
        }],
      },
    }))
    useDirectorStore.getState().setObjectTransform(characterId, {
      position: [8, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })

    useDirectorStore.getState().restoreDirectorSnapshot(snapshotId as string)

    const state = useDirectorStore.getState()
    const restored = state.project.objects.find((item) => item.id === characterId)
    expect(restored?.transform.position).toEqual([2, 0, -1])
    expect(state.project.directorStoryboardAssets?.map((asset) => asset.id)).toEqual(['asset-1'])
    expect(state.project.directorStoryboardBoards?.map((board) => board.id)).toEqual(['board-1'])
  })

  it('saves, edits, orders, and deletes director storyboard boards from selected assets', () => {
    useDirectorStore.setState((state) => ({
      project: {
        ...state.project,
        directorStoryboardAssets: [
          {
            id: 'asset-1',
            type: 'rendered_snapshot',
            name: '快照 1',
            createdAt: 1,
            imageUrl: 'cos/one.png',
            layout: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          },
          {
            id: 'asset-2',
            type: 'rendered_snapshot',
            name: '快照 2',
            createdAt: 2,
            imageUrl: 'cos/two.png',
            layout: { x: 0.2, y: 0.1, width: 0.8, height: 0.8, rotation: 0.1 },
          },
        ],
      },
    }))

    const boardId = useDirectorStore.getState().saveDirectorStoryboardBoard({
      name: '自定义分镜板',
      assetIds: ['asset-2', 'asset-1'],
    })
    expect(boardId).toBeTruthy()
    expect(useDirectorStore.getState().project.directorStoryboardBoards?.[0]).toMatchObject({
      id: boardId,
      name: '自定义分镜板',
      coverImageUrl: 'cos/two.png',
      assetIds: ['asset-2', 'asset-1'],
    })

    useDirectorStore.getState().saveDirectorStoryboardBoard({
      boardId: boardId as string,
      name: '改名分镜板',
      assetIds: ['asset-1'],
    })
    expect(useDirectorStore.getState().project.directorStoryboardBoards?.[0]).toMatchObject({
      id: boardId,
      name: '改名分镜板',
      coverImageUrl: 'cos/one.png',
      assetIds: ['asset-1'],
    })

    useDirectorStore.getState().removeDirectorStoryboardBoard(boardId as string)
    expect(useDirectorStore.getState().project.directorStoryboardBoards).toEqual([])
  })
})
