/**
 * Director Desk — 3D 分镜编辑器数据模型
 *
 * 该文件是 server-safe 的（不导入 React 或 three），
 * 供 Prisma / API / worker / 前端 store 共用。
 */

// ---------- Constants ----------

export const DIRECTOR_PROJECT_VERSION = 1;

/** 角色颜色调色板（7 色） */
export const DEFAULT_CHARACTER_COLORS = [
  '#E56C5B',
  '#7AA7FF',
  '#6CDB7A',
  '#F5C151',
  '#B67DDE',
  '#4CC3D9',
  '#FF8FA3',
] as const;

/** 20 个姿势预设 id */
export const POSE_PRESET_IDS = [
  'stand',
  't-pose',
  'walk',
  'run',
  'sit',
  'crouch',
  'kneel-one',
  'kneel-two',
  'hands-on-hips',
  'lean',
  'bow',
  'think',
  'fight',
  'kick',
  'throw',
  'push',
  'wave',
  'reach',
  'cross-arms',
  'phone',
] as const;

export type PosePresetId = (typeof POSE_PRESET_IDS)[number];

/** 姿势中文映射 */
export const POSE_ZH: Record<string, string> = {
  'stand': '站立',
  't-pose': 'T-姿势',
  'walk': '行走',
  'run': '奔跑',
  'sit': '坐着',
  'crouch': '蹲伏',
  'kneel-one': '单膝跪',
  'kneel-two': '双膝跪',
  'hands-on-hips': '叉腰',
  'lean': '倚靠',
  'bow': '鞠躬',
  'think': '沉思',
  'fight': '打斗',
  'kick': '踢',
  'throw': '投掷',
  'push': '推搡',
  'wave': '挥手',
  'reach': '伸手',
  'cross-arms': '抱臂',
  'phone': '看手机',
};

/** 8 种体型 id */
export const BODY_TYPE_IDS = [
  'mannequin',
  'female',
  'broad',
  'muscular',
  'slim',
  'teen',
  'child',
  'chibi',
] as const;

export type BodyTypeId = (typeof BODY_TYPE_IDS)[number];

// ---------- Types ----------

export type DirectorRenderMode = 'billboard' | 'mannequin';

export type DirectorObjectKind = 'character' | 'prop' | 'crowd';

export type DirectorImportedAssetKind = 'model' | 'panorama';
export type DirectorImportedAssetSourceType = 'model' | 'image';
export type PanoramaProjectionMode = 'equirectangular' | 'backdrop';
export type DirectorCameraTargetMode = 'manual' | 'object';

export const GEOMETRY_PRIMITIVE_OPTIONS = [
  { type: 'box', label: '立方体' },
  { type: 'sphere', label: '球体' },
  { type: 'cylinder', label: '圆柱体' },
  { type: 'torus', label: '环状体' },
  { type: 'cone', label: '圆锥' },
  { type: 'pyramid', label: '棱锥' },
] as const;

export type GeometryPrimitiveType = (typeof GEOMETRY_PRIMITIVE_OPTIONS)[number]['type'];

export interface DirectorTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface DirectorImportedAsset {
  id: string;
  kind: DirectorImportedAssetKind;
  sourceType: DirectorImportedAssetSourceType;
  fileName: string;
  name: string;
  /** data URL at import time; storage key after save/load */
  url: string;
  projectionMode?: PanoramaProjectionMode;
}

export interface DirectorObject {
  id: string;
  kind: DirectorObjectKind;
  name: string;
  /** character: CharacterAppearance.imageMediaId; prop: LocationImage.imageMediaId; crowd: null */
  refId: string | null;
  visible: boolean;
  locked: boolean;
  color: string;
  mode: DirectorRenderMode;
  transform: DirectorTransform;
  /** not persisted; resolved at load time */
  imageUrl?: string | null;
  geometryType?: GeometryPrimitiveType;
  assetRefId?: string;
  // character-specific
  bodyType?: BodyTypeId;
  posePresetId?: PosePresetId;
  poseControls?: Record<string, number>;
  /** radians around Y; undefined = billboard always faces camera */
  facing?: number;
  // crowd-specific
  crowdCount?: [number, number];
  crowdSpacing?: [number, number];
}

export interface DirectorCamera {
  id: string;
  name: string;
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
  targetMode?: DirectorCameraTargetMode;
  targetObjectId?: string | null;
  visible?: boolean;
}

export interface DirectorSnapshot {
  id: string;
  name: string;
  capturedAt: number;
  project: DirectorProject;
  cameraId: string;
  camera: {
    fov: number;
    position: [number, number, number];
    target: [number, number, number];
  };
  imageDataUrl?: string;
  imageUrl?: string | null;
  note?: string;
}

export type DirectorStoryboardAssetType = 'rendered_snapshot';

export interface DirectorStoryboardAsset {
  id: string;
  type: DirectorStoryboardAssetType;
  name: string;
  createdAt: number;
  imageUrl: string;
  sourceSnapshotId?: string;
  sourceCameraId?: string;
  note?: string;
  layout: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
}

export interface DirectorStoryboardBoardItem {
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface DirectorStoryboardBoard {
  id: string;
  name: string;
  createdAt: number;
  coverImageUrl: string;
  assetIds: string[];
  items: DirectorStoryboardBoardItem[];
  note?: string;
}

export interface DirectorSceneSettings {
  backgroundColor: string;
  showGround: boolean;
  groundOpacity: number;
  ambientLightIntensity: number;
  directionalLightIntensity: number;
  showLabels: boolean;
  showGrid: boolean;
  /** 背景图 MediaObject.id */
  backdropAssetId: string | null;
  backdropOpacity: number;
  backdropYaw: number;
  panoramaAssetId?: string | null;
  panoramaRadius?: number;
  panoramaYaw?: number;
  /** not persisted; resolved at load time */
  backdropImageUrl?: string | null;
}

export interface DirectorProject {
  version: 1;
  scene: DirectorSceneSettings;
  objects: DirectorObject[];
  cameras: DirectorCamera[];
  activeCameraId: string;
  importedAssets?: DirectorImportedAsset[];
  directorSnapshots?: DirectorSnapshot[];
  directorStoryboardAssets?: DirectorStoryboardAsset[];
  directorStoryboardBoards?: DirectorStoryboardBoard[];
}

const MAX_PROJECT_JSON_BYTES = 1024 * 1024;

// ---------- Type guards ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isNumTriplet(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    typeof v[2] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Number.isFinite(v[2])
  );
}

function isTransform(v: unknown): v is DirectorTransform {
  if (!isRecord(v)) return false;
  return (
    isNumTriplet(v.position) && isNumTriplet(v.rotation) && isNumTriplet(v.scale)
  );
}

function isRenderMode(v: unknown): v is DirectorRenderMode {
  return v === 'billboard' || v === 'mannequin';
}

function isObjectKind(v: unknown): v is DirectorObjectKind {
  return v === 'character' || v === 'prop' || v === 'crowd';
}

function isGeometryPrimitiveType(v: unknown): v is GeometryPrimitiveType {
  return typeof v === 'string' && GEOMETRY_PRIMITIVE_OPTIONS.some((item) => item.type === v);
}

function isImportedAssetKind(v: unknown): v is DirectorImportedAssetKind {
  return v === 'model' || v === 'panorama';
}

function isImportedAssetSourceType(v: unknown): v is DirectorImportedAssetSourceType {
  return v === 'model' || v === 'image';
}

function isPanoramaProjectionMode(v: unknown): v is PanoramaProjectionMode {
  return v === 'equirectangular' || v === 'backdrop';
}

function isCameraTargetMode(v: unknown): v is DirectorCameraTargetMode {
  return v === 'manual' || v === 'object';
}

function isBodyTypeId(v: unknown): v is BodyTypeId {
  return typeof v === 'string' && (BODY_TYPE_IDS as readonly string[]).includes(v);
}

function isPosePresetId(v: unknown): v is PosePresetId {
  return typeof v === 'string' && (POSE_PRESET_IDS as readonly string[]).includes(v);
}

// ---------- Helpers ----------

export function validateDirectorProjectSize(json: string): boolean {
  return json.length <= MAX_PROJECT_JSON_BYTES;
}

export function createDefaultDirectorProject(): DirectorProject {
  return {
    version: DIRECTOR_PROJECT_VERSION,
    scene: {
      backgroundColor: '#1a1d23',
      showGround: true,
      groundOpacity: 0.8,
      ambientLightIntensity: 0.6,
      directionalLightIntensity: 1,
      showLabels: true,
      showGrid: true,
      backdropAssetId: null,
      backdropOpacity: 0.6,
      backdropYaw: 0,
      panoramaAssetId: null,
      panoramaRadius: 60,
      panoramaYaw: 0,
      backdropImageUrl: null,
    },
    objects: [],
    cameras: [
      {
        id: 'cam-1',
        name: '主机位',
        fov: 50,
        position: [0, 1.55, 5.4],
        target: [0, 1.05, 0],
        targetMode: 'manual',
        targetObjectId: null,
        visible: true,
      },
    ],
    activeCameraId: 'cam-1',
  };
}

function parseScene(input: unknown): DirectorSceneSettings | null {
  if (!isRecord(input)) return null;
  const def = createDefaultDirectorProject().scene;
  const backgroundColor =
    typeof input.backgroundColor === 'string'
      ? input.backgroundColor
      : def.backgroundColor;
  const showGround =
    typeof input.showGround === 'boolean' ? input.showGround : def.showGround;
  const groundOpacity =
    typeof input.groundOpacity === 'number' && Number.isFinite(input.groundOpacity)
      ? input.groundOpacity
      : def.groundOpacity;
  const showLabels =
    typeof input.showLabels === 'boolean' ? input.showLabels : def.showLabels;
  const showGrid =
    typeof input.showGrid === 'boolean' ? input.showGrid : def.showGrid;
  const ambientLightIntensity =
    typeof input.ambientLightIntensity === 'number' && Number.isFinite(input.ambientLightIntensity)
      ? input.ambientLightIntensity
      : def.ambientLightIntensity;
  const directionalLightIntensity =
    typeof input.directionalLightIntensity === 'number' && Number.isFinite(input.directionalLightIntensity)
      ? input.directionalLightIntensity
      : def.directionalLightIntensity;
  const backdropAssetId =
    typeof input.backdropAssetId === 'string' ? input.backdropAssetId : null;
  const backdropOpacity =
    typeof input.backdropOpacity === 'number' &&
    Number.isFinite(input.backdropOpacity)
      ? input.backdropOpacity
      : def.backdropOpacity;
  const backdropYaw =
    typeof input.backdropYaw === 'number' && Number.isFinite(input.backdropYaw)
      ? input.backdropYaw
      : def.backdropYaw;
  return {
    backgroundColor,
    showGround,
    groundOpacity,
    ambientLightIntensity,
    directionalLightIntensity,
    showLabels,
    showGrid,
    backdropAssetId,
    backdropOpacity,
    backdropYaw,
    panoramaAssetId: typeof input.panoramaAssetId === 'string' ? input.panoramaAssetId : null,
    panoramaRadius: typeof input.panoramaRadius === 'number' && Number.isFinite(input.panoramaRadius)
      ? input.panoramaRadius
      : def.panoramaRadius,
    panoramaYaw: typeof input.panoramaYaw === 'number' && Number.isFinite(input.panoramaYaw)
      ? input.panoramaYaw
      : def.panoramaYaw,
    backdropImageUrl: null,
  };
}

function parseImportedAsset(input: unknown): DirectorImportedAsset | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== 'string' || !input.id) return null;
  if (!isImportedAssetKind(input.kind)) return null;
  if (!isImportedAssetSourceType(input.sourceType)) return null;
  if (typeof input.fileName !== 'string' || !input.fileName) return null;
  if (typeof input.name !== 'string') return null;
  if (typeof input.url !== 'string' || !input.url) return null;
  const asset: DirectorImportedAsset = {
    id: input.id,
    kind: input.kind,
    sourceType: input.sourceType,
    fileName: input.fileName,
    name: input.name,
    url: input.url,
  };
  if (isPanoramaProjectionMode(input.projectionMode)) {
    asset.projectionMode = input.projectionMode;
  }
  return asset;
}

function parseObject(input: unknown): DirectorObject | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== 'string' || !input.id) return null;
  if (!isObjectKind(input.kind)) return null;
  if (typeof input.name !== 'string') return null;
  if (!isTransform(input.transform)) return null;
  const refId =
    typeof input.refId === 'string'
      ? input.refId
      : input.refId === null
      ? null
      : undefined;
  if (refId === undefined) return null;
  if (typeof input.visible !== 'boolean') return null;
  if (typeof input.locked !== 'boolean') return null;
  if (typeof input.color !== 'string') return null;
  if (!isRenderMode(input.mode)) return null;

  const obj: DirectorObject = {
    id: input.id,
    kind: input.kind,
    name: input.name,
    refId,
    visible: input.visible,
    locked: input.locked,
    color: input.color,
    mode: input.mode,
    transform: input.transform,
  };

  if (isBodyTypeId(input.bodyType)) obj.bodyType = input.bodyType;
  if (input.kind === 'prop' && isGeometryPrimitiveType(input.geometryType)) {
    obj.geometryType = input.geometryType;
  }
  if (input.kind === 'prop' && typeof input.assetRefId === 'string' && input.assetRefId) {
    obj.assetRefId = input.assetRefId;
  }
  if (isPosePresetId(input.posePresetId)) obj.posePresetId = input.posePresetId;
  if (isRecord(input.poseControls)) {
    const controls: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.poseControls)) {
      if (typeof v === 'number' && Number.isFinite(v)) controls[k] = v;
    }
    obj.poseControls = controls;
  }
  if (typeof input.facing === 'number' && Number.isFinite(input.facing)) {
    obj.facing = input.facing;
  }
  if (
    Array.isArray(input.crowdCount) &&
    input.crowdCount.length === 2 &&
    typeof input.crowdCount[0] === 'number' &&
    typeof input.crowdCount[1] === 'number'
  ) {
    obj.crowdCount = [input.crowdCount[0], input.crowdCount[1]];
  }
  if (
    Array.isArray(input.crowdSpacing) &&
    input.crowdSpacing.length === 2 &&
    typeof input.crowdSpacing[0] === 'number' &&
    typeof input.crowdSpacing[1] === 'number'
  ) {
    obj.crowdSpacing = [input.crowdSpacing[0], input.crowdSpacing[1]];
  }
  // imageUrl is transient — never accepted from parse input
  return obj;
}

function parseCamera(input: unknown): DirectorCamera | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== 'string' || !input.id) return null;
  if (typeof input.name !== 'string') return null;
  if (typeof input.fov !== 'number' || !Number.isFinite(input.fov)) return null;
  if (!isNumTriplet(input.position)) return null;
  if (!isNumTriplet(input.target)) return null;
  const cam: DirectorCamera = {
    id: input.id,
    name: input.name,
    fov: input.fov,
    position: input.position,
    target: input.target,
    targetMode: isCameraTargetMode(input.targetMode) ? input.targetMode : 'manual',
    targetObjectId: typeof input.targetObjectId === 'string' ? input.targetObjectId : null,
    visible: typeof input.visible === 'boolean' ? input.visible : true,
  };
  if (cam.targetMode !== 'object') {
    cam.targetMode = 'manual';
    cam.targetObjectId = null;
  }
  return cam;
}

function parseSnapshot(input: unknown): DirectorSnapshot | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== 'string' || !input.id) return null;
  if (typeof input.name !== 'string') return null;
  if (typeof input.capturedAt !== 'number' || !Number.isFinite(input.capturedAt)) return null;
  if (typeof input.cameraId !== 'string' || !input.cameraId) return null;
  if (!isRecord(input.camera)) return null;
  const fov = input.camera.fov;
  if (typeof fov !== 'number' || !Number.isFinite(fov)) return null;
  if (!isNumTriplet(input.camera.position)) return null;
  if (!isNumTriplet(input.camera.target)) return null;
  const project = parseDirectorProject(input.project);
  if (!project) return null;

  return {
    id: input.id,
    name: input.name,
    capturedAt: input.capturedAt,
    project,
    cameraId: input.cameraId,
    camera: {
      fov,
      position: input.camera.position,
      target: input.camera.target,
    },
    imageDataUrl: typeof input.imageDataUrl === 'string' ? input.imageDataUrl : undefined,
    imageUrl: typeof input.imageUrl === 'string' ? input.imageUrl : null,
    note: typeof input.note === 'string' ? input.note : undefined,
  };
}

function parseStoryboardAsset(input: unknown): DirectorStoryboardAsset | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== 'string' || !input.id) return null;
  if (input.type !== 'rendered_snapshot') return null;
  if (typeof input.name !== 'string') return null;
  if (typeof input.createdAt !== 'number' || !Number.isFinite(input.createdAt)) return null;
  if (typeof input.imageUrl !== 'string' || !input.imageUrl) return null;
  if (!isRecord(input.layout)) return null;
  const { x, y, width, height, rotation } = input.layout;
  if (
    typeof x !== 'number' || !Number.isFinite(x) ||
    typeof y !== 'number' || !Number.isFinite(y) ||
    typeof width !== 'number' || !Number.isFinite(width) ||
    typeof height !== 'number' || !Number.isFinite(height) ||
    typeof rotation !== 'number' || !Number.isFinite(rotation)
  ) {
    return null;
  }

  return {
    id: input.id,
    type: input.type,
    name: input.name,
    createdAt: input.createdAt,
    imageUrl: input.imageUrl,
    sourceSnapshotId: typeof input.sourceSnapshotId === 'string' ? input.sourceSnapshotId : undefined,
    sourceCameraId: typeof input.sourceCameraId === 'string' ? input.sourceCameraId : undefined,
    note: typeof input.note === 'string' ? input.note : undefined,
    layout: { x, y, width, height, rotation },
  };
}

function parseStoryboardBoardItem(input: unknown): DirectorStoryboardBoardItem | null {
  if (!isRecord(input)) return null;
  if (typeof input.assetId !== 'string' || !input.assetId) return null;
  const { x, y, width, height, rotation } = input;
  if (
    typeof x !== 'number' || !Number.isFinite(x) ||
    typeof y !== 'number' || !Number.isFinite(y) ||
    typeof width !== 'number' || !Number.isFinite(width) ||
    typeof height !== 'number' || !Number.isFinite(height) ||
    typeof rotation !== 'number' || !Number.isFinite(rotation)
  ) {
    return null;
  }
  return { assetId: input.assetId, x, y, width, height, rotation };
}

function parseStoryboardBoard(input: unknown): DirectorStoryboardBoard | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== 'string' || !input.id) return null;
  if (typeof input.name !== 'string') return null;
  if (typeof input.createdAt !== 'number' || !Number.isFinite(input.createdAt)) return null;
  if (typeof input.coverImageUrl !== 'string' || !input.coverImageUrl) return null;
  const assetIds = Array.isArray(input.assetIds)
    ? input.assetIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  const items = Array.isArray(input.items)
    ? input.items.map(parseStoryboardBoardItem).filter((item): item is DirectorStoryboardBoardItem => item !== null)
    : [];
  if (assetIds.length === 0 || items.length === 0) return null;
  return {
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    coverImageUrl: input.coverImageUrl,
    assetIds,
    items,
    note: typeof input.note === 'string' ? input.note : undefined,
  };
}

export function parseDirectorProject(json: unknown): DirectorProject | null {
  if (!isRecord(json)) return null;
  if (json.version !== DIRECTOR_PROJECT_VERSION) return null;
  const scene = parseScene(json.scene);
  if (!scene) return null;
  if (!Array.isArray(json.objects)) return null;
  if (!Array.isArray(json.cameras)) return null;
  if (typeof json.activeCameraId !== 'string' || !json.activeCameraId) return null;

  const objects: DirectorObject[] = [];
  for (const raw of json.objects) {
    const parsed = parseObject(raw);
    if (!parsed) return null;
    // strip transient field
    delete parsed.imageUrl;
    objects.push(parsed);
  }

  const cameras: DirectorCamera[] = [];
  for (const raw of json.cameras) {
    const parsed = parseCamera(raw);
    if (!parsed) return null;
    cameras.push(parsed);
  }

  const directorSnapshots: DirectorSnapshot[] = [];
  const importedAssets: DirectorImportedAsset[] = [];
  if (Array.isArray(json.importedAssets)) {
    for (const raw of json.importedAssets) {
      const parsed = parseImportedAsset(raw);
      if (!parsed) return null;
      importedAssets.push(parsed);
    }
  }
  const importedAssetIds = new Set(importedAssets.map((asset) => asset.id));
  if (scene.panoramaAssetId && !importedAssetIds.has(scene.panoramaAssetId)) {
    scene.panoramaAssetId = null;
  }
  for (const object of objects) {
    if (object.assetRefId && !importedAssetIds.has(object.assetRefId)) {
      delete object.assetRefId;
    }
  }

  const objectIds = new Set(objects.map((object) => object.id));
  for (const camera of cameras) {
    if (camera.targetMode === 'object' && (!camera.targetObjectId || !objectIds.has(camera.targetObjectId))) {
      camera.targetMode = 'manual';
      camera.targetObjectId = null;
    }
  }

  if (Array.isArray(json.directorSnapshots)) {
    for (const raw of json.directorSnapshots) {
      const parsed = parseSnapshot(raw);
      if (!parsed) return null;
      directorSnapshots.push(parsed);
    }
  }
  const directorStoryboardAssets: DirectorStoryboardAsset[] = [];
  if (Array.isArray(json.directorStoryboardAssets)) {
    for (const raw of json.directorStoryboardAssets) {
      const parsed = parseStoryboardAsset(raw);
      if (!parsed) return null;
      directorStoryboardAssets.push(parsed);
    }
  }
  const directorStoryboardBoards: DirectorStoryboardBoard[] = [];
  if (Array.isArray(json.directorStoryboardBoards)) {
    for (const raw of json.directorStoryboardBoards) {
      const parsed = parseStoryboardBoard(raw);
      if (!parsed) return null;
      directorStoryboardBoards.push(parsed);
    }
  }

  // strip transient scene field
  scene.backdropImageUrl = null;

  return {
    version: DIRECTOR_PROJECT_VERSION,
    scene,
    objects,
    cameras,
    activeCameraId: json.activeCameraId,
    ...(importedAssets.length > 0 ? { importedAssets } : {}),
    ...(directorSnapshots.length > 0 ? { directorSnapshots } : {}),
    ...(directorStoryboardAssets.length > 0 ? { directorStoryboardAssets } : {}),
    ...(directorStoryboardBoards.length > 0 ? { directorStoryboardBoards } : {}),
  };
}

function stripDirectorProjectForPersistence(p: DirectorProject, includeSnapshots = true): DirectorProject {
  const stripped: DirectorProject = {
    ...p,
    scene: { ...p.scene },
    objects: p.objects.map((o) => ({ ...o })),
    cameras: p.cameras.map((c) => ({ ...c })),
    ...(p.importedAssets
      ? { importedAssets: p.importedAssets.map((asset) => ({ ...asset })) }
      : {}),
    ...(p.directorStoryboardAssets
      ? { directorStoryboardAssets: p.directorStoryboardAssets.map((asset) => ({ ...asset, layout: { ...asset.layout } })) }
      : {}),
    ...(p.directorStoryboardBoards
      ? { directorStoryboardBoards: p.directorStoryboardBoards.map((board) => ({
          ...board,
          assetIds: [...board.assetIds],
          items: board.items.map((item) => ({ ...item })),
        })) }
      : {}),
    ...(includeSnapshots && p.directorSnapshots
      ? {
          directorSnapshots: p.directorSnapshots.map((snapshot) => ({
            ...snapshot,
            project: stripDirectorProjectForPersistence(snapshot.project, false),
            imageDataUrl: undefined,
          })),
        }
      : {}),
  };
  delete stripped.scene.backdropImageUrl;
  for (const o of stripped.objects) {
    delete o.imageUrl;
  }
  if (!includeSnapshots) {
    delete stripped.directorSnapshots;
  }
  if (stripped.directorSnapshots?.length === 0) {
    delete stripped.directorSnapshots;
  }
  if (stripped.importedAssets?.length === 0) {
    delete stripped.importedAssets;
  }
  if (stripped.directorStoryboardAssets?.length === 0) {
    delete stripped.directorStoryboardAssets;
  }
  if (stripped.directorStoryboardBoards?.length === 0) {
    delete stripped.directorStoryboardBoards;
  }
  return stripped;
}

export function serializeDirectorProject(p: DirectorProject): string {
  const stripped = stripDirectorProjectForPersistence(p);
  return JSON.stringify(stripped);
}

export function applyImportedAssetUrlMap(project: DirectorProject, urlByAssetId: ReadonlyMap<string, string>): DirectorProject {
  const nextImportedAssets = project.importedAssets?.map((asset) => {
    const uploadedUrl = urlByAssetId.get(asset.id);
    return uploadedUrl && uploadedUrl !== asset.url ? { ...asset, url: uploadedUrl } : asset;
  });
  const nextSnapshots = project.directorSnapshots?.map((snapshot) => {
    const nextSnapshotProject = applyImportedAssetUrlMap(snapshot.project, urlByAssetId);
    return nextSnapshotProject === snapshot.project ? snapshot : { ...snapshot, project: nextSnapshotProject };
  });
  const importedAssetsChanged = !!nextImportedAssets && nextImportedAssets.some((asset, index) => asset !== project.importedAssets?.[index]);
  const snapshotsChanged = !!nextSnapshots && nextSnapshots.some((snapshot, index) => snapshot !== project.directorSnapshots?.[index]);
  if (!importedAssetsChanged && !snapshotsChanged) return project;
  return {
    ...project,
    ...(nextImportedAssets ? { importedAssets: nextImportedAssets } : {}),
    ...(nextSnapshots ? { directorSnapshots: nextSnapshots } : {}),
  };
}
