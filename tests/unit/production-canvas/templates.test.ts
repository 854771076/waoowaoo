import { describe, expect, it } from 'vitest'
import {
  shortDramaNodeTemplates,
  shortDramaWorkflowTemplate,
  toNodeTemplateUpsertData,
  toWorkflowTemplateUpsertData,
} from '@/lib/production-canvas/templates'

describe('production canvas templates', () => {
  it('registers every first-version short drama node kind once', () => {
    const templateKeys = new Set(shortDramaNodeTemplates.map((template) => template.templateKey))
    const kinds = new Set(shortDramaNodeTemplates.map((template) => template.kind))

    expect(shortDramaNodeTemplates).toHaveLength(13)
    expect(templateKeys.size).toBe(shortDramaNodeTemplates.length)
    expect(kinds).toEqual(new Set([
      'project-settings',
      'source-text',
      'episode-split',
      'episode',
      'character-library',
      'location-library',
      'script',
      'storyboard',
      'panel-image',
      'voice',
      'video',
      'editor-timeline',
      'export',
    ]))
  })

  it('builds Prisma upsert payloads for node templates', () => {
    const payload = toNodeTemplateUpsertData(shortDramaNodeTemplates[0])

    expect(payload.where).toEqual({ templateKey: 'short-drama.project-settings.v1' })
    expect(payload.create).toMatchObject({
      templateKey: 'short-drama.project-settings.v1',
      kind: 'project-settings',
      title: '项目设置',
      category: 'project',
      enabled: true,
    })
    expect(payload.update).toMatchObject({
      kind: 'project-settings',
      enabled: true,
    })
  })

  it('keeps workflow template connected to registered node templates', () => {
    const registeredTemplateKeys = new Set(shortDramaNodeTemplates.map((template) => template.templateKey))
    const workflowTemplateKeys = shortDramaWorkflowTemplate.definition.nodeTemplateKeys

    expect(workflowTemplateKeys.every((templateKey) => registeredTemplateKeys.has(templateKey))).toBe(true)
    expect(shortDramaWorkflowTemplate.definition.edgeTemplateKeys).toContainEqual({
      source: 'editor-timeline',
      target: 'export',
      kind: 'dependency',
    })

    const payload = toWorkflowTemplateUpsertData(shortDramaWorkflowTemplate)
    expect(payload.where).toEqual({ templateKey: 'short-drama.default.v1' })
    expect(payload.create).toMatchObject({
      templateKey: 'short-drama.default.v1',
      category: 'short-drama',
      enabled: true,
    })
  })
})
