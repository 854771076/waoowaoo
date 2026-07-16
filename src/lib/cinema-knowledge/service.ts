import { prisma } from '@/lib/prisma'
import {
  enrichPromptWithKnowledge,
  type EnrichedPromptResult,
  type KnowledgeBindingMode,
  type KnowledgeCandidate,
  type PromptKnowledgeContext,
} from './prompt-enrichment'

interface CinemaKnowledgeItemRecord {
  id: string
  title: string
  category: string
  promptPhrase: string
  usageRule: string | null
  negativePhrase: string | null
  sceneTags: string | null
  shotTags: string | null
  moodTags: string | null
  craftTags: string | null
  priority: number
  enabled: boolean
}

interface CinemaKnowledgeBindingRecord {
  knowledgeItemId: string
  mode: string
  weight: number
}

interface CinemaKnowledgeDb {
  cinemaKnowledgeItem: {
    findMany(args: Record<string, unknown>): Promise<CinemaKnowledgeItemRecord[]>
  }
  cinemaKnowledgeBinding: {
    findMany(args: Record<string, unknown>): Promise<CinemaKnowledgeBindingRecord[]>
  }
  promptKnowledgeTrace: {
    create(args: Record<string, unknown>): Promise<unknown>
  }
}

export interface RetrieveKnowledgeParams extends PromptKnowledgeContext {
  projectId: string
  userId: string
  scopeType?: string
  scopeId?: string | null
  maxItems?: number
  maxChars?: number
}

export interface EnrichProjectPromptParams extends RetrieveKnowledgeParams {
  basePrompt: string
  targetType: string
  targetId: string
}

function parseJsonStringArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function normalizeBindingMode(mode: string | null | undefined): KnowledgeBindingMode {
  if (mode === 'force_include' || mode === 'force_exclude') return mode
  return 'boost'
}

function toCandidate(
  item: CinemaKnowledgeItemRecord,
  binding?: CinemaKnowledgeBindingRecord,
): KnowledgeCandidate {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    promptPhrase: item.promptPhrase,
    usageRule: item.usageRule,
    negativePhrase: item.negativePhrase,
    sceneTags: parseJsonStringArray(item.sceneTags),
    shotTags: parseJsonStringArray(item.shotTags),
    moodTags: parseJsonStringArray(item.moodTags),
    craftTags: parseJsonStringArray(item.craftTags),
    priority: item.priority,
    enabled: item.enabled,
    bindingMode: binding ? normalizeBindingMode(binding.mode) : undefined,
    bindingWeight: binding?.weight,
  }
}

export async function retrieveKnowledgeForPrompt(params: RetrieveKnowledgeParams): Promise<KnowledgeCandidate[]> {
  const db = prisma as unknown as CinemaKnowledgeDb
  const [items, bindings] = await Promise.all([
    db.cinemaKnowledgeItem.findMany({
      where: {
        userId: params.userId,
        enabled: true,
        reviewStatus: 'approved',
      },
      orderBy: [
        { priority: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: 200,
    }),
    db.cinemaKnowledgeBinding.findMany({
      where: {
        projectId: params.projectId,
        OR: [
          { scopeType: 'project', scopeId: null },
          ...(params.scopeType && params.scopeId
            ? [{ scopeType: params.scopeType, scopeId: params.scopeId }]
            : []),
        ],
      },
    }),
  ])

  const bindingByItemId = new Map(bindings.map((binding) => [binding.knowledgeItemId, binding]))
  return items.map((item) => toCandidate(item, bindingByItemId.get(item.id)))
}

export async function enrichProjectPromptWithKnowledge(
  params: EnrichProjectPromptParams,
): Promise<EnrichedPromptResult> {
  const db = prisma as unknown as CinemaKnowledgeDb
  const candidates = await retrieveKnowledgeForPrompt(params)
  const result = enrichPromptWithKnowledge({
    basePrompt: params.basePrompt,
    candidates,
    context: params,
    maxItems: params.maxItems,
    maxChars: params.maxChars,
  })

  if (result.injectedText) {
    await db.promptKnowledgeTrace.create({
      data: {
        projectId: params.projectId,
        userId: params.userId,
        targetType: params.targetType,
        targetId: params.targetId,
        promptKind: params.promptKind,
        knowledgeItemIds: JSON.stringify(result.selectedItems.map((item) => item.id)),
        matchedTags: JSON.stringify(result.selectedItems.flatMap((item) => item.matchedTags)),
        finalInjectedText: result.injectedText,
      },
    })
  }

  return result
}
