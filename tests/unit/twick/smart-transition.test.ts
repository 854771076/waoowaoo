import { describe, expect, it, vi } from 'vitest'
import { buildSmartTransitionInputFromProject, recommendSmartTransitions } from '@/lib/novel-promotion/editor/smart-transition'
import { applyTwickTransitionToProject, setTimelineElementTransition } from '@/lib/twick/transition'
import type { TwickTimelineProject } from '@/lib/twick/types'

function projectWithTwoClips(overrides?: {
  firstStoryboardId?: string
  secondStoryboardId?: string
}): TwickTimelineProject {
  return {
    version: 1,
    tracks: [
      {
        id: 'track-video-main',
        name: 'Video',
        type: 'video',
        elements: [
          {
            id: 'clip-1',
            type: 'video',
            s: 0,
            e: 4,
            props: { src: 'mediaobj://video-1' },
            metadata: { panelId: 'panel-1', storyboardId: overrides?.firstStoryboardId ?? 'storyboard-1' },
          },
          {
            id: 'clip-2',
            type: 'video',
            s: 4,
            e: 8,
            props: { src: 'mediaobj://video-2' },
            metadata: { panelId: 'panel-2', storyboardId: overrides?.secondStoryboardId ?? 'storyboard-1' },
          },
        ],
      },
    ],
  }
}

describe('smart transition recommendations', () => {
  it('prefers dissolve for clips in the same storyboard', () => {
    const input = buildSmartTransitionInputFromProject({
      projectData: projectWithTwoClips(),
      fromElementId: 'clip-1',
      toElementId: 'clip-2',
    })

    const recommendations = recommendSmartTransitions(input)

    expect(recommendations).toHaveLength(4)
    expect(recommendations[0]).toEqual(expect.objectContaining({
      kind: 'dissolve',
      confidence: expect.any(Number),
    }))
    expect(recommendations.map((item) => item.kind)).toEqual(['dissolve', 'fade', 'slide', 'zoom'])
  })

  it('prefers fade for clips in different storyboards', () => {
    const input = buildSmartTransitionInputFromProject({
      projectData: projectWithTwoClips({ secondStoryboardId: 'storyboard-2' }),
      fromElementId: 'clip-1',
      toElementId: 'clip-2',
    })

    const recommendations = recommendSmartTransitions(input)

    expect(recommendations[0]).toEqual(expect.objectContaining({
      kind: 'fade',
    }))
    expect(recommendations.map((item) => item.kind)).toContain('dissolve')
  })

  it('throws a boundary error when the selected first clip has no successor', () => {
    expect(() => buildSmartTransitionInputFromProject({
      projectData: projectWithTwoClips(),
      fromElementId: 'missing-previous-clip',
      toElementId: 'clip-1',
    })).toThrow('TRANSITION_FROM_ELEMENT_NOT_FOUND')
  })
})

describe('Twick transition writer', () => {
  it('writes the real top-level Twick transition field to the from element', () => {
    const updated = applyTwickTransitionToProject(projectWithTwoClips(), {
      fromElementId: 'clip-1',
      toElementId: 'clip-2',
      kind: 'fade',
      duration: 0.75,
    })

    expect(updated.tracks[0].elements[0]).toEqual(expect.objectContaining({
      transition: {
        toElementId: 'clip-2',
        duration: 0.75,
        kind: 'fade',
      },
    }))
    expect(updated.tracks[0].elements[1]).not.toHaveProperty('transition')
  })

  it('uses TimelineEditor.addTransition when available', () => {
    const addTransition = vi.fn(() => true)

    const ok = setTimelineElementTransition({ addTransition }, {
      fromElementId: 'clip-1',
      toElementId: 'clip-2',
      kind: 'zoom',
      duration: 0.45,
    })

    expect(ok).toBe(true)
    expect(addTransition).toHaveBeenCalledWith('clip-1', 'clip-2', 'zoom', 0.45)
  })
})
