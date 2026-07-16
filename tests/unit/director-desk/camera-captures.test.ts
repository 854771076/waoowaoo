import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultDirectorProject } from '@/lib/director-desk/schema'
import { collectBoundShotsForSave } from '@/app/[locale]/workspace/[projectId]/director-desk/editor/store/directorSelectors'
import { useDirectorStore } from '@/app/[locale]/workspace/[projectId]/director-desk/editor/store/directorStore'

describe('director-desk camera captures', () => {
  beforeEach(() => {
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

  it('unbinds all captures for one camera without deleting them or touching other cameras', () => {
    const store = useDirectorStore.getState()
    const first = store.addCameraCapture('cam-1', 'data:image/jpeg;base64,a', '主机位 A', {
      fov: 35,
      position: [1, 2, 3],
      target: [4, 5, 6],
    })
    const second = store.addCameraCapture('cam-1', 'data:image/jpeg;base64,b', '主机位 B', {
      fov: 36,
      position: [2, 3, 4],
      target: [5, 6, 7],
    })
    const otherCameraId = store.addCamera({ name: '侧面机位' })
    const other = useDirectorStore.getState().addCameraCapture(otherCameraId, 'data:image/jpeg;base64,c', '侧面', {
      fov: 40,
      position: [3, 4, 5],
      target: [6, 7, 8],
    })
    useDirectorStore.getState().toggleCaptureBound('cam-1', first)
    useDirectorStore.getState().toggleCaptureBound('cam-1', second)
    useDirectorStore.getState().toggleCaptureBound(otherCameraId, other)

    useDirectorStore.getState().unbindAllCapturesForCamera('cam-1')

    expect(useDirectorStore.getState().cameraCaptures['cam-1']).toHaveLength(2)
    expect(useDirectorStore.getState().cameraCaptures['cam-1'].map((cap) => cap.isBound)).toEqual([false, false])
    expect(useDirectorStore.getState().cameraCaptures[otherCameraId].map((cap) => cap.isBound)).toEqual([true])
    expect(collectBoundShotsForSave().map((shot) => shot.cameraId)).toEqual([otherCameraId])
  })

  it('binds all captures for one camera without touching other cameras', () => {
    const store = useDirectorStore.getState()
    const first = store.addCameraCapture('cam-1', 'data:image/jpeg;base64,a', '主机位 A', {
      fov: 35,
      position: [1, 2, 3],
      target: [4, 5, 6],
    })
    const second = store.addCameraCapture('cam-1', 'data:image/jpeg;base64,b', '主机位 B', {
      fov: 36,
      position: [2, 3, 4],
      target: [5, 6, 7],
    })
    const otherCameraId = store.addCamera({ name: '侧面机位' })
    useDirectorStore.getState().addCameraCapture(otherCameraId, 'data:image/jpeg;base64:c', '侧面未绑定', {
      fov: 40,
      position: [3, 4, 5],
      target: [6, 7, 8],
    })

    useDirectorStore.getState().bindAllCapturesForCamera('cam-1')

    expect(useDirectorStore.getState().cameraCaptures['cam-1'].map((cap) => cap.id)).toEqual([first, second])
    expect(useDirectorStore.getState().cameraCaptures['cam-1'].map((cap) => cap.isBound)).toEqual([true, true])
    expect(useDirectorStore.getState().cameraCaptures[otherCameraId].map((cap) => cap.isBound)).toEqual([false])
    expect(collectBoundShotsForSave().map((shot) => shot.cameraId)).toEqual(['cam-1', 'cam-1'])
  })

  it('clears bound state without deleting unsaved local captures', () => {
    useDirectorStore.getState().hydrateBoundShots([
      {
        id: 'shot-1',
        cameraId: 'cam-1',
        name: '历史截图',
        isActive: true,
        imageUrl: 'https://example.com/shot.jpg',
        fov: 41,
        pos: [3, 2, 1],
        target: [0, 1, -2],
      },
    ])
    const localCaptureId = useDirectorStore.getState().addCameraCapture('cam-1', 'data:image/jpeg;base64,local', '本地截图', {
      fov: 35,
      position: [1, 2, 3],
      target: [4, 5, 6],
    })
    useDirectorStore.getState().toggleCaptureBound('cam-1', localCaptureId)

    useDirectorStore.getState().clearBoundCaptures()

    const captures = useDirectorStore.getState().cameraCaptures['cam-1']
    expect(captures).toHaveLength(2)
    expect(captures.map((cap) => cap.name)).toEqual(['历史截图', '本地截图'])
    expect(captures.map((cap) => cap.isBound)).toEqual([false, false])
    expect(collectBoundShotsForSave()).toEqual([])
  })

  it('clears local camera captures when replacing the project from imported JSON', () => {
    const capId = useDirectorStore.getState().addCameraCapture('cam-1', 'data:image/jpeg;base64,old', '旧截图', {
      fov: 35,
      position: [1, 2, 3],
      target: [4, 5, 6],
    })
    useDirectorStore.getState().toggleCaptureBound('cam-1', capId)

    useDirectorStore.getState().replaceProject(createDefaultDirectorProject())

    expect(useDirectorStore.getState().cameraCaptures).toEqual({})
    expect(collectBoundShotsForSave()).toEqual([])
  })

  it('clears copied objects when replacing the project from imported JSON', () => {
    const oldObjectId = useDirectorStore.getState().addObject({
      kind: 'prop',
      name: '旧道具',
      transform: { position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })
    useDirectorStore.getState().select(oldObjectId)
    useDirectorStore.getState().copySelectedObjects()

    useDirectorStore.getState().replaceProject(createDefaultDirectorProject())
    useDirectorStore.getState().pasteClipboardObjects()

    expect(useDirectorStore.getState().clipboard).toEqual([])
    expect(useDirectorStore.getState().clipboardPasteCount).toBe(0)
    expect(useDirectorStore.getState().project.objects).toEqual([])
  })

  it('restores a camera pose from a captured screenshot', () => {
    const store = useDirectorStore.getState()
    const objectId = store.addObject({
      kind: 'character',
      name: '目标角色',
      transform: { position: [2, 0, -1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })
    useDirectorStore.getState().setCameraTargetObject('cam-1', objectId)
    const capId = useDirectorStore.getState().addCameraCapture('cam-1', 'data:image/jpeg;base64,a', '恢复截图', {
      fov: 34,
      position: [1, 2, 3],
      target: [4, 5, 6],
    })
    useDirectorStore.getState().setCameraField('cam-1', 'fov', 70)

    useDirectorStore.getState().restoreCameraCapturePose('cam-1', capId)

    expect(useDirectorStore.getState().project.cameras[0]).toMatchObject({
      fov: 34,
      position: [1, 2, 3],
      target: [4, 5, 6],
      targetMode: 'manual',
      targetObjectId: null,
    })
  })

  it('restores a camera pose from persisted shot metadata when capture metadata is absent', () => {
    useDirectorStore.getState().hydrateBoundShots([
      {
        id: 'shot-1',
        cameraId: 'cam-1',
        name: '历史截图',
        isActive: true,
        imageUrl: 'https://example.com/shot.jpg',
        fov: 41,
        pos: [3, 2, 1],
        target: [0, 1, -2],
      },
    ])

    const capId = useDirectorStore.getState().cameraCaptures['cam-1'][0].id
    useDirectorStore.getState().restoreCameraCapturePose('cam-1', capId)

    expect(useDirectorStore.getState().project.cameras[0]).toMatchObject({
      fov: 41,
      position: [3, 2, 1],
      target: [0, 1, -2],
      targetMode: 'manual',
      targetObjectId: null,
    })
  })

  it('creates a new camera from a captured screenshot pose without changing the source camera', () => {
    const capId = useDirectorStore.getState().addCameraCapture('cam-1', 'data:image/jpeg;base64,a', '侧面构图', {
      fov: 32,
      position: [3, 2.5, 6],
      target: [0, 1, -1],
    })
    useDirectorStore.getState().setCameraField('cam-1', 'fov', 70)

    const cameraId = useDirectorStore.getState().createCameraFromCapturePose('cam-1', capId)
    const state = useDirectorStore.getState()
    const camera = state.project.cameras.find((item) => item.id === cameraId)

    expect(state.project.cameras[0].fov).toBe(70)
    expect(camera).toMatchObject({
      name: '侧面构图 机位',
      fov: 32,
      position: [3, 2.5, 6],
      target: [0, 1, -1],
      targetMode: 'manual',
      targetObjectId: null,
      visible: true,
    })
    expect(state.selectedId).toBe(cameraId)
    expect(state.project.activeCameraId).toBe('cam-1')
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

  it('adds geometry primitives as editable prop objects', () => {
    const id = useDirectorStore.getState().addGeometryPrimitive('torus')
    const object = useDirectorStore.getState().project.objects.find((item) => item.id === id)

    expect(object).toMatchObject({
      kind: 'prop',
      name: '环状体',
      refId: null,
      mode: 'mannequin',
      geometryType: 'torus',
    })
    expect(useDirectorStore.getState().selectedId).toBe(id)
  })

  it('adds imported models as prop objects and cleans references when removed', () => {
    const assetId = useDirectorStore.getState().addImportedAsset({
      kind: 'model',
      fileName: 'chair.obj',
      name: 'chair',
      url: 'data:text/plain;base64,b2Jq',
    })
    const state = useDirectorStore.getState()
    const object = state.project.objects.find((item) => item.assetRefId === assetId)

    expect(state.project.importedAssets?.[0]).toMatchObject({
      id: assetId,
      kind: 'model',
      sourceType: 'model',
      fileName: 'chair.obj',
    })
    expect(object).toMatchObject({
      kind: 'prop',
      name: 'chair',
      assetRefId: assetId,
    })

    useDirectorStore.getState().removeImportedAsset(assetId)
    expect(useDirectorStore.getState().project.importedAssets).toEqual([])
    expect(useDirectorStore.getState().project.objects.some((item) => item.assetRefId === assetId)).toBe(false)
  })

  it('removes imported asset references from snapshots so restore cannot revive deleted assets', () => {
    const assetId = useDirectorStore.getState().addImportedAsset({
      kind: 'model',
      fileName: 'chair.obj',
      name: 'chair',
      url: 'data:text/plain;base64,b2Jq',
    })
    const snapshotId = useDirectorStore.getState().addDirectorSnapshot({ name: '带模型快照' })
    expect(snapshotId).toBeTruthy()

    useDirectorStore.getState().removeImportedAsset(assetId)
    useDirectorStore.getState().restoreDirectorSnapshot(snapshotId as string)

    const state = useDirectorStore.getState()
    expect(state.project.importedAssets).toEqual([])
    expect(state.project.objects.some((item) => item.assetRefId === assetId)).toBe(false)
    expect(state.project.directorSnapshots?.[0].project.importedAssets).toEqual([])
    expect(state.project.directorSnapshots?.[0].project.objects.some((item) => item.assetRefId === assetId)).toBe(false)
  })

  it('adds scene instances from an existing imported model asset', () => {
    const assetId = useDirectorStore.getState().addImportedAsset({
      kind: 'model',
      fileName: 'spaceship.glb',
      name: 'spaceship',
      url: 'data:model/gltf-binary;base64,Z2xi',
      addToScene: false,
    })
    expect(useDirectorStore.getState().project.objects).toHaveLength(0)

    const firstObjectId = useDirectorStore.getState().addImportedModelInstance(assetId)
    const secondObjectId = useDirectorStore.getState().addImportedModelInstance(assetId)
    const state = useDirectorStore.getState()

    expect(state.project.objects.map((object) => ({
      id: object.id,
      name: object.name,
      assetRefId: object.assetRefId,
    }))).toEqual([
      { id: firstObjectId, name: 'spaceship', assetRefId: assetId },
      { id: secondObjectId, name: 'spaceship 2', assetRefId: assetId },
    ])
    expect(state.selectedId).toBe(secondObjectId)
    expect(state.selectedIds).toEqual([secondObjectId])
  })

  it('adds imported panoramas as scene background assets', () => {
    const assetId = useDirectorStore.getState().addImportedAsset({
      kind: 'panorama',
      fileName: 'studio.jpg',
      name: 'studio.jpg',
      url: 'data:image/jpeg;base64,a',
      projectionMode: 'equirectangular',
    })
    const state = useDirectorStore.getState()

    expect(state.project.scene.panoramaAssetId).toBe(assetId)
    expect(state.project.scene.panoramaRadius).toBe(60)
    expect(state.project.importedAssets?.[0]).toMatchObject({
      id: assetId,
      kind: 'panorama',
      sourceType: 'image',
      projectionMode: 'equirectangular',
    })
  })

  it('updates imported panorama projection mode', () => {
    const assetId = useDirectorStore.getState().addImportedAsset({
      kind: 'panorama',
      fileName: 'studio.jpg',
      name: 'studio.jpg',
      url: 'data:image/jpeg;base64,a',
      projectionMode: 'equirectangular',
    })

    useDirectorStore.getState().setImportedAssetField(assetId, 'projectionMode', 'backdrop')

    expect(useDirectorStore.getState().project.importedAssets?.[0].projectionMode).toBe('backdrop')
  })

  it('ignores invalid panorama asset ids when switching scene panorama', () => {
    const assetId = useDirectorStore.getState().addImportedAsset({
      kind: 'panorama',
      fileName: 'studio.jpg',
      name: 'studio.jpg',
      url: 'data:image/jpeg;base64,a',
      projectionMode: 'equirectangular',
    })

    useDirectorStore.getState().setSceneField('panoramaAssetId', 'missing-panorama')

    expect(useDirectorStore.getState().project.scene.panoramaAssetId).toBe(assetId)
  })

  it('keeps object-targeted cameras aimed at the selected object focus point', () => {
    const store = useDirectorStore.getState()
    const characterId = store.addObject({
      kind: 'character',
      name: '目标角色',
      transform: { position: [1, 0, -2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })

    useDirectorStore.getState().setCameraTargetObject('cam-1', characterId)
    expect(useDirectorStore.getState().project.cameras[0]).toMatchObject({
      targetMode: 'object',
      targetObjectId: characterId,
      target: [1, 1.05, -2],
    })

    useDirectorStore.getState().setObjectTransform(characterId, {
      position: [3, 0, -4],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
    expect(useDirectorStore.getState().project.cameras[0].target).toEqual([3, 1.05, -4])
  })

  it('clears object camera targets when the target object is removed', () => {
    const store = useDirectorStore.getState()
    const objectId = store.addObject({
      kind: 'prop',
      name: '目标道具',
      transform: { position: [2, 0.5, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })

    useDirectorStore.getState().setCameraTargetObject('cam-1', objectId)
    useDirectorStore.getState().removeObject(objectId)

    expect(useDirectorStore.getState().project.cameras[0]).toMatchObject({
      targetMode: 'manual',
      targetObjectId: null,
      target: [2, 1.1, 1],
    })
  })

  it('adds a camera from the current director viewport', () => {
    useDirectorStore.getState().setViewportCamera({
      fov: 36,
      position: [4, 2, 8],
      target: [1, 1.2, -1],
    })

    const cameraId = useDirectorStore.getState().addCameraFromViewport()
    const state = useDirectorStore.getState()
    const camera = state.project.cameras.find((item) => item.id === cameraId)

    expect(camera).toMatchObject({
      name: '机位 2',
      fov: 36,
      position: [4, 2, 8],
      target: [1, 1.2, -1],
      targetMode: 'manual',
      targetObjectId: null,
    })
    expect(state.selectedId).toBe(cameraId)
    expect(state.project.activeCameraId).toBe('cam-1')
  })

  it('updates the selected camera from the current director viewport', () => {
    useDirectorStore.getState().setCameraTargetObject('cam-1', null)
    useDirectorStore.getState().setViewportCamera({
      fov: 28,
      position: [-2, 3, 6],
      target: [0.5, 1, -0.5],
    })

    useDirectorStore.getState().updateCameraFromViewport('cam-1')

    expect(useDirectorStore.getState().project.cameras[0]).toMatchObject({
      fov: 28,
      position: [-2, 3, 6],
      target: [0.5, 1, -0.5],
      targetMode: 'manual',
      targetObjectId: null,
    })
  })

  it('duplicates a camera as an independent manual shot', () => {
    const store = useDirectorStore.getState()
    const objectId = store.addObject({
      kind: 'character',
      name: '镜头目标',
      transform: { position: [1, 0, -2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })
    useDirectorStore.getState().setCameraField('cam-1', 'name', '近景')
    useDirectorStore.getState().setCameraField('cam-1', 'fov', 38)
    useDirectorStore.getState().setCameraField('cam-1', 'position', [2, 1.8, 4])
    useDirectorStore.getState().setCameraTargetObject('cam-1', objectId)

    const copyId = useDirectorStore.getState().duplicateCamera('cam-1')
    const state = useDirectorStore.getState()
    const copy = state.project.cameras.find((camera) => camera.id === copyId)

    expect(copy).toMatchObject({
      name: '近景 副本',
      fov: 38,
      position: [2, 1.8, 4],
      target: [1, 1.05, -2],
      targetMode: 'manual',
      targetObjectId: null,
      visible: true,
    })
    expect(state.project.cameras).toHaveLength(2)
    expect(state.selectedId).toBe(copyId)
  })

  it('copies, pastes, and deletes multi-selected director objects', () => {
    const store = useDirectorStore.getState()
    const firstId = store.addObject({
      kind: 'character',
      name: '角色 A',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })
    const secondId = store.addObject({
      kind: 'prop',
      name: '道具 B',
      transform: { position: [2, 0, -1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })

    useDirectorStore.getState().select(firstId)
    useDirectorStore.getState().toggleObjectSelection(secondId)
    useDirectorStore.getState().copySelectedObjects()
    expect(useDirectorStore.getState().clipboard.map((object) => object.name)).toEqual(['角色 A', '道具 B'])

    useDirectorStore.getState().pasteClipboardObjects()
    const afterPaste = useDirectorStore.getState()
    expect(afterPaste.project.objects).toHaveLength(4)
    expect(afterPaste.selectedIds).toHaveLength(2)
    expect(afterPaste.project.objects.filter((object) => object.name.endsWith(' 副本'))).toHaveLength(2)

    useDirectorStore.getState().removeSelectedObjects()
    const afterDelete = useDirectorStore.getState()
    expect(afterDelete.project.objects.map((object) => object.id).sort()).toEqual([firstId, secondId].sort())
    expect(afterDelete.selectedIds).toEqual([])
  })

  it('toggles visibility and lock state for multi-selected objects', () => {
    const store = useDirectorStore.getState()
    const firstId = store.addObject({
      kind: 'character',
      name: '角色 A',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })
    const secondId = store.addObject({
      kind: 'prop',
      name: '道具 B',
      transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })
    const thirdId = store.addObject({
      kind: 'crowd',
      name: '群演 C',
      transform: { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })

    useDirectorStore.getState().select(firstId)
    useDirectorStore.getState().toggleObjectSelection(secondId)
    useDirectorStore.getState().setSelectedObjectsVisibility(false)
    useDirectorStore.getState().setSelectedObjectsLocked(true)

    const hiddenLocked = useDirectorStore.getState().project.objects
    expect(hiddenLocked.filter((object) => [firstId, secondId].includes(object.id)).map((object) => object.visible)).toEqual([false, false])
    expect(hiddenLocked.filter((object) => [firstId, secondId].includes(object.id)).map((object) => object.locked)).toEqual([true, true])
    expect(hiddenLocked.find((object) => object.id === thirdId)).toMatchObject({ visible: true, locked: false })

    useDirectorStore.getState().setSelectedObjectsVisibility(true)
    useDirectorStore.getState().setSelectedObjectsLocked(false)
    const restored = useDirectorStore.getState().project.objects
    expect(restored.filter((object) => [firstId, secondId].includes(object.id)).map((object) => object.visible)).toEqual([true, true])
    expect(restored.filter((object) => [firstId, secondId].includes(object.id)).map((object) => object.locked)).toEqual([false, false])
  })

  it('resets an object transform and keeps bound camera targets in sync', () => {
    const store = useDirectorStore.getState()
    const objectId = store.addObject({
      kind: 'character',
      name: '重置角色',
      transform: { position: [4, 0, -3], rotation: [0, 1.2, 0], scale: [1.8, 1.8, 1.8] },
    })
    useDirectorStore.getState().setCameraTargetObject('cam-1', objectId)

    useDirectorStore.getState().resetObjectTransform(objectId)

    const state = useDirectorStore.getState()
    expect(state.project.objects.find((object) => object.id === objectId)?.transform).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
    expect(state.project.cameras[0].target).toEqual([0, 1.05, 0])
  })

  it('updates object rotation without changing position or scale', () => {
    const objectId = useDirectorStore.getState().addObject({
      kind: 'prop',
      name: '旋转道具',
      transform: { position: [2, 0.5, -1], rotation: [0, 0, 0], scale: [1.4, 1.4, 1.4] },
    })

    useDirectorStore.getState().setObjectRotation(objectId, [0.1, 1.2, -0.3])

    expect(useDirectorStore.getState().project.objects.find((object) => object.id === objectId)?.transform).toEqual({
      position: [2, 0.5, -1],
      rotation: [0.1, 1.2, -0.3],
      scale: [1.4, 1.4, 1.4],
    })
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

  it('drops bound captures for cameras removed by director snapshot restore', () => {
    const snapshotId = useDirectorStore.getState().addDirectorSnapshot({ name: '单机位构图' })
    expect(snapshotId).toBeTruthy()
    const secondCameraId = useDirectorStore.getState().addCamera({ name: '临时机位' })
    const capId = useDirectorStore.getState().addCameraCapture(secondCameraId, 'data:image/jpeg;base64,temp', '临时截图', {
      fov: 44,
      position: [1, 2, 3],
      target: [0, 1, 0],
    })
    useDirectorStore.getState().toggleCaptureBound(secondCameraId, capId)

    useDirectorStore.getState().restoreDirectorSnapshot(snapshotId as string)

    const state = useDirectorStore.getState()
    expect(state.project.cameras.map((camera) => camera.id)).toEqual(['cam-1'])
    expect(state.cameraCaptures[secondCameraId]).toBeUndefined()
    expect(collectBoundShotsForSave()).toEqual([])
  })

  it('drops captures when their camera is deleted', () => {
    const cameraId = useDirectorStore.getState().addCamera({ name: '待删机位' })
    const capId = useDirectorStore.getState().addCameraCapture(cameraId, 'data:image/jpeg;base64,deleted', '待删截图', {
      fov: 38,
      position: [1, 2, 3],
      target: [0, 1, 0],
    })
    useDirectorStore.getState().toggleCaptureBound(cameraId, capId)

    useDirectorStore.getState().removeCamera(cameraId)

    expect(useDirectorStore.getState().project.cameras.some((camera) => camera.id === cameraId)).toBe(false)
    expect(useDirectorStore.getState().cameraCaptures[cameraId]).toBeUndefined()
    expect(collectBoundShotsForSave()).toEqual([])
  })

  it('skips bound captures whose camera no longer exists when saving', () => {
    useDirectorStore.setState((state) => ({
      cameraCaptures: {
        ...state.cameraCaptures,
        'missing-camera': [
          {
            id: 'cap-missing-camera',
            dataUrl: 'data:image/jpeg;base64,missing',
            isBound: true,
            isActiveStar: true,
            name: '失效机位截图',
            capturedAt: Date.now(),
            capturedFov: 40,
            capturedPosition: [1, 2, 3],
            capturedTarget: [0, 1, 0],
          },
        ],
      },
    }))

    expect(collectBoundShotsForSave()).toEqual([])
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
      note: '第一版备注',
      assetIds: ['asset-2', 'asset-1'],
    })
    expect(boardId).toBeTruthy()
    expect(useDirectorStore.getState().project.directorStoryboardBoards?.[0]).toMatchObject({
      id: boardId,
      name: '自定义分镜板',
      note: '第一版备注',
      coverImageUrl: 'cos/two.png',
      assetIds: ['asset-2', 'asset-1'],
    })

    useDirectorStore.getState().saveDirectorStoryboardBoard({
      boardId: boardId as string,
      name: '改名分镜板',
      note: '修改后的备注',
      assetIds: ['asset-1'],
      items: [
        { assetId: 'asset-1', x: 0.12, y: 0.23, width: 0.64, height: 0.72, rotation: 0.33 },
      ],
    })
    expect(useDirectorStore.getState().project.directorStoryboardBoards?.[0]).toMatchObject({
      id: boardId,
      name: '改名分镜板',
      note: '修改后的备注',
      coverImageUrl: 'cos/one.png',
      assetIds: ['asset-1'],
      items: [
        { assetId: 'asset-1', x: 0.12, y: 0.23, width: 0.64, height: 0.72, rotation: 0.33 },
      ],
    })

    useDirectorStore.getState().removeDirectorStoryboardBoard(boardId as string)
    expect(useDirectorStore.getState().project.directorStoryboardBoards).toEqual([])
  })
})
