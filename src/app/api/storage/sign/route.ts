import path from 'node:path'
import { NextRequest } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getStorageProvider } from '@/lib/storage'

export const runtime = 'nodejs'

// ponytail: proxy bytes through Next instead of 302-redirecting to OSS/MinIO. Browser stays on same origin → no CORS.
// Upgrade path: route callers through /m/{publicId} (MediaObject) for immutable caching; this stays as fallback for temp/non-registered keys.
const DEFAULT_EXPIRES_SECONDS = 3600
const PROXY_CACHE = 'private, max-age=300'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
}

function guessMime(key: string): string {
  return MIME_BY_EXT[path.extname(key).toLowerCase()] || 'application/octet-stream'
}

export const GET = apiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  const expiresRaw = searchParams.get('expires')

  if (!key) {
    throw new ApiError('INVALID_PARAMS')
  }

  // expires accepted for API parity with existing callers; proxy uses its own Cache-Control.
  const expires = expiresRaw ? Number.parseInt(expiresRaw, 10) : DEFAULT_EXPIRES_SECONDS
  void expires

  const provider = getStorageProvider()
  const rangeHeader = request.headers.get('range')
  const contentType = guessMime(key)
  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': PROXY_CACHE,
  }

  if (typeof provider.getObjectStream === 'function') {
    const result = await provider.getObjectStream(key, { rangeHeader })
    const headers = new Headers(baseHeaders)
    if (result.contentLength != null) headers.set('Content-Length', String(result.contentLength))
    if (result.contentRange) headers.set('Content-Range', result.contentRange)
    if (result.acceptsRanges) headers.set('Accept-Ranges', result.acceptsRanges)
    if (result.contentType) headers.set('Content-Type', result.contentType)
    return new Response(result.body as unknown as ReadableStream, {
      status: result.statusCode ?? (rangeHeader ? 206 : 200),
      headers,
    })
  }

  const buffer = await provider.getObjectBuffer(key)
  const headers = new Headers(baseHeaders)
  headers.set('Content-Length', String(buffer.length))
  if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
    headers.set('Accept-Ranges', 'bytes')
  }
  return new Response(new Uint8Array(buffer), { status: 200, headers })
})
