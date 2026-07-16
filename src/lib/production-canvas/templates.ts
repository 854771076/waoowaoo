import type { Prisma } from '@prisma/client'
import type { ProductionCanvasNodeCategory, ProductionCanvasNodeKind } from './types'

export interface ProductionNodeTemplateDefinition {
  templateKey: string
  kind: ProductionCanvasNodeKind
  title: string
  category: ProductionCanvasNodeCategory
  description: string
  inputs: string[]
  outputs: string[]
  defaultData: Record<string, unknown>
}

export interface ProductionWorkflowTemplateDefinition {
  templateKey: string
  title: string
  category: string
  description: string
  definition: {
    nodeTemplateKeys: string[]
    edgeTemplateKeys: Array<{
      source: string
      target: string
      kind: string
    }>
  }
}

export const shortDramaNodeTemplates: ProductionNodeTemplateDefinition[] = [
  { templateKey: 'short-drama.project-settings.v1', kind: 'project-settings', title: '项目设置', category: 'project', description: '短剧项目配置和生产参数入口。', inputs: [], outputs: ['source-text'], defaultData: {} },
  { templateKey: 'short-drama.source-text.v1', kind: 'source-text', title: '原文/剧本', category: 'story', description: '承载原文导入、编辑和分集前置内容。', inputs: ['project-settings'], outputs: ['episode-split'], defaultData: {} },
  { templateKey: 'short-drama.episode-split.v1', kind: 'episode-split', title: '分集', category: 'story', description: '将原文拆分为短剧剧集。', inputs: ['source-text'], outputs: ['episode'], defaultData: {} },
  { templateKey: 'short-drama.episode.v1', kind: 'episode', title: '当前集', category: 'story', description: '当前生产集的聚合节点。', inputs: ['episode-split'], outputs: ['script'], defaultData: {} },
  { templateKey: 'short-drama.character-library.v1', kind: 'character-library', title: '角色资产', category: 'asset', description: '角色分析、形象和声音资产入口。', inputs: [], outputs: ['script'], defaultData: {} },
  { templateKey: 'short-drama.location-library.v1', kind: 'location-library', title: '场景资产', category: 'asset', description: '场景分析和场景图片资产入口。', inputs: [], outputs: ['script'], defaultData: {} },
  { templateKey: 'short-drama.script.v1', kind: 'script', title: '剧本/片段', category: 'generation', description: '从原文生成可用于分镜的剧情片段。', inputs: ['episode', 'character-library', 'location-library'], outputs: ['storyboard'], defaultData: {} },
  { templateKey: 'short-drama.storyboard.v1', kind: 'storyboard', title: '分镜脚本', category: 'generation', description: '生成和维护短剧分镜结构。', inputs: ['script'], outputs: ['panel-image'], defaultData: {} },
  { templateKey: 'short-drama.panel-image.v1', kind: 'panel-image', title: '分镜图片', category: 'generation', description: '为分镜镜头生成图片。', inputs: ['storyboard'], outputs: ['video'], defaultData: {} },
  { templateKey: 'short-drama.voice.v1', kind: 'voice', title: '配音/字幕', category: 'generation', description: '生成配音、字幕和口播资产。', inputs: ['episode'], outputs: ['editor-timeline'], defaultData: {} },
  { templateKey: 'short-drama.video.v1', kind: 'video', title: '视频片段', category: 'generation', description: '从分镜图片生成视频片段。', inputs: ['panel-image'], outputs: ['editor-timeline'], defaultData: {} },
  { templateKey: 'short-drama.editor-timeline.v1', kind: 'editor-timeline', title: '时间线编辑', category: 'editing', description: '进入编辑器组装视频、音频和字幕。', inputs: ['voice', 'video'], outputs: ['export'], defaultData: {} },
  { templateKey: 'short-drama.export.v1', kind: 'export', title: '导出成片', category: 'delivery', description: '渲染并导出最终成片。', inputs: ['editor-timeline'], outputs: [], defaultData: {} },
]

export const shortDramaWorkflowTemplate: ProductionWorkflowTemplateDefinition = {
  templateKey: 'short-drama.default.v1',
  title: '短剧默认生产链路',
  category: 'short-drama',
  description: '参照 LibTV 的节点化工作台，将现有短剧生产阶段串联为独立新链路。',
  definition: {
    nodeTemplateKeys: shortDramaNodeTemplates.map((template) => template.templateKey),
    edgeTemplateKeys: [
      { source: 'project-settings', target: 'source-text', kind: 'dependency' },
      { source: 'source-text', target: 'episode-split', kind: 'dependency' },
      { source: 'episode-split', target: 'episode', kind: 'dependency' },
      { source: 'episode', target: 'script', kind: 'dependency' },
      { source: 'character-library', target: 'script', kind: 'reference' },
      { source: 'location-library', target: 'script', kind: 'reference' },
      { source: 'script', target: 'storyboard', kind: 'dependency' },
      { source: 'storyboard', target: 'panel-image', kind: 'dependency' },
      { source: 'panel-image', target: 'video', kind: 'dependency' },
      { source: 'voice', target: 'editor-timeline', kind: 'dependency' },
      { source: 'video', target: 'editor-timeline', kind: 'dependency' },
      { source: 'editor-timeline', target: 'export', kind: 'dependency' },
    ],
  },
}

export function toNodeTemplateUpsertData(template: ProductionNodeTemplateDefinition) {
  const data = {
    kind: template.kind,
    title: template.title,
    category: template.category,
    description: template.description,
    inputSchema: { inputs: template.inputs } as Prisma.InputJsonValue,
    outputSchema: { outputs: template.outputs } as Prisma.InputJsonValue,
    defaultData: template.defaultData as Prisma.InputJsonValue,
    enabled: true,
  }
  return {
    where: { templateKey: template.templateKey },
    update: data,
    create: {
      templateKey: template.templateKey,
      ...data,
    },
  }
}

export function toWorkflowTemplateUpsertData(template: ProductionWorkflowTemplateDefinition) {
  const data = {
    title: template.title,
    category: template.category,
    description: template.description,
    definition: template.definition as unknown as Prisma.InputJsonValue,
    enabled: true,
  }
  return {
    where: { templateKey: template.templateKey },
    update: data,
    create: {
      templateKey: template.templateKey,
      ...data,
    },
  }
}
