'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { checkApiResponse } from '@/lib/error-handler'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { clearTaskTargetOverlay, upsertTaskTargetOverlay } from '../task-target-overlay'
import type { MediaRef } from '@/types/project'
import { apiFetch } from '@/lib/api-fetch'

// ============ 类型定义 ============
export interface PanelCandidate {
    id: string
    imageUrl: string | null
    media?: MediaRef | null
    isSelected: boolean
    taskRunning: boolean
}

export interface StoryboardPanel {
    id: string
    shotId: string
    stageIndex: number
    shotIndex: number
    imageUrl: string | null
    media?: MediaRef | null
    motionPrompt: string | null
    voiceText: string | null
    voiceUrl: string | null
    voiceMedia?: MediaRef | null
    videoUrl: string | null
	    videoGenerationMode?: 'normal' | 'firstlastframe' | 'director_storyboard' | null
    videoMedia?: MediaRef | null
    imageTaskRunning?: boolean
    videoTaskRunning?: boolean
    lipSyncTaskRunning?: boolean
    errorMessage: string | null
    candidates: PanelCandidate[]
    pendingCandidateCount: number
}

export interface StoryboardGroup {
    id: string
    stageIndex: number
    panels: StoryboardPanel[]
}

export interface StoryboardData {
    groups: StoryboardGroup[]
}

type VideoGenerationOptionValue = string | number | boolean
type VideoGenerationOptions = Record<string, VideoGenerationOptionValue>
type GridVideoSource = 'split' | 'original' | 'director_storyboard'

export interface GridSplitImage {
    imageUrl: string
    cellIndex: number
    panelGridSize: number
}

export interface GridVideoFrame {
    cellIndex: number
    imageUrl: string
    imagePrompt?: string
    videoPrompt: string
    action?: string
    shotType?: string
    cameraMove?: string
    description?: string
    location?: string
}

interface BatchVideoGenerationParams {
    videoModel: string
    generationOptions?: VideoGenerationOptions
}

// ============ 查询 Hooks ============

/**
 * 获取分镜数据
 */
export function useStoryboards(projectId: string | null, episodeId: string | null) {
    return useQuery({
        queryKey: queryKeys.storyboards.all(episodeId || ''),
        queryFn: async () => {
            if (!projectId || !episodeId) throw new Error('Project ID and Episode ID are required')
            const res = await apiFetch(`/api/novel-promotion/${projectId}/storyboards?episodeId=${episodeId}`)
            if (!res.ok) throw new Error('Failed to fetch storyboards')
            const data = await res.json()
            // API returns { storyboards: [...] }, but our types expect { groups: [...] }
            return { groups: data.storyboards || [] } as StoryboardData
        },
        enabled: !!projectId && !!episodeId,
    })
}

// ============ Mutation Hooks ============

/**
 * 重新生成分镜图片
 */
export function useRegeneratePanelImage(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ panelId }: { panelId: string }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await apiFetch(`/api/novel-promotion/${projectId}/regenerate-panel-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ panelId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(resolveTaskErrorMessage(error, 'Failed to regenerate'))
            }
            return res.json()
        },
        onMutate: async () => {
            if (!projectId) return
            await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
        },
        onSettled: () => {
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
            }
        },
    })
}

/**
 * 修改分镜图片
 */
export function useModifyPanelImage(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            panelId: string
            modifyPrompt: string
            extraImageUrls?: string[]
        }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await apiFetch(`/api/novel-promotion/${projectId}/modify-panel-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(resolveTaskErrorMessage(error, 'Failed to modify'))
            }
            return res.json()
        },
        onMutate: async () => {
            if (!projectId) return
            await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
        },
        onSettled: () => {
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
            }
        },
    })
}

/**
 * 生成视频
 */
export function useGenerateVideo(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            storyboardId: string
            panelIndex: number
            panelId?: string
            videoModel: string
            generationOptions?: VideoGenerationOptions
            firstLastFrame?: {
                lastFrameStoryboardId: string
                lastFramePanelIndex: number
                flModel: string
                customPrompt?: string
            }
            imageLayout?: 'single' | 'grid'
            gridSize?: number
            gridVideoSource?: GridVideoSource
            videoReferenceImages?: string[]
            directorStoryboardBoardId?: string
        }) => {
            if (!projectId) throw new Error('Project ID is required')

            // 构建请求体
            const requestBody: {
                storyboardId: string
                panelIndex: number
                firstLastFrame?: {
                    lastFrameStoryboardId: string
                    lastFramePanelIndex: number
                    flModel: string
                    customPrompt?: string
                }
                videoModel: string
                generationOptions?: VideoGenerationOptions
                imageLayout?: 'single' | 'grid'
                gridSize?: number
                gridVideoSource?: GridVideoSource
                videoReferenceImages?: string[]
                directorStoryboardBoardId?: string
            } = {
                storyboardId: params.storyboardId,
                panelIndex: params.panelIndex,
                videoModel: params.videoModel,
            }

            // 如果是首尾帧模式
            if (params.firstLastFrame) {
                requestBody.firstLastFrame = params.firstLastFrame
            }

            if (params.generationOptions && typeof params.generationOptions === 'object') {
                requestBody.generationOptions = params.generationOptions
            }

            if (params.imageLayout) {
                requestBody.imageLayout = params.imageLayout
            }

            if (params.gridSize !== undefined && params.gridSize > 0) {
                requestBody.gridSize = params.gridSize
            }

            if (params.gridVideoSource) {
                requestBody.gridVideoSource = params.gridVideoSource
            }

            if (Array.isArray(params.videoReferenceImages) && params.videoReferenceImages.length > 0) {
                requestBody.videoReferenceImages = params.videoReferenceImages
            }

            if (typeof params.directorStoryboardBoardId === 'string' && params.directorStoryboardBoardId.trim()) {
                requestBody.directorStoryboardBoardId = params.directorStoryboardBoardId.trim()
            }

            const res = await apiFetch(`/api/novel-promotion/${projectId}/generate-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            })
            // 🔥 使用统一错误处理
            await checkApiResponse(res)
            return res.json()
        },
        onMutate: async ({ panelId }) => {
            if (!projectId) return
            await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
            if (!panelId) return
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'NovelPromotionPanel',
                targetId: panelId,
                intent: 'generate',
            })
        },
        onError: (_error, { panelId }) => {
            if (!projectId || !panelId) return
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'NovelPromotionPanel',
                targetId: panelId,
            })
        },
        onSettled: () => {
            // 🔥 刷新缓存获取最新状态
            if (episodeId && projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
            }
        },
    })
}

export function useSplitGridPanel(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: { panelId: string; force?: boolean; gridSize?: number; enhance?: boolean; cellIndex?: number }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await apiFetch(`/api/novel-promotion/${projectId}/panel/${params.panelId}/split-grid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(params.force ? { force: true } : {}),
                    ...(params.gridSize ? { gridSize: params.gridSize } : {}),
                    ...(params.enhance ? { enhance: true } : {}),
                    ...(params.cellIndex ? { cellIndex: params.cellIndex } : {}),
                }),
            })
            await checkApiResponse(res)
            return res.json() as Promise<{
                images?: GridSplitImage[]
                frames?: GridVideoFrame[]
                reused?: boolean
                enhanced?: boolean
                enhancedCount?: number
                async?: boolean
                taskId?: string
            }>
        },
        onMutate: async ({ panelId, enhance, cellIndex }) => {
            if (!projectId || !enhance) return
            await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'NovelPromotionPanel',
                targetId: panelId,
                intent: 'modify',
                runningTaskType: 'grid_split_enhance',
                runningPayload: {
                    ...(cellIndex ? { cellIndex } : {}),
                },
            })
        },
        onError: (_error, { panelId, enhance }) => {
            if (!projectId || !enhance) return
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'NovelPromotionPanel',
                targetId: panelId,
            })
        },
        onSettled: () => {
            if (!projectId) return
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
                queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
            } else {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
            }
        },
    })
}

/**
 * 批量生成视频
 *
 * 后端为每个需要生成的 panel 创建独立的 Panel 级任务，
 * 与单个生成走完全相同的 SSE → overlay → UI 流程。
 */
export function useBatchGenerateVideos(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: BatchVideoGenerationParams) => {
            if (!projectId) throw new Error('Project ID is required')
            if (!episodeId) throw new Error('Episode ID is required')

            const requestBody: {
                all: boolean
                episodeId: string
                videoModel: string
                generationOptions?: VideoGenerationOptions
            } = {
                all: true,
                episodeId,
                videoModel: params.videoModel,
            }
            if (params.generationOptions && typeof params.generationOptions === 'object') {
                requestBody.generationOptions = params.generationOptions
            }

            const res = await apiFetch(`/api/novel-promotion/${projectId}/generate-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            })
            // 🔥 使用统一错误处理
            await checkApiResponse(res)
            return res.json()
        },
        onMutate: async () => {
            if (!projectId) return
            await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
        },
        onSettled: () => {
            // 🔥 刷新缓存获取最新状态
            if (episodeId && projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
            }
        },
    })
}

/**
 * 选择分镜候选图
 */
export function useSelectPanelCandidate(episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ panelId, candidateId }: { panelId: string; candidateId: string }) => {
            const res = await apiFetch(`/api/novel-promotion/panels/${panelId}/select-candidate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(resolveTaskErrorMessage(error, 'Failed to select candidate'))
            }
            return res.json()
        },
        onSettled: () => {
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
            }
        },
    })
}

/**
 * 刷新分镜数据
 */
export function useRefreshStoryboards(episodeId: string | null) {
    const queryClient = useQueryClient()

    return () => {
        if (episodeId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
        }
    }
}

/**
 * 🔥 口型同步生成（乐观更新）
 */
export function useLipSync(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            storyboardId: string
            panelIndex: number
            voiceLineId: string
            panelId?: string
        }) => {
            const res = await apiFetch(`/api/novel-promotion/${projectId}/lip-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storyboardId: params.storyboardId,
                    panelIndex: params.panelIndex,
                    voiceLineId: params.voiceLineId
                })
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(resolveTaskErrorMessage(error, 'Lip sync failed'))
            }

            return res.json()
        },
        onMutate: async ({ panelId }) => {
            if (!projectId) return
            await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
            if (!panelId) return
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'NovelPromotionPanel',
                targetId: panelId,
                intent: 'generate',
            })
        },
        onError: (_error, { panelId }) => {
            if (!projectId || !panelId) return
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'NovelPromotionPanel',
                targetId: panelId,
            })
        },
        onSettled: () => {
            // 请求完成后刷新数据
            if (projectId && episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
            }
        }
    })
}
