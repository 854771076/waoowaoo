import { describe, expect, it } from 'vitest'
import { buildDefaultShortDramaCanvas, type ShortDramaFlowFacts } from '@/lib/production-canvas/default-flow'

function baseFacts(overrides: Partial<ShortDramaFlowFacts> = {}): ShortDramaFlowFacts {
  return {
    projectId: 'project-1',
    projectName: '测试短剧',
    novelPromotionProjectId: 'novel-project-1',
    activeEpisodeId: 'episode-1',
    activeEpisodeName: '第 1 集',
    episodeCount: 1,
    characterCount: 2,
    confirmedCharacterCount: 1,
    locationCount: 3,
    selectedLocationImageCount: 2,
    clipCount: 4,
    storyboardCount: 2,
    panelCount: 12,
    panelImageCount: 8,
    panelVideoCount: 5,
    hasSourceText: true,
    hasVoice: true,
    editorProjectId: 'editor-1',
    editorRenderStatus: 'IDLE',
    editorRenderOutputMediaObjectId: null,
    isEpisodeSplitRunning: false,
    isScriptRunning: false,
    isStoryboardRunning: false,
    isEditorRenderRunning: false,
    ...overrides,
  }
}

describe('buildDefaultShortDramaCanvas', () => {
  it('builds the first-version short drama production chain', () => {
    const flow = buildDefaultShortDramaCanvas(baseFacts())

    expect(flow.nodes.map((node) => node.kind)).toEqual([
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
    ])
    expect(flow.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeKey: 'source-text', targetNodeKey: 'episode-split' }),
      expect.objectContaining({ sourceNodeKey: 'storyboard', targetNodeKey: 'panel-image' }),
      expect.objectContaining({ sourceNodeKey: 'editor-timeline', targetNodeKey: 'export' }),
    ]))
  })

  it('keeps business data as references instead of copying old workflow payloads', () => {
    const flow = buildDefaultShortDramaCanvas(baseFacts())
    const episodeNode = flow.nodes.find((node) => node.kind === 'episode')
    const editorNode = flow.nodes.find((node) => node.kind === 'editor-timeline')

    expect(episodeNode).toMatchObject({
      refType: 'NovelPromotionEpisode',
      refId: 'episode-1',
    })
    expect(editorNode).toMatchObject({
      refType: 'NovelPromotionEditorProject',
      refId: 'editor-1',
    })
  })

  it('marks downstream nodes as ready instead of done when outputs are missing', () => {
    const flow = buildDefaultShortDramaCanvas(baseFacts({
      storyboardCount: 0,
      panelCount: 0,
      panelImageCount: 0,
      panelVideoCount: 0,
      editorProjectId: null,
      hasVoice: false,
    }))

    expect(flow.nodes.find((node) => node.kind === 'storyboard')?.status).toBe('ready')
    expect(flow.nodes.find((node) => node.kind === 'panel-image')?.status).toBe('idle')
    expect(flow.nodes.find((node) => node.kind === 'video')?.status).toBe('idle')
    expect(flow.nodes.find((node) => node.kind === 'editor-timeline')?.status).toBe('idle')
  })

  it('exposes executable actions only when node prerequisites are represented', () => {
    const flow = buildDefaultShortDramaCanvas(baseFacts())

    expect(flow.nodes.find((node) => node.kind === 'project-settings')?.data.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'refresh', kind: 'refresh' }),
    ]))
    expect(flow.nodes.find((node) => node.kind === 'episode-split')?.data.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'split', kind: 'run', disabled: false }),
    ]))
    expect(flow.nodes.find((node) => node.kind === 'script')?.data.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'generate', kind: 'run', disabled: false }),
    ]))
    expect(flow.nodes.find((node) => node.kind === 'storyboard')?.data.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'generate', kind: 'run', disabled: false }),
    ]))
    expect(flow.nodes.find((node) => node.kind === 'export')?.data.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'render', kind: 'run', disabled: false }),
    ]))
  })

  it('disables render action until an editor timeline project exists', () => {
    const flow = buildDefaultShortDramaCanvas(baseFacts({ editorProjectId: null }))

    expect(flow.nodes.find((node) => node.kind === 'export')?.data.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'render',
        disabled: true,
        disabledReason: '需要先创建时间线项目',
      }),
    ]))
  })

  it('keeps cost-heavy panel-level generation disabled until scoped controls exist', () => {
    const flow = buildDefaultShortDramaCanvas(baseFacts())

    expect(flow.nodes.find((node) => node.kind === 'panel-image')?.data.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'generate-missing',
        disabled: true,
        disabledReason: '请进入分镜页选择具体镜头生成，避免批量误触发成本任务',
      }),
    ]))
    expect(flow.nodes.find((node) => node.kind === 'video')?.data.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'generate',
        disabled: true,
        disabledReason: '请进入视频页选择具体镜头生成，避免批量误触发成本任务',
      }),
    ]))
  })

  it('shows running status from active task facts before outputs are produced', () => {
    const flow = buildDefaultShortDramaCanvas(baseFacts({
      clipCount: 0,
      storyboardCount: 0,
      panelCount: 0,
      panelImageCount: 0,
      panelVideoCount: 0,
      editorRenderStatus: 'IDLE',
      isScriptRunning: true,
      isStoryboardRunning: true,
      isEditorRenderRunning: true,
    }))

    expect(flow.nodes.find((node) => node.kind === 'script')?.status).toBe('running')
    expect(flow.nodes.find((node) => node.kind === 'storyboard')?.status).toBe('running')
    expect(flow.nodes.find((node) => node.kind === 'export')?.status).toBe('running')
  })
})
