import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getMediaObjectById } from '@/lib/media/service'
import { isMediaObjRef, extractMediaObjectId } from '@/lib/twick/media-ref'

/**
 * POST /api/novel-promotion/[projectId]/media-resolve
 * 批量解析 mediaobj:// 引用为浏览器可访问的 URL
 *
 * 返回相对路径 (/m/{publicId})，让浏览器用当前 origin 访问，避免 INTERNAL_APP_URL
 * (如 http://127.0.0.1:3000) 造成跨源 CORS。server-side 渲染路径直接用
 * resolveMediaUrlForServerRender，不走这个 HTTP 接口。
 */
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { refs } = body as { refs?: string[] }

    if (!Array.isArray(refs) || refs.length === 0) {
        return NextResponse.json({ urls: {} })
    }

    const mediaObjRefs = refs.filter(ref => isMediaObjRef(ref))
    const resolvedUrls: Record<string, string> = {}

    await Promise.all(mediaObjRefs.map(async (ref) => {
        const mediaObjectId = extractMediaObjectId(ref)
        if (!mediaObjectId) return

        const mediaObject = await getMediaObjectById(mediaObjectId)
        if (!mediaObject || !mediaObject.url) return

        // Return the relative /m/ URL as-is; browser resolves it against the page origin.
        // toFetchableUrl() prepends INTERNAL_APP_URL (server-side origin) and breaks CORS
        // when the page is on localhost but INTERNAL_APP_URL is 127.0.0.1 (or vice versa).
        resolvedUrls[ref] = mediaObject.url
    }))

    return NextResponse.json({ urls: resolvedUrls })
})
