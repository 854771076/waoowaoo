import type { ProjectJSON } from '@twick/timeline'
import type { TwickTimelineElement } from '@/lib/twick/types'
import { TWICK_TRANSITION_KINDS, type TwickTransitionKind, findTimelineElement } from '@/lib/twick/transition'

export type SmartTransitionClip = {
  elementId: string
  storyboardId?: string | null
  panelId?: string | null
  type?: string | null
  start?: number | null
  end?: number | null
}

export type SmartTransitionRecommendation = {
  kind: TwickTransitionKind
  duration: number
  confidence: number
  reason: string
}

export type SmartTransitionInput = {
  from: SmartTransitionClip
  to: SmartTransitionClip
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clipFromElement(element: TwickTimelineElement): SmartTransitionClip {
  const metadata = element.metadata && typeof element.metadata === 'object'
    ? element.metadata as Record<string, unknown>
    : {}

  return {
    elementId: element.id,
    type: element.type,
    storyboardId: readString(metadata.storyboardId),
    panelId: readString(metadata.panelId),
    start: readNumber(element.s),
    end: readNumber(element.e),
  }
}

function pushUniqueRecommendation(
  recommendations: SmartTransitionRecommendation[],
  recommendation: SmartTransitionRecommendation,
) {
  if (recommendations.some((item) => item.kind === recommendation.kind)) return
  recommendations.push(recommendation)
}

export function recommendSmartTransitions(input: SmartTransitionInput): SmartTransitionRecommendation[] {
  const sameStoryboard = !!input.from.storyboardId && input.from.storyboardId === input.to.storyboardId
  const continuousPanels = !!input.from.panelId && !!input.to.panelId && input.from.panelId !== input.to.panelId

  const recommendations: SmartTransitionRecommendation[] = []

  if (sameStoryboard) {
    pushUniqueRecommendation(recommendations, {
      kind: 'dissolve',
      duration: 0.55,
      confidence: 0.88,
      reason: 'Same storyboard/scene: a dissolve keeps continuity while softening the cut.',
    })
    pushUniqueRecommendation(recommendations, {
      kind: 'fade',
      duration: 0.45,
      confidence: 0.72,
      reason: 'Subtle fade works as a safe continuity transition for adjacent shots.',
    })
  } else {
    pushUniqueRecommendation(recommendations, {
      kind: 'fade',
      duration: 0.7,
      confidence: 0.86,
      reason: 'Different storyboard/scene: fade signals a clean scene change.',
    })
    pushUniqueRecommendation(recommendations, {
      kind: 'dissolve',
      duration: 0.6,
      confidence: 0.74,
      reason: 'Dissolve provides a softer alternative when the scene change should feel smooth.',
    })
  }

  if (continuousPanels) {
    pushUniqueRecommendation(recommendations, {
      kind: 'slide',
      duration: 0.5,
      confidence: sameStoryboard ? 0.68 : 0.6,
      reason: 'Slide can emphasize progression between adjacent generated panels.',
    })
  }

  pushUniqueRecommendation(recommendations, {
    kind: 'zoom',
    duration: 0.45,
    confidence: sameStoryboard ? 0.58 : 0.52,
    reason: 'Zoom adds momentum for a more dynamic short-video edit.',
  })

  for (const kind of TWICK_TRANSITION_KINDS) {
    if (recommendations.length >= 4) break
    pushUniqueRecommendation(recommendations, {
      kind,
      duration: 0.5,
      confidence: 0.5,
      reason: 'General-purpose Twick transition fallback.',
    })
  }

  return recommendations
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
}

export function buildSmartTransitionInputFromProject(params: {
  projectData: ProjectJSON
  fromElementId: string
  toElementId: string
}): SmartTransitionInput {
  const fromElement = findTimelineElement(params.projectData, params.fromElementId)
  const toElement = findTimelineElement(params.projectData, params.toElementId)

  if (!fromElement) throw new Error('TRANSITION_FROM_ELEMENT_NOT_FOUND')
  if (!toElement) throw new Error('TRANSITION_TO_ELEMENT_NOT_FOUND')
  if (fromElement.id === toElement.id) throw new Error('TRANSITION_SAME_ELEMENT')

  return {
    from: clipFromElement(fromElement),
    to: clipFromElement(toElement),
  }
}
