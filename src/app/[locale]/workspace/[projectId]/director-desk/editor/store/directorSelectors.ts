'use client'
import { useDirectorStore } from './directorStore'

export const useSelectedObject = () =>
  useDirectorStore(s => {
    if (!s.selectedId) return null
    return s.project.objects.find(o => o.id === s.selectedId) ?? null
  })

export const useActiveCamera = () =>
  useDirectorStore(s => s.project.cameras.find(c => c.id === s.project.activeCameraId) ?? s.project.cameras[0] ?? null)

export const useSelectedCamera = () =>
  useDirectorStore(s => {
    if (!s.selectedId) return null
    return s.project.cameras.find(c => c.id === s.selectedId) ?? null
  })

export function getActiveCameraSnapshot() {
  const s = useDirectorStore.getState()
  return s.project.cameras.find(c => c.id === s.project.activeCameraId) ?? s.project.cameras[0] ?? null
}

export function collectBoundShotsForSave() {
  const s = useDirectorStore.getState()
  const shots: Array<{
    cameraId: string; name: string; isActive: boolean;
    fov: number; position: [number,number,number]; target: [number,number,number];
    note?: string; snapshotDataUrl: string;
  }> = []
  for (const [cameraId, caps] of Object.entries(s.cameraCaptures)) {
    for (const cap of caps) {
      if (!cap.isBound) continue
      // Bound captures from server have a signed URL, not dataUrl. Only upload dataUrl captures (newly-taken).
      if (!cap.dataUrl.startsWith('data:')) continue
      const cam = s.project.cameras.find(c => c.id === cameraId)
      if (!cam) continue
      shots.push({
        cameraId,
        name: cap.name || cam.name,
        isActive: cap.isActiveStar,
        fov: cam.fov,
        position: [...cam.position] as [number,number,number],
        target: [...cam.target] as [number,number,number],
        note: cap.note,
        snapshotDataUrl: cap.dataUrl,
      })
    }
  }
  // Normalize: exactly one active (first encountered wins)
  if (shots.length > 0 && !shots.some(s => s.isActive)) shots[0].isActive = true
  let seenActive = false
  for (const s of shots) {
    if (s.isActive) {
      if (seenActive) s.isActive = false
      seenActive = true
    }
  }
  return shots
}
