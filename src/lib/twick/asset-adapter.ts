import { toMediaObjRef } from './media-url-resolver'
import type {
  PanelVideoSource,
  TwickCaptionElement,
  TwickMediaElement,
  TwickSourceMetadata,
  VoiceLineSource,
} from './types'

function endSec(startSec: number, durationSec: number): number {
  return startSec + durationSec
}

export function panelToVideoElement(
  panel: PanelVideoSource,
  startSec: number,
): TwickMediaElement {
  const metadata: TwickSourceMetadata = {
    panelId: panel.panelId,
    storyboardId: panel.storyboardId,
    source: 'generated',
  }
  if (panel.description) metadata.description = panel.description

  return {
    id: `video-${panel.panelId}`,
    type: 'video',
    s: startSec,
    e: endSec(startSec, panel.duration),
    props: {
      src: toMediaObjRef(panel.videoMediaObjectId),
      time: 0,
    },
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
    id: `audio-${voiceLine.voiceLineId}`,
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
  voiceLine: VoiceLineSource,
  startSec: number,
): TwickCaptionElement {
  const metadata: TwickSourceMetadata = {
    voiceLineId: voiceLine.voiceLineId,
    source: 'generated',
  }
  if (voiceLine.speaker) metadata.speaker = voiceLine.speaker

  return {
    id: `caption-${voiceLine.voiceLineId}`,
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
