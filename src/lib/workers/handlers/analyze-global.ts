import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import {
  CHUNK_SIZE,
  chunkContent,
  parseAliases,
  readText,
  safeParseCharactersResponse,
  safeParseLocationsResponse,
  safeParsePropsResponse,
  type CharacterBrief,
} from './analyze-global-parse'
import { buildAnalyzeGlobalPrompts, loadAnalyzeGlobalPromptTemplates } from './analyze-global-prompt'
import { createAnalyzeGlobalStats, persistAnalyzeGlobalChunk } from './analyze-global-persist'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { formatLocationExistingInfo } from '@/lib/assets/location-hierarchy'

function readAssetKind(value: Record<string, unknown>): string {
  return typeof value.assetKind === 'string' ? value.assetKind : 'location'
}

export async function handleAnalyzeGlobalTask(job: Job<TaskJobData>) {
  const projectId = job.data.projectId
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
    },
  })
  if (!project) {
    throw new Error('Project not found')
  }

  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: true,
      locations: {
        include: {
          children: true,
        },
      },
      episodes: {
        orderBy: { episodeNumber: 'asc' },
        select: {
          id: true,
          name: true,
          novelText: true,
        },
      },
    },
  })
  if (!novelData) {
    throw new Error('Novel promotion data not found')
  }

  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    projectAnalysisModel: novelData.analysisModel,
  })

  let allContent = ''
  if (readText(novelData.globalAssetText).trim()) {
    allContent += `【全局设定】\n${readText(novelData.globalAssetText)}\n\n`
  }
  for (const ep of novelData.episodes) {
    const text = readText(ep.novelText)
    if (!text.trim()) continue
    allContent += `【${ep.name}】\n${text}\n\n`
  }
  if (!allContent.trim()) {
    throw new Error('没有可分析的内容，请先添加剧集或全局设定')
  }

  const chunks = chunkContent(allContent, CHUNK_SIZE)
  const templates = await loadAnalyzeGlobalPromptTemplates(job.data.locale, projectId)
  const existingCharacters: CharacterBrief[] = novelData.characters.map((item) => ({
    id: item.id,
    name: item.name,
    aliases: parseAliases(item.aliases as string | null),
    introduction: readText((item as Record<string, unknown>).introduction),
  }))
  const existingCharacterNames = existingCharacters.flatMap((item) => [item.name, ...item.aliases])
  const existingLocationEntries: Array<{
    name: string
    summary: string | null
    sceneType: 'macro' | 'micro'
    parentName: string | null
  }> = []
  const existingChildPaths = new Set<string>()
  for (const loc of novelData.locations) {
    if (readAssetKind(loc as unknown as Record<string, unknown>) === 'prop') continue
    const sceneType = (loc as unknown as { sceneType?: string }).sceneType === 'micro' ? 'micro' : 'macro'
    const parentId = (loc as unknown as { parentId?: string | null }).parentId ?? null
    if (sceneType === 'macro') {
      existingLocationEntries.push({
        name: loc.name,
        summary: readText(loc.summary),
        sceneType: 'macro',
        parentName: null,
      })
      const children = (loc as unknown as { children?: Array<Record<string, unknown>> }).children || []
      for (const child of children) {
        if (readAssetKind(child) === 'prop') continue
        if (child.sceneType !== 'micro') continue
        const childName = typeof child.name === 'string' ? child.name : ''
        if (!childName) continue
        existingLocationEntries.push({
          name: childName,
          summary: readText(child.summary),
          sceneType: 'micro',
          parentName: loc.name,
        })
        existingChildPaths.add(`${loc.name.toLowerCase()}/${childName.toLowerCase()}`)
      }
    } else if (sceneType === 'micro' && !parentId) {
      // ponytail: 孤立子场景（parent 被删）作为顶层条目兜底
      existingLocationEntries.push({
        name: loc.name,
        summary: readText(loc.summary),
        sceneType: 'micro',
        parentName: null,
      })
    }
  }
  // 只有 macro 名字进入 existingLocationNames（用于 macro 去重）；micro 通过 existingChildPaths 去重
  const existingLocationNames = existingLocationEntries
    .filter((e) => e.sceneType === 'macro' || (e.sceneType === 'micro' && !e.parentName))
    .map((e) => e.name)
  const existingLocationInfo = existingLocationEntries.map((e) => formatLocationExistingInfo(e))
  const existingPropNames = novelData.locations
    .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
    .map((item) => item.name)
  const stats = createAnalyzeGlobalStats(chunks.length)

  await reportTaskProgress(job, 10, {
    stage: 'analyze_global_prepare',
    stageLabel: '准备全局资产分析参数',
    displayMode: 'detail',
    message: `共 ${chunks.length} 个切片`,
  })
  await assertTaskActive(job, 'analyze_global_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'analyze_global')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  try {
    for (let i = 0; i < chunks.length; i += 1) {
      await assertTaskActive(job, `analyze_global_chunk:${i + 1}`)
      const chunk = chunks[i]
      const progress = 15 + Math.min(60, Math.floor(((i + 1) / Math.max(1, chunks.length)) * 60))
      await reportTaskProgress(job, progress, {
        stage: 'analyze_global_chunk',
        stageLabel: '分析全局资产切片',
        displayMode: 'detail',
        message: `切片 ${i + 1}/${chunks.length}`,
        stepId: `analyze_global_chunk_${i + 1}`,
        stepTitle: `全局资产分析 ${i + 1}/${chunks.length}`,
        stepIndex: i + 1,
        stepTotal: chunks.length,
      })

      const { characterPrompt, locationPrompt, propPrompt } = buildAnalyzeGlobalPrompts({
        chunk,
        templates,
        existingCharacters,
        existingLocationInfo,
        existingPropNames,
      })

      const [characterCompletion, locationCompletion, propCompletion] = await withInternalLLMStreamCallbacks(
        streamCallbacks,
        async () =>
          await Promise.all([
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: characterPrompt }],
              temperature: 0.7,
              projectId,
              action: 'analyze_global_characters',
              meta: {
                stepId: `analyze_global_characters_${i + 1}`,
                stepTitle: `角色分析 ${i + 1}/${chunks.length}`,
                stepIndex: i + 1,
                stepTotal: chunks.length,
              },
            }),
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: locationPrompt }],
              temperature: 0.7,
              projectId,
              action: 'analyze_global_locations',
              meta: {
                stepId: `analyze_global_locations_${i + 1}`,
                stepTitle: `场景分析 ${i + 1}/${chunks.length}`,
                stepIndex: i + 1,
                stepTotal: chunks.length,
              },
            }),
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: propPrompt }],
              temperature: 0.7,
              projectId,
              action: 'analyze_global_props',
              meta: {
                stepId: `analyze_global_props_${i + 1}`,
                stepTitle: `道具分析 ${i + 1}/${chunks.length}`,
                stepIndex: i + 1,
                stepTotal: chunks.length,
              },
            }),
          ]),
      )

      const characterResponse = characterCompletion.text
      const locationResponse = locationCompletion.text
      const propResponse = propCompletion.text
      const charactersData = safeParseCharactersResponse(characterResponse)
      const locationsData = safeParseLocationsResponse(locationResponse)
      const propsData = safeParsePropsResponse(propResponse)

      await persistAnalyzeGlobalChunk({
        projectInternalId: novelData.id,
        charactersData,
        locationsData,
        propsData,
        existingCharacters,
        existingCharacterNames,
        existingLocationNames,
        existingLocationInfo,
        existingChildPaths,
        existingPropNames,
        stats,
      })

      stats.processedChunks += 1
    }
  } finally {
    await streamCallbacks.flush()
  }

  await reportTaskProgress(job, 96, {
    stage: 'analyze_global_done',
    stageLabel: '全局资产分析完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    stats: {
      totalChunks: stats.totalChunks,
      newCharacters: stats.newCharacters,
      updatedCharacters: stats.updatedCharacters,
      newLocations: stats.newLocations,
      newProps: stats.newProps,
      skippedCharacters: stats.skippedCharacters,
      skippedLocations: stats.skippedLocations,
      skippedSubLocations: stats.skippedSubLocations,
      skippedProps: stats.skippedProps,
      totalCharacters: existingCharacterNames.length,
      totalLocations: existingLocationNames.length + existingChildPaths.size,
      totalProps: existingPropNames.length,
    },
  }
}
