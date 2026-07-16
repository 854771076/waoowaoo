import { afterEach, describe, expect, it, vi } from 'vitest'

import { readLocalModelFile } from '@/app/[locale]/workspace/[projectId]/director-desk/editor/loaders/localModelImport'

class MockFileReader {
  result: string | ArrayBuffer | null = null
  error: Error | null = null
  private listeners = new Map<string, Array<() => void>>()

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  readAsDataURL() {
    this.result = 'data:model/gltf-binary;base64,Z2xi'
    for (const listener of this.listeners.get('load') ?? []) listener()
  }
}

describe('director-desk local model import', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts GLB and GLTF model files', async () => {
    vi.stubGlobal('FileReader', MockFileReader)

    await expect(readLocalModelFile({ name: 'spaceship.glb' } as File)).resolves.toEqual({
      fileName: 'spaceship.glb',
      name: 'spaceship',
      url: 'data:model/gltf-binary;base64,Z2xi',
    })
    await expect(readLocalModelFile({ name: 'scene.gltf' } as File)).resolves.toMatchObject({
      fileName: 'scene.gltf',
      name: 'scene',
    })
  })

  it('rejects unsupported local model files with the supported format list', async () => {
    await expect(readLocalModelFile({ name: 'model.usdz' } as File)).rejects.toThrow('FBX / OBJ / GLB / GLTF')
  })
})

