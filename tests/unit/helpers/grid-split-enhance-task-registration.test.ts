import { describe, expect, it } from 'vitest'
import { isBillableTaskType, buildDefaultTaskBillingInfo } from '@/lib/billing/task-policy'
import { getQueueTypeByTaskType } from '@/lib/task/queues'
import { resolveTaskIntent } from '@/lib/task/intent'
import { TASK_TYPE } from '@/lib/task/types'

describe('grid split enhance task registration', () => {
  it('runs on image queue with image billing and modify intent', () => {
    expect(getQueueTypeByTaskType(TASK_TYPE.GRID_SPLIT_ENHANCE)).toBe('image')
    expect(resolveTaskIntent(TASK_TYPE.GRID_SPLIT_ENHANCE)).toBe('modify')
    expect(isBillableTaskType(TASK_TYPE.GRID_SPLIT_ENHANCE)).toBe(true)

    const billing = buildDefaultTaskBillingInfo(TASK_TYPE.GRID_SPLIT_ENHANCE, {
      imageModel: 'seedream',
      count: 3,
      generationOptions: { resolution: '1080p' },
    })

    expect(billing).toMatchObject({
      billable: true,
      apiType: 'image',
      model: 'seedream',
      quantity: 3,
      action: TASK_TYPE.GRID_SPLIT_ENHANCE,
    })
  })
})
