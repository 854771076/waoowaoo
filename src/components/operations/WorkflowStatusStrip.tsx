import React from 'react'

export type WorkflowStatusTone = 'default' | 'success' | 'warning' | 'muted'

export interface WorkflowStatusItem {
  label: string
  value: string | number
  tone?: WorkflowStatusTone
}

interface WorkflowStatusStripProps {
  title: string
  items: WorkflowStatusItem[]
  className?: string
}

const toneClassName: Record<WorkflowStatusTone, string> = {
  default: 'border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)]',
  success: 'border-[var(--glass-tone-success-fg)]/25 bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]',
  warning: 'border-[var(--glass-tone-warning-fg)]/25 bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]',
  muted: 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)]',
}

export default function WorkflowStatusStrip({
  title,
  items,
  className = '',
}: WorkflowStatusStripProps) {
  if (items.length === 0) return null

  return (
    <div
      data-testid="workflow-status-strip"
      aria-label={title}
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 ${className}`}
    >
      <span className="text-xs font-semibold text-[var(--glass-text-primary)]">{title}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => (
          <span
            key={`${item.label}:${item.value}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${toneClassName[item.tone || 'default']}`}
          >
            <span>{item.label}</span>
            <span className="font-semibold tabular-nums">{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
