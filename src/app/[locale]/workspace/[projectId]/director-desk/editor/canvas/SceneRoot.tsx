'use client'
import { Suspense, useMemo } from 'react'
import { useDirectorStore } from '../store/directorStore'
import { Ground } from './Ground'
import { Backdrop } from './Backdrop'
import { CameraRigs } from './CameraRigs'
import { ViewportOverlays } from './ViewportOverlays'
import { ViewportBackground } from './ViewportBackground'
import { TransformableObject } from './TransformableObject'
import { BillboardObject } from './objects/BillboardObject'
import { MannequinObject } from './objects/MannequinObject'
import { CrowdObject } from './objects/CrowdObject'
import { GeometryPrimitiveObject } from './objects/GeometryPrimitiveObject'
import { ImportedModelObject } from './objects/ImportedModelObject'

export function SceneRoot() {
  const objects = useDirectorStore((s) => s.project.objects)
  const importedAssets = useDirectorStore((s) => s.project.importedAssets ?? [])
  const select = useDirectorStore((s) => s.select)
  const viewMode = useDirectorStore((s) => s.viewMode)
  const viewportRuleOfThirdsEnabled = useDirectorStore((s) => s.viewportRuleOfThirdsEnabled)
  const ambientLightIntensity = useDirectorStore((s) => s.project.scene.ambientLightIntensity)
  const directionalLightIntensity = useDirectorStore((s) => s.project.scene.directionalLightIntensity)
  const importedAssetById = useMemo(() => new Map(importedAssets.map((asset) => [asset.id, asset])), [importedAssets])

  return (
    <group>
      <ViewportBackground />
      <ambientLight intensity={ambientLightIntensity} />
      <directionalLight position={[5, 8, 5]} intensity={directionalLightIntensity} />
      <hemisphereLight args={['#ffffff', '#333844', 0.35]} />
      {/* click on empty ground plane -> deselect */}
      <mesh
        position={[0, -0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          select(null)
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <Ground />
      <Backdrop />
      {objects
        .filter((o) => o.visible)
        .map((o) => {
          let child
          const asset = o.assetRefId ? importedAssetById.get(o.assetRefId) : undefined
          if (o.kind === 'crowd') child = <CrowdObject object={o} />
          else if (asset?.sourceType === 'model') {
            child = (
              <Suspense fallback={null}>
                <ImportedModelObject asset={asset} />
              </Suspense>
            )
          } else if (o.kind === 'prop' && o.geometryType) child = <GeometryPrimitiveObject object={o} />
          else if (o.kind === 'character' && o.mode === 'mannequin') child = <MannequinObject object={o} />
          else child = <BillboardObject object={o} />
          return (
            <TransformableObject key={o.id} objectId={o.id} transform={o.transform} locked={o.locked} kind={o.kind} mode={o.mode}>
              {child}
            </TransformableObject>
          )
        })}
      <CameraRigs />
      {viewMode === 'camera' && viewportRuleOfThirdsEnabled && <ViewportOverlays />}
    </group>
  )
}
