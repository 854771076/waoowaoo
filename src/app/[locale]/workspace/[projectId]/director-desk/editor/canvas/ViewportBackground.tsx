'use client'

import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import {
  BackSide,
  ClampToEdgeWrapping,
  Color,
  EquirectangularReflectionMapping,
  LinearFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'
import { useDirectorStore } from '../store/directorStore'
import type { DirectorImportedAsset, PanoramaProjectionMode } from '@/lib/director-desk/schema'

type PanoramaTextureState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; texture: Texture }
  | { status: 'error' }

function configurePanoramaTexture(texture: Texture, projectionMode: PanoramaProjectionMode = 'equirectangular') {
  texture.colorSpace = SRGBColorSpace
  if (projectionMode === 'equirectangular') {
    texture.mapping = EquirectangularReflectionMapping
    texture.repeat.set(1, 1)
    texture.offset.set(0, 0)
  } else {
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.repeat.set(-1, 1)
    texture.offset.set(1, 0)
  }
  texture.needsUpdate = true
  return texture
}

function usePanoramaTexture(asset: DirectorImportedAsset | null): PanoramaTextureState {
  const [state, setState] = useState<PanoramaTextureState>({ status: 'idle' })
  const projectionMode = asset?.projectionMode ?? 'equirectangular'

  useEffect(() => {
    if (!asset?.url) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    let texture: Texture | null = null
    setState({ status: 'loading' })
    try {
      texture = new TextureLoader().load(
        asset.url,
        (loadedTexture) => {
          if (cancelled) {
            loadedTexture.dispose()
            return
          }
          setState({ status: 'ready', texture: configurePanoramaTexture(loadedTexture, projectionMode) })
        },
        undefined,
        () => {
          if (!cancelled) setState({ status: 'error' })
        },
      )
    } catch {
      setState({ status: 'error' })
    }
    return () => {
      cancelled = true
      texture?.dispose()
    }
  }, [asset?.url, projectionMode])

  return state
}

export function ViewportBackground() {
  const sceneSettings = useDirectorStore((s) => s.project.scene)
  const panoramaAsset = useDirectorStore((s) => {
    const assetId = s.project.scene.panoramaAssetId
    return assetId ? (s.project.importedAssets ?? []).find((asset) => asset.id === assetId) ?? null : null
  })
  const { gl, scene } = useThree()
  const projectionMode = panoramaAsset?.projectionMode ?? 'equirectangular'
  const textureState = usePanoramaTexture(panoramaAsset)
  const fallbackColor = useMemo(() => new Color(sceneSettings.backgroundColor), [sceneSettings.backgroundColor])
  const radius = Math.max(10, sceneSettings.panoramaRadius ?? 60)
  const yaw = sceneSettings.panoramaYaw ?? 0

  useEffect(() => {
    const nextBackground =
      textureState.status === 'ready' && projectionMode === 'equirectangular'
        ? textureState.texture
        : fallbackColor
    scene.background = nextBackground
    scene.backgroundBlurriness = 0
    scene.backgroundIntensity = 1
    scene.backgroundRotation.set(0, textureState.status === 'ready' && projectionMode === 'equirectangular' ? yaw : 0, 0)
    gl.setClearColor(fallbackColor, 1)
  }, [fallbackColor, gl, projectionMode, scene, textureState, yaw])

  return (
    <>
      {textureState.status === 'ready' && projectionMode === 'backdrop' ? (
        <mesh frustumCulled={false} renderOrder={-1000} rotation={[0, yaw, 0]}>
          <sphereGeometry args={[radius, 96, 64]} />
          <meshBasicMaterial depthWrite={false} map={textureState.texture} side={BackSide} toneMapped={false} />
        </mesh>
      ) : null}
      {textureState.status === 'error' ? (
        <Html center>
          <div className="rounded border border-red-400/30 bg-black/70 px-3 py-2 text-xs text-red-200" role="status">
            全景图加载失败，请重新导入
          </div>
        </Html>
      ) : null}
    </>
  )
}
