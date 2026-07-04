import { toMediaObjRef } from './media-ref'
import type {
  CaptionVoiceLineSource,
  PanelVideoSource,
  TwickCaptionElement,
  TwickMediaElement,
  TwickSourceMetadata,
  VoiceLineSource,
} from './types'

function endSec(startSec: number, durationSec: number): number {
  return startSec + durationSec
}

let elementIdCounter = 0

function createElementInstanceId(prefix: string, sourceId: string): string {
  elementIdCounter = (elementIdCounter + 1) % Number.MAX_SAFE_INTEGER
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${sourceId}-${Date.now().toString(36)}-${elementIdCounter.toString(36)}-${randomSuffix}`
}

export function panelToVideoElement(
  panel: PanelVideoSource,
  startSec: number,
  canvasSize?: { width: number; height: number },
): TwickMediaElement {
  const metadata: TwickSourceMetadata = {
    panelId: panel.panelId,
    storyboardId: panel.storyboardId,
    source: 'generated',
  }
  if (panel.description) metadata.description = panel.description

  return {
    id: createElementInstanceId('video', panel.panelId),
    // ponytail: Twick's Track.fromJSON never back-fills trackId onto its elements, and
    // editor.splitElement bails to { success:false } the moment getTrackById(undefined)
    // returns nothing → clicking the scissors icon looked like a dead button. Set trackId
    // explicitly, same as voiceLineToCaptionElement below.
    trackId: 'track-video-main',
    type: 'video',
    s: startSec,
    e: endSec(startSec, panel.duration),
    props: {
      src: toMediaObjRef(panel.videoMediaObjectId),
      time: 0,
    },
    // ponytail: without a frame Twick's scene container is 0×0 → black canvas + broken
    // objectFit. Give every generated video the full canvas as its frame; `cover` scales
    // the source to fill. Twick will refit if updateVideoMeta ever succeeds.
    objectFit: 'cover',
    ...(canvasSize ? {
      frame: {
        size: [canvasSize.width, canvasSize.height],
        x: 0,
        y: 0,
        rotation: 0,
      },
    } : {}),
    metadata,
  }
}

export function voiceLineToAudioElement(
  voiceLine: VoiceLineSource,
  startSec: number,
): TwickMediaElement {
  const metadata: TwickSourceMetadata = {
    voiceLineId: voiceLine.voiceLineId,
    source: 'generated',
  }
  if (voiceLine.speaker) metadata.speaker = voiceLine.speaker

  return {
    id: createElementInstanceId('audio', voiceLine.voiceLineId),
    trackId: 'track-audio-main',
    type: 'audio',
    s: startSec,
    e: endSec(startSec, voiceLine.duration),
    props: {
      src: toMediaObjRef(voiceLine.audioMediaObjectId),
      time: 0,
      volume: 1,
    },
    metadata,
  }
}

export function voiceLineToCaptionElement(
  voiceLine: CaptionVoiceLineSource,
  startSec: number,
): TwickCaptionElement {
  const metadata: TwickSourceMetadata = {
    voiceLineId: voiceLine.voiceLineId,
    source: 'generated',
  }
  if (voiceLine.speaker) metadata.speaker = voiceLine.speaker

  return {
    id: `caption-${voiceLine.voiceLineId}`,
    // ponytail: Twick reads x/y from the track's props (useTrackDefaults=true by default),
    // and looks the track up via element.getTrackId(). Without trackId, getTrackById returns
    // undefined → captionProps is always {} → after drag the caption snaps back to (0, 0).
    trackId: 'track-captions',
    type: 'caption',
    t: voiceLine.text,
    s: startSec,
    e: endSec(startSec, voiceLine.duration),
    props: {
      fontSize: 32,
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 2,
      textAlign: 'center',
    },
    metadata,
  }
}
