'use client'

import { useDirectorStore } from '../../store/directorStore'
import { NameLabel } from '../NameLabel'
import type { DirectorObject, GeometryPrimitiveType } from '@/lib/director-desk/schema'

function PrimitiveMesh({ geometryType, color }: { geometryType: GeometryPrimitiveType; color: string }) {
  const material = <meshStandardMaterial color={color} metalness={0.02} roughness={0.68} />

  if (geometryType === 'sphere') {
    return (
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.55, 32, 16]} />
        {material}
      </mesh>
    )
  }
  if (geometryType === 'cylinder') {
    return (
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 1.2, 32]} />
        {material}
      </mesh>
    )
  }
  if (geometryType === 'torus') {
    return (
      <mesh position={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.45, 0.14, 16, 48]} />
        {material}
      </mesh>
    )
  }
  if (geometryType === 'cone') {
    return (
      <mesh position={[0, 0.55, 0]}>
        <coneGeometry args={[0.5, 1.1, 32]} />
        {material}
      </mesh>
    )
  }
  if (geometryType === 'pyramid') {
    return (
      <mesh position={[0, 0.55, 0]}>
        <coneGeometry args={[0.55, 1.1, 4]} />
        {material}
      </mesh>
    )
  }
  return (
    <mesh position={[0, 0.5, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      {material}
    </mesh>
  )
}

export function GeometryPrimitiveObject({ object }: { object: DirectorObject }) {
  const showLabels = useDirectorStore((s) => s.project.scene.showLabels)
  if (!object.geometryType) return null

  return (
    <group>
      <PrimitiveMesh geometryType={object.geometryType} color={object.color} />
      {showLabels && <NameLabel text={object.name} y={1.35} color={object.color} />}
    </group>
  )
}
