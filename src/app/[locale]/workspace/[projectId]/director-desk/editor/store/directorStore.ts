/**
 * Director Desk — zustand store.
 * In-memory only: persists via save API; undo/redo capped at 50.
 */
import { create } from 'zustand'
import type {
  DirectorProject,
  DirectorObject,
  DirectorCamera,
  DirectorSceneSettings,
  DirectorSnapshot,
  DirectorStoryboardAsset,
  DirectorStoryboardBoard,
  DirectorStoryboardBoardItem,
  GeometryPrimitiveType,
  DirectorImportedAsset,
  DirectorImportedAssetKind,
  PanoramaProjectionMode,
} from '@/lib/director-desk/schema'
import { createDefaultDirectorProject } from '@/lib/director-desk/schema'
import { getDirectorObjectFocusTarget } from '@/lib/director-desk/camera-target'

interface LoadedPanel {
  directorLayout: unknown
  directorShots?: Array<{ id?: string; cameraId: string; name: string; isActive: boolean; imageUrl: string; imageMediaId?: string | null; note?: string; fov: number; pos: [number,number,number]; target: [number,number,number] }>
  characters: Array<{ name?: string; imageMediaId?: string | null; imageUrl?: string | null }>
  props: Array<{ name?: string; imageMediaId?: string | null; imageUrl?: string | null }>
  location?: { imageUrl?: string | null } | null
}

export interface CameraCapture {
  id: string
  dataUrl: string
  isBound: boolean
  isActiveStar: boolean
  name: string
  note?: string
  capturedAt: number
  /** Set for shots hydrated from DB so save can retain/update them without re-uploading. */
  persistedShotId?: string
  persistedImageMediaId?: string
  /** DB camera fields (fov/pos/target) at time of hydration, for save fallback if camera moved. */
  persistedFov?: number
  persistedPos?: [number, number, number]
  persistedTarget?: [number, number, number]
  capturedFov?: number
  capturedPosition?: [number, number, number]
  capturedTarget?: [number, number, number]
}

export interface ViewportCameraSnapshot {
  fov: number
  position: [number, number, number]
  target: [number, number, number]
}

export interface ImportedAssetInput {
  kind: DirectorImportedAssetKind
  name: string
  fileName: string
  url: string
  addToScene?: boolean
  projectionMode?: PanoramaProjectionMode
}

interface DirectorState {
  project: DirectorProject
  selectedId: string | null
  selectedIds: string[]
  viewMode: 'director' | 'camera'
  transformMode: 'translate' | 'rotate' | 'scale'
  viewportPanelsCollapsed: boolean
  viewportRuleOfThirdsEnabled: boolean
  isDirty: boolean
  history: DirectorProject[]
  future: DirectorProject[]
  clipboard: DirectorObject[]
  clipboardPasteCount: number
  panelId: string
  projectId: string
  videoRatio: string
  loaded: boolean
  glCanvas: HTMLCanvasElement | null
  viewportCamera: ViewportCameraSnapshot | null
  cameraCaptures: Record<string, CameraCapture[]>

  load: (project: DirectorProject, panelId: string, projectId: string, videoRatio: string, boundShots?: Array<{cameraId:string;name:string;isActive:boolean;imageUrl:string;note?:string;fov:number;pos:[number,number,number];target:[number,number,number]}>) => void
  reset: () => void
  replaceProject: (project: DirectorProject) => void
  select: (id: string | null) => void
  toggleObjectSelection: (id: string) => void
  setViewMode: (m: 'director' | 'camera') => void
  /** Silent: set viewMode without pushing undo history (used for temporary capture view switches). */
  setViewModeSilent: (m: 'director' | 'camera') => void
  setTransformMode: (m: 'translate' | 'rotate' | 'scale') => void
  setViewportPanelsCollapsed: (collapsed: boolean) => void
  toggleViewportPanelsCollapsed: () => void
  setViewportRuleOfThirdsEnabled: (enabled: boolean) => void
  setSceneField: <K extends keyof DirectorSceneSettings>(k: K, v: DirectorSceneSettings[K]) => void
  setObjectField: <K extends keyof DirectorObject>(id: string, k: K, v: DirectorObject[K]) => void
  setObjectTransform: (id: string, t: DirectorObject['transform']) => void
  setObjectRotation: (id: string, rotation: [number, number, number]) => void
  resetObjectTransform: (id: string) => void
  addObject: (partial: Partial<DirectorObject> & { kind: DirectorObject['kind']; name: string }) => string
  addGeometryPrimitive: (geometryType: GeometryPrimitiveType) => string
  addImportedAsset: (input: ImportedAssetInput) => string
  setImportedAssetField: <K extends keyof DirectorImportedAsset>(assetId: string, k: K, v: DirectorImportedAsset[K]) => void
  addImportedModelInstance: (assetId: string) => string | null
  removeImportedAsset: (assetId: string) => void
  duplicateObject: (id: string) => string | null
  removeObject: (id: string) => void
  removeSelectedObjects: () => void
  setSelectedObjectsVisibility: (visible: boolean) => void
  setSelectedObjectsLocked: (locked: boolean) => void
  copySelectedObjects: () => void
  pasteClipboardObjects: () => void
  addCamera: (partial?: Partial<DirectorCamera>) => string
  addCameraFromViewport: () => string | null
  duplicateCamera: (id: string) => string | null
  removeCamera: (id: string) => void
  setCameraField: <K extends keyof DirectorCamera>(id: string, k: K, v: DirectorCamera[K]) => void
  setCameraTargetObject: (cameraId: string, objectId: string | null) => void
  updateCameraFromViewport: (cameraId: string) => void
  setActiveCamera: (id: string) => void
  /** Silent: set active camera without pushing undo history (used for temporary capture switches). */
  setActiveCameraSilent: (id: string) => void
  addCameraCapture: (cameraId: string, dataUrl: string, name?: string, meta?: { fov: number; position: [number, number, number]; target: [number, number, number] }) => string
  addDirectorSnapshot: (input: { name?: string; dataUrl?: string; note?: string; camera?: ViewportCameraSnapshot }) => string | null
  restoreDirectorSnapshot: (snapshotId: string) => void
  setDirectorSnapshotName: (snapshotId: string, name: string) => void
  setDirectorSnapshotNote: (snapshotId: string, note: string) => void
  removeDirectorSnapshot: (snapshotId: string) => void
  createDirectorStoryboardBoard: (input?: { name?: string; note?: string; assetIds?: string[]; items?: DirectorStoryboardBoardItem[] }) => string | null
  saveDirectorStoryboardBoard: (input: { boardId?: string; name?: string; note?: string; assetIds: string[]; items?: DirectorStoryboardBoardItem[] }) => string | null
  removeDirectorStoryboardBoard: (boardId: string) => void
  toggleCaptureBound: (cameraId: string, captureId: string) => void
  toggleCaptureActive: (cameraId: string, captureId: string) => void
  setCaptureName: (cameraId: string, captureId: string, name: string) => void
  setCaptureNote: (cameraId: string, captureId: string, note: string) => void
  removeCameraCapture: (cameraId: string, captureId: string) => void
  restoreCameraCapturePose: (cameraId: string, captureId: string) => void
  createCameraFromCapturePose: (cameraId: string, captureId: string) => string | null
  bindAllCapturesForCamera: (cameraId: string) => void
  unbindAllCapturesForCamera: (cameraId: string) => void
  bindAllCaptures: () => void
  clearBoundCaptures: () => void
  hydrateBoundShots: (shots: Array<{id?:string;cameraId:string;name:string;isActive:boolean;imageUrl:string;imageMediaId?:string|null;note?:string;fov?:number;pos?:[number,number,number];target?:[number,number,number]}>) => void
  setGlCanvas: (canvas: HTMLCanvasElement | null) => void
  setViewportCamera: (camera: ViewportCameraSnapshot | null) => void
  undo: () => void
  redo: () => void
}

function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function pushHistory(state: DirectorState, next: DirectorProject): Partial<DirectorState> {
  const history = [...state.history, clone(state.project)].slice(-50)
  return { project: next, history, future: [], isDirty: true }
}

function createSnapshotProject(project: DirectorProject): DirectorProject {
  const snapshotProject = clone(project)
  delete snapshotProject.directorSnapshots
  return snapshotProject
}

function clearCameraTargetsForObjects(project: DirectorProject, removedObjectIds: Set<string>): void {
  for (const camera of project.cameras) {
    if (camera.targetMode === 'object' && camera.targetObjectId && removedObjectIds.has(camera.targetObjectId)) {
      camera.targetMode = 'manual'
      camera.targetObjectId = null
    }
  }
}

function removeImportedAssetReferences(project: DirectorProject, assetId: string): Set<string> {
  project.importedAssets = (project.importedAssets ?? []).filter((item) => item.id !== assetId)
  if (project.scene.panoramaAssetId === assetId) {
    project.scene.panoramaAssetId = null
  }
  const removedObjectIds = new Set(project.objects.filter((object) => object.assetRefId === assetId).map((object) => object.id))
  project.objects = project.objects.filter((object) => object.assetRefId !== assetId)
  clearCameraTargetsForObjects(project, removedObjectIds)
  for (const snapshot of project.directorSnapshots ?? []) {
    removeImportedAssetReferences(snapshot.project, assetId)
  }
  return removedObjectIds
}

function buildDirectorStoryboardBoard(
  assets: DirectorStoryboardAsset[],
  boards: DirectorStoryboardBoard[],
  input: { boardId?: string; name?: string; note?: string; assetIds: string[]; items?: DirectorStoryboardBoardItem[] },
): DirectorStoryboardBoard | null {
  const requestedIds = input.assetIds.length ? new Set(input.assetIds) : null
  if (!requestedIds) return null
  const selectedAssets = input.assetIds
    .map((assetId) => assets.find((asset) => asset.id === assetId))
    .filter((asset): asset is DirectorStoryboardAsset => !!asset)
  if (selectedAssets.length === 0) return null
  const existing = input.boardId ? boards.find((board) => board.id === input.boardId) : null
  const boardId = existing?.id ?? uid('director-board')
  const inputItemsByAssetId = new Map((input.items ?? []).map((item) => [item.assetId, item]))
  const existingItemsByAssetId = new Map((existing?.items ?? []).map((item) => [item.assetId, item]))
  return {
    id: boardId,
    name: input.name?.trim() || existing?.name || `导演台分镜板 ${boards.length + 1}`,
    createdAt: existing?.createdAt ?? Date.now(),
    coverImageUrl: selectedAssets[0].imageUrl,
    assetIds: selectedAssets.map((asset) => asset.id),
    items: selectedAssets.map((asset, index) => {
      const item = inputItemsByAssetId.get(asset.id) ?? existingItemsByAssetId.get(asset.id)
      return item
        ? {
            assetId: asset.id,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            rotation: item.rotation,
          }
        : {
            assetId: asset.id,
            x: asset.layout.x,
            y: asset.layout.y + index * 0.08,
            width: asset.layout.width,
            height: asset.layout.height,
            rotation: asset.layout.rotation,
          }
    }),
    note: input.note?.trim() || undefined,
  }
}

function findNextImportedAssetId(assets: DirectorImportedAsset[]): string {
  const existing = new Set(assets.map((asset) => asset.id))
  for (let index = assets.length + 1; index < assets.length + 1000; index++) {
    const id = `asset-${index}`
    if (!existing.has(id)) return id
  }
  return uid('asset')
}

function createImportedModelObject(asset: DirectorImportedAsset, objectId: string, name: string): DirectorObject {
  return {
    id: objectId,
    kind: 'prop',
    name,
    refId: null,
    visible: true,
    locked: false,
    color: '#8FB7FF',
    mode: 'mannequin',
    assetRefId: asset.id,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  }
}

function getImportedModelBaseName(asset: DirectorImportedAsset): string {
  return asset.name || asset.fileName.replace(/\.(fbx|obj|glb|gltf)$/i, '')
}

function getCapturePose(capture: CameraCapture | undefined): ViewportCameraSnapshot | null {
  const fov = capture?.capturedFov ?? capture?.persistedFov
  const position = capture?.capturedPosition ?? capture?.persistedPos
  const target = capture?.capturedTarget ?? capture?.persistedTarget
  if (!capture || typeof fov !== 'number' || !position || !target) return null
  return { fov, position, target }
}

export const useDirectorStore = create<DirectorState>((set, get) => ({
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
  panelId: '',
  projectId: '',
  videoRatio: '9:16',
  loaded: false,
  glCanvas: null,
  viewportCamera: null,
  cameraCaptures: {},

  load(project, panelId, projectId, videoRatio, boundShots) {
    const cameraCaptures: Record<string, CameraCapture[]> = {}
    if (boundShots) {
      for (const s of boundShots) {
        const cap: CameraCapture = {
          id: uid('cap'),
          dataUrl: s.imageUrl,
          isBound: true,
          isActiveStar: !!s.isActive,
          name: s.name || '机位',
          note: s.note,
          capturedAt: Date.now(),
          persistedShotId: (s as { id?: string }).id,
          persistedImageMediaId: (s as { imageMediaId?: string | null }).imageMediaId ?? undefined,
          persistedFov: s.fov,
          persistedPos: s.pos,
          persistedTarget: s.target,
          capturedFov: s.fov,
          capturedPosition: s.pos,
          capturedTarget: s.target,
        }
        if (!cameraCaptures[s.cameraId]) cameraCaptures[s.cameraId] = []
        cameraCaptures[s.cameraId].push(cap)
      }
    }
    set({
      project: clone(project),
      panelId,
      projectId,
      videoRatio,
      loaded: true,
      isDirty: false,
      history: [],
      future: [],
      selectedId: null,
      selectedIds: [],
      viewMode: 'director',
      cameraCaptures,
    })
  },

  async reset() {
    // Caller reloads from API; for now just mark not dirty and clear history (actual reload is page-level)
    const { panelId, projectId } = get()
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/director-desk/load?panelId=${encodeURIComponent(panelId)}`)
      if (!res.ok) return
      const data = await res.json() as {
        panel: LoadedPanel
        project: { videoRatio: string }
      }
      const { initDirectorProjectFromPanel } = await import('@/lib/director-desk/init')
      const { parseDirectorProject } = await import('@/lib/director-desk/schema')
      const parsed = data.panel.directorLayout ? parseDirectorProject(data.panel.directorLayout) : null
      const proj: DirectorProject = parsed
        ?? initDirectorProjectFromPanel({ panel: data.panel as unknown as Parameters<typeof initDirectorProjectFromPanel>[0]['panel'], project: data.project })
      // Re-inject signed imageUrls onto objects (not persisted). refId-first, name fallback for legacy layouts.
      for (const o of proj.objects) {
        let url: string | null = null
        if (o.refId) {
          const ch = data.panel.characters.find((c) => c.imageMediaId === o.refId)
          const pr = data.panel.props.find((p) => p.imageMediaId === o.refId)
          url = ch?.imageUrl ?? pr?.imageUrl ?? null
        }
        if (!url && o.kind === 'character') {
          const ch = data.panel.characters.find((c) => c.name === o.name)
          url = ch?.imageUrl ?? null
        }
        if (!url && o.kind === 'prop') {
          const pr = data.panel.props.find((p) => p.name === o.name)
          url = pr?.imageUrl ?? null
        }
        if (url) o.imageUrl = url
      }
      // Set backdrop signed url
      if (data.panel.location?.imageUrl) {
        proj.scene.backdropImageUrl = data.panel.location.imageUrl
      }
      set({
        project: proj, history: [], future: [], isDirty: false, selectedId: null, selectedIds: [], viewMode: 'director',
        cameraCaptures: buildCapturesFromShots(data.panel.directorShots ?? []),
      })
    } catch (e) {
      console.error('reset failed', e)
    }
  },

  replaceProject(project) {
    set({
      ...pushHistory(get(), clone(project)),
      selectedId: null,
      selectedIds: [],
      viewMode: 'director',
      cameraCaptures: {},
      clipboard: [],
      clipboardPasteCount: 0,
    })
  },

  select(id) { set({ selectedId: id, selectedIds: id ? [id] : [] }) },
  toggleObjectSelection(id) {
    const { selectedIds } = get()
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id]
    set({ selectedIds: nextIds, selectedId: nextIds[nextIds.length - 1] ?? null })
  },
  setViewMode(m) { set({ viewMode: m }) },
  setViewModeSilent(m) { set({ viewMode: m }) },
  setTransformMode(m) { set({ transformMode: m }) },
  setViewportPanelsCollapsed(collapsed) { set({ viewportPanelsCollapsed: collapsed }) },
  toggleViewportPanelsCollapsed() { set({ viewportPanelsCollapsed: !get().viewportPanelsCollapsed }) },
  setViewportRuleOfThirdsEnabled(enabled) { set({ viewportRuleOfThirdsEnabled: enabled }) },
  setGlCanvas(canvas) { set({ glCanvas: canvas }) },
  setViewportCamera(camera) { set({ viewportCamera: camera }) },

  setSceneField(k, v) {
    const { project } = get()
    if (k === 'panoramaAssetId' && v) {
      const exists = project.importedAssets?.some((asset) => asset.id === v && asset.kind === 'panorama')
      if (!exists) return
    }
    const next = clone(project)
    next.scene[k] = v
    set(pushHistory(get(), next))
  },

  setObjectField(id, k, v) {
    const { project } = get()
    const next = clone(project)
    const o = next.objects.find(x => x.id === id)
    if (!o) return
    ;(o as Record<keyof DirectorObject, unknown>)[k] = v
    set(pushHistory(get(), next))
  },

  setObjectTransform(id, t) {
    const { project } = get()
    const next = clone(project)
    const o = next.objects.find(x => x.id === id)
    if (!o) return
    o.transform = t
    for (const camera of next.cameras) {
      if (camera.targetMode === 'object' && camera.targetObjectId === id) {
        camera.target = getDirectorObjectFocusTarget(o)
      }
    }
    set(pushHistory(get(), next))
  },

  setObjectRotation(id, rotation) {
    const object = get().project.objects.find(item => item.id === id)
    if (!object) return
    get().setObjectTransform(id, {
      ...object.transform,
      rotation,
    })
  },

  resetObjectTransform(id) {
    get().setObjectTransform(id, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
  },

  addObject(partial) {
    const { project } = get()
    const next = clone(project)
    const id = uid(partial.kind)
    // omit caller-provided id (we generate our own); build rest without it
    const { id: _unusedId, ...partialRest } = partial as Partial<DirectorObject> & { id?: string }
    void _unusedId
    const newObj: DirectorObject = {
      kind: partial.kind,
      name: partial.name,
      refId: partial.refId ?? null,
      visible: partial.visible ?? true,
      locked: partial.locked ?? false,
      color: partial.color ?? '#7AA7FF',
      mode: partial.mode ?? (partial.kind === 'character' ? 'mannequin' : 'billboard'),
      transform: partial.transform ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      ...partialRest,
      id,
    }
    next.objects.push(newObj)
    set(pushHistory(get(), next))
    set({ selectedId: id, selectedIds: [id] })
    return id
  },

  addGeometryPrimitive(geometryType) {
    const labelMap: Record<GeometryPrimitiveType, string> = {
      box: '立方体',
      sphere: '球体',
      cylinder: '圆柱体',
      torus: '环状体',
      cone: '圆锥',
      pyramid: '棱锥',
    }
    return get().addObject({
      kind: 'prop',
      name: labelMap[geometryType],
      refId: null,
      color: '#8FB7FF',
      mode: 'mannequin',
      geometryType,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    })
  },

  addImportedAsset(input) {
    const { project } = get()
    const next = clone(project)
    const importedAssets = [...(next.importedAssets ?? [])]
    const assetId = findNextImportedAssetId(importedAssets)
    const asset: DirectorImportedAsset = {
      id: assetId,
      kind: input.kind,
      sourceType: input.kind === 'panorama' ? 'image' : 'model',
      fileName: input.fileName,
      name: input.name,
      url: input.url,
      projectionMode: input.projectionMode,
    }
    importedAssets.push(asset)
    next.importedAssets = importedAssets

    if (input.kind === 'panorama') {
      next.scene.panoramaAssetId = assetId
      next.scene.panoramaRadius = next.scene.panoramaRadius ?? 60
      next.scene.panoramaYaw = next.scene.panoramaYaw ?? 0
      set({ ...pushHistory(get(), next), selectedId: null, selectedIds: [] })
      return assetId
    }

    if (input.addToScene !== false) {
      const objectId = uid('prop')
      next.objects.push(createImportedModelObject(asset, objectId, getImportedModelBaseName(asset)))
      set({ ...pushHistory(get(), next), selectedId: objectId, selectedIds: [objectId] })
      return assetId
    }

    set(pushHistory(get(), next))
    return assetId
  },

  setImportedAssetField(assetId, k, v) {
    const { project } = get()
    const next = clone(project)
    const asset = next.importedAssets?.find((item) => item.id === assetId)
    if (!asset) return
    ;(asset as Record<keyof DirectorImportedAsset, unknown>)[k] = v
    set(pushHistory(get(), next))
  },

  addImportedModelInstance(assetId) {
    const { project } = get()
    const asset = project.importedAssets?.find((item) => item.id === assetId && item.kind === 'model')
    if (!asset) return null
    const next = clone(project)
    const objectId = uid('prop')
    const baseName = getImportedModelBaseName(asset)
    const existingCount = next.objects.filter((object) => object.assetRefId === assetId).length
    next.objects.push(createImportedModelObject(asset, objectId, existingCount === 0 ? baseName : `${baseName} ${existingCount + 1}`))
    set({ ...pushHistory(get(), next), selectedId: objectId, selectedIds: [objectId] })
    return objectId
  },

  removeImportedAsset(assetId) {
    const { project, selectedId, selectedIds } = get()
    const next = clone(project)
    const asset = next.importedAssets?.find((item) => item.id === assetId)
    if (!asset) return
    const removedObjectIds = removeImportedAssetReferences(next, assetId)
    const nextSelectedIds = selectedIds.filter((id) => !removedObjectIds.has(id))
    set({
      ...pushHistory(get(), next),
      selectedId: selectedId && removedObjectIds.has(selectedId) ? nextSelectedIds[nextSelectedIds.length - 1] ?? null : selectedId,
      selectedIds: nextSelectedIds,
    })
  },

  duplicateObject(id) {
    const { project } = get()
    const src = project.objects.find(o => o.id === id)
    if (!src) return null
    const next = clone(project)
    const newId = uid(src.kind)
    const copy: DirectorObject = {
      ...clone(src),
      id: newId,
      name: src.name + ' 副本',
      transform: {
        ...src.transform,
        position: [src.transform.position[0] + 1, src.transform.position[1], src.transform.position[2]],
      },
    }
    next.objects.push(copy)
    set(pushHistory(get(), next))
    set({ selectedId: newId, selectedIds: [newId] })
    return newId
  },

  removeObject(id) {
    const { project, selectedId, selectedIds } = get()
    const next = clone(project)
    next.objects = next.objects.filter(o => o.id !== id)
    clearCameraTargetsForObjects(next, new Set([id]))
    const nextSelectedIds = selectedIds.filter((item) => item !== id)
    set({
      ...pushHistory(get(), next),
      selectedId: selectedId === id ? nextSelectedIds[nextSelectedIds.length - 1] ?? null : selectedId,
      selectedIds: nextSelectedIds,
    })
  },

  removeSelectedObjects() {
    const { project, selectedId, selectedIds } = get()
    const ids = new Set(selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [])
    if (ids.size === 0) return
    const objectIds = new Set(project.objects.filter((object) => ids.has(object.id)).map((object) => object.id))
    if (objectIds.size === 0) {
      if (selectedId && project.cameras.some((camera) => camera.id === selectedId)) {
        get().removeCamera(selectedId)
      }
      return
    }
    const next = clone(project)
    next.objects = next.objects.filter((object) => !objectIds.has(object.id))
    clearCameraTargetsForObjects(next, objectIds)
    set({ ...pushHistory(get(), next), selectedId: null, selectedIds: [] })
  },

  setSelectedObjectsVisibility(visible) {
    const { project, selectedId, selectedIds } = get()
    const ids = new Set(selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [])
    if (ids.size === 0) return
    const next = clone(project)
    let changed = false
    for (const object of next.objects) {
      if (!ids.has(object.id) || object.visible === visible) continue
      object.visible = visible
      changed = true
    }
    if (!changed) return
    set(pushHistory(get(), next))
  },

  setSelectedObjectsLocked(locked) {
    const { project, selectedId, selectedIds } = get()
    const ids = new Set(selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [])
    if (ids.size === 0) return
    const next = clone(project)
    let changed = false
    for (const object of next.objects) {
      if (!ids.has(object.id) || object.locked === locked) continue
      object.locked = locked
      changed = true
    }
    if (!changed) return
    set(pushHistory(get(), next))
  },

  copySelectedObjects() {
    const { project, selectedId, selectedIds } = get()
    const ids = selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : []
    const clipboard = ids
      .map((id) => project.objects.find((object) => object.id === id))
      .filter((object): object is DirectorObject => !!object)
      .map((object) => clone(object))
    set({ clipboard, clipboardPasteCount: 0 })
  },

  pasteClipboardObjects() {
    const { project, clipboard, clipboardPasteCount } = get()
    if (clipboard.length === 0) return
    const next = clone(project)
    const offset = 0.6 * (clipboardPasteCount + 1)
    const pastedIds: string[] = []
    for (const source of clipboard) {
      const id = uid(source.kind)
      pastedIds.push(id)
      next.objects.push({
        ...clone(source),
        id,
        name: `${source.name} 副本`,
        transform: {
          ...source.transform,
          position: [
            source.transform.position[0] + offset,
            source.transform.position[1],
            source.transform.position[2] + offset,
          ],
        },
      })
    }
    set({
      ...pushHistory(get(), next),
      selectedId: pastedIds[pastedIds.length - 1] ?? null,
      selectedIds: pastedIds,
      clipboardPasteCount: clipboardPasteCount + 1,
    })
  },

  addCamera(partial) {
    const { project } = get()
    const next = clone(project)
    const id = uid('cam')
    const newCam: DirectorCamera = {
      id,
      name: partial?.name ?? `机位 ${next.cameras.length + 1}`,
      fov: partial?.fov ?? 50,
      position: partial?.position ?? [0, 1.55, 5.4],
      target: partial?.target ?? [0, 1.05, 0],
      targetMode: partial?.targetMode ?? 'manual',
      targetObjectId: partial?.targetObjectId ?? null,
      visible: true,
    }
    next.cameras.push(newCam)
    set(pushHistory(get(), next))
    set({ selectedId: id, selectedIds: [id] })
    return id
  },

  addCameraFromViewport() {
    const { viewportCamera } = get()
    if (!viewportCamera) return null
    return get().addCamera({
      fov: viewportCamera.fov,
      position: viewportCamera.position,
      target: viewportCamera.target,
      targetMode: 'manual',
      targetObjectId: null,
    })
  },

  duplicateCamera(id) {
    const { project } = get()
    const source = project.cameras.find(camera => camera.id === id)
    if (!source) return null
    const next = clone(project)
    const copyId = uid('cam')
    next.cameras.push({
      ...clone(source),
      id: copyId,
      name: `${source.name} 副本`,
      targetMode: 'manual',
      targetObjectId: null,
    })
    set(pushHistory(get(), next))
    set({ selectedId: copyId, selectedIds: [copyId] })
    return copyId
  },

  removeCamera(id) {
    const { project, cameraCaptures } = get()
    if (project.cameras.length <= 1) return
    const next = clone(project)
    next.cameras = next.cameras.filter(c => c.id !== id)
    if (next.activeCameraId === id) next.activeCameraId = next.cameras[0].id
    const nextCameraCaptures = { ...cameraCaptures }
    delete nextCameraCaptures[id]
    set({ ...pushHistory(get(), next), selectedId: null, selectedIds: [], cameraCaptures: nextCameraCaptures })
  },

  setCameraField(id, k, v) {
    const { project } = get()
    const next = clone(project)
    const c = next.cameras.find(x => x.id === id)
    if (!c) return
    ;(c as Record<keyof DirectorCamera, unknown>)[k] = v
    if (k === 'target') {
      c.targetMode = 'manual'
      c.targetObjectId = null
    }
    set(pushHistory(get(), next))
  },

  setCameraTargetObject(cameraId, objectId) {
    const { project } = get()
    const next = clone(project)
    const camera = next.cameras.find(x => x.id === cameraId)
    if (!camera) return
    if (!objectId) {
      camera.targetMode = 'manual'
      camera.targetObjectId = null
      set(pushHistory(get(), next))
      return
    }
    const object = next.objects.find(x => x.id === objectId)
    if (!object) return
    camera.targetMode = 'object'
    camera.targetObjectId = object.id
    camera.target = getDirectorObjectFocusTarget(object)
    set(pushHistory(get(), next))
  },

  updateCameraFromViewport(cameraId) {
    const { project, viewportCamera } = get()
    if (!viewportCamera) return
    const next = clone(project)
    const camera = next.cameras.find(x => x.id === cameraId)
    if (!camera) return
    camera.fov = viewportCamera.fov
    camera.position = viewportCamera.position
    camera.target = viewportCamera.target
    camera.targetMode = 'manual'
    camera.targetObjectId = null
    set(pushHistory(get(), next))
  },

  setActiveCamera(id) {
    const { project } = get()
    if (!project.cameras.find(c => c.id === id)) return
    const next = clone(project)
    next.activeCameraId = id
    set(pushHistory(get(), next))
  },

  setActiveCameraSilent(id) {
    const { project } = get()
    if (!project.cameras.find(c => c.id === id)) return
    set({ project: { ...project, activeCameraId: id } })
  },

  addCameraCapture(cameraId, dataUrl, name, meta) {
    const { cameraCaptures } = get()
    const capId = uid('cap')
    const list = [...(cameraCaptures[cameraId] ?? [])]
    list.push({
      id: capId,
      dataUrl,
      isBound: false,
      isActiveStar: list.length === 0,
      name: name ?? `截图 ${list.length + 1}`,
      capturedAt: Date.now(),
      capturedFov: meta?.fov,
      capturedPosition: meta?.position,
      capturedTarget: meta?.target,
    })
    set({ cameraCaptures: { ...cameraCaptures, [cameraId]: list }, isDirty: true })
    return capId
  },

  addDirectorSnapshot(input) {
    const { project } = get()
    const camera = project.cameras.find(c => c.id === project.activeCameraId) ?? project.cameras[0]
    if (!camera) return null
    const snapshotCamera = input.camera ?? {
      fov: camera.fov,
      position: camera.position,
      target: camera.target,
    }
    const snapshotProject = createSnapshotProject(project)
    snapshotProject.activeCameraId = camera.id
    snapshotProject.cameras = snapshotProject.cameras.map(item =>
      item.id === camera.id
        ? {
            ...item,
            fov: snapshotCamera.fov,
            position: snapshotCamera.position,
            target: snapshotCamera.target,
          }
        : item,
    )
    const snapshots = project.directorSnapshots ?? []
    const snapshotId = uid('snap')
    const snapshot: DirectorSnapshot = {
      id: snapshotId,
      name: input.name?.trim() || `快照 ${snapshots.length + 1}`,
      capturedAt: Date.now(),
      project: snapshotProject,
      cameraId: camera.id,
      camera: snapshotCamera,
      imageDataUrl: input.dataUrl,
      note: input.note,
    }
    const next = {
      ...project,
      directorSnapshots: [snapshot, ...snapshots].slice(0, 24),
    }
    set(pushHistory(get(), next))
    return snapshotId
  },

  restoreDirectorSnapshot(snapshotId) {
    const { project, cameraCaptures } = get()
    const snapshot = project.directorSnapshots?.find(item => item.id === snapshotId)
    if (!snapshot) return
    const snapshots = project.directorSnapshots ?? []
    const next = {
      ...createSnapshotProject(snapshot.project),
      directorSnapshots: snapshots,
      activeCameraId: snapshot.cameraId,
      cameras: snapshot.project.cameras.some(camera => camera.id === snapshot.cameraId)
        ? snapshot.project.cameras.map(camera => camera.id === snapshot.cameraId
          ? { ...camera, fov: snapshot.camera.fov, position: snapshot.camera.position, target: snapshot.camera.target }
          : camera)
        : [
            ...snapshot.project.cameras,
            {
              id: snapshot.cameraId,
              name: snapshot.name,
              fov: snapshot.camera.fov,
              position: snapshot.camera.position,
              target: snapshot.camera.target,
              visible: true,
            },
          ],
      directorStoryboardAssets: project.directorStoryboardAssets,
      directorStoryboardBoards: project.directorStoryboardBoards,
    }
    const cameraIds = new Set(next.cameras.map(camera => camera.id))
    const nextCameraCaptures: Record<string, CameraCapture[]> = {}
    for (const [cameraId, captures] of Object.entries(cameraCaptures)) {
      if (cameraIds.has(cameraId)) nextCameraCaptures[cameraId] = captures
    }
    set({ ...pushHistory(get(), next), selectedId: null, selectedIds: [], viewMode: 'director', cameraCaptures: nextCameraCaptures })
  },

  setDirectorSnapshotName(snapshotId, name) {
    const { project } = get()
    const snapshots = (project.directorSnapshots ?? []).map(snapshot =>
      snapshot.id === snapshotId ? { ...snapshot, name } : snapshot,
    )
    set(pushHistory(get(), { ...project, directorSnapshots: snapshots }))
  },

  setDirectorSnapshotNote(snapshotId, note) {
    const { project } = get()
    const snapshots = (project.directorSnapshots ?? []).map(snapshot =>
      snapshot.id === snapshotId ? { ...snapshot, note } : snapshot,
    )
    set(pushHistory(get(), { ...project, directorSnapshots: snapshots }))
  },

  removeDirectorSnapshot(snapshotId) {
    const { project } = get()
    const snapshots = (project.directorSnapshots ?? []).filter(snapshot => snapshot.id !== snapshotId)
    set(pushHistory(get(), { ...project, directorSnapshots: snapshots }))
  },

  createDirectorStoryboardBoard(input) {
    const { project } = get()
    const assets = project.directorStoryboardAssets ?? []
    return get().saveDirectorStoryboardBoard({
      name: input?.name,
      note: input?.note,
      items: input?.items,
      assetIds: input?.assetIds?.length ? input.assetIds : assets.map((asset) => asset.id),
    })
  },

  saveDirectorStoryboardBoard(input) {
    const { project } = get()
    const assets = project.directorStoryboardAssets ?? []
    const boards = project.directorStoryboardBoards ?? []
    const board = buildDirectorStoryboardBoard(assets, boards, input)
    if (!board) return null
    const nextBoards = input.boardId
      ? boards.map((item) => item.id === input.boardId ? board : item)
      : [board, ...boards]
    if (input.boardId && !boards.some((item) => item.id === input.boardId)) {
      nextBoards.unshift(board)
    }
    set(pushHistory(get(), {
      ...project,
      directorStoryboardBoards: nextBoards.slice(0, 24),
    }))
    return board.id
  },

  removeDirectorStoryboardBoard(boardId) {
    const { project } = get()
    const boards = (project.directorStoryboardBoards ?? []).filter((board) => board.id !== boardId)
    set(pushHistory(get(), {
      ...project,
      directorStoryboardBoards: boards,
    }))
  },

  toggleCaptureBound(cameraId, captureId) {
    const { cameraCaptures } = get()
    const list = [...(cameraCaptures[cameraId] ?? [])]
    const cap = list.find(c => c.id === captureId)
    if (!cap) return
    cap.isBound = !cap.isBound
    set({ cameraCaptures: { ...cameraCaptures, [cameraId]: list }, isDirty: true })
  },

  toggleCaptureActive(cameraId, captureId) {
    const { cameraCaptures } = get()
    const next: Record<string, CameraCapture[]> = {}
    for (const [cId, caps] of Object.entries(cameraCaptures)) {
      next[cId] = caps.map(c => ({ ...c, isActiveStar: c.id === captureId && cId === cameraId }))
    }
    set({ cameraCaptures: next, isDirty: true })
  },

  setCaptureName(cameraId, captureId, name) {
    const { cameraCaptures } = get()
    const list = [...(cameraCaptures[cameraId] ?? [])]
    const cap = list.find(c => c.id === captureId)
    if (!cap) return
    cap.name = name
    set({ cameraCaptures: { ...cameraCaptures, [cameraId]: list }, isDirty: true })
  },

  setCaptureNote(cameraId, captureId, note) {
    const { cameraCaptures } = get()
    const list = [...(cameraCaptures[cameraId] ?? [])]
    const cap = list.find(c => c.id === captureId)
    if (!cap) return
    cap.note = note
    set({ cameraCaptures: { ...cameraCaptures, [cameraId]: list }, isDirty: true })
  },

  removeCameraCapture(cameraId, captureId) {
    const { cameraCaptures } = get()
    // Drop from store entirely. Save uses deleteMany+createMany so only the
    // currently-bound list (which excludes removed entries) is recreated.
    const list = (cameraCaptures[cameraId] ?? []).filter(c => c.id !== captureId)
    set({ cameraCaptures: { ...cameraCaptures, [cameraId]: list }, isDirty: true })
  },

  restoreCameraCapturePose(cameraId, captureId) {
    const { project, cameraCaptures } = get()
    const capture = (cameraCaptures[cameraId] ?? []).find(c => c.id === captureId)
    const pose = getCapturePose(capture)
    if (!pose) return
    const next = clone(project)
    const camera = next.cameras.find(c => c.id === cameraId)
    if (!camera) return
    camera.fov = pose.fov
    camera.position = pose.position
    camera.target = pose.target
    camera.targetMode = 'manual'
    camera.targetObjectId = null
    set(pushHistory(get(), next))
  },

  createCameraFromCapturePose(cameraId, captureId) {
    const { cameraCaptures } = get()
    const capture = (cameraCaptures[cameraId] ?? []).find(c => c.id === captureId)
    const pose = getCapturePose(capture)
    if (!capture || !pose) return null
    return get().addCamera({
      name: `${capture.name || '截图'} 机位`,
      fov: pose.fov,
      position: pose.position,
      target: pose.target,
      targetMode: 'manual',
      targetObjectId: null,
    })
  },

  bindAllCapturesForCamera(cameraId) {
    const { cameraCaptures } = get()
    const list = cameraCaptures[cameraId] ?? []
    if (list.length === 0 || list.every(c => c.isBound)) return
    set({
      cameraCaptures: {
        ...cameraCaptures,
        [cameraId]: list.map(c => ({ ...c, isBound: true })),
      },
      isDirty: true,
    })
  },

  unbindAllCapturesForCamera(cameraId) {
    const { cameraCaptures } = get()
    const list = cameraCaptures[cameraId] ?? []
    if (list.length === 0 || !list.some(c => c.isBound)) return
    set({
      cameraCaptures: {
        ...cameraCaptures,
        [cameraId]: list.map(c => ({ ...c, isBound: false })),
      },
      isDirty: true,
    })
  },

  bindAllCaptures() {
    const { cameraCaptures } = get()
    const next: Record<string, CameraCapture[]> = {}
    for (const [cId, caps] of Object.entries(cameraCaptures)) {
      next[cId] = caps.map(c => ({ ...c, isBound: true }))
    }
    set({ cameraCaptures: next, isDirty: true })
  },

  clearBoundCaptures() {
    const { cameraCaptures } = get()
    const next: Record<string, CameraCapture[]> = {}
    for (const [cId, caps] of Object.entries(cameraCaptures)) {
      next[cId] = caps.map(c => ({ ...c, isBound: false }))
    }
    set({ cameraCaptures: next })
  },

  hydrateBoundShots(shots) {
    set({ cameraCaptures: buildCapturesFromShots(shots) })
  },

  undo() {
    const { history, future, project } = get()
    if (history.length === 0) return
    const prev = history[history.length - 1]
    set({
      project: clone(prev),
      history: history.slice(0, -1),
      future: [clone(project), ...future],
      isDirty: true,
    })
  },

  redo() {
    const { history, future, project } = get()
    if (future.length === 0) return
    const next = future[0]
    set({
      project: clone(next),
      history: [...history, clone(project)],
      future: future.slice(1),
      isDirty: true,
    })
  },
}))

function buildCapturesFromShots(shots: Array<{id?:string;cameraId:string;name:string;isActive:boolean;imageUrl:string;imageMediaId?:string|null;note?:string;fov?:number;pos?:[number,number,number];target?:[number,number,number]}>): Record<string, CameraCapture[]> {
  const out: Record<string, CameraCapture[]> = {}
  for (const s of shots) {
    if (!out[s.cameraId]) out[s.cameraId] = []
    out[s.cameraId].push({
      id: uid('cap'),
      dataUrl: s.imageUrl,
      isBound: true,
      isActiveStar: !!s.isActive,
      name: s.name || '机位',
      note: s.note,
      capturedAt: Date.now(),
      persistedShotId: s.id,
      persistedImageMediaId: s.imageMediaId ?? undefined,
      persistedFov: s.fov,
      persistedPos: s.pos,
      persistedTarget: s.target,
      capturedFov: s.fov,
      capturedPosition: s.pos,
      capturedTarget: s.target,
    })
  }
  return out
}
