import { logAuthAction } from '@/lib/logging/semantic'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async () => {
  // This instance is private deployment, no public registration
  logAuthAction('REGISTER_REJECTED', 'unknown', { error: 'Private deployment' })
  throw new ApiError(
    'FORBIDDEN',
    { message: '该实例为私有部署，注册已关闭，请联系管理员创建账号' }
  )
})
