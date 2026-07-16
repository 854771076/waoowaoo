export type PromptKnowledgeKind = 'image' | 'video' | 'cover' | 'modify' | 'analysis'

export type KnowledgeBindingMode = 'boost' | 'force_include' | 'force_exclude'

export interface KnowledgeCandidate {
  id: string
  title: string
  category: string
  promptPhrase: string
  usageRule?: string | null
  negativePhrase?: string | null
  sceneTags?: string[]
  shotTags?: string[]
  moodTags?: string[]
  craftTags?: string[]
  priority?: number | null
  enabled?: boolean | null
  bindingMode?: KnowledgeBindingMode | null
  bindingWeight?: number | null
}

export interface PromptKnowledgeContext {
  promptKind: PromptKnowledgeKind
  sceneTags?: string[]
  shotTags?: string[]
  moodTags?: string[]
  craftTags?: string[]
  existingPrompt?: string
}

export interface MatchedKnowledgeItem extends KnowledgeCandidate {
  matchedTags: string[]
  score: number
}

export interface SelectKnowledgeOptions {
  candidates: KnowledgeCandidate[]
  context: PromptKnowledgeContext
  maxItems?: number
}

export interface EnrichPromptOptions extends SelectKnowledgeOptions {
  basePrompt: string
  maxChars?: number
}

export interface EnrichedPromptResult {
  prompt: string
  injectedText: string
  selectedItems: MatchedKnowledgeItem[]
}

const DEFAULT_MAX_ITEMS_BY_KIND: Record<PromptKnowledgeKind, number> = {
  image: 5,
  video: 4,
  cover: 4,
  modify: 3,
  analysis: 6,
}

const DEFAULT_MAX_CHARS_BY_KIND: Record<PromptKnowledgeKind, number> = {
  image: 480,
  video: 420,
  cover: 420,
  modify: 320,
  analysis: 800,
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase()
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return []
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean)))
}

function phraseExistsInPrompt(prompt: string, phrase: string): boolean {
  const normalizedPrompt = prompt.trim().toLowerCase()
  const normalizedPhrase = phrase.trim().toLowerCase()
  if (!normalizedPrompt || !normalizedPhrase) return false
  return normalizedPrompt.includes(normalizedPhrase)
}

function collectContextTags(context: PromptKnowledgeContext): Set<string> {
  return new Set([
    ...normalizeTags(context.sceneTags),
    ...normalizeTags(context.shotTags),
    ...normalizeTags(context.moodTags),
    ...normalizeTags(context.craftTags),
  ])
}

function collectCandidateTags(candidate: KnowledgeCandidate): string[] {
  return [
    ...normalizeTags(candidate.sceneTags),
    ...normalizeTags(candidate.shotTags),
    ...normalizeTags(candidate.moodTags),
    ...normalizeTags(candidate.craftTags),
  ]
}

function scoreCandidate(
  candidate: KnowledgeCandidate,
  contextTags: Set<string>,
  existingPrompt: string,
): MatchedKnowledgeItem | null {
  if (candidate.enabled === false) return null
  if (candidate.bindingMode === 'force_exclude') return null
  const phrase = candidate.promptPhrase.trim()
  if (!phrase) return null
  if (phraseExistsInPrompt(existingPrompt, phrase)) return null

  const candidateTags = collectCandidateTags(candidate)
  const matchedTags = Array.from(new Set(candidateTags.filter((tag) => contextTags.has(tag))))
  if (matchedTags.length === 0 && candidate.bindingMode !== 'force_include') return null

  const baseScore = matchedTags.length * 10
  const priorityScore = candidate.priority ?? 0
  const bindingScore = candidate.bindingMode === 'force_include'
    ? 1000
    : candidate.bindingWeight ?? 0
  const score = baseScore + priorityScore + bindingScore

  return { ...candidate, matchedTags, score }
}

export function selectKnowledgeForPrompt(options: SelectKnowledgeOptions): MatchedKnowledgeItem[] {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS_BY_KIND[options.context.promptKind]
  const contextTags = collectContextTags(options.context)
  const existingPrompt = options.context.existingPrompt || ''

  return options.candidates
    .map((candidate) => scoreCandidate(candidate, contextTags, existingPrompt))
    .filter((candidate): candidate is MatchedKnowledgeItem => Boolean(candidate))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.priority ?? 0) - (a.priority ?? 0)
    })
    .slice(0, maxItems)
}

function buildKnowledgeLine(item: MatchedKnowledgeItem): string {
  const rule = item.usageRule?.trim()
  const phrase = item.promptPhrase.trim()
  if (rule) return `- ${item.title}：${phrase}（${rule}）`
  return `- ${item.title}：${phrase}`
}

function fitLinesToBudget(lines: string[], maxChars: number): string[] {
  const selected: string[] = []
  let used = 0
  for (const line of lines) {
    const nextUsed = used + line.length + (selected.length ? 1 : 0)
    if (nextUsed > maxChars) continue
    selected.push(line)
    used = nextUsed
  }
  return selected
}

export function formatKnowledgePromptBlock(
  items: MatchedKnowledgeItem[],
  promptKind: PromptKnowledgeKind,
  maxChars = DEFAULT_MAX_CHARS_BY_KIND[promptKind],
): string {
  if (!items.length) return ''
  const lines = fitLinesToBudget(items.map(buildKnowledgeLine), maxChars)
  if (!lines.length) return ''
  return [
    '【影视专业知识约束】',
    ...lines,
    '仅在不破坏剧情、角色、场景一致性的前提下应用以上知识。',
  ].join('\n')
}

export function enrichPromptWithKnowledge(options: EnrichPromptOptions): EnrichedPromptResult {
  const selectedItems = selectKnowledgeForPrompt({
    candidates: options.candidates,
    context: {
      ...options.context,
      existingPrompt: options.context.existingPrompt ?? options.basePrompt,
    },
    maxItems: options.maxItems,
  })
  const injectedText = formatKnowledgePromptBlock(
    selectedItems,
    options.context.promptKind,
    options.maxChars,
  )

  if (!injectedText) {
    return {
      prompt: options.basePrompt,
      injectedText: '',
      selectedItems: [],
    }
  }

  return {
    prompt: [options.basePrompt.trim(), injectedText].filter(Boolean).join('\n\n'),
    injectedText,
    selectedItems,
  }
}
