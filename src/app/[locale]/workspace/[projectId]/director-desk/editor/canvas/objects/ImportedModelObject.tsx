'use client'

import { useLoader } from '@react-three/fiber'
import { useMemo } from 'react'
import { Box3, Vector3, type Object3D } from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import type { DirectorImportedAsset } from '@/lib/director-desk/schema'

function getImportedModelNormalization(bounds: Box3) {
  if (bounds.isEmpty()) return { position: [0, 0, 0] as [number, number, number], scale: 1 }
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const maxAxis = Math.max(size.x, size.y, size.z, 0.001)
  const scale = 1.4 / maxAxis
  return {
    position: [-center.x * scale, -bounds.min.y * scale, -center.z * scale] as [number, number, number],
    scale,
  }
}

function NormalizedImportedObject({ object }: { object: Object3D }) {
  const { clone, normalization } = useMemo(() => {
    const clonedObject = object.clone(true)
    clonedObject.updateMatrixWorld(true)
    clonedObject.traverse((child) => {
      if ('castShadow' in child) child.castShadow = true
      if ('receiveShadow' in child) child.receiveShadow = true
    })
    return {
      clone: clonedObject,
      normalization: getImportedModelNormalization(new Box3().setFromObject(clonedObject)),
    }
  }, [object])

  return (
    <group position={normalization.position} scale={[normalization.scale, normalization.scale, normalization.scale]}>
      <primitive object={clone} />
    </group>
  )
}

function FbxModel({ url }: { url: string }) {
  const object = useLoader(FBXLoader, url)
  return <NormalizedImportedObject object={object} />
}

function ObjModel({ url }: { url: string }) {
  const object = useLoader(OBJLoader, url)
  return <NormalizedImportedObject object={object} />
}

function GltfModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url)
  return <NormalizedImportedObject object={gltf.scene} />
}

export function ImportedModelObject({ asset }: { asset: DirectorImportedAsset }) {
  if (/\.fbx$/i.test(asset.fileName)) return <FbxModel url={asset.url} />
  if (/\.obj$/i.test(asset.fileName)) return <ObjModel url={asset.url} />
  if (/\.(glb|gltf)$/i.test(asset.fileName)) return <GltfModel url={asset.url} />
  return null
}
