'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useProjectData } from '@/lib/query/hooks'
import { EditorStageRuntimeProvider } from '@/lib/novel-promotion/stages/editor-stage-runtime-core'
import { EditorStageShell } from '../modes/novel-promotion/components/editor/EditorStageShell'
import { WorkspaceProvider } from '../modes/novel-promotion/WorkspaceProvider'
import { resolveSelectedEpisodeId } from '../episode-selection'
import { useRouter } from '@/i18n/navigation'

const DEFAULT_VIDEO_SIZE = { width: 720, height: 1280 }

// ponytail: same math as EditorStage — extracted here would be a one-import util,
// but it's 12 lines used in exactly two places. Duplicate is cheaper than the file.
function resolveVideoSize(videoRatio: string | undefined): { width: number; height: number } {
  if (!videoRatio) return DEFAULT_VIDEO_SIZE
  const [rawWidth, rawHeight] = videoRatio.split(':').map((part) => Number(part))
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return DEFAULT_VIDEO_SIZE
  }
  const longSide = 1280
  const shortSide = Math.round((longSide * Math.min(rawWidth, rawHeight)) / Math.max(rawWidth, rawHeight))
  return rawWidth >= rawHeight
    ? { width: longSide, height: shortSide }
    : { width: shortSide, height: longSide }
}

export default function EditorFullscreenPage() {
  const params = useParams<{ projectId?: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tc = useTranslations('common')
  if (!params?.projectId) throw new Error('EditorFullscreenPage requires projectId')

  const projectId = params.projectId
  const urlEpisodeId = searchParams?.get('episode') ?? null

  const { data: project, isLoading } = useProjectData(projectId)
  const episodes = project?.novelPromotionData?.episodes ?? []
  const episodeId = resolveSelectedEpisodeId(episodes, urlEpisodeId)
  const { width, height } = resolveVideoSize(project?.novelPromotionData?.videoRatio ?? undefined)

  if (isLoading || !project) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-[var(--glass-text-secondary)]">
        {tc('loading')}
      </div>
    )
  }

  if (!episodeId) {
    router.replace({ pathname: `/workspace/${projectId}` })
    return null
  }

  return (
    <WorkspaceProvider projectId={projectId} episodeId={episodeId}>
      <EditorStageRuntimeProvider
        projectId={projectId}
        episodeId={episodeId}
        videoWidth={width}
        videoHeight={height}
      >
        <EditorStageShell videoWidth={width} videoHeight={height} fullscreen />
      </EditorStageRuntimeProvider>
    </WorkspaceProvider>
  )
}
