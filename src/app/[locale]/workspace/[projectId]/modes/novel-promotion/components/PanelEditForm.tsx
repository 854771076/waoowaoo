'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import PanelEditFormV2 from '@/components/ui/patterns/PanelEditFormV2'
import { GlassButton, GlassModalShell, GlassSurface } from '@/components/ui/primitives'
import { Character, Location } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import { AppIcon } from '@/components/ui/icons'
import { buildLocationPathName } from '@/lib/assets/location-hierarchy'

interface CharacterAppearance {
  id?: string
  appearanceIndex?: string | number
  changeReason?: string | null
}

export interface PanelEditData {
  id: string
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  location: string | null
  characters: { name: string; appearance: string; slot?: string }[]
  srtStart: number | null
  srtEnd: number | null
  duration: number | null
  videoPrompt: string | null
  photographyRules?: string | null
  actingNotes?: string | null
  sourceText?: string | null
}

interface PanelEditFormProps {
  panelData: PanelEditData
  isSaving?: boolean
  saveStatus?: 'idle' | 'saving' | 'error'
  saveErrorMessage?: string | null
  onRetrySave?: () => void
  onUpdate: (updates: Partial<PanelEditData>) => void
  onOpenCharacterPicker: () => void
  onOpenLocationPicker: () => void
  onRemoveCharacter: (index: number) => void
  onRemoveLocation: () => void
}

export default function PanelEditForm({
  panelData,
  isSaving = false,
  saveStatus = 'idle',
  saveErrorMessage = null,
  onRetrySave,
  onUpdate,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation
}: PanelEditFormProps) {
  return (
    <PanelEditFormV2
      panelData={panelData}
      isSaving={isSaving}
      saveStatus={saveStatus}
      saveErrorMessage={saveErrorMessage}
      onRetrySave={onRetrySave}
      onUpdate={onUpdate}
      onOpenCharacterPicker={onOpenCharacterPicker}
      onOpenLocationPicker={onOpenLocationPicker}
      onRemoveCharacter={onRemoveCharacter}
      onRemoveLocation={onRemoveLocation}
      uiMode="flow"
    />
  )
}

interface CharacterPickerModalProps {
  projectId: string
  currentCharacters: { name: string; appearance: string; slot?: string }[]
  onSelect: (charName: string, appearance: string) => void
  onClose: () => void
}

export function CharacterPickerModal({
  projectId,
  currentCharacters,
  onSelect,
  onClose
}: CharacterPickerModalProps) {
  const ts = useTranslations('storyboard')
  const { data: assets } = useProjectAssets(projectId)
  const characters: Character[] = assets?.characters ?? []

  return (
    <GlassModalShell open onClose={onClose} size="md" title={ts('panel.selectCharacter')}>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto">
        {characters.length === 0 ? (
          <p className="py-8 text-center text-[var(--glass-text-secondary)]">{ts('panel.noCharacterAssets')}</p>
        ) : (
          characters.map(char => {
            const appearances = char.appearances || []
            return (
              <GlassSurface key={char.id} variant="panel" className="space-y-2 p-3">
                <h5 className="text-sm font-medium text-[var(--glass-text-primary)]">{char.name}</h5>
                <div className="flex flex-wrap gap-2">
                  {appearances.map((app: CharacterAppearance) => {
                    const appearanceName = app.changeReason || ts('panel.defaultAppearance')
                    const isSelected = currentCharacters.some(
                      c => c.name === char.name && c.appearance === appearanceName
                    )
                    return (
                      <GlassButton
                        key={app.id || app.appearanceIndex}
                        size="sm"
                        variant={isSelected ? 'secondary' : 'ghost'}
                        disabled={isSelected}
                        onClick={() => {
                          if (!isSelected) onSelect(char.name, appearanceName)
                        }}
                      >
                        {appearanceName}
                        {isSelected && (
                          <AppIcon name="checkTiny" className="h-3 w-3" />
                        )}
                      </GlassButton>
                    )
                  })}
                </div>
              </GlassSurface>
            )
          })
        )}
      </div>
    </GlassModalShell>
  )
}

interface LocationPickerModalProps {
  projectId: string
  currentLocation: string | null
  onSelect: (locationName: string) => void
  onClose: () => void
}

export function LocationPickerModal({
  projectId,
  currentLocation,
  onSelect,
  onClose
}: LocationPickerModalProps) {
  const ts = useTranslations('storyboard')
  const tCommon = useTranslations('common')
  const { data: assets } = useProjectAssets(projectId)
  const locations: Location[] = assets?.locations ?? []
  const [query, setQuery] = useState('')

  const { macros, childrenByParent } = useMemo(() => {
    const macroList: Location[] = []
    const microByParent = new Map<string, Location[]>()
    for (const loc of locations) {
      if (loc.sceneType === 'micro' && loc.parentId) {
        const arr = microByParent.get(loc.parentId) ?? []
        arr.push(loc)
        microByParent.set(loc.parentId, arr)
      } else {
        macroList.push(loc)
      }
    }
    return { macros: macroList, childrenByParent: microByParent }
  }, [locations])

  const needle = query.trim().toLowerCase()
  const matches = (text: string) => text.toLowerCase().includes(needle)

  return (
    <GlassModalShell open onClose={onClose} size="md" title={ts('panel.selectLocation')}>
      <div className="max-h-[60vh] overflow-y-auto space-y-3">
        {locations.length === 0 ? (
          <p className="py-8 text-center text-[var(--glass-text-secondary)]">{ts('panel.noLocationAssets')}</p>
        ) : (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tCommon('search')}
              className="w-full px-3 py-2 rounded-[var(--glass-radius-md)] border border-[var(--glass-stroke-strong)] bg-[var(--glass-bg-surface)] text-sm text-[var(--glass-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--glass-tone-info-fg)]"
            />
            <div className="space-y-1">
              {macros.map((macro) => {
                const children = childrenByParent.get(macro.id) ?? []
                // For search: keep this group if macro name matches, or any child matches (path/name)
                const macroMatch = needle === '' || matches(macro.name)
                const visibleChildren = needle === ''
                  ? children
                  : children.filter((child) => matches(child.name) || matches(buildLocationPathName(child.name, macro.name)))
                if (needle !== '' && !macroMatch && visibleChildren.length === 0) return null

                const macroSelected = currentLocation === macro.name
                return (
                  <div key={macro.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(macro.name)}
                      className={`w-full rounded-[var(--glass-radius-md)] border px-3 py-2 text-left transition-colors flex items-center gap-2 ${
                        macroSelected
                          ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)] border-[var(--glass-stroke-focus)]'
                          : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] border-transparent'
                      }`}
                    >
                      <span aria-hidden>🏞</span>
                      <span className="font-medium text-[var(--glass-text-primary)] flex-1 truncate">{macro.name}</span>
                      {macroSelected && (
                        <span className="text-xs text-[var(--glass-tone-success-fg)]">{ts('panel.selected')}</span>
                      )}
                    </button>

                    {visibleChildren.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {visibleChildren.map((child) => {
                          const path = buildLocationPathName(child.name, macro.name)
                          const childSelected = currentLocation === path
                          return (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => onSelect(path)}
                              className={`w-full pl-6 pr-3 py-1.5 rounded-[var(--glass-radius-md)] border text-left transition-colors flex items-center gap-2 ${
                                childSelected
                                  ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)] border-[var(--glass-stroke-focus)]'
                                  : 'bg-[var(--glass-bg-muted)]/50 text-[var(--glass-text-secondary)] border-transparent'
                              }`}
                            >
                              <span aria-hidden className="text-[var(--glass-text-tertiary)]">↳</span>
                              <span className="text-sm text-[var(--glass-text-primary)] flex-1 truncate">{path}</span>
                              {childSelected && (
                                <span className="text-xs text-[var(--glass-tone-success-fg)]">{ts('panel.selected')}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </GlassModalShell>
  )
}
