'use client'

import VideoEditor, {
  DEFAULT_ELEMENT_COLORS,
  DEFAULT_TIMELINE_TICK_CONFIGS,
  DEFAULT_TIMELINE_ZOOM_CONFIG,
  INITIAL_TIMELINE_DATA,
} from '@twick/video-editor'
import '@twick/video-editor/dist/video-editor.css'
import '@twick/timeline/dist/timeline.css'
import { LivePlayerProvider } from '@twick/live-player'
import { TimelineProvider, useTimelineContext } from '@twick/timeline'

function LeftPanelPoc() {
  const { editor } = useTimelineContext()

  const handleAddTrack = () => {
    editor.addTrack(`测试轨道 ${new Date().toLocaleTimeString()}`, 'video')
  }

  return (
    <aside className="h-full w-64 border-r border-slate-200 bg-white p-4 text-slate-900">
      <h2 className="text-lg font-semibold">左侧素材面板 POC</h2>
      <p className="mt-2 text-sm text-slate-500">
        通过 useTimelineContext 调用 editor.addTrack 写入 timeline。
      </p>
      <button
        type="button"
        onClick={handleAddTrack}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        添加测试轨道
      </button>
    </aside>
  )
}

function RightPanelPoc() {
  const { present, selectedItem } = useTimelineContext()
  const trackCount = present?.tracks?.length ?? 0

  return (
    <aside className="h-full w-72 border-l border-slate-200 bg-white p-4 text-slate-900">
      <h2 className="text-lg font-semibold">右侧 AI 面板 POC</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-slate-500">当前轨道数量</dt>
          <dd className="font-mono text-base">{trackCount}</dd>
        </div>
        <div>
          <dt className="text-slate-500">选中元素 id</dt>
          <dd className="break-all font-mono text-xs">
            {selectedItem?.getId() ?? '未选中'}
          </dd>
        </div>
      </dl>
    </aside>
  )
}

export default function TwickPocPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">Twick VideoEditor 三栏 POC</h1>
        <p className="mt-1 text-sm text-slate-600">
          使用 @twick/video-editor 注入自定义 leftPanel/rightPanel，并在外部面板读写 timeline context。
        </p>
      </div>

      <div className="h-[calc(100vh-132px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <LivePlayerProvider>
          <TimelineProvider
            contextId="twick-poc-timeline"
            initialData={INITIAL_TIMELINE_DATA}
            resolution={{ width: 720, height: 1280 }}
            analytics={{ enabled: false }}
          >
            <VideoEditor
              leftPanel={<LeftPanelPoc />}
              rightPanel={<RightPanelPoc />}
              defaultPlayControls
              editorConfig={{
                videoProps: {
                  width: 720,
                  height: 1280,
                  backgroundColor: '#ffffff',
                },
                // POC待确认：业务最终是否启用 canvasMode，以及尺寸/质量配置。
                canvasMode: true,
                playerProps: {
                  maxWidth: 420,
                  maxHeight: 560,
                },
                timelineTickConfigs: DEFAULT_TIMELINE_TICK_CONFIGS,
                timelineZoomConfig: DEFAULT_TIMELINE_ZOOM_CONFIG,
                elementColors: DEFAULT_ELEMENT_COLORS,
              }}
            />
          </TimelineProvider>
        </LivePlayerProvider>
      </div>
    </main>
  )
}
