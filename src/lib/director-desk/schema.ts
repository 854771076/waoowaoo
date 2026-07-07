/**
 * Director Desk — 3D 分镜编辑器数据模型
 *
 * 该文件是 server-safe 的（不导入 React 或 three），
 * 供 Prisma / API / worker / 前端 store 共用。
 */

// ---------- Types ----------

export type DirectorRenderMode = 'preview' | 'wireframe' | 'clay';

export type DirectorObjectKind =
  | 'character'
  | 'prop'
  | 'primitive'
  | 'reference-image';

export interface DirectorTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface DirectorObject {
  id: string;
  kind: DirectorObjectKind;
  name: string;
  transform: DirectorTransform;
  /** 角色：颜色索引；道具/图片：可选颜色 */
  color?: string | null;
  /** 姿势预设 id，仅 character 有效 */
  poseId?: string | null;
  /** 体型预设 id，仅 character 有效 */
  bodyTypeId?: string | null;
  /** 图片/图元子类型标识 */
  variant?: string | null;
  /** 图片对象的资产引用（MediaObject.id） */
  assetId?: string | null;
  /** 备注 */
  note?: string | null;
  /** 未持久化：加载时解析出的图片 URL */
  imageUrl?: string | null;
  /** 是否锁定 */
  locked?: boolean;
  /** 是否可见 */
  visible?: boolean;
}

export interface DirectorCamera {
  id: string;
  name: string;
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
  /** 是否在视口中可见（辅助显示） */
  visible?: boolean;
}

export interface DirectorSceneSettings {
  backgroundColor: string;
  showGround: boolean;
  groundOpacity: number;
  showLabels: boolean;
  showGrid: boolean;
  /** 背景图 MediaObject.id */
  backdropAssetId: string | null;
  backdropOpacity: number;
  backdropYaw: number;
  /** 未持久化：加载时解析出的背景图 URL */
  backdropImageUrl?: string | null;
}

export interface DirectorProject {
  version: number;
  scene: DirectorSceneSettings;
  objects: DirectorObject[];
  cameras: DirectorCamera[];
  activeCameraId: string;
  renderMode?: DirectorRenderMode;
}

// ---------- Constants ----------

export const DIRECTOR_PROJECT_VERSION = 1;

/** 角色颜色调色板（7 色） */
export const DEFAULT_CHARACTER_COLORS: readonly string[] = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
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

export type DirectorPoseId = (typeof POSE_PRESET_IDS)[number];

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

export type DirectorBodyTypeId = (typeof BODY_TYPE_IDS)[number];

/** 姿势中文映射 */
export const POSE_ZH: Record<DirectorPoseId, string> = {
  stand: '站立',
  't-pose': 'T 姿',
  walk: '行走',
  run: '奔跑',
  sit: '坐姿',
  crouch: '蹲下',
  'kneel-one': '单膝跪',
  'kneel-two': '双膝跪',
  'hands-on-hips': '叉腰',
  lean: '倚靠',
  bow: '鞠躬',
  think: '思考',
  fight: '格斗',
  kick: '踢腿',
  throw: '投掷',
  push: '推',
  wave: '挥手',
  reach: '伸手',
  'cross-arms': '抱臂',
  phone: '打电话',
};

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
  return v === 'preview' || v === 'wireframe' || v === 'clay';
}

function isObjectKind(v: unknown): v is DirectorObjectKind {
  return (
    v === 'character' ||
    v === 'prop' ||
    v === 'primitive' ||
    v === 'reference-image'
  );
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
      showLabels: true,
      showGrid: true,
      backdropAssetId: null,
      backdropOpacity: 0.6,
      backdropYaw: 0,
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
    showLabels,
    showGrid,
    backdropAssetId,
    backdropOpacity,
    backdropYaw,
    backdropImageUrl: null,
  };
}

function parseObject(input: unknown): DirectorObject | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== 'string' || !input.id) return null;
  if (!isObjectKind(input.kind)) return null;
  if (typeof input.name !== 'string') return null;
  if (!isTransform(input.transform)) return null;
  const obj: DirectorObject = {
    id: input.id,
    kind: input.kind,
    name: input.name,
    transform: input.transform,
  };
  if (typeof input.color === 'string' || input.color === null) {
    obj.color = input.color as string | null;
  }
  if (typeof input.poseId === 'string' || input.poseId === null) {
    obj.poseId = input.poseId as string | null;
  }
  if (typeof input.bodyTypeId === 'string' || input.bodyTypeId === null) {
    obj.bodyTypeId = input.bodyTypeId as string | null;
  }
  if (typeof input.variant === 'string' || input.variant === null) {
    obj.variant = input.variant as string | null;
  }
  if (typeof input.assetId === 'string' || input.assetId === null) {
    obj.assetId = input.assetId as string | null;
  }
  if (typeof input.note === 'string' || input.note === null) {
    obj.note = input.note as string | null;
  }
  if (typeof input.locked === 'boolean') obj.locked = input.locked;
  if (typeof input.visible === 'boolean') obj.visible = input.visible;
  // imageUrl 不持久化，加载时不接受
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
    visible: typeof input.visible === 'boolean' ? input.visible : true,
  };
  return cam;
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
    objects.push(parsed);
  }

  const cameras: DirectorCamera[] = [];
  for (const raw of json.cameras) {
    const parsed = parseCamera(raw);
    if (!parsed) return null;
    cameras.push(parsed);
  }

  const project: DirectorProject = {
    version: DIRECTOR_PROJECT_VERSION,
    scene,
    objects,
    cameras,
    activeCameraId: json.activeCameraId,
  };
  if (isRenderMode(json.renderMode)) {
    project.renderMode = json.renderMode;
  }
  return project;
}

export function serializeDirectorProject(p: DirectorProject): string {
  const stripped: DirectorProject = {
    ...p,
    scene: { ...p.scene },
    objects: p.objects.map((o) => ({ ...o })),
    cameras: p.cameras.map((c) => ({ ...c })),
  };
  delete stripped.scene.backdropImageUrl;
  for (const o of stripped.objects) {
    delete o.imageUrl;
  }
  return JSON.stringify(stripped);
}
