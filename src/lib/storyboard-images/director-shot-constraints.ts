import { parseDirectorProject } from '@/lib/director-desk/schema'

interface Vector3 {
  x: number
  y: number
  z: number
}

export interface DirectorShotCharacterConstraint {
  name: string
  position: Vector3
  facingDeg: number | null
  posture: string
  renderMode: string | null
}

export interface DirectorShotConstraints {
  activeCamera: {
    fov: number | null
    position: Vector3 | null
    target: Vector3 | null
  }
  boundShotNotes: string[]
  characters: DirectorShotCharacterConstraint[]
}

export interface DirectorShotRecord {
  cameraId: string
  name: string
  isActive: boolean
  fov: number
  posX: number
  posY: number
  posZ: number
  targetX: number
  targetY: number
  targetZ: number
  note: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pickNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseJsonUnknown(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function pickVector3(value: unknown): Vector3 | null {
  const record = asRecord(value)
  const x = pickNumber(record.x)
  const y = pickNumber(record.y)
  const z = pickNumber(record.z)
  if (x === null || y === null || z === null) return null
  return { x, y, z }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function formatVector(vector: Vector3): string {
  return `x=${formatNumber(vector.x)}, y=${formatNumber(vector.y)}, z=${formatNumber(vector.z)}`
}

export function extractDirectorShotConstraints(panelContext: Record<string, unknown>): DirectorShotConstraints | null {
  const panel = asRecord(panelContext.panel)
  const directorShot = asRecord(panel.director_shot)
  if (Object.keys(directorShot).length === 0) return null

  const activeCamera = asRecord(directorShot.active_camera)
  const activePosition = pickVector3(activeCamera.camera_position)
  const activeTarget = pickVector3(activeCamera.camera_target)
  const fov = pickNumber(activeCamera.camera_fov)
  const characters = asArray(directorShot.characters)
    .map((item) => {
      const character = asRecord(item)
      const name = pickText(character.name)
      const position = pickVector3(character.position)
      if (!name || !position) return null
      return {
        name,
        position,
        facingDeg: pickNumber(character.facing_deg),
        posture: pickText(character.posture) || 'stand',
        renderMode: pickText(character.render_mode) || null,
      }
    })
    .filter((item): item is DirectorShotCharacterConstraint => item !== null)

  if (!activePosition && !activeTarget && fov === null && characters.length === 0) return null

  const boundShotNotes = asArray(directorShot.bound_shots)
    .map((item) => pickText(asRecord(item).note))
    .filter(Boolean)

  return {
    activeCamera: {
      fov,
      position: activePosition,
      target: activeTarget,
    },
    boundShotNotes,
    characters,
  }
}

export function buildDirectorShotConstraintPrompt(panelContext: Record<string, unknown>): string {
  const constraints = extractDirectorShotConstraints(panelContext)
  if (!constraints) return ''

  const cameraParts = [
    constraints.activeCamera.fov !== null ? `FOV ${formatNumber(constraints.activeCamera.fov)}` : '',
    constraints.activeCamera.position ? `机位 ${formatVector(constraints.activeCamera.position)}` : '',
    constraints.activeCamera.target ? `看向 ${formatVector(constraints.activeCamera.target)}` : '',
  ].filter(Boolean)

  const characterParts = constraints.characters.map((character) => {
    const facing = character.facingDeg !== null ? `，朝向 ${formatNumber(character.facingDeg)}°` : ''
    const posture = character.posture ? `，姿态 ${character.posture}` : ''
    return `${character.name}：位置 ${formatVector(character.position)}${facing}${posture}`
  })

  return [
    '导演台站位约束：严格遵循预设机位、人物坐标、朝向和姿态。',
    cameraParts.length > 0 ? `主机位：${cameraParts.join('，')}。` : '',
    characterParts.length > 0 ? `人物站位：${characterParts.join('；')}。` : '',
    constraints.boundShotNotes.length > 0 ? `机位备注：${constraints.boundShotNotes.join('；')}。` : '',
    '不得交换人物左右/前后站位，不得忽略人物朝向，不得把导演台参考图当作分屏或九宫格内容。',
  ].filter(Boolean).join('')
}

export function buildDirectorShotConstraintPromptFromLayout(params: {
  directorLayout: string | null | undefined
  directorShots?: DirectorShotRecord[] | null
}): string {
  if (!params.directorLayout) return ''
  const parsed = parseDirectorProject(parseJsonUnknown(params.directorLayout))
  if (!parsed || parsed.version !== 1) return ''

  const dbShots = params.directorShots ?? []
  const activeDb = dbShots.find((shot) => shot.isActive) ?? dbShots[0] ?? null
  const activeCam = activeDb
    ? {
      id: activeDb.cameraId,
      name: activeDb.name,
      fov: activeDb.fov,
      position: [activeDb.posX, activeDb.posY, activeDb.posZ] as [number, number, number],
      target: [activeDb.targetX, activeDb.targetY, activeDb.targetZ] as [number, number, number],
    }
    : parsed.cameras.find((camera) => camera.id === parsed.activeCameraId) ?? parsed.cameras[0] ?? null
  if (!activeCam) return ''

  const round2 = (value: number) => Math.round(value * 100) / 100
  return buildDirectorShotConstraintPrompt({
    panel: {
      director_shot: {
        active_camera: {
          camera_fov: activeCam.fov,
          camera_position: {
            x: round2(activeCam.position[0]),
            y: round2(activeCam.position[1]),
            z: round2(activeCam.position[2]),
          },
          camera_target: {
            x: round2(activeCam.target[0]),
            y: round2(activeCam.target[1]),
            z: round2(activeCam.target[2]),
          },
        },
        bound_shots: dbShots.map((shot) => ({
          name: shot.name,
          is_active: !!shot.isActive,
          camera_fov: shot.fov,
          camera_position: {
            x: round2(shot.posX),
            y: round2(shot.posY),
            z: round2(shot.posZ),
          },
          camera_target: {
            x: round2(shot.targetX),
            y: round2(shot.targetY),
            z: round2(shot.targetZ),
          },
          note: shot.note ?? null,
        })),
        characters: parsed.objects
          .filter((object) => object.kind === 'character' && object.visible !== false)
          .map((object) => ({
            name: object.name,
            position: {
              x: round2(object.transform.position[0]),
              y: round2(object.transform.position[1]),
              z: round2(object.transform.position[2]),
            },
            facing_deg: Math.round(((object.facing ?? 0) * 180) / Math.PI),
            posture: object.posePresetId ?? 'stand',
            render_mode: object.mode,
          })),
      },
    },
  })
}
