import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { createScopedLogger } from '@/lib/logging/core'
import { PROP_IMAGE_RATIO, addLocationPromptSuffix, addPropPromptSuffix, isArtStyleValue, type ArtStyleValue } from '@/lib/constants'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { type TaskJobData } from '@/lib/task/types'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import { resolveWorkerArtStylePrompt } from '@/lib/workers/art-style'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
  toSignedUrlIfCos,
} from '../utils'
import {
  AnyObj,
  generateProjectLabeledImageToStorage,
  pickFirstString,
} from './image-task-handler-shared'
import { buildLocationImagePromptCore } from '@/lib/location-image-prompt'
import { buildPropImagePromptCore } from '@/lib/prop-image-prompt'

const logger = createScopedLogger({ module: 'worker.location-image' })
const PARENT_REFERENCE_WAIT_TIMEOUT_MS = 180_000
const PARENT_REFERENCE_WAIT_INTERVAL_MS = 3_000

function resolvePayloadArtStyle(payload: AnyObj): ArtStyleValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(payload, 'artStyle')) return undefined
  const parsedArtStyle = typeof payload.artStyle === 'string' ? payload.artStyle.trim() : ''
  if (!isArtStyleValue(parsedArtStyle)) {
    throw new Error('Invalid artStyle in IMAGE_LOCATION payload')
  }
  return parsedArtStyle
}

interface LocationImageRecord {
  id: string
  locationId: string
  description: string | null
  availableSlots?: string | null
  imageUrl?: string | null
  isSelected?: boolean
  imageIndex: number
  location?: { name: string } | null
}

interface LocationWithImages {
  id: string
  name: string
  sceneType?: string | null
  parentId?: string | null
  selectedImageId?: string | null
  selectedImage?: { imageUrl?: string | null } | null
  parent?: LocationWithImages | null
  images?: LocationImageRecord[]
}

interface LocationImageTaskDb {
  locationImage: {
    findUnique(args: Record<string, unknown>): Promise<LocationImageRecord | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  novelPromotionLocation: {
    findUnique(args: Record<string, unknown>): Promise<LocationWithImages | null>
    findMany(args: Record<string, unknown>): Promise<LocationWithImages[]>
    update(args: Record<string, unknown>): Promise<unknown>
  }
}

function resolveRequestedLocationCount(payload: AnyObj): number | null {
  if (!Object.prototype.hasOwnProperty.call(payload, 'count')) return null
  return normalizeImageGenerationCount('location', payload.count)
}

function pickLocationReferenceImage(location: LocationWithImages | null | undefined): string | null {
  if (!location) return null
  const selectedImageUrl = location.selectedImage?.imageUrl?.trim()
  if (selectedImageUrl) return selectedImageUrl
  const selectedImage = location.images?.find((image) => image.isSelected && image.imageUrl?.trim())
  const fallbackImage = selectedImage || location.images?.find((image) => image.imageUrl?.trim())
  return fallbackImage?.imageUrl?.trim() || null
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForParentReferenceImage(params: {
  job: Job<TaskJobData>
  db: LocationImageTaskDb
  projectId: string
  locationId: string
  locationName: string
  parentId: string
  parentName: string
}): Promise<string | null> {
  const startedAt = Date.now()
  let attempt = 0

  await reportTaskProgress(params.job, 18, {
    stage: 'wait_parent_location_reference',
    stageLabel: '等待父级场景图',
    displayMode: 'detail',
    message: `等待「${params.parentName}」生成完成后作为局部场景参考`,
  })

  while (Date.now() - startedAt < PARENT_REFERENCE_WAIT_TIMEOUT_MS) {
    attempt += 1
    const parent = await params.db.novelPromotionLocation.findUnique({
      where: { id: params.parentId },
      include: {
        selectedImage: true,
        images: { orderBy: { imageIndex: 'asc' } },
      },
    })
    const parentImage = pickLocationReferenceImage(parent)
    const signedParentImage = toSignedUrlIfCos(parentImage, 3600)
    if (signedParentImage) {
      logger.info({
        action: 'location_image_parent_reference_wait_succeeded',
        message: 'parent location reference became available',
        projectId: params.projectId,
        details: {
          locationId: params.locationId,
          locationName: params.locationName,
          parentId: params.parentId,
          parentName: params.parentName,
          attempt,
          waitedMs: Date.now() - startedAt,
        },
      })
      return signedParentImage
    }
    await wait(PARENT_REFERENCE_WAIT_INTERVAL_MS)
  }

  logger.warn({
    action: 'location_image_parent_reference_wait_timeout',
    message: 'parent location reference unavailable before timeout',
    projectId: params.projectId,
    details: {
      locationId: params.locationId,
      locationName: params.locationName,
      parentId: params.parentId,
      parentName: params.parentName,
      timeoutMs: PARENT_REFERENCE_WAIT_TIMEOUT_MS,
    },
  })
  return null
}

function buildParentSceneReferenceInstruction(params: {
  parentName: string
  locationName: string
  locale: 'zh' | 'en'
}): string {
  if (params.locale === 'en') {
    return [
      '',
      `Parent scene reference image: ${params.parentName}.`,
      `Generate ${params.locationName} as a local area inside this parent scene. Keep the same world design, architectural material, color palette, light direction, scale logic, and era style from the reference image. Do not redesign the parent setting; extend it consistently into this local scene.`,
    ].join('\n')
  }
  return [
    '',
    `父级大场景参考图：${params.parentName}。`,
    `请将「${params.locationName}」生成为该父级场景内部/附属的局部空间，继承参考图中的世界观、建筑材质、色彩体系、光线方向、空间尺度和时代风格。不要重新设计父级场景，只在统一视觉语言下延展出该局部场景。`,
  ].join('\n')
}

export async function handleLocationImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const userId = job.data.userId
  const db = prisma as unknown as LocationImageTaskDb
  const models = await getProjectModels(projectId, userId)
  const modelId = models.locationModel
  if (!modelId) throw new Error('Location model not configured')
  const requestedCount = resolveRequestedLocationCount(payload)

  const payloadArtStyle = resolvePayloadArtStyle(payload)
  const artStyle = resolveWorkerArtStylePrompt({
    payloadArtStyle,
    modelConfigArtStyle: models.artStyle,
    modelConfigArtStylePrompt: models.artStylePrompt,
    locale: job.data.locale,
  })
  const assetType = payload.type === 'prop' ? 'prop' : 'location'

  // targetId may be locationId (group) or locationImageId (single)
  const maybeLocationImage = await db.locationImage.findUnique({
    where: { id: job.data.targetId },
    include: { location: true },
  })

  let locationImages: LocationImageRecord[] = []
  // 用于存储 locationId -> name 的映射，避免 images 子集缺少 location 关联
  const locationNameMap: Record<string, string> = {}

  if (maybeLocationImage) {
    // 来源 location 名字已 include，先记录
    if (maybeLocationImage.location?.name) {
      locationNameMap[maybeLocationImage.locationId] = maybeLocationImage.location.name
    }
    if (payload.imageIndex !== undefined) {
      locationImages = [maybeLocationImage]
    } else {
      const location = await db.novelPromotionLocation.findUnique({
        where: { id: maybeLocationImage.locationId },
        include: { images: { orderBy: { imageIndex: 'asc' } } },
      })
      if (location?.name) {
        locationNameMap[maybeLocationImage.locationId] = location.name
      }
      const orderedImages = location?.images || [maybeLocationImage]
      locationImages = requestedCount === null ? orderedImages : orderedImages.slice(0, requestedCount)
    }
  } else {
    const locationId = pickFirstString(payload.id, payload.locationId, job.data.targetId)
    if (!locationId) throw new Error('Location id missing')

    const location = await db.novelPromotionLocation.findUnique({
      where: { id: locationId },
      include: { images: { orderBy: { imageIndex: 'asc' } } },
    })

    if (!location || !location.images?.length) {
      throw new Error('Location images not found')
    }

    // 记录 location 名字
    locationNameMap[locationId] = location.name

    if (payload.imageIndex !== undefined) {
      const image = location.images.find((it) => it.imageIndex === Number(payload.imageIndex))
      if (!image) throw new Error(`Location image not found for imageIndex=${payload.imageIndex}`)
      locationImages = [image]
    } else {
      locationImages = requestedCount === null ? location.images : location.images.slice(0, requestedCount)
    }
  }

  // 补充查询缺失的 location 名字（兜底）
  const missingLocationIds = Array.from(new Set(locationImages.map((it) => it.locationId)))
    .filter((id) => !locationNameMap[id])
  if (missingLocationIds.length > 0) {
    const extras = await db.novelPromotionLocation.findMany({
      where: { id: { in: missingLocationIds } } as Record<string, unknown>,
    })
    for (const loc of extras) {
      locationNameMap[loc.id] = loc.name
    }
  }

  const locationIds = Array.from(new Set(locationImages.map((it) => it.locationId)))
  const parentReferenceByLocationId = new Map<string, { parentName: string; imageUrl: string }>()
  const hasSelectedImageByLocationId = new Map<string, boolean>()

  if (assetType === 'location' && locationIds.length > 0) {
    const contextLocations = await db.novelPromotionLocation.findMany({
      where: { id: { in: locationIds } } as Record<string, unknown>,
      include: {
        selectedImage: true,
        images: { orderBy: { imageIndex: 'asc' } },
        parent: {
          include: {
            selectedImage: true,
            images: { orderBy: { imageIndex: 'asc' } },
          },
        },
      },
    })
    for (const loc of contextLocations) {
      if (loc.name) locationNameMap[loc.id] = loc.name
      hasSelectedImageByLocationId.set(
        loc.id,
        Boolean(
          loc.selectedImageId
          || loc.selectedImage?.imageUrl?.trim()
          || loc.images?.some((image) => image.isSelected && image.imageUrl?.trim()),
        ),
      )
      if (loc.sceneType !== 'micro' || !loc.parent) continue
      const parentImage = pickLocationReferenceImage(loc.parent)
      let signedParentImage = toSignedUrlIfCos(parentImage, 3600)
      logger.info({
        action: 'location_image_parent_reference_resolved',
        message: 'location image parent reference resolved',
        projectId,
        details: {
          locationId: loc.id,
          locationName: loc.name,
          parentId: loc.parent.id,
          parentName: loc.parent.name,
          hasParentReference: Boolean(signedParentImage),
          parentSelectedImageId: loc.parent.selectedImageId ?? null,
        },
      })
      if (!signedParentImage) {
        signedParentImage = await waitForParentReferenceImage({
          job,
          db,
          projectId,
          locationId: loc.id,
          locationName: loc.name,
          parentId: loc.parent.id,
          parentName: loc.parent.name,
        })
      }
      if (!signedParentImage) continue
      const normalizedParentReferences = await normalizeReferenceImagesForGeneration([signedParentImage], {
        context: {
          projectId,
          taskId: job.data.taskId,
          locationId: loc.id,
          parentId: loc.parent.id,
          source: 'location_parent_reference',
        },
      })
      if (normalizedParentReferences.length === 0) continue
      parentReferenceByLocationId.set(loc.id, {
        parentName: loc.parent.name,
        imageUrl: normalizedParentReferences[0],
      })
    }
  }

  for (let i = 0; i < locationImages.length; i++) {
    const item = locationImages[i]
    // 优先用映射表中的名字，回退到 item.location?.name，最后才用默认值
    const name = locationNameMap[item.locationId] || item.location?.name || '场景'
    const promptBody = item.description || ''
    if (!promptBody) continue
    const promptCore = assetType === 'prop'
      ? buildPropImagePromptCore({
        description: promptBody,
      })
      : buildLocationImagePromptCore({
        description: promptBody,
        availableSlotsRaw: item.availableSlots,
        locale: job.data.locale === 'en' ? 'en' : 'zh',
      })

    const parentReference = parentReferenceByLocationId.get(item.locationId) || null
    const locale = job.data.locale === 'en' ? 'en' : 'zh'
    const promptWithParentReference = parentReference
      ? `${promptCore}${buildParentSceneReferenceInstruction({
        parentName: parentReference.parentName,
        locationName: name,
        locale,
      })}`
      : promptCore
    const promptWithSuffix = assetType === 'prop'
      ? addPropPromptSuffix(promptWithParentReference)
      : addLocationPromptSuffix(promptWithParentReference)
    const prompt = artStyle ? `${promptWithSuffix}，${artStyle}` : promptWithSuffix
    // ponytail: 背景图比例跟随项目视频比例(16:9/9:16/1:1 等),道具仍是固定 3:2 资产图。
    // videoRatio 已由 getProjectModelConfig 兜底为 '16:9',不会为空。
    const aspectRatio = assetType === 'prop' ? PROP_IMAGE_RATIO : (models.videoRatio || '16:9')
    await reportTaskProgress(job, 20 + Math.floor((i / Math.max(locationImages.length, 1)) * 55), {
      stage: 'generate_location_image',
      imageId: item.id,
    })

    const imageKey = await generateProjectLabeledImageToStorage({
      job,
      userId,
      modelId,
      prompt,
      label: name,
      targetId: item.id,
      keyPrefix: 'location',
      options: {
        aspectRatio,
        ...(parentReference ? { referenceImages: [parentReference.imageUrl] } : {}),
      },
      // 同一 task 内串行生成多张时，禁止复用已有 externalId，否则所有图都会一模一样
      allowTaskExternalIdResume: locationImages.length === 1,
    })

    await assertTaskActive(job, 'persist_location_image')
    const shouldAutoSelectLocationImage = assetType === 'location'
      && !hasSelectedImageByLocationId.get(item.locationId)
    await db.locationImage.update({
      where: { id: item.id },
      data: {
        imageUrl: imageKey,
        ...(shouldAutoSelectLocationImage ? { isSelected: true } : {}),
      },
    })
    if (shouldAutoSelectLocationImage) {
      await db.novelPromotionLocation.update({
        where: { id: item.locationId },
        data: { selectedImageId: item.id },
      })
      hasSelectedImageByLocationId.set(item.locationId, true)
      logger.info({
        action: 'location_image_auto_selected',
        message: 'location image auto selected after generation',
        projectId,
        details: {
          locationId: item.locationId,
          imageId: item.id,
          imageIndex: item.imageIndex,
        },
      })
    }
  }

  return {
    updated: locationImages.length,
    locationIds,
  }
}
