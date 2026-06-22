import {
  panelToVideoElement,
  voiceLineToAudioElement,
  voiceLineToCaptionElement,
} from './asset-adapter'
import type { PanelVideoSource, TwickTimelineProject, TwickTrack, VoiceLineSource } from './types'

export interface BuildProjectOptions {
  width: number
  height: number
  fps?: number
  includeAudio?: boolean
  includeCaptions?: boolean
  backgroundColor?: string
  title?: string
}

function createTrack(id: string, name: string, type: string): TwickTrack {
  return {
    id,
    name,
    type,
    elements: [],
  }
}

export function buildInitialProject(
  panels: PanelVideoSource[],
  voiceLines: VoiceLineSource[],
  options: BuildProjectOptions,
): TwickTimelineProject {
  const {
    width,
    height,
    fps = 30,
    includeAudio = true,
    includeCaptions = false,
    backgroundColor,
    title,
  } = options

  const videoTrack = createTrack('track-video-main', '视频', 'video')
  const audioTrack = createTrack('track-audio-main', '语音', 'audio')
  const captionTrack = createTrack('track-captions', '字幕', 'caption')

  let currentTime = 0

  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index]
    videoTrack.elements.push(panelToVideoElement(panel, currentTime))

    const voiceLine = voiceLines[index]
    if (voiceLine) {
      if (includeAudio) {
        audioTrack.elements.push(voiceLineToAudioElement(voiceLine, currentTime))
      }
      if (includeCaptions) {
        captionTrack.elements.push(voiceLineToCaptionElement(voiceLine, currentTime))
      }
    }

    currentTime += panel.duration
  }

  const tracks: TwickTrack[] = [videoTrack]
  if (audioTrack.elements.length > 0) tracks.push(audioTrack)
  if (captionTrack.elements.length > 0) tracks.push(captionTrack)

  return {
    version: 1,
    ...(backgroundColor ? { backgroundColor } : {}),
    metadata: {
      ...(title ? { title } : {}),
      custom: {
        width,
        height,
        fps,
        duration: currentTime,
      },
    },
    tracks,
  }
}
