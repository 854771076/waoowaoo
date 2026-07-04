import { NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getProviderConfig } from '@/lib/api-config'
import { listBailianVoices } from '@/lib/providers/bailian'

/**
 * GET /api/novel-promotion/[projectId]/bailian-voices
 * 返回当前用户百炼账号下已存在的所有自定义音色(CosyVoice + Qwen)。
 * 仅用于前端"选择已有音色"下拉,不做持久化。
 */
export const GET = apiHandler(async (
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const { apiKey } = await getProviderConfig(session.user.id, 'bailian')
  const result = await listBailianVoices(apiKey)
  return NextResponse.json(result)
})
