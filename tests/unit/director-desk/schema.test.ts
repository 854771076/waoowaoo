import { describe, expect, it } from 'vitest'

import {
  applyImportedAssetUrlMap,
  createDefaultDirectorProject,
  parseDirectorProject,
  serializeDirectorProject,
  validateDirectorProjectSize,
  type DirectorProject,
} from '@/lib/director-desk/schema'
import {
  parseProjectJson,
  serializeProjectJson,
} from '@/app/[locale]/workspace/[projectId]/director-desk/editor/io/projectJson'

describe('director-desk schema', () => {
  it('roundtrips default project through serialize + parse', () => {
    const project = createDefaultDirectorProject()
    const json = serializeDirectorProject(project)
    const parsed = parseDirectorProject(JSON.parse(json))
    expect(parsed).not.toBeNull()
    expect(parsed?.version).toBe(1)
    expect(parsed?.cameras).toHaveLength(1)
    expect(parsed?.cameras[0].name).toBe('主机位')
    expect(parsed?.activeCameraId).toBe('cam-1')
    expect(parsed?.objects).toEqual([])
    expect(parsed?.scene.backgroundColor).toBe('#1a1d23')
    expect(parsed?.scene.showGround).toBe(true)
    expect(parsed?.scene.groundOpacity).toBe(0.8)
    expect(parsed?.scene.ambientLightIntensity).toBe(0.6)
    expect(parsed?.scene.directionalLightIntensity).toBe(1)
    expect(parsed?.scene.backdropAssetId).toBeNull()
  })

  it('roundtrips through editor JSON import/export helpers', () => {
    const project = createDefaultDirectorProject()
    project.objects.push({
      id: 'obj-json-1',
      kind: 'character',
      name: '导入角色',
      refId: null,
      visible: true,
      locked: false,
      color: '#7AA7FF',
      mode: 'mannequin',
      transform: { position: [1, 0, -1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })

    const json = serializeProjectJson(project)
    expect(json).toContain('\n')
    const parsed = parseProjectJson(json)
    expect(parsed.objects[0]).toMatchObject({
      id: 'obj-json-1',
      kind: 'character',
      name: '导入角色',
    })
  })

  it('rejects invalid editor JSON import payloads with explicit errors', () => {
    expect(() => parseProjectJson('{bad json')).toThrow('导演台 JSON 格式无效')
    expect(() => parseProjectJson(JSON.stringify({ version: 1 }))).toThrow('导演台 JSON 不符合当前项目格式')
  })

  it('rejects mismatched version', () => {
    const project = createDefaultDirectorProject()
    const raw = JSON.parse(serializeDirectorProject(project))
    raw.version = 2
    expect(parseDirectorProject(raw)).toBeNull()
  })

  it('rejects non-array objects/cameras', () => {
    const base = JSON.parse(serializeDirectorProject(createDefaultDirectorProject()))
    const badObjects = { ...base, objects: 'oops' }
    expect(parseDirectorProject(badObjects)).toBeNull()
    const badCameras = { ...base, cameras: null }
    expect(parseDirectorProject(badCameras)).toBeNull()
  })

  it('rejects oversized JSON', () => {
    const project = createDefaultDirectorProject()
    const filler = 'x'.repeat(1024 * 1024 + 10)
    const raw = { ...project, __filler: filler }
    const json = JSON.stringify(raw)
    expect(validateDirectorProjectSize(json)).toBe(false)

    const small = serializeDirectorProject(project)
    expect(validateDirectorProjectSize(small)).toBe(true)
  })

  it('strips imageUrl/backdropImageUrl on parse', () => {
    const project = createDefaultDirectorProject()
    project.scene.backdropImageUrl = 'https://example.com/bg.png'
    project.objects.push({
      id: 'obj-1',
      kind: 'prop',
      name: '参考图',
      refId: 'media-1',
      visible: true,
      locked: false,
      color: '#888',
      mode: 'billboard',
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      imageUrl: 'https://example.com/ref.png',
    })

    const json = serializeDirectorProject(project)
    const raw = JSON.parse(json) as DirectorProject & {
      scene: DirectorProject['scene']
    }
    // backdropImageUrl and imageUrl stripped by serializer
    expect(raw.scene.backdropImageUrl).toBeUndefined()
    expect(raw.objects[0]).not.toHaveProperty('imageUrl')

    // even if input contains them, parse discards
    const inputWithTransientFields = {
      ...raw,
      scene: { ...raw.scene, backdropImageUrl: 'https://x' },
      objects: [{ ...raw.objects[0], imageUrl: 'https://y' }],
    }
    const parsed = parseDirectorProject(inputWithTransientFields)
    expect(parsed).not.toBeNull()
    expect(parsed?.scene.backdropImageUrl).toBeNull()
    expect(parsed?.objects[0].imageUrl).toBeUndefined()
  })

  it('preserves supported prop geometry primitive types', () => {
    const project = createDefaultDirectorProject()
    project.objects.push({
      id: 'geo-1',
      kind: 'prop',
      name: '圆锥',
      refId: null,
      visible: true,
      locked: false,
      color: '#8FB7FF',
      mode: 'mannequin',
      geometryType: 'cone',
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    })

    const parsed = parseDirectorProject(JSON.parse(serializeDirectorProject(project)))
    expect(parsed?.objects[0].geometryType).toBe('cone')
  })

  it('preserves imported assets and validates object/panorama references', () => {
    const project = createDefaultDirectorProject()
    project.importedAssets = [
      {
        id: 'asset-model-1',
        kind: 'model',
        sourceType: 'model',
        fileName: 'chair.obj',
        name: 'chair',
        url: 'images/director-assets-panel-1.obj',
      },
      {
        id: 'asset-panorama-1',
        kind: 'panorama',
        sourceType: 'image',
        fileName: 'studio.jpg',
        name: 'studio.jpg',
        url: 'images/director-assets-panel-2.jpg',
        projectionMode: 'equirectangular',
      },
    ]
    project.scene.panoramaAssetId = 'asset-panorama-1'
    project.objects.push({
      id: 'asset-prop-1',
      kind: 'prop',
      name: 'chair',
      refId: null,
      visible: true,
      locked: false,
      color: '#8FB7FF',
      mode: 'mannequin',
      assetRefId: 'asset-model-1',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    })

    const parsed = parseDirectorProject(JSON.parse(serializeDirectorProject(project)))
    expect(parsed?.importedAssets).toHaveLength(2)
    expect(parsed?.scene.panoramaAssetId).toBe('asset-panorama-1')
    expect(parsed?.objects[0].assetRefId).toBe('asset-model-1')

    const raw = JSON.parse(serializeDirectorProject(project))
    raw.scene.panoramaAssetId = 'missing-panorama'
    raw.objects[0].assetRefId = 'missing-model'
    const sanitized = parseDirectorProject(raw)
    expect(sanitized?.scene.panoramaAssetId).toBeNull()
    expect(sanitized?.objects[0].assetRefId).toBeUndefined()
  })

  it('applies uploaded imported asset urls to current project and snapshots', () => {
    const project = createDefaultDirectorProject()
    project.importedAssets = [
      {
        id: 'asset-model-1',
        kind: 'model',
        sourceType: 'model',
        fileName: 'chair.glb',
        name: 'chair',
        url: 'data:model/gltf-binary;base64,AAAA',
      },
    ]
    project.directorSnapshots = [
      {
        id: 'snap-1',
        name: '带模型快照',
        capturedAt: 1,
        project: {
          ...createDefaultDirectorProject(),
          importedAssets: [
            {
              id: 'asset-model-1',
              kind: 'model',
              sourceType: 'model',
              fileName: 'chair.glb',
              name: 'chair',
              url: 'data:model/gltf-binary;base64,AAAA',
            },
          ],
        },
        cameraId: 'cam-1',
        camera: {
          fov: 50,
          position: [0, 1.6, 5],
          target: [0, 1, 0],
        },
      },
    ]

    const patched = applyImportedAssetUrlMap(project, new Map([['asset-model-1', 'images/director-assets-panel-1.glb']]))

    expect(patched.importedAssets?.[0].url).toBe('images/director-assets-panel-1.glb')
    expect(patched.directorSnapshots?.[0].project.importedAssets?.[0].url).toBe('images/director-assets-panel-1.glb')
    expect(project.importedAssets?.[0].url).toBe('data:model/gltf-binary;base64,AAAA')
  })

  it('applies uploaded imported asset urls when no snapshots exist', () => {
    const project = createDefaultDirectorProject()
    project.importedAssets = [
      {
        id: 'asset-panorama-1',
        kind: 'panorama',
        sourceType: 'image',
        fileName: 'studio.jpg',
        name: 'studio.jpg',
        url: 'data:image/jpeg;base64,AAAA',
        projectionMode: 'equirectangular',
      },
    ]

    const patched = applyImportedAssetUrlMap(project, new Map([['asset-panorama-1', 'images/director-assets-panel-2.jpg']]))

    expect(patched.importedAssets?.[0].url).toBe('images/director-assets-panel-2.jpg')
    expect(patched.directorSnapshots).toBeUndefined()
  })

  it('preserves camera object targets and clears missing object references', () => {
    const project = createDefaultDirectorProject()
    project.objects.push({
      id: 'target-character-1',
      kind: 'character',
      name: '目标角色',
      refId: null,
      visible: true,
      locked: false,
      color: '#7AA7FF',
      mode: 'mannequin',
      transform: {
        position: [1, 0, -1],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    })
    project.cameras[0].targetMode = 'object'
    project.cameras[0].targetObjectId = 'target-character-1'
    project.cameras[0].target = [1, 1.05, -1]

    const parsed = parseDirectorProject(JSON.parse(serializeDirectorProject(project)))
    expect(parsed?.cameras[0]).toMatchObject({
      targetMode: 'object',
      targetObjectId: 'target-character-1',
      target: [1, 1.05, -1],
    })

    const raw = JSON.parse(serializeDirectorProject(project))
    raw.cameras[0].targetObjectId = 'missing-object'
    const sanitized = parseDirectorProject(raw)
    expect(sanitized?.cameras[0]).toMatchObject({
      targetMode: 'manual',
      targetObjectId: null,
      target: [1, 1.05, -1],
    })
  })

  it('preserves editable scene lighting intensities', () => {
    const project = createDefaultDirectorProject()
    project.scene.ambientLightIntensity = 0.35
    project.scene.directionalLightIntensity = 1.45

    const parsed = parseDirectorProject(JSON.parse(serializeDirectorProject(project)))

    expect(parsed?.scene.ambientLightIntensity).toBe(0.35)
    expect(parsed?.scene.directionalLightIntensity).toBe(1.45)
  })

  it('createDefaultDirectorProject returns 1 camera named 主机位 and empty objects', () => {
    const project = createDefaultDirectorProject()
    expect(project.cameras).toHaveLength(1)
    expect(project.cameras[0].name).toBe('主机位')
    expect(project.objects).toEqual([])
  })
})
