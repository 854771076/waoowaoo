import { describe, expect, it } from 'vitest'
import { buildInitialProject } from '@/lib/twick/project-builder'
import type { PanelVideoSource, VoiceLineSource } from '@/lib/twick/types'

describe('project-builder', () => {
  const panels: PanelVideoSource[] = [
    { panelId: 'p1', storyboardId: 'sb1', videoMediaObjectId: 'mo1', duration: 3 },
    { panelId: 'p2', storyboardId: 'sb1', videoMediaObjectId: 'mo2', duration: 4 },
    { panelId: 'p3', storyboardId: 'sb2', videoMediaObjectId: 'mo3', duration: 2.5 },
  ]

  const voiceLines: VoiceLineSource[] = [
    { voiceLineId: 'vl1', audioMediaObjectId: 'a1', duration: 2.8, text: 'Line 1' },
    { voiceLineId: 'vl2', audioMediaObjectId: 'a2', duration: 3.9, text: 'Line 2' },
    { voiceLineId: 'vl3', audioMediaObjectId: 'a3', duration: 2.4, text: 'Line 3' },
  ]

  it('builds a real Twick ProjectJSON with video track elements placed sequentially', () => {
    const project = buildInitialProject(panels, [], {
      width: 720,
      height: 1280,
      includeAudio: false,
    })

    expect(project.version).toBe(1)
    expect(project.tracks).toHaveLength(1)
    expect(project.tracks[0]).toMatchObject({
      id: 'track-video-main',
      name: '视频',
      type: 'video',
    })
    expect(project.tracks[0].elements).toHaveLength(3)
    expect(project.tracks[0].elements.map((el) => [el.s, el.e])).toEqual([
      [0, 3],
      [3, 7],
      [7, 9.5],
    ])
    expect(project.tracks[0].elements[1].props.src).toBe('mediaobj://mo2')
    expect(project.metadata?.custom).toMatchObject({
      width: 720,
      height: 1280,
      fps: 30,
      duration: 9.5,
    })
    expect('width' in project).toBe(false)
    expect('height' in project).toBe(false)
    expect('duration' in project).toBe(false)
  })

  it('builds video and audio tracks when voice lines are included', () => {
    const project = buildInitialProject(panels, voiceLines, {
      width: 720,
      height: 1280,
      includeAudio: true,
    })

    expect(project.tracks).toHaveLength(2)
    const audioTrack = project.tracks.find((track) => track.type === 'audio')
    expect(audioTrack).toBeDefined()
    expect(audioTrack?.elements).toHaveLength(3)
    expect(audioTrack?.elements[0]).toMatchObject({
      type: 'audio',
      s: 0,
      e: 2.8,
      props: {
        src: 'mediaobj://a1',
        volume: 1,
      },
    })
  })

  it('builds a caption text track when captions are enabled', () => {
    const project = buildInitialProject(panels, voiceLines, {
      width: 720,
      height: 1280,
      includeAudio: true,
      includeCaptions: true,
    })

    expect(project.tracks).toHaveLength(3)
    const captionTrack = project.tracks.find((track) => track.type === 'caption')
    expect(captionTrack).toBeDefined()
    expect(captionTrack?.name).toBe('字幕')
    expect(captionTrack?.elements).toHaveLength(3)
    expect(captionTrack?.elements[0].t).toBe('Line 1')
  })

  it('handles empty panels with a valid empty ProjectJSON', () => {
    const project = buildInitialProject([], [], { width: 720, height: 1280 })

    expect(project).toMatchObject({
      version: 1,
      tracks: [
        {
          id: 'track-video-main',
          name: '视频',
          type: 'video',
          elements: [],
        },
      ],
    })
    expect(project.metadata?.custom?.duration).toBe(0)
  })
})
