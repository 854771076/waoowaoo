'use client'

import { serializeDirectorProject } from '@/lib/director-desk/schema'
import { captureCameraScreenshot } from './screenshot'
import { useDirectorStore } from '../store/directorStore'
import { collectBoundShotsForSave, getActiveCameraSnapshot } from '../store/directorSelectors'

export const DIRECTOR_DESK_SAVED_EVENT = 'director-desk:saved'

export function notifyDirectorDeskSaved(panelId: string) {
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: DIRECTOR_DESK_SAVED_EVENT, panelId }, '*')
    }
  } catch {
    /* cross-origin opener，无法通知父窗口时忽略，保存结果仍以接口为准 */
  }
}

interface SaveDirectorDeskOptions {
  autoCaptureIfNoShots?: boolean
}

export async function saveDirectorDesk(options: SaveDirectorDeskOptions = {}): Promise<{ warning?: string }> {
  const initialState = useDirectorStore.getState()
  const { panelId, projectId, videoRatio } = initialState
  if (!panelId || !projectId) throw new Error('导演台缺少 panelId 或 projectId')

  let shots = collectBoundShotsForSave()
  if (options.autoCaptureIfNoShots && shots.length === 0) {
    const active = getActiveCameraSnapshot()
    if (active) {
      try {
        const dataUrl = await captureCameraScreenshot(videoRatio, active.id)
        const store = useDirectorStore.getState()
        const capId = store.addCameraCapture(active.id, dataUrl, active.name, {
          fov: active.fov,
          position: active.position,
          target: active.target,
        })
        store.toggleCaptureBound(active.id, capId)
        store.toggleCaptureActive(active.id, capId)
        shots = collectBoundShotsForSave()
      } catch (error) {
        console.error('[director-desk] auto-capture before save failed', error)
      }
    }
  }

  const state = useDirectorStore.getState()
  const response = await fetch(`/api/novel-promotion/${projectId}/director-desk/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      panelId,
      project: JSON.parse(serializeDirectorProject(state.project)),
      shots,
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${response.status} ${text || '保存失败'}`)
  }

  const data = await response.json().catch(() => null) as { warning?: string } | null
  useDirectorStore.setState({ isDirty: false })
  notifyDirectorDeskSaved(panelId)
  return data?.warning ? { warning: data.warning } : {}
}
