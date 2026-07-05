import { NextRequest, NextResponse } from 'next/server'
import { getStorageProvider } from '@/lib/storage'
import { getMediaObjectByPublicId } from '@/lib/media/service'
import { logWarn } from '@/lib/logging/core'

export const runtime = 'nodejs'

function buildEtag(media: { sha256?: string | null; id: string; updatedAt?: string | null }) {
  if (media.sha256) return `"${media.sha256}"`
  return `W/"media-${media.id}-${media.updatedAt || '0'}"`
}

function parseRangeHeader(range: string | null, size: number | null): { start: number; end?: number } | null {
  if (!range) return null
  const m = /^bytes=(\d+)-(\d*)$/.exec(range.trim())
  if (!m) return null
  const start = Number.parseInt(m[1]!, 10)
  const end = m[2] ? Number.parseInt(m[2], 10) : undefined
  if (!Number.isFinite(start) || start < 0) return null
  if (end != null && (!Number.isFinite(end) || end < start)) return null
  if (size != null && start >= size) return null
  return { start, end }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params
  const media = await getMediaObjectByPublicId(publicId)

  if (!media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }
  if (!media.storageKey) {
    return NextResponse.json({ error: 'Media storage key missing' }, { status: 500 })
  }

  const etag = buildEtag({
    id: media.id,
    sha256: media.sha256,
    updatedAt: media.updatedAt || null,
  })

  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  const rangeHeader = request.headers.get('range')
  const sizeBytes = media.sizeBytes != null ? Number(media.sizeBytes) : null
  const range = parseRangeHeader(rangeHeader, sizeBytes)
  const provider = getStorageProvider()

  try {
    // Prefer direct stream from storage provider (avoids server→public-internet fetch,
    // works in VPC / proxied-dev environments where outbound OSS access is blocked).
    if (typeof provider.getObjectStream === 'function') {
      const result = await provider.getObjectStream(media.storageKey, { range })
      const status = result.statusCode === 206 ? 206 : (range ? 206 : 200)
      const headers = new Headers()
      const contentType = media.mimeType || result.contentType || 'application/octet-stream'
      headers.set('Content-Type', contentType)
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      headers.set('ETag', etag)
      if (result.contentLength != null) headers.set('Content-Length', String(result.contentLength))
      if (result.contentRange) headers.set('Content-Range', result.contentRange)
      headers.set('Accept-Ranges', result.acceptsRanges || (contentType.startsWith('video/') ? 'bytes' : 'none'))
      return new Response(result.body as unknown as ReadableStream, { status, headers })
    }
  } catch (error: unknown) {
    logWarn('[m/route] getObjectStream failed, falling back to buffer', {
      publicId,
      err: error instanceof Error ? error.message : String(error),
    })
  }

  // Fallback: full buffer (no range). Used by providers without getObjectStream (minio/local).
  const buffer = await provider.getObjectBuffer(media.storageKey)
  const contentType = media.mimeType || 'application/octet-stream'
  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', etag)
  headers.set('Content-Length', String(buffer.length))
  if (contentType.startsWith('video/')) headers.set('Accept-Ranges', 'bytes')
  return new Response(new Uint8Array(buffer), { status: 200, headers })
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  void request
  const { publicId } = await context.params
  const media = await getMediaObjectByPublicId(publicId)
  if (!media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  const etag = buildEtag({
    id: media.id,
    sha256: media.sha256,
    updatedAt: media.updatedAt || null,
  })

  const headers = new Headers()
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', etag)
  if (media.mimeType) headers.set('Content-Type', media.mimeType)
  if (media.sizeBytes != null) headers.set('Content-Length', String(media.sizeBytes))
  if ((media.mimeType || '').startsWith('video/')) headers.set('Accept-Ranges', 'bytes')
  return new Response(null, { status: 200, headers })
}
