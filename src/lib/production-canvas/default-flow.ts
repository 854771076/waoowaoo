import type { ProductionCanvasNodeData, ProductionCanvasNodeKind, ProductionCanvasNodeStatus } from './types'

export interface DefaultCanvasNodeDraft {
  nodeKey: string
  kind: ProductionCanvasNodeKind
  templateKey: string
  title: string
  x: number
  y: number
  width: number
  height: number
  refType: string | null
  refId: string | null
  status: ProductionCanvasNodeStatus
  data: ProductionCanvasNodeData
}

export interface DefaultCanvasEdgeDraft {
  edgeKey: string
  sourceNodeKey: string
  targetNodeKey: string
  kind: string
  label?: string
}

type MetricValue = string | number

function metric(label: string, value: MetricValue) {
  return { label, value }
}

function node(input: Omit<DefaultCanvasNodeDraft, 'x' | 'y' | 'width' | 'height'> & { column: number; row?: number }): DefaultCanvasNodeDraft {
  return {
    ...input,
    x: input.column * 360,
    y: (input.row || 0) * 190,
    width: 300,
    height: 148,
  }
}

function edge(sourceNodeKey: string, targetNodeKey: string, label?: string): DefaultCanvasEdgeDraft {
  return {
    edgeKey: `${sourceNodeKey}->${targetNodeKey}`,
    sourceNodeKey,
    targetNodeKey,
    kind: 'dependency',
    label,
  }
}

export interface ShortDramaFlowFacts {
  projectId: string
  projectName: string
  novelPromotionProjectId: string | null
  activeEpisodeId: string | null
  activeEpisodeName: string | null
  episodeCount: number
  characterCount: number
  confirmedCharacterCount: number
  locationCount: number
  selectedLocationImageCount: number
  clipCount: number
  storyboardCount: number
  panelCount: number
  panelImageCount: number
  panelVideoCount: number
  hasSourceText: boolean
  hasVoice: boolean
  editorProjectId: string | null
  editorRenderStatus: string | null
  editorRenderOutputMediaObjectId: string | null
  isEpisodeSplitRunning: boolean
  isScriptRunning: boolean
  isStoryboardRunning: boolean
  isEditorRenderRunning: boolean
}

function doneOrReady(done: boolean, ready: boolean): ProductionCanvasNodeStatus {
  if (done) return 'done'
  if (ready) return 'ready'
  return 'idle'
}

function runningDoneOrReady(running: boolean, done: boolean, ready: boolean): ProductionCanvasNodeStatus {
  if (running) return 'running'
  return doneOrReady(done, ready)
}

export function buildDefaultShortDramaCanvas(facts: ShortDramaFlowFacts): {
  nodes: DefaultCanvasNodeDraft[]
  edges: DefaultCanvasEdgeDraft[]
} {
  const hasNovelProject = !!facts.novelPromotionProjectId
  const hasEpisode = !!facts.activeEpisodeId
  const hasStoryboard = facts.storyboardCount > 0 || facts.panelCount > 0
  const hasEditor = !!facts.editorProjectId
  const hasExport = facts.editorRenderStatus === 'DONE' || !!facts.editorRenderOutputMediaObjectId

  const nodes = [
    node({
      nodeKey: 'project-settings',
      kind: 'project-settings',
      templateKey: 'short-drama.project-settings.v1',
      title: '项目设置',
      column: 0,
      refType: 'Project',
      refId: facts.projectId,
      status: hasNovelProject ? 'done' : 'blocked',
      data: {
        category: 'project',
        summary: hasNovelProject ? '短剧项目配置已建立' : '缺少短剧项目配置',
        metrics: [
          metric('项目', facts.projectName),
          metric('模式', hasNovelProject ? '短剧生产' : '未初始化'),
        ],
        actions: [
          { key: 'open', label: '打开项目', kind: 'open', href: `/workspace/${facts.projectId}` },
          { key: 'refresh', label: '刷新节点状态', kind: 'refresh' },
        ],
      },
    }),
    node({
      nodeKey: 'source-text',
      kind: 'source-text',
      templateKey: 'short-drama.source-text.v1',
      title: '原文/剧本',
      column: 1,
      refType: facts.activeEpisodeId ? 'NovelPromotionEpisode' : 'NovelPromotionProject',
      refId: facts.activeEpisodeId || facts.novelPromotionProjectId,
      status: doneOrReady(facts.hasSourceText, hasEpisode),
      data: {
        category: 'story',
        summary: facts.hasSourceText ? '当前集已有原文内容' : '等待导入或编辑原文',
        metrics: [
          metric('当前集', facts.activeEpisodeName || '未选择'),
          metric('原文', facts.hasSourceText ? '已填写' : '缺失'),
        ],
        actions: [
          { key: 'open', label: '编辑原文', kind: 'open', href: `/workspace/${facts.projectId}?stage=config${facts.activeEpisodeId ? `&episode=${facts.activeEpisodeId}` : ''}` },
        ],
      },
    }),
    node({
      nodeKey: 'episode-split',
      kind: 'episode-split',
      templateKey: 'short-drama.episode-split.v1',
      title: '分集',
      column: 2,
      refType: 'NovelPromotionProject',
      refId: facts.novelPromotionProjectId,
      status: runningDoneOrReady(facts.isEpisodeSplitRunning, facts.episodeCount > 0, facts.hasSourceText),
      data: {
        category: 'story',
        summary: facts.episodeCount > 0 ? '已有可生产剧集' : '可从原文拆分剧集',
        metrics: [
          metric('剧集数', facts.episodeCount),
          metric('当前集', facts.activeEpisodeName || '无'),
        ],
        actions: [
          { key: 'open', label: '管理剧集', kind: 'open', href: `/workspace/${facts.projectId}?stage=config` },
          { key: 'split', label: '智能分集', kind: 'run', disabled: !facts.hasSourceText, disabledReason: '需要先填写原文' },
        ],
      },
    }),
    node({
      nodeKey: 'episode',
      kind: 'episode',
      templateKey: 'short-drama.episode.v1',
      title: '当前集',
      column: 3,
      refType: 'NovelPromotionEpisode',
      refId: facts.activeEpisodeId,
      status: hasEpisode ? 'done' : 'idle',
      data: {
        category: 'story',
        summary: facts.activeEpisodeName || '尚未创建剧集',
        metrics: [
          metric('片段', facts.clipCount),
          metric('分镜组', facts.storyboardCount),
        ],
        actions: [
          { key: 'open', label: '进入当前集', kind: 'open', href: `/workspace/${facts.projectId}${facts.activeEpisodeId ? `?episode=${facts.activeEpisodeId}` : ''}` },
        ],
      },
    }),
    node({
      nodeKey: 'character-library',
      kind: 'character-library',
      templateKey: 'short-drama.character-library.v1',
      title: '角色资产',
      column: 4,
      row: -1,
      refType: 'NovelPromotionProject',
      refId: facts.novelPromotionProjectId,
      status: doneOrReady(facts.characterCount > 0, hasEpisode),
      data: {
        category: 'asset',
        summary: facts.characterCount > 0 ? '角色库已有资产' : '可从剧本分析角色',
        metrics: [
          metric('角色', facts.characterCount),
          metric('已确认', facts.confirmedCharacterCount),
        ],
        actions: [
          { key: 'open', label: '打开角色资产', kind: 'open', href: `/workspace/${facts.projectId}?stage=assets${facts.activeEpisodeId ? `&episode=${facts.activeEpisodeId}` : ''}` },
        ],
      },
    }),
    node({
      nodeKey: 'location-library',
      kind: 'location-library',
      templateKey: 'short-drama.location-library.v1',
      title: '场景资产',
      column: 4,
      row: 1,
      refType: 'NovelPromotionProject',
      refId: facts.novelPromotionProjectId,
      status: doneOrReady(facts.locationCount > 0, hasEpisode),
      data: {
        category: 'asset',
        summary: facts.locationCount > 0 ? '场景库已有资产' : '可从剧本分析场景',
        metrics: [
          metric('场景', facts.locationCount),
          metric('选中图', facts.selectedLocationImageCount),
        ],
        actions: [
          { key: 'open', label: '打开场景资产', kind: 'open', href: `/workspace/${facts.projectId}?stage=assets${facts.activeEpisodeId ? `&episode=${facts.activeEpisodeId}` : ''}` },
        ],
      },
    }),
    node({
      nodeKey: 'script',
      kind: 'script',
      templateKey: 'short-drama.script.v1',
      title: '剧本/片段',
      column: 5,
      refType: 'NovelPromotionEpisode',
      refId: facts.activeEpisodeId,
      status: runningDoneOrReady(facts.isScriptRunning, facts.clipCount > 0, facts.hasSourceText),
      data: {
        category: 'generation',
        summary: facts.clipCount > 0 ? '已生成剧情片段' : '可从原文生成剧本片段',
        metrics: [
          metric('片段数', facts.clipCount),
          metric('前置', facts.hasSourceText ? '已满足' : '缺原文'),
        ],
        actions: [
          { key: 'open', label: '打开剧本', kind: 'open', href: `/workspace/${facts.projectId}?stage=script${facts.activeEpisodeId ? `&episode=${facts.activeEpisodeId}` : ''}` },
          { key: 'generate', label: '文转剧本', kind: 'run', disabled: !facts.hasSourceText, disabledReason: '需要原文' },
        ],
      },
    }),
    node({
      nodeKey: 'storyboard',
      kind: 'storyboard',
      templateKey: 'short-drama.storyboard.v1',
      title: '分镜脚本',
      column: 6,
      refType: 'NovelPromotionEpisode',
      refId: facts.activeEpisodeId,
      status: runningDoneOrReady(facts.isStoryboardRunning, hasStoryboard, facts.clipCount > 0),
      data: {
        category: 'generation',
        summary: hasStoryboard ? '已有分镜结构' : '可从剧本生成分镜',
        metrics: [
          metric('分镜组', facts.storyboardCount),
          metric('镜头', facts.panelCount),
        ],
        actions: [
          { key: 'open', label: '打开分镜', kind: 'open', href: `/workspace/${facts.projectId}?stage=storyboard${facts.activeEpisodeId ? `&episode=${facts.activeEpisodeId}` : ''}` },
          { key: 'generate', label: '生成分镜', kind: 'run', disabled: facts.clipCount === 0, disabledReason: '需要剧本片段' },
        ],
      },
    }),
    node({
      nodeKey: 'panel-image',
      kind: 'panel-image',
      templateKey: 'short-drama.panel-image.v1',
      title: '分镜图片',
      column: 7,
      refType: 'NovelPromotionEpisode',
      refId: facts.activeEpisodeId,
      status: doneOrReady(facts.panelImageCount > 0, hasStoryboard),
      data: {
        category: 'generation',
        summary: facts.panelImageCount > 0 ? '已有分镜图片' : '可为分镜生成图片',
        metrics: [
          metric('已生图', facts.panelImageCount),
          metric('总镜头', facts.panelCount),
        ],
        actions: [
          { key: 'open', label: '查看图片', kind: 'open', href: `/workspace/${facts.projectId}?stage=storyboard${facts.activeEpisodeId ? `&episode=${facts.activeEpisodeId}` : ''}` },
          {
            key: 'generate-missing',
            label: '生成缺失',
            kind: 'run',
            disabled: true,
            disabledReason: hasStoryboard ? '请进入分镜页选择具体镜头生成，避免批量误触发成本任务' : '需要分镜脚本',
          },
        ],
      },
    }),
    node({
      nodeKey: 'voice',
      kind: 'voice',
      templateKey: 'short-drama.voice.v1',
      title: '配音/字幕',
      column: 8,
      row: -1,
      refType: 'NovelPromotionEpisode',
      refId: facts.activeEpisodeId,
      status: doneOrReady(facts.hasVoice, hasEpisode),
      data: {
        category: 'generation',
        summary: facts.hasVoice ? '已有音频或字幕' : '可生成配音和字幕',
        metrics: [
          metric('语音', facts.hasVoice ? '已生成' : '未生成'),
          metric('当前集', facts.activeEpisodeName || '无'),
        ],
        actions: [
          { key: 'open', label: '打开配音', kind: 'open', href: `/workspace/${facts.projectId}?stage=voice${facts.activeEpisodeId ? `&episode=${facts.activeEpisodeId}` : ''}` },
        ],
      },
    }),
    node({
      nodeKey: 'video',
      kind: 'video',
      templateKey: 'short-drama.video.v1',
      title: '视频片段',
      column: 8,
      row: 1,
      refType: 'NovelPromotionEpisode',
      refId: facts.activeEpisodeId,
      status: doneOrReady(facts.panelVideoCount > 0, facts.panelImageCount > 0),
      data: {
        category: 'generation',
        summary: facts.panelVideoCount > 0 ? '已有视频片段' : '可从分镜图片生成视频',
        metrics: [
          metric('视频', facts.panelVideoCount),
          metric('图片', facts.panelImageCount),
        ],
        actions: [
          { key: 'open', label: '打开视频', kind: 'open', href: `/workspace/${facts.projectId}?stage=videos${facts.activeEpisodeId ? `&episode=${facts.activeEpisodeId}` : ''}` },
          {
            key: 'generate',
            label: '生成视频',
            kind: 'run',
            disabled: true,
            disabledReason: facts.panelImageCount > 0 ? '请进入视频页选择具体镜头生成，避免批量误触发成本任务' : '需要分镜图片',
          },
        ],
      },
    }),
    node({
      nodeKey: 'editor-timeline',
      kind: 'editor-timeline',
      templateKey: 'short-drama.editor-timeline.v1',
      title: '时间线编辑',
      column: 9,
      refType: 'NovelPromotionEditorProject',
      refId: facts.editorProjectId,
      status: doneOrReady(hasEditor, facts.panelVideoCount > 0 || facts.hasVoice),
      data: {
        category: 'editing',
        summary: hasEditor ? '时间线项目已建立' : '可进入编辑器合成',
        metrics: [
          metric('编辑器', hasEditor ? '已创建' : '未创建'),
          metric('渲染', facts.editorRenderStatus || 'IDLE'),
        ],
        actions: [
          { key: 'open', label: '打开编辑器', kind: 'open', href: `/workspace/${facts.projectId}/editor${facts.activeEpisodeId ? `?episode=${facts.activeEpisodeId}` : ''}` },
        ],
      },
    }),
    node({
      nodeKey: 'export',
      kind: 'export',
      templateKey: 'short-drama.export.v1',
      title: '导出成片',
      column: 10,
      refType: 'NovelPromotionEditorProject',
      refId: facts.editorProjectId,
      status: facts.isEditorRenderRunning || facts.editorRenderStatus === 'PROCESSING' ? 'running' : doneOrReady(hasExport, hasEditor),
      data: {
        category: 'delivery',
        summary: hasExport ? '已有导出成片' : '等待时间线渲染导出',
        metrics: [
          metric('状态', facts.editorRenderStatus || 'IDLE'),
          metric('输出', facts.editorRenderOutputMediaObjectId ? '已生成' : '无'),
        ],
        actions: [
          { key: 'open-editor', label: '前往导出', kind: 'open', href: `/workspace/${facts.projectId}/editor${facts.activeEpisodeId ? `?episode=${facts.activeEpisodeId}` : ''}` },
          { key: 'render', label: '提交渲染', kind: 'run', disabled: !hasEditor, disabledReason: '需要先创建时间线项目' },
        ],
      },
    }),
  ]

  return {
    nodes,
    edges: [
      edge('project-settings', 'source-text'),
      edge('source-text', 'episode-split'),
      edge('episode-split', 'episode'),
      edge('episode', 'script'),
      edge('character-library', 'script', '资产约束'),
      edge('location-library', 'script', '资产约束'),
      edge('script', 'storyboard'),
      edge('storyboard', 'panel-image'),
      edge('panel-image', 'video'),
      edge('voice', 'editor-timeline'),
      edge('video', 'editor-timeline'),
      edge('editor-timeline', 'export'),
    ],
  }
}
