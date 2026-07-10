'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

/**
 * LocationSection - 场景资产区块组件
 * 从 AssetsStage.tsx 提取，负责场景列表的展示和操作
 *
 * V6.5 重构：内部直接订阅 useProjectAssets，消除 props drilling
 * 场景层级 Task 7：macro（大场景）横向 grid 展示，micro（局部场景）按 parent 折叠展开
 */

import { useMemo, useState } from 'react'
import { Location, Prop } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import LocationCard from './LocationCard'
import AddLocationModal from './AddLocationModal'
import { AppIcon } from '@/components/ui/icons'
import { resolveLocationBackedGenerateType } from './location-backed-asset'

interface LocationSectionProps {
    // V6.5 删除：locations prop - 现在内部直接订阅
    projectId: string
    assetType?: 'location' | 'prop'
    activeTaskKeys: Set<string>
    onClearTaskKey: (key: string) => void
    onRegisterTransientTaskKey: (key: string) => void
    // 回调函数
    onAddLocation: () => void
    onDeleteLocation: (locationId: string) => void
    onEditLocation: (location: Location | Prop) => void
    // V6.6 重构：重命名为 handleGenerateImage
    handleGenerateImage: (type: 'character' | 'location' | 'prop', id: string, appearanceId?: string, count?: number) => Promise<void>
    onSelectImage: (locationId: string, imageIndex: number | null) => void
    onConfirmSelection: (locationId: string) => Promise<void> | void
    onRegenerateSingle: (locationId: string, imageIndex: number) => Promise<void>
    onRegenerateGroup: (locationId: string, count?: number) => Promise<void>
    onUndo: (locationId: string) => void
    onImageClick: (imageUrl: string) => void
    onImageEdit: (locationId: string, imageIndex: number, locationName: string) => void
    onCopyFromGlobal: (locationId: string) => void  // 从资产中心复制
    /** 分集筛选：仅显示指定 ID 的场景/道具，null 表示显示全部 */
    filterIds?: Set<string> | null
}

export default function LocationSection({
    projectId,
    assetType = 'location',
    activeTaskKeys,
    onClearTaskKey,
    onRegisterTransientTaskKey,
    onAddLocation,
    onDeleteLocation,
    onEditLocation,
    handleGenerateImage,
    onSelectImage,
    onConfirmSelection,
    onRegenerateSingle,
    onRegenerateGroup,
    onUndo,
    onImageClick,
    onImageEdit,
    onCopyFromGlobal,
    filterIds = null,
}: LocationSectionProps) {
    const t = useTranslations('assets')

    const { data: assets } = useProjectAssets(projectId)
    const allLocations: Array<Location | Prop> = assetType === 'prop'
        ? assets?.props ?? []
        : assets?.locations ?? []
    const locations = filterIds ? allLocations.filter((l) => filterIds.has(l.id)) : allLocations
    const assetKey = assetType === 'prop' ? 'prop' : 'location'
    const generateType = resolveLocationBackedGenerateType(assetType)

    // 子场景添加 modal 的父节点（null = 关闭）
    const [subAddParent, setSubAddParent] = useState<{ id: string; name: string } | null>(null)

    // 分组：macro / micro-by-parent / orphans（仅对 location 生效；prop 保持扁平）
    const { macros, microsByParent, orphans } = useMemo(() => {
        if (assetType === 'prop') {
            return {
                macros: locations,
                microsByParent: new Map<string, Array<Location | Prop>>(),
                orphans: [] as Array<Location | Prop>,
            }
        }
        const macros = locations.filter((l) => l.sceneType !== 'micro')
        const macroIds = new Set(macros.map((m) => m.id))
        const microsByParent = new Map<string, Array<Location | Prop>>()
        const orphans: Array<Location | Prop> = []
        for (const l of locations) {
            if (l.sceneType !== 'micro') continue
            const pid = l.parentId ?? null
            if (pid && macroIds.has(pid)) {
                const arr = microsByParent.get(pid) ?? []
                arr.push(l)
                microsByParent.set(pid, arr)
            } else {
                orphans.push(l)
            }
        }
        return { macros, microsByParent, orphans }
    }, [assetType, locations])

    // 用户手动折叠的 macro id（默认所有有子场景的 macro 展开）。
    // 为什么用 collapsed 集合：数据是异步加载的，初始 mount 时 microsByParent 常为空，
    // 用"默认展开有 children 的 id"填 useState 会因初始化只跑一次而失效。
    const [collapsedMacros, setCollapsedMacros] = useState<Set<string>>(new Set())

    const isExpanded = (macroId: string) => !collapsedMacros.has(macroId)

    const toggleExpanded = (macroId: string) => {
        setCollapsedMacros((prev) => {
            const next = new Set(prev)
            if (next.has(macroId)) next.delete(macroId)
            else next.add(macroId)
            return next
        })
    }

    // 生成 LocationCard props（复用 macro/micro/orphan 三处的回调装配）
    const buildCardProps = (location: Location | Prop) => ({
        location: location as Location,
        assetType,
        onEdit: () => onEditLocation(location),
        onDelete: () => onDeleteLocation(location.id),
        onRegenerate: (count?: number) => {
            const validImages = location.images?.filter((img) => img.imageUrl) || []
            _ulogInfo('[LocationSection] 重新生成判断:', {
                locationName: location.name,
                images: location.images,
                validImages,
                validImageCount: validImages.length,
            })
            if (validImages.length === 1) {
                const imageIndex = validImages[0].imageIndex
                const taskKey = `location-${location.id}-${imageIndex}`
                onRegisterTransientTaskKey(taskKey)
                void onRegenerateSingle(location.id, imageIndex).catch(() => {
                    onClearTaskKey(taskKey)
                })
            } else {
                const taskKey = `location-${location.id}-group`
                onRegisterTransientTaskKey(taskKey)
                void onRegenerateGroup(location.id, count).catch(() => {
                    onClearTaskKey(taskKey)
                })
            }
        },
        onGenerate: (count?: number) => {
            const taskKey = `location-${location.id}-group`
            onRegisterTransientTaskKey(taskKey)
            void handleGenerateImage(generateType, location.id, undefined, count).catch(() => {
                onClearTaskKey(taskKey)
            })
        },
        onUndo: () => onUndo(location.id),
        onImageClick,
        onSelectImage,
        onImageEdit: (locId: string, imgIdx: number) => onImageEdit(locId, imgIdx, location.name),
        onCopyFromGlobal: () => onCopyFromGlobal(location.id),
        activeTaskKeys,
        onClearTaskKey,
        projectId,
        onConfirmSelection,
    })

    const gridClass = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-6 gap-6'
    const childGridClass = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-6 gap-4'

    return (
        <div className="glass-surface p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
                        <AppIcon name="imageLandscape" className="h-5 w-5" />
                    </span>
                    <h3 className="text-lg font-bold text-[var(--glass-text-primary)]">
                        {assetType === 'prop' ? t('stage.propAssets') : t('stage.locationAssets')}
                    </h3>
                    <span className="text-sm text-[var(--glass-text-tertiary)] bg-[var(--glass-bg-muted)]/50 px-2 py-1 rounded-lg">
                        {assetType === 'prop'
                            ? t('stage.propCounts', { count: locations.length })
                            : t('stage.locationCounts', { count: locations.length })}
                    </span>
                </div>
                <button
                    onClick={onAddLocation}
                    className="glass-btn-base glass-btn-primary flex items-center gap-2 px-4 py-2 font-medium"
                >
                    + {t(`${assetKey}.add`)}
                </button>
            </div>

            {/* Prop：保持扁平网格 */}
            {assetType === 'prop' && (
                <div className={gridClass}>
                    {locations.map((location) => (
                        <LocationCard key={location.id} {...buildCardProps(location)} />
                    ))}
                </div>
            )}

            {/* Location：分层展示 */}
            {assetType !== 'prop' && (
                <div className="space-y-6">
                    <div className={gridClass}>
                        {macros.map((macro) => {
                            const children = microsByParent.get(macro.id) ?? []
                            const expanded = isExpanded(macro.id)
                            return (
                                <div key={macro.id} className="flex flex-col gap-2">
                                    <LocationCard {...buildCardProps(macro)} />
                                    <div className="flex items-center justify-between gap-2 text-xs px-1">
                                        {children.length > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => toggleExpanded(macro.id)}
                                                className="text-[var(--glass-tone-info-fg)] hover:underline"
                                                title={expanded ? '收起' : `展开 ${children.length} 个子场景`}
                                            >
                                                {expanded ? '收起' : `展开子场景 (${children.length})`}
                                            </button>
                                        ) : (
                                            <span />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setSubAddParent({ id: macro.id, name: macro.name })}
                                            className="text-[var(--glass-tone-info-fg)] hover:underline"
                                            title={`在「${macro.name}」下添加局部场景`}
                                        >
                                            + 局部场景
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* 展开的子场景 */}
                    {macros
                        .filter((m) => isExpanded(m.id) && (microsByParent.get(m.id)?.length ?? 0) > 0)
                        .map((macro) => (
                            <div
                                key={`children-${macro.id}`}
                                className="pl-4 border-l-2 border-[var(--glass-stroke-base)]/40 ml-2"
                            >
                                <div className="text-xs text-[var(--glass-text-tertiary)] mb-3">
                                    ↳ 「{macro.name}」的局部场景
                                </div>
                                <div className={childGridClass}>
                                    {(microsByParent.get(macro.id) ?? []).map((child) => (
                                        <LocationCard
                                            key={child.id}
                                            {...buildCardProps(child)}
                                            isSubLocation
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}

                    {/* 未归类局部场景（orphans） */}
                    {orphans.length > 0 && (
                        <div className="pl-4 border-l-2 border-[var(--glass-tone-warning-fg)]/40 ml-2">
                            <div className="text-xs text-[var(--glass-tone-warning-fg)] mb-3">
                                未归类局部场景（父场景不存在或未指定）
                            </div>
                            <div className={childGridClass}>
                                {orphans.map((orphan) => (
                                    <div key={orphan.id} className="flex flex-col gap-2">
                                        <LocationCard {...buildCardProps(orphan)} isSubLocation />
                                        <button
                                            type="button"
                                            onClick={() => alert('归入功能即将支持')}
                                            className="text-xs text-[var(--glass-tone-warning-fg)] hover:underline text-left px-1"
                                        >
                                            归入...
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {subAddParent && (
                <AddLocationModal
                    projectId={projectId}
                    parentId={subAddParent.id}
                    parentName={subAddParent.name}
                    onClose={() => setSubAddParent(null)}
                    onSuccess={() => {
                        // 保持父级展开（若用户此前折叠，则新增后为其解除折叠）
                        setCollapsedMacros((prev) => {
                            if (!prev.has(subAddParent.id)) return prev
                            const next = new Set(prev)
                            next.delete(subAddParent.id)
                            return next
                        })
                        setSubAddParent(null)
                    }}
                />
            )}
        </div>
    )
}
