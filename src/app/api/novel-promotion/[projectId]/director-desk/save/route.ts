import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { uploadObject, generateUniqueKey } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import {
  parseDirectorProject,
  serializeDirectorProject,
  validateDirectorProjectSize,
  type DirectorProject,
} from '@/lib/director-desk/schema'
import { computePhotographyRulesPatch } from '@/lib/director-desk/photography-rules'

interface IncomingShot {
  clientId?: string
  cameraId: string
  name: string
  isActive: boolean
  fov: number
  position: [number, number, number]
  target: [number, number, number]
  note?: string
  snapshotDataUrl: string
}

const MAX_SHOTS = 8
const MAX_DATAURL_BYTES = 5 * 1024 * 1024

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  if (!match) return null
  try {
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') }
  } catch {
    return null
  }
}

function isTriplet(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    typeof v[2] === 'number'
  )
}

function validateShot(raw: unknown): IncomingShot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.cameraId !== 'string' || !s.cameraId) return null
  if (typeof s.name !== 'string') return null
  if (typeof s.isActive !== 'boolean') return null
  if (typeof s.fov !== 'number' || !Number.isFinite(s.fov)) return null
  if (!isTriplet(s.position)) return null
  if (!isTriplet(s.target)) return null
  if (typeof s.snapshotDataUrl !== 'string') return null
  return {
    clientId: typeof s.clientId === 'string' ? s.clientId : undefined,
    cameraId: s.cameraId,
    name: s.name,
    isActive: s.isActive,
    fov: s.fov,
    position: s.position,
    target: s.target,
    note: typeof s.note === 'string' ? s.note : undefined,
    snapshotDataUrl: s.snapshotDataUrl,
  }
}

/**
 * POST /api/novel-promotion/[projectId]/director-desk/save
 * 保存 Director Desk 编辑器的 layout + 快照，并反向同步 photographyRules
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null) as {
    panelId?: unknown
    project?: unknown
    shots?: unknown
  } | null

  if (!body || typeof body.panelId !== 'string' || !body.panelId) {
    throw new ApiError('INVALID_PARAMS')
  }
  const panelId = body.panelId

  const parsedProject = parseDirectorProject(body.project)
  if (!parsedProject) throw new ApiError('INVALID_PARAMS')

  if (!Array.isArray(body.shots)) throw new ApiError('INVALID_PARAMS')
  if (body.shots.length > MAX_SHOTS) throw new ApiError('INVALID_PARAMS')

  const shots: IncomingShot[] = []
  for (const raw of body.shots) {
    const s = validateShot(raw)
    if (!s) throw new ApiError('INVALID_PARAMS')
    shots.push(s)
  }

  // 归一化 isActive：仅允许一个 active（先到先得），若无则默认第一个
  let sawActive = false
  for (const s of shots) {
    if (s.isActive) {
      if (sawActive) s.isActive = false
      else sawActive = true
    }
  }
  if (!sawActive && shots.length > 0) shots[0].isActive = true

  // 校验 panel 归属
  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    include: {
      storyboard: {
        include: {
          episode: { include: { novelPromotionProject: true } },
        },
      },
    },
  })
  if (!panel || panel.storyboard.episode.novelPromotionProject.projectId !== projectId) {
    throw new ApiError('NOT_FOUND')
  }

  const serializedLayout = serializeDirectorProject(parsedProject)
  if (!validateDirectorProjectSize(serializedLayout)) {
    throw new ApiError('INVALID_PARAMS', { message: 'director project too large' })
  }

  // 处理截图上传
  const createdShots: Array<{
    panelId: string
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
    imageMediaId: string
    note: string | null
  }> = []
  let succeeded = 0

  for (const s of shots) {
    try {
      const parsed = parseDataUrl(s.snapshotDataUrl)
      if (!parsed || parsed.buffer.length > MAX_DATAURL_BYTES) {
        console.error('[director-desk] bad shot dataUrl', s.cameraId)
        continue
      }
      const jpeg = await sharp(parsed.buffer).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
      const key = generateUniqueKey(`director-shot-${panelId}`, 'jpg')
      await uploadObject(jpeg, key, undefined, 'image/jpeg')
      const mediaRef = await ensureMediaObjectFromStorageKey(key, {
        mimeType: 'image/jpeg',
        sizeBytes: jpeg.length,
      })
      createdShots.push({
        panelId,
        cameraId: s.cameraId,
        name: s.name || '机位',
        isActive: !!s.isActive,
        fov: Number.isFinite(Number(s.fov)) ? Number(s.fov) : 50,
        posX: Number.isFinite(Number(s.position?.[0])) ? Number(s.position[0]) : 0,
        posY: Number.isFinite(Number(s.position?.[1])) ? Number(s.position[1]) : 1.55,
        posZ: Number.isFinite(Number(s.position?.[2])) ? Number(s.position[2]) : 5.4,
        targetX: Number.isFinite(Number(s.target?.[0])) ? Number(s.target[0]) : 0,
        targetY: Number.isFinite(Number(s.target?.[1])) ? Number(s.target[1]) : 1.05,
        targetZ: Number.isFinite(Number(s.target?.[2])) ? Number(s.target[2]) : 0,
        imageMediaId: mediaRef.id,
        note: typeof s.note === 'string' ? s.note : null,
      })
      succeeded++
    } catch (err) {
      console.error('[director-desk] shot upload failed:', err)
    }
  }

  // 计算 photographyRules patch：使用真正保存下来的 active shot 的相机参数
  let projectForPatch: DirectorProject = parsedProject
  if (createdShots.length > 0) {
    const active = createdShots.find((c) => c.isActive) ?? createdShots[0]
    const patchedCameras = parsedProject.cameras.map((cam) => {
      if (cam.id !== active.cameraId) return cam
      return {
        ...cam,
        fov: active.fov,
        position: [active.posX, active.posY, active.posZ] as [number, number, number],
        target: [active.targetX, active.targetY, active.targetZ] as [number, number, number],
      }
    })
    // 若 shot 的 cameraId 在 parsedProject.cameras 中不存在，则补一个临时相机
    const exists = parsedProject.cameras.some((c) => c.id === active.cameraId)
    if (!exists) {
      patchedCameras.push({
        id: active.cameraId,
        name: active.name || '机位',
        fov: active.fov,
        position: [active.posX, active.posY, active.posZ],
        target: [active.targetX, active.targetY, active.targetZ],
        visible: true,
      })
    }
    projectForPatch = {
      ...parsedProject,
      cameras: patchedCameras,
      activeCameraId: active.cameraId,
    }
  }

  const patch = computePhotographyRulesPatch({ project: projectForPatch })

  // 合并到现有 panel.photographyRules（保留除 characters 的其它字段）
  let existingRules: Record<string, unknown> = {}
  if (panel.photographyRules) {
    try {
      const parsed = JSON.parse(panel.photographyRules)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existingRules = parsed as Record<string, unknown>
      }
    } catch { /* ignore corrupt */ }
  }
  const existingCharacters: Array<Record<string, unknown>> = Array.isArray(existingRules.characters)
    ? (existingRules.characters as Array<Record<string, unknown>>)
    : []
  const byName = new Map<string, Record<string, unknown>>()
  for (const c of existingCharacters) {
    if (c && typeof c.name === 'string') byName.set(c.name, { ...c })
  }
  for (const p of patch.characters) {
    const existing = byName.get(p.name)
    if (existing) {
      existing.screen_position = p.screen_position
      existing.posture = p.posture
      existing.facing = p.facing
      byName.set(p.name, existing)
    } else {
      byName.set(p.name, {
        name: p.name,
        screen_position: p.screen_position,
        posture: p.posture,
        facing: p.facing,
      })
    }
  }
  const mergedRules = {
    ...existingRules,
    characters: Array.from(byName.values()),
  }

  await prisma.$transaction(async (tx) => {
    await tx.novelPromotionDirectorShot.deleteMany({ where: { panelId } })
    if (createdShots.length > 0) {
      await tx.novelPromotionDirectorShot.createMany({ data: createdShots })
    }
    await tx.novelPromotionPanel.update({
      where: { id: panelId },
      data: {
        directorLayout: serializedLayout,
        photographyRules: JSON.stringify(mergedRules),
      },
    })
  }, { maxWait: 15000, timeout: 30000 })

  let warning: string | undefined
  if (succeeded === 0 && shots.length > 0) warning = 'all_screenshots_failed'
  else if (succeeded < shots.length) warning = 'some_screenshots_failed'

  return NextResponse.json({
    success: true,
    shotIds: createdShots.map((s) => `shot-${s.cameraId}`),
    ...(warning ? { warning } : {}),
  })
})
