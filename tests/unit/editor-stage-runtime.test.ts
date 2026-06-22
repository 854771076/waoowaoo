import { describe, expect, it, vi } from 'vitest'
import { createDebouncedAction } from '@/lib/novel-promotion/stages/editor-stage-runtime/useEditorProjectSync'
import {
  mapStoryboardsToPanelVideos,
  mapVoiceLinesToSources,
} from '@/lib/novel-promotion/stages/editor-stage-runtime/useEditorStageDataLoader'

describe('editor-stage-runtime data mapping', () => {
  it('maps storyboard groups to Twick panel video sources using video media object ids', () => {
    const result = mapStoryboardsToPanelVideos({
      groups: [
        {
          id: 'storyboard-1',
          stageIndex: 0,
          panels: [
            {
              id: 'panel-1',
              shotId: 'shot-1',
              stageIndex: 0,
              shotIndex: 0,
              imageUrl: null,
              motionPrompt: 'camera move',
              voiceText: 'voice text',
              voiceUrl: null,
              videoUrl: '/video.mp4',
              videoMedia: {
                id: 'media-video-1',
                publicId: 'public-video-1',
                url: '/video.mp4',
                mimeType: 'video/mp4',
                sizeBytes: null,
                width: 1080,
                height: 1920,
                durationMs: 4500,
              },
              errorMessage: null,
              candidates: [],
              pendingCandidateCount: 0,
            },
            {
              id: 'panel-without-video-media',
              shotId: 'shot-2',
              stageIndex: 0,
              shotIndex: 1,
              imageUrl: null,
              motionPrompt: null,
              voiceText: null,
              voiceUrl: null,
              videoUrl: null,
              errorMessage: null,
              candidates: [],
              pendingCandidateCount: 0,
            },
          ],
        },
      ],
    })

    expect(result).toEqual([
      {
        panelId: 'panel-1',
        storyboardId: 'storyboard-1',
        videoMediaObjectId: 'media-video-1',
        duration: 4.5,
        description: 'camera move',
      },
    ])
  })

  it('maps matched voice lines to Twick audio sources using audio media object ids', () => {
    const result = mapVoiceLinesToSources({
      voiceLines: [
        {
          id: 'line-1',
          lineIndex: 0,
          speaker: 'Alice',
          content: 'Hello',
          audioUrl: '/audio.mp3',
          audioDuration: 1.25,
          audioMedia: {
            id: 'media-audio-1',
            durationMs: 1300,
          },
          matchedStoryboardId: 'storyboard-1',
          matchedPanelIndex: 0,
        },
        {
          id: 'line-without-media',
          lineIndex: 1,
          speaker: 'Bob',
          content: 'Skipped',
          audioUrl: '/legacy.mp3',
          audioDuration: 2,
          matchedStoryboardId: null,
          matchedPanelIndex: null,
        },
      ],
    })

    expect(result).toEqual([
      {
        voiceLineId: 'line-1',
        audioMediaObjectId: 'media-audio-1',
        duration: 1.25,
        text: 'Hello',
        speaker: 'Alice',
      },
    ])
  })
})

describe('editor-stage-runtime debounce helper', () => {
  it('runs only the latest scheduled action after the delay and supports cancel', () => {
    vi.useFakeTimers()
    const action = vi.fn()
    const debounced = createDebouncedAction(action, 1000)

    debounced.schedule('first')
    vi.advanceTimersByTime(500)
    debounced.schedule('second')
    vi.advanceTimersByTime(999)
    expect(action).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(action).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledWith('second')

    debounced.schedule('third')
    debounced.cancel()
    vi.advanceTimersByTime(1000)
    expect(action).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
