'use client'
import { useRef, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useDirectorStore } from '../store/directorStore'
import { GEOMETRY_PRIMITIVE_OPTIONS } from '@/lib/director-desk/schema'
import type { PanoramaProjectionMode } from '@/lib/director-desk/schema'
import { readLocalModelFile } from '../loaders/localModelImport'
import { readPanoramaFile } from '../loaders/panoramaImport'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-white/70">
      <span className="w-24 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </label>
  )
}

export function ScenePanel() {
  const scene = useDirectorStore((s) => s.project.scene)
  const importedAssets = useDirectorStore((s) => s.project.importedAssets ?? [])
  const setSceneField = useDirectorStore((s) => s.setSceneField)
  const addCamera = useDirectorStore((s) => s.addCamera)
  const addObject = useDirectorStore((s) => s.addObject)
  const addGeometryPrimitive = useDirectorStore((s) => s.addGeometryPrimitive)
  const addImportedAsset = useDirectorStore((s) => s.addImportedAsset)
  const setImportedAssetField = useDirectorStore((s) => s.setImportedAssetField)
  const addImportedModelInstance = useDirectorStore((s) => s.addImportedModelInstance)
  const removeImportedAsset = useDirectorStore((s) => s.removeImportedAsset)
  const reset = useDirectorStore((s) => s.reset)
  const modelInputRef = useRef<HTMLInputElement | null>(null)
  const panoramaInputRef = useRef<HTMLInputElement | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const panoramaAsset = scene.panoramaAssetId
    ? importedAssets.find((asset) => asset.id === scene.panoramaAssetId) ?? null
    : null
  const panoramaAssets = importedAssets.filter((asset) => asset.kind === 'panorama')
  const modelAssets = importedAssets.filter((asset) => asset.kind === 'model')

  const handleModelImport = async (file: File) => {
    try {
      setImportError(null)
      const result = await readLocalModelFile(file)
      addImportedAsset({ kind: 'model', ...result })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }

  const handlePanoramaImport = async (file: File) => {
    try {
      setImportError(null)
      const result = await readPanoramaFile(file)
      addImportedAsset({ kind: 'panorama', ...result })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="flex flex-col gap-3 text-xs text-white/80">
      <div className="mb-1 text-sm font-medium">场景设置</div>

      <Row label="背景色">
        <input
          type="color"
          value={scene.backgroundColor}
          onChange={(e) => setSceneField('backgroundColor', e.target.value)}
          className="h-6 w-full cursor-pointer rounded border border-white/10 bg-transparent"
        />
      </Row>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={scene.showGround}
          onChange={(e) => setSceneField('showGround', e.target.checked)}
        />
        <span>显示地面</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={scene.showGrid}
          onChange={(e) => setSceneField('showGrid', e.target.checked)}
        />
        <span>网格</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={scene.showLabels}
          onChange={(e) => setSceneField('showLabels', e.target.checked)}
        />
        <span>名字标签</span>
      </label>

      <Row label="地面透明度">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={scene.groundOpacity}
          onChange={(e) => setSceneField('groundOpacity', Number(e.target.value))}
          className="w-full"
        />
      </Row>
      <Row label="环境光">
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={scene.ambientLightIntensity}
          onChange={(e) => setSceneField('ambientLightIntensity', Number(e.target.value))}
          className="w-full"
        />
      </Row>
      <Row label="主光强度">
        <input
          type="range"
          min={0}
          max={3}
          step={0.05}
          value={scene.directionalLightIntensity}
          onChange={(e) => setSceneField('directionalLightIntensity', Number(e.target.value))}
          className="w-full"
        />
      </Row>
      <Row label="背板透明度">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={scene.backdropOpacity}
          onChange={(e) => setSceneField('backdropOpacity', Number(e.target.value))}
          className="w-full"
        />
      </Row>
      <Row label="背板旋转">
        <input
          type="range"
          min={-Math.PI}
          max={Math.PI}
          step={0.05}
          value={scene.backdropYaw}
          onChange={(e) => setSceneField('backdropYaw', Number(e.target.value))}
          className="w-full"
        />
      </Row>

      <div className="mt-2 border-t border-white/10 pt-3">
        <div className="mb-2 text-sm font-medium">导入资产</div>
        <input
          ref={modelInputRef}
          type="file"
          accept=".fbx,.obj,.glb,.gltf"
          className="hidden"
          onChange={(event) => {
            const input = event.currentTarget
            const file = input.files?.[0]
            if (file) void handleModelImport(file)
            input.value = ''
          }}
        />
        <input
          ref={panoramaInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(event) => {
            const input = event.currentTarget
            const file = input.files?.[0]
            if (file) void handlePanoramaImport(file)
            input.value = ''
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => modelInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
          >
            <AppIcon name="upload" size={13} />
            导入模型
          </button>
          <button
            type="button"
            onClick={() => panoramaInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
          >
            <AppIcon name="imageEdit" size={13} />
            导入全景图
          </button>
        </div>
        {importError && (
          <div className="mt-2 rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">
            {importError}
          </div>
        )}
        {panoramaAssets.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {panoramaAssets.map((asset) => {
              const isActive = asset.id === scene.panoramaAssetId
              return (
                <div key={asset.id} className={`rounded border bg-white/5 p-2 ${isActive ? 'border-sky-400/35' : 'border-white/10'}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-[11px] text-white/70">{asset.fileName}</div>
                    {isActive ? (
                      <>
                        <span className="rounded border border-sky-300/25 bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-100">当前</span>
                        <button
                          type="button"
                          onClick={() => setSceneField('panoramaAssetId', null)}
                          className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/65 hover:bg-white/10"
                        >
                          取消背景
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSceneField('panoramaAssetId', asset.id)}
                        className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/65 hover:bg-white/10"
                      >
                        设为背景
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImportedAsset(asset.id)}
                      className="rounded p-1 text-red-300 hover:bg-red-500/20"
                      aria-label={`移除全景图 ${asset.fileName}`}
                      title="移除全景图"
                    >
                      <AppIcon name="trash" size={13} />
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={asset.fileName} className="h-20 w-full rounded object-cover" />
                </div>
              )
            })}
          </div>
        )}
        {modelAssets.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {modelAssets.map((asset) => (
              <div key={asset.id} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1">
                <AppIcon name="cube" size={13} className="text-white/50" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-white/70">{asset.fileName}</span>
                <button
                  type="button"
                  onClick={() => addImportedModelInstance(asset.id)}
                  className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label={`添加模型 ${asset.fileName} 到场景`}
                  title="添加到场景"
                >
                  <AppIcon name="plus" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => removeImportedAsset(asset.id)}
                  className="rounded p-1 text-red-300 hover:bg-red-500/20"
                  aria-label={`移除模型 ${asset.fileName}`}
                  title="移除模型"
                >
                  <AppIcon name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {panoramaAsset && (
        <div className="mt-2 border-t border-white/10 pt-3">
          <div className="mb-2 text-sm font-medium">全景设置</div>
          <Row label="显示模式">
            <select
              value={panoramaAsset.projectionMode ?? 'equirectangular'}
              onChange={(e) => setImportedAssetField(panoramaAsset.id, 'projectionMode', e.target.value as PanoramaProjectionMode)}
              className="w-full rounded border border-white/10 bg-white/5 px-1.5 py-1 text-xs outline-none focus:border-white/30"
            >
              <option value="equirectangular" className="text-black">全景包围</option>
              <option value="backdrop" className="text-black">球形背板</option>
            </select>
          </Row>
          <Row label="半径">
            <input
              type="range"
              min={20}
              max={160}
              step={1}
              value={scene.panoramaRadius ?? 60}
              onChange={(e) => setSceneField('panoramaRadius', Number(e.target.value))}
              className="w-full"
            />
          </Row>
          <Row label="旋转">
            <input
              type="range"
              min={-Math.PI}
              max={Math.PI}
              step={0.05}
              value={scene.panoramaYaw ?? 0}
              onChange={(e) => setSceneField('panoramaYaw', Number(e.target.value))}
              className="w-full"
            />
          </Row>
        </div>
      )}

      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="mb-2 text-sm font-medium">截图 / 机位</div>
        <div className="mb-2 text-[11px] text-white/50">在左侧选择机位后截图</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => addCamera()}
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
          >
            添加机位
          </button>
          <button
            onClick={() =>
              addObject({
                kind: 'crowd',
                name: '群演',
                crowdCount: [2, 3],
                crowdSpacing: [0.8, 0.8],
                color: '#888888',
                refId: null,
              })
            }
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
          >
            添加群演
          </button>
        </div>
      </div>

      <div className="mt-2 border-t border-white/10 pt-3">
        <div className="mb-2 text-sm font-medium">几何体道具</div>
        <div className="grid grid-cols-2 gap-2">
          {GEOMETRY_PRIMITIVE_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => addGeometryPrimitive(option.type)}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => {
          if (confirm('确定重置为上次保存吗？')) void reset()
        }}
        className="mt-4 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60 hover:bg-white/10"
      >
        重置为上次保存
      </button>
    </div>
  )
}
