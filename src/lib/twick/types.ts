import type { ElementJSON, ProjectJSON, TrackJSON } from '@twick/timeline'

export type TwickTimelineProject = ProjectJSON
export type TwickTrack = TrackJSON
export type TwickTimelineElement = ElementJSON & {
  props?: Record<string, unknown>
}

export type TwickMediaElement = TwickTimelineElement & {
  props: {
    src: string
    time?: number
    volume?: number
    [key: string]: unknown
  }
}

export type TwickCaptionElement = TwickTimelineElement & {
  t: string
  props: {
    fontSize?: number
    fill?: string
    stroke?: string
    strokeWidth?: number
    textAlign?: string
    [key: string]: unknown
  }
}

export interface PanelVideoSource {
  panelId: string
  storyboardId: string
  videoMediaObjectId: string
  duration: number
  description?: string
}

export interface VoiceLineSource {
  voiceLineId: string
  audioMediaObjectId: string
  duration: number
  text: string
  speaker?: string
}

export type MediaObjRef = `mediaobj://${string}`

export interface TwickSourceMetadata {
  panelId?: string
  voiceLineId?: string
  storyboardId?: string
  source?: 'generated' | 'ai_enhanced' | 'uploaded'
  description?: string
  speaker?: string
  [key: string]: unknown
}
