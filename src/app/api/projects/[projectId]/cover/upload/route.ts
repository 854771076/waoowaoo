import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { uploadObject, generateUniqueKey } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15MB

/**
 * POST /api/projects/[projectId]/cover/upload
 * 上传图片作为项目封面
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    throw new ApiError('INVALID_PARAMS', { message: 'file is required' })
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ApiError('INVALID_PARAMS', { message: `Unsupported file type: ${file.type}` })
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError('INVALID_PARAMS', { message: 'File exceeds 15MB limit' })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const processed = await sharp(buffer).jpeg({ quality: 90, mozjpeg: true }).toBuffer()

  const key = generateUniqueKey(`project-cover-${projectId}`, 'jpg')
  await uploadObject(processed, key, undefined, 'image/jpeg')

  const mediaRef = await ensureMediaObjectFromStorageKey(key, { mimeType: 'image/jpeg' })

  await prisma.project.update({
    where: { id: projectId },
    data: { coverMediaId: mediaRef.id },
  })

  return NextResponse.json({ success: true, media: mediaRef })
})
