'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { queryKeys } from '@/lib/query/keys'
import { buildInitialProject } from '@/lib/twick/project-builder'
import type { PanelVideoSource, TwickTimelineProject, VoiceLineSource } from '@/lib/twick/types'
import type {
  EditorConflictError,
  EditorProjectRecord,
  EditorProjectSaveResult,
  EditorProjectStatus,
} from './types'

export const EDITOR_PROJECT_SAVE_DEBOUNCE_MS = 1000

export function createDebouncedAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => void,
  delayMs: number,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let latestArgs: TArgs | null = null

  const cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    latestArgs = null
  }

  const schedule = (...args: TArgs) => {
    cancel()
    latestArgs = args
    timer = setTimeout(() => {
      const argsToFlush = latestArgs
      timer = null
      latestArgs = null
      if (argsToFlush) action(...argsToFlush)
    }, delayMs)
  }

  const flush = () => {
    if (!timer || !latestArgs) return false
    const argsToFlush = latestArgs
    clearTimeout(timer)
    timer = null
    latestArgs = null
    action(...argsToFlush)
    return true
  }

  const hasPending = () => Boolean(timer && latestArgs)

  return { schedule, cancel, flush, hasPending }
}

export function editorProjectQueryKey(projectId: string | null, episodeId: string | null) {
  return ['editor-project', projectId ?? '', episodeId ?? ''] as const
}

function versionFromUpdatedAt(updatedAt?: string | null): number {
  if (!updatedAt) return 0
  const value = Date.parse(updatedAt)
  return Number.isFinite(value) ? value : 0
}

function normalizeEditorProjectResponse(payload: unknown): EditorProjectRecord {
  const envelope = payload as { data?: unknown; projectData?: unknown } | null
  const raw = envelope && 'data' in envelope ? envelope.data : payload
  const record = raw as Partial<EditorProjectRecord> | null

  if (!record || record.projectData === null) {
    return {
      id: null,
      projectData: null,
      version: 0,
    }
  }

  return {
    id: typeof record.id === 'string' ? record.id : null,
    episodeId: typeof record.episodeId === 'string' ? record.episodeId : undefined,
    projectData: record.projectData as TwickTimelineProject,
    version: typeof record.version === 'number' ? record.version : versionFromUpdatedAt(record.updatedAt),
    renderStatus: record.renderStatus,
    outputUrl: record.outputUrl,
    updatedAt: record.updatedAt,
  }
}

function normalizeSaveResponse(payload: unknown): EditorProjectSaveResult {
  const envelope = payload as { data?: unknown } | null
  const raw = envelope && envelope.data ? envelope.data : payload
  const record = raw as Partial<EditorProjectSaveResult> | null

  return {
    id: typeof record?.id === 'string' ? record.id : null,
    version: typeof record?.version === 'number' ? record.version : versionFromUpdatedAt(record?.updatedAt),
    updatedAt: record?.updatedAt,
  }
}

async function fetchEditorProject(projectId: string, episodeId: string): Promise<EditorProjectRecord> {
  const response = await apiFetch(`/api/novel-promotion/${projectId}/editor?episodeId=${episodeId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch editor project')
  }
  return normalizeEditorProjectResponse(await response.json())
}

async function saveEditorProject(params: {
  projectId: string
  episodeId: string
  projectData: TwickTimelineProject
  version: number
}): Promise<EditorProjectSaveResult> {
  const response = await apiFetch(`/api/novel-promotion/${params.projectId}/editor`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      episodeId: params.episodeId,
      projectData: params.projectData,
      version: params.version,
    }),
  })

  if (response.status === 409) {
    const json = await response.json().catch(() => ({})) as { currentVersion?: number }
    const error = new Error('Editor project version conflict') as EditorConflictError
    error.code = 'CONFLICT'
    error.currentVersion = json.currentVersion
    throw error
  }

  if (!response.ok) {
    throw new Error('Failed to save editor project')
  }

  return normalizeSaveResponse(await response.json())
}

export interface UseEditorProjectSyncParams {
  projectId: string | null
  episodeId: string | null
  panelVideos: PanelVideoSource[]
  voiceLineSources: VoiceLineSource[]
  isAssetDataLoaded: boolean
  videoWidth: number
  videoHeight: number
}

export function useEditorProjectSync({
  projectId,
  episodeId,
  panelVideos,
  voiceLineSources,
  isAssetDataLoaded,
  videoWidth,
  videoHeight,
}: UseEditorProjectSyncParams) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => editorProjectQueryKey(projectId, episodeId), [projectId, episodeId])
  const [projectIdState, setProjectIdState] = useState<string | null>(null)
  const [projectData, setProjectData] = useState<TwickTimelineProject | null>(null)
  const [version, setVersion] = useState(0)
  const [status, setStatus] = useState<EditorProjectStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hasConflict, setHasConflict] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const initializedKeyRef = useRef<string | null>(null)
  const projectDataRef = useRef<TwickTimelineProject | null>(null)
  const versionRef = useRef(0)
  const savePendingRef = useRef(false)
  const saveMutationPendingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof createDebouncedAction<[TwickTimelineProject]>> | null>(null)

  useEffect(() => {
    projectDataRef.current = projectData
  }, [projectData])

  useEffect(() => {
    versionRef.current = version
  }, [version])

  const editorProjectQuery = useQuery({
    queryKey,
    queryFn: () => {
      if (!projectId || !episodeId) throw new Error('Project ID and episode ID are required')
      return fetchEditorProject(projectId, episodeId)
    },
    enabled: !!projectId && !!episodeId,
  })

  const saveMutation = useMutation<EditorProjectSaveResult, Error, { projectData: TwickTimelineProject; version: number }>({
    mutationFn: (input) => {
      if (!projectId || !episodeId) throw new Error('Project ID and episode ID are required')
      return saveEditorProject({
        projectId,
        episodeId,
        projectData: input.projectData,
        version: input.version,
      })
    },
    onMutate: () => {
      setStatus('saving')
      setSaveError(null)
    },
    onSuccess: (result) => {
      setProjectIdState((previous) => result.id ?? previous)
      setVersion(result.version)
      setLastSavedAt(new Date())
      setStatus('saved')
      setHasConflict(false)
      setSaveError(null)
      queryClient.invalidateQueries({ queryKey })
      if (projectId && episodeId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
      }
    },
    onError: (error: Error) => {
      const maybeConflict = error as Partial<EditorConflictError>
      if (maybeConflict.code === 'CONFLICT') {
        setStatus('conflict')
        setHasConflict(true)
        setSaveError('Editor project was changed elsewhere. Reload or force save to continue.')
        if (typeof maybeConflict.currentVersion === 'number') {
          setVersion(maybeConflict.currentVersion)
        }
        return
      }
      setStatus('error')
      setSaveError(error.message || 'Failed to save editor project')
    },
  })

  useEffect(() => {
    saveMutationPendingRef.current = saveMutation.isPending
  }, [saveMutation.isPending])

  useEffect(() => {
    if (!saveMutation.isPending && savePendingRef.current && debounceRef.current?.hasPending() === false) {
      const currentProjectData = projectDataRef.current
      if (currentProjectData && !hasConflict) {
        savePendingRef.current = false
        saveMutation.mutate({ projectData: currentProjectData, version: versionRef.current })
      }
    }
  }, [hasConflict, saveMutation, saveMutation.isPending])

  const triggerSave = useCallback((data: TwickTimelineProject, saveVersion = versionRef.current) => {
    if (!projectId || !episodeId || saveMutationPendingRef.current) return
    savePendingRef.current = false
    saveMutation.mutate({ projectData: data, version: saveVersion })
  }, [episodeId, projectId, saveMutation])

  useEffect(() => {
    debounceRef.current?.flush()
    debounceRef.current = createDebouncedAction((data: TwickTimelineProject) => {
      triggerSave(data, versionRef.current)
    }, EDITOR_PROJECT_SAVE_DEBOUNCE_MS)

    return () => {
      debounceRef.current?.flush()
    }
  }, [triggerSave])

  const flushPendingSave = useCallback(() => {
    if (hasConflict || saveMutationPendingRef.current) return false
    const flushed = debounceRef.current?.flush() ?? false
    if (flushed) return true
    if (!savePendingRef.current) return false
    const currentProjectData = projectDataRef.current
    if (!currentProjectData) {
      savePendingRef.current = false
      return false
    }
    triggerSave(currentProjectData, versionRef.current)
    return true
  }, [hasConflict, triggerSave])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const handleBlur = () => {
      flushPendingSave()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave()
      }
    }

    window.addEventListener('blur', handleBlur)
    window.addEventListener('pagehide', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      flushPendingSave()
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('pagehide', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [flushPendingSave])

  useEffect(() => {
    const key = `${projectId ?? ''}:${episodeId ?? ''}`
    initializedKeyRef.current = null
    setProjectIdState(null)
    setProjectData(null)
    setVersion(0)
    setStatus(projectId && episodeId ? 'loading' : 'idle')
    setSaveError(null)
    setHasConflict(false)
    setLastSavedAt(null)
    debounceRef.current?.cancel()
    if (!projectId || !episodeId) {
      initializedKeyRef.current = key
    }
  }, [episodeId, projectId])

  useEffect(() => {
    if (!projectId || !episodeId || editorProjectQuery.isLoading || !isAssetDataLoaded) return
    const key = `${projectId}:${episodeId}`
    if (initializedKeyRef.current === key) return

    if (editorProjectQuery.error) {
      setStatus('error')
      setSaveError(editorProjectQuery.error.message || 'Failed to load editor project')
      initializedKeyRef.current = key
      return
    }

    const record = editorProjectQuery.data
    if (record?.projectData) {
      setProjectIdState(record.id)
      setProjectData(record.projectData)
      setVersion(record.version)
      setStatus('saved')
      setLastSavedAt(record.updatedAt ? new Date(record.updatedAt) : null)
      initializedKeyRef.current = key
      return
    }

    if (panelVideos.length === 0) {
      setProjectData(null)
      setVersion(0)
      setStatus('idle')
      initializedKeyRef.current = key
      return
    }

    const initialProject = buildInitialProject(panelVideos, voiceLineSources, {
      width: videoWidth,
      height: videoHeight,
      includeAudio: true,
      includeCaptions: false,
    })
    setProjectData(initialProject)
    setVersion(0)
    setStatus('idle')
    initializedKeyRef.current = key
    triggerSave(initialProject, 0)
  }, [
    editorProjectQuery.data,
    editorProjectQuery.error,
    editorProjectQuery.isLoading,
    episodeId,
    isAssetDataLoaded,
    panelVideos,
    projectId,
    triggerSave,
    videoHeight,
    videoWidth,
    voiceLineSources,
  ])

  const updateProjectData = useCallback((nextData: TwickTimelineProject) => {
    setProjectData(nextData)
    projectDataRef.current = nextData
    setSaveError(null)
    if (hasConflict) return
    setStatus('idle')
    savePendingRef.current = true
    debounceRef.current?.schedule(nextData)
  }, [hasConflict])

  const saveNow = useCallback(() => {
    const currentProjectData = projectDataRef.current
    if (!currentProjectData || saveMutation.isPending) return
    debounceRef.current?.cancel()
    savePendingRef.current = true
    triggerSave(currentProjectData, versionRef.current)
  }, [saveMutation.isPending, triggerSave])

  const forceSave = useCallback(() => {
    const currentProjectData = projectDataRef.current
    if (!currentProjectData || saveMutation.isPending) return
    debounceRef.current?.cancel()
    savePendingRef.current = true
    setHasConflict(false)
    setSaveError(null)
    triggerSave(currentProjectData, versionRef.current)
  }, [saveMutation.isPending, triggerSave])

  const reloadFromServer = useCallback(async () => {
    debounceRef.current?.cancel()
    savePendingRef.current = false
    setHasConflict(false)
    setSaveError(null)
    setStatus('loading')
    initializedKeyRef.current = null
    await queryClient.invalidateQueries({ queryKey })
    await editorProjectQuery.refetch()
  }, [editorProjectQuery, queryClient, queryKey])

  return {
    id: projectIdState,
    projectData,
    version,
    status,
    isLoading: editorProjectQuery.isLoading || status === 'loading',
    isSaving: saveMutation.isPending || status === 'saving',
    saveError,
    hasConflict,
    lastSavedAt,
    updateProjectData,
    saveNow,
    forceSave,
    reloadFromServer,
  }
}
