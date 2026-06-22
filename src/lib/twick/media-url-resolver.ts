import { getMediaObjectById } from '@/lib/media/service'
import type { MediaObjRef } from './types'

const MEDIA_OBJ_PREFIX = 'mediaobj://'

export function isMediaObjRef(src: string): src is MediaObjRef {
  return src.startsWith(MEDIA_OBJ_PREFIX) && src.slice(MEDIA_OBJ_PREFIX.length).trim().length > 0
}

export function toMediaObjRef(mediaObjectId: string): MediaObjRef {
  const normalizedId = mediaObjectId.trim()
  if (!normalizedId) {
    throw new Error('Media object id is required')
  }
  return `${MEDIA_OBJ_PREFIX}${normalizedId}` as MediaObjRef
}

export function extractMediaObjectId(ref: MediaObjRef | string): string | null {
  if (!isMediaObjRef(ref)) return null
  return ref.slice(MEDIA_OBJ_PREFIX.length) || null
}

export async function resolveMediaUrl(ref: string): Promise<string> {
  if (!isMediaObjRef(ref)) {
    return ref
  }

  const mediaObjectId = extractMediaObjectId(ref)
  if (!mediaObjectId) {
    throw new Error(`Invalid media object reference: ${ref}`)
  }

  const mediaObject = await getMediaObjectById(mediaObjectId)
  if (!mediaObject) {
    throw new Error(`Media object not found: ${mediaObjectId}`)
  }

  return mediaObject.url
}

export async function resolveMediaUrls(refs: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()

  await Promise.all(refs.map(async (ref) => {
    resolved.set(ref, await resolveMediaUrl(ref))
  }))

  return resolved
}
