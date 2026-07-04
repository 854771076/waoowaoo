'use client'

import { ElementDeserializer, TimelineEditor } from '@twick/timeline'
import type { ProjectJSON } from '@twick/timeline'
import { resolveMediaUrls } from '@/lib/novel-promotion/stages/editor-stage-runtime/useEditorProjectSync'
import { panelToVideoElement, voiceLineToAudioElement } from '@/lib/twick/asset-adapter'
import type { PanelVideoSource, VoiceLineSource } from '@/lib/twick/types'

// ponytail: shared payload for asset drag → timeline drop. Kept as a single
// custom MIME type so we can sniff it in dragover without touching text/plain.
export const ASSET_DND_MIME = 'application/x-twick-asset'
export type AssetDndPayload =
  | { kind: 'video-panel'; id: string }
  | { kind: 'voice-line'; id: string }

interface AddToTimelineArgs<TSource> {
  source: TSource
  editor: TimelineEditor
  present: ProjectJSON | null | undefined
  projectId: string
  trackLabel: string
}

// ponytail: same NaN guard both list handlers used before extraction — a bad
// element `e` would poison Math.max(...ends) and yield a NaN start position.
function nextEndForType(present: ProjectJSON | null | undefined, elementType: string): number {
  const ends = present?.tracks
    ?.flatMap((track) => track.elements ?? [])
    .filter((element) => element.type === elementType)
    .map((element) => (typeof element.e === 'number' && Number.isFinite(element.e) ? element.e : 0)) ?? []
  return ends.length > 0 ? Math.max(0, ...ends) : 0
}

export async function addVideoPanelToTimeline({
  source,
  editor,
  present,
  projectId,
  trackLabel,
}: AddToTimelineArgs<PanelVideoSource>): Promise<void> {
  const videoTrack = editor.getTracksByType('video')[0] ?? editor.addTrack(trackLabel, 'video')
  const currentEnd = nextEndForType(present, 'video')
  const rawElement = panelToVideoElement(source, currentEnd)
  const resolvedElement = await resolveMediaUrls(rawElement, projectId)
  const element = ElementDeserializer.fromJSON(resolvedElement)
  if (!element) return
  try {
    await editor.addElementToTrack(videoTrack, element)
  } catch (error) {
    console.warn('[asset-timeline-actions] addElementToTrack (video) failed', error)
  }
}

export async function addVoiceLineToTimeline({
  source,
  editor,
  present,
  projectId,
  trackLabel,
}: AddToTimelineArgs<VoiceLineSource>): Promise<void> {
  const audioTrack = editor.getTracksByType('audio')[0] ?? editor.addTrack(trackLabel, 'audio')
  const currentEnd = nextEndForType(present, 'audio')
  const rawElement = voiceLineToAudioElement(source, currentEnd)
  const resolvedElement = await resolveMediaUrls(rawElement, projectId)
  const element = ElementDeserializer.fromJSON(resolvedElement)
  if (!element) return
  try {
    await editor.addElementToTrack(audioTrack, element)
  } catch (error) {
    console.warn('[asset-timeline-actions] addElementToTrack (audio) failed', error)
  }
}

export function setAssetDragPayload(dataTransfer: DataTransfer, payload: AssetDndPayload): void {
  const serialized = JSON.stringify(payload)
  dataTransfer.setData(ASSET_DND_MIME, serialized)
  // Fallback for browsers that stripped custom types (mostly Safari legacy).
  dataTransfer.setData('text/plain', serialized)
  dataTransfer.effectAllowed = 'copy'
}

export function readAssetDragPayload(dataTransfer: DataTransfer | null): AssetDndPayload | null {
  if (!dataTransfer) return null
  const raw = dataTransfer.getData(ASSET_DND_MIME) || dataTransfer.getData('text/plain')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AssetDndPayload
    if (parsed && (parsed.kind === 'video-panel' || parsed.kind === 'voice-line') && typeof parsed.id === 'string') {
      return parsed
    }
  } catch {
    // ignore
  }
  return null
}
