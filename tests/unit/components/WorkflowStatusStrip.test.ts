// @vitest-environment jsdom

import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WorkflowStatusStrip from '@/components/operations/WorkflowStatusStrip'

describe('WorkflowStatusStrip', () => {
  it('renders compact operational status items', () => {
    render(createElement(WorkflowStatusStrip, {
      title: '画风库',
      items: [
        { label: '全部', value: 12 },
        { label: '启用', value: 9, tone: 'success' },
        { label: '停用', value: 3, tone: 'muted' },
      ],
    }))

    expect(screen.getByTestId('workflow-status-strip').getAttribute('aria-label')).toBe('画风库')
    expect(screen.getByText('画风库')).toBeTruthy()
    expect(screen.getByText('全部')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('启用')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy()
  })

  it('does not render when there are no status items', () => {
    const { container } = render(createElement(WorkflowStatusStrip, {
      title: '空状态',
      items: [],
    }))

    expect(container.innerHTML).toBe('')
  })
})
