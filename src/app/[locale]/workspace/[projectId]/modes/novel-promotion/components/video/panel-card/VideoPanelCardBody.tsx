import React from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import type { VideoPanelRuntime } from './hooks/useVideoPanelActions'
import { toDisplayImageUrl } from '@/lib/media/image-url'

interface VideoPanelCardBodyProps {
  runtime: VideoPanelRuntime
}

export default function VideoPanelCardBody({ runtime }: VideoPanelCardBodyProps) {
  const {
    t,
    tCommon,
    panel,
    panelIndex,
    panelKey,
    layout,
    actions,
    taskStatus,
    videoModel,
    promptEditor,
    voiceManager,
    lipSync,
    videoReference,
    computed,
  } = runtime
  const safeTranslate = (key: string | undefined, fallback = ''): string => {
    if (!key) return fallback
    try {
      return t(key as never)
    } catch {
      return fallback
    }
  }

  const renderCapabilityLabel = (field: {
    field: string
    label: string
    labelKey?: string
    unitKey?: string
  }): string => {
    const labelText = safeTranslate(field.labelKey, safeTranslate(`capability.${field.field}`, field.label))
    const unitText = safeTranslate(field.unitKey)
    return unitText ? `${labelText} (${unitText})` : labelText
  }

  const isFirstLastFrameGenerated = panel.videoGenerationMode === 'firstlastframe' && !!panel.videoUrl
  const showsIncomingLinkBadge = layout.isLastFrame && !!layout.prevPanel
  const showsOutgoingLinkBadge = layout.isLinked && !!layout.nextPanel
  const showsPromptEditor = !layout.isLastFrame || layout.isLinked
  const showsFirstLastFrameActions = layout.isLinked && !!layout.nextPanel
  const isGridVideoPanel = panel.imageLayout === 'grid'
  const selectedDirectorStoryboardBoard = computed.directorStoryboardBoards.find((board) => board.id === computed.directorStoryboardBoardId)
  const generateVideoButtonLabel = taskStatus.isVideoTaskRunning
    ? taskStatus.taskRunningVideoLabel
    : isGridVideoPanel
      ? panel.videoUrl
        ? t('panelCard.regenerateVideo')
        : t('panelCard.generateVideo')
      : panel.videoUrl
        ? t('stage.hasSynced')
        : t('panelCard.generateVideo')
  const referenceKindLabel = (kind: string) => {
    if (kind === 'source') return t('panelCard.videoReference.source')
    if (kind === 'lastFrame') return t('panelCard.videoReference.lastFrame')
    if (kind === 'character') return t('panelCard.videoReference.character')
    if (kind === 'characterSheet') return t('panelCard.videoReference.characterSheet')
    if (kind === 'location') return t('panelCard.videoReference.location')
    return kind
  }
  const resolvedVideoReference = videoReference || {
    choices: [],
    selectedIds: new Set<string>(),
    selectedImages: [],
    includeCharacterSheet: false,
    setIncludeCharacterSheet: () => undefined,
    toggleChoice: () => undefined,
  }
  const showVideoReferenceSelector = resolvedVideoReference.choices.length > 0

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-0.5 bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] rounded font-medium">{panel.textPanel?.shot_type || t('panelCard.unknownShotType')}</span>
        {panel.textPanel?.duration && <span className="text-[var(--glass-text-tertiary)]">{panel.textPanel.duration}{t('promptModal.duration')}</span>}
      </div>

      <p className="text-sm text-[var(--glass-text-secondary)] line-clamp-2">{panel.textPanel?.description}</p>

      <div className="mt-3 pt-3 border-t border-[var(--glass-stroke-base)]">
        {(showsIncomingLinkBadge || showsOutgoingLinkBadge) && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {showsIncomingLinkBadge && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${showsOutgoingLinkBadge
                    ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                    : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)] border border-[var(--glass-stroke-base)]'
                  }`}
              >
                <AppIcon name={showsOutgoingLinkBadge ? 'link' : 'unplug'} className="w-3 h-3" />
                {t('firstLastFrame.asLastFrameFor', { number: panelIndex })}
              </span>
            )}
            {showsOutgoingLinkBadge && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
                <AppIcon name="link" className="w-3 h-3" />
                {t('firstLastFrame.asFirstFrameFor', { number: panelIndex + 2 })}
              </span>
            )}
          </div>
        )}

        {showsPromptEditor && (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-[var(--glass-text-tertiary)]">{t('promptModal.promptLabel')}</span>
              {!promptEditor.isEditing && (
                <button onClick={promptEditor.handleStartEdit} className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-info-fg)] transition-colors p-0.5">
                  <AppIcon name="edit" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {promptEditor.isEditing ? (
              <div className="relative mb-3">
                <textarea
                  value={promptEditor.editingPrompt}
                  onChange={(event) => promptEditor.setEditingPrompt(event.target.value)}
                  autoFocus
                  className="w-full text-xs p-2 pr-16 border border-[var(--glass-stroke-focus)] rounded-lg bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-tone-info-fg)] resize-none"
                  rows={3}
                  placeholder={t('promptModal.placeholder')}
                />
                <div className="absolute right-1 top-1 flex flex-col gap-1">
                  <button onClick={promptEditor.handleSave} disabled={promptEditor.isSavingPrompt} className="px-2 py-1 text-[10px] bg-[var(--glass-accent-from)] text-white rounded">{promptEditor.isSavingPrompt ? '...' : t('panelCard.save')}</button>
                  <button onClick={promptEditor.handleCancelEdit} disabled={promptEditor.isSavingPrompt} className="px-2 py-1 text-[10px] bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] rounded">{t('panelCard.cancel')}</button>
                </div>
              </div>
            ) : (
              <div onClick={promptEditor.handleStartEdit} className="text-xs p-2 border border-[var(--glass-stroke-base)] rounded-lg bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] cursor-pointer">
                {promptEditor.localPrompt || <span className="text-[var(--glass-text-tertiary)] italic">{t('panelCard.clickToEditPrompt')}</span>}
              </div>
            )}

            {showVideoReferenceSelector && (
              <div className="mt-2 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--glass-text-secondary)]">
                    <AppIcon name="image" className="h-3.5 w-3.5" />
                    {t('panelCard.videoReference.title')}
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-[10px] text-[var(--glass-text-tertiary)]">
                    <input
                      type="checkbox"
                      checked={resolvedVideoReference.includeCharacterSheet}
                      onChange={(event) => resolvedVideoReference.setIncludeCharacterSheet(event.target.checked)}
                      className="h-3 w-3"
                    />
                    <span>{t('panelCard.videoReference.characterSheetMode')}</span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {resolvedVideoReference.choices.map((choice) => {
                    const checked = choice.required || resolvedVideoReference.selectedIds.has(choice.id)
                    const displayImageUrl = toDisplayImageUrl(choice.url)
                    return (
                      <label
                        key={choice.id}
                        className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${checked
                            ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                            : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] text-[var(--glass-text-tertiary)]'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={choice.required}
                          onChange={() => resolvedVideoReference.toggleChoice(choice.id)}
                          className="h-3 w-3"
                        />
                        {displayImageUrl && (
                          <MediaImageWithLoading
                            src={displayImageUrl}
                            alt=""
                            containerClassName="h-6 w-6 flex-shrink-0 rounded"
                            className="h-full w-full object-cover"
                            showLoadingIndicator={false}
                          />
                        )}
                        <span className="truncate">
                          {referenceKindLabel(choice.kind)}: {choice.label}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {showsFirstLastFrameActions ? (() => {
              const linkedNextPanel = layout.nextPanel!
              return (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => actions.onGenerateFirstLastFrame(
                      panel.storyboardId,
                      panel.panelIndex,
                      linkedNextPanel.storyboardId,
                      linkedNextPanel.panelIndex,
                      panelKey,
                      {
                        ...layout.flGenerationOptions,
                        ...(typeof panel.textPanel?.duration === 'number' ? { duration: panel.textPanel.duration } : {}),
                      },
                      panel.panelId,
                      resolvedVideoReference.selectedImages,
                    )}
                    disabled={
                      taskStatus.isVideoTaskRunning
                      || !panel.imageUrl
                      || !linkedNextPanel.imageUrl
                      || !layout.flModel
                      || layout.flMissingCapabilityFields.length > 0
                    }
                    className="flex-shrink-0 min-w-[120px] py-2 px-3 text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 bg-[var(--glass-accent-from)] text-white"
                  >
                    {isFirstLastFrameGenerated ? t('firstLastFrame.generated') : taskStatus.isVideoTaskRunning ? taskStatus.taskRunningVideoLabel : t('firstLastFrame.generate')}
                  </button>
                  <div className="flex-1 min-w-0">
                    <ModelCapabilityDropdown
                      compact
                      models={layout.flModelOptions}
                      value={layout.flModel || undefined}
                      onModelChange={actions.onFlModelChange}
                      capabilityFields={layout.flCapabilityFields.map((field) => ({
                        field: field.field,
                        label: field.label,
                        options: field.options,
                        disabledOptions: field.disabledOptions,
                      }))}
                      capabilityOverrides={layout.flGenerationOptions}
                      onCapabilityChange={(field, rawValue) => actions.onFlCapabilityChange(field, rawValue)}
                      placeholder={t('panelCard.selectModel')}
                    />
                  </div>
                </div>
              )
            })() : (
              <>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      actions.onGenerateVideo(
                        panel.storyboardId,
                        panel.panelIndex,
                        videoModel.selectedModel,
                        undefined,
                        {
                          ...videoModel.generationOptions,
                          ...(typeof panel.textPanel?.duration === 'number' ? { duration: panel.textPanel.duration } : {}),
                        },
                        panel.panelId,
                        panel.imageLayout,
                        undefined,
                        isGridVideoPanel ? computed.gridVideoSource : undefined,
                        resolvedVideoReference.selectedImages,
                        computed.gridVideoSource === 'director_storyboard' ? computed.directorStoryboardBoardId : undefined,
                      )}
                    disabled={
                      taskStatus.isVideoTaskRunning
                      || (!panel.imageUrl && computed.gridVideoSource !== 'director_storyboard')
                      || (computed.gridVideoSource === 'director_storyboard' && !computed.directorStoryboardBoardId)
                      || !videoModel.selectedModel
                      || videoModel.missingCapabilityFields.length > 0
                    }
                    className="flex-shrink-0 min-w-[90px] py-2 px-3 text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 bg-[var(--glass-accent-from)] text-white"
                  >
                    {generateVideoButtonLabel}
                  </button>
                  <div className="flex-1 min-w-0">
                    <ModelCapabilityDropdown
                      compact
                      models={videoModel.videoModelOptions}
                      value={videoModel.selectedModel || undefined}
                      onModelChange={(modelKey) => {
                        videoModel.setSelectedModel(modelKey)
                      }}
                      capabilityFields={videoModel.capabilityFields.map((field) => ({
                        field: field.field,
                        label: renderCapabilityLabel(field),
                        options: field.options,
                        disabledOptions: field.disabledOptions,
                      }))}
                      capabilityOverrides={videoModel.generationOptions}
                      onCapabilityChange={(field, rawValue) => videoModel.setCapabilityValue(field, rawValue)}
                      placeholder={t('panelCard.selectModel')}
                    />
                  </div>
                </div>

                {isGridVideoPanel && (
                  <div className="mt-2 space-y-2 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-2 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={actions.onOpenGridSplit}
                        disabled={!panel.panelId || !panel.imageUrl}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--glass-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <AppIcon name="scissors" className="h-3.5 w-3.5" />
                        {t('panelCard.splitGrid')}
                      </button>
                      <span className="text-[10px] text-[var(--glass-text-tertiary)]">
                        {computed.hasGridSplitImages
                          ? t('panelCard.gridSplitReady', { count: panel.gridSplitImages?.length || 0 })
                          : t('panelCard.gridSplitNotReady')}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-0.5">
                      <button
                        type="button"
                        onClick={() => actions.onGridVideoSourceChange('split')}
                        disabled={!computed.hasGridSplitImages}
                        className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${computed.gridVideoSource === 'split'
                            ? 'bg-[var(--glass-accent-from)] text-white'
                            : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
                          }`}
                      >
                        {t('panelCard.useSplitGridVideo')}
                      </button>
                      <button
                        type="button"
                        onClick={() => actions.onGridVideoSourceChange('original')}
                        className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${computed.gridVideoSource === 'original'
                            ? 'bg-[var(--glass-accent-from)] text-white'
                            : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
                          }`}
                      >
                        {t('panelCard.useOriginalGridVideo')}
                      </button>
                      <button
                        type="button"
                        onClick={() => actions.onGridVideoSourceChange('director_storyboard')}
                        disabled={computed.directorStoryboardBoards.length === 0}
                        className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${computed.gridVideoSource === 'director_storyboard'
                            ? 'bg-[var(--glass-accent-from)] text-white'
                            : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
                          }`}
                      >
                        导演台分镜板
                      </button>
                    </div>
                    {computed.gridVideoSource === 'director_storyboard' && (
                      <div className="flex flex-wrap gap-1.5">
                        {computed.directorStoryboardBoards.map((board) => {
                          const displayUrl = toDisplayImageUrl(board.coverImageUrl)
                          return (
                            <button
                              key={board.id}
                              type="button"
                              onClick={() => actions.onDirectorStoryboardBoardChange(board.id)}
                              className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${computed.directorStoryboardBoardId === board.id
                                  ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                                  : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] text-[var(--glass-text-tertiary)]'
                                }`}
                            >
                              {displayUrl ? (
                                <MediaImageWithLoading
                                  src={displayUrl}
                                  alt=""
                                  containerClassName="h-6 w-6 flex-shrink-0 rounded"
                                  className="h-full w-full object-cover"
                                  showLoadingIndicator={false}
                                />
                              ) : null}
                              <span className="truncate">{board.name}</span>
                            </button>
                          )
                        })}
                        {!selectedDirectorStoryboardBoard ? (
                          <span className="text-[10px] text-[var(--glass-text-tertiary)]">请先在导演台生成分镜板</span>
                        ) : null}
                      </div>
                    )}
                    <div className="flex items-start gap-1.5 text-[10px] leading-4 text-[var(--glass-text-tertiary)]">
                      <AppIcon name="info" className="mt-0.5 h-3 w-3 flex-shrink-0" />
                      <span>{t('panelCard.gridSplitVideoHint')}</span>
                    </div>
                  </div>
                )}

                {computed.showLipSyncSection && (
                  <div className="mt-2">
                    <div className="flex gap-2">
                      <button
                        onClick={computed.canLipSync ? lipSync.handleStartLipSync : undefined}
                        disabled={!computed.canLipSync || taskStatus.isLipSyncTaskRunning || lipSync.executingLipSync}
                        className="flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1 bg-[var(--glass-accent-from)] text-white disabled:opacity-50"
                      >
                        {taskStatus.isLipSyncTaskRunning || lipSync.executingLipSync ? (
                          <TaskStatusInline state={taskStatus.lipSyncInlineState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                          <>{t('panelCard.lipSync')}</>
                        )}
                      </button>

                      {(taskStatus.isLipSyncTaskRunning || panel.lipSyncVideoUrl) && voiceManager.hasMatchedAudio && (
                        <button onClick={lipSync.handleStartLipSync} disabled={lipSync.executingLipSync} className="flex-shrink-0 px-3 py-1.5 text-xs rounded-lg bg-[var(--glass-tone-warning-fg)] text-white">
                          {t('panelCard.redo')}
                        </button>
                      )}
                    </div>

                    {voiceManager.audioGenerateError && (
                      <div className="mt-1 p-1.5 bg-[var(--glass-tone-danger-bg)] border border-[var(--glass-stroke-danger)] rounded text-[10px] text-[var(--glass-tone-danger-fg)]">
                        {voiceManager.audioGenerateError}
                      </div>
                    )}

                    {voiceManager.localVoiceLines.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {voiceManager.localVoiceLines.map((voiceLine) => {
                          const isVoiceTaskRunning = voiceManager.isVoiceLineTaskRunning(voiceLine.id)
                          const voiceAudioRunningState = isVoiceTaskRunning
                            ? resolveTaskPresentationState({ phase: 'processing', intent: 'generate', resource: 'audio', hasOutput: !!voiceLine.audioUrl })
                            : null

                          return (
                            <div key={voiceLine.id} className="flex items-start gap-1.5 p-1.5 bg-[var(--glass-bg-muted)] rounded text-[10px]">
                              {voiceLine.audioUrl ? (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    voiceManager.handlePlayVoiceLine(voiceLine)
                                  }}
                                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors bg-[var(--glass-bg-muted)]"
                                  title={voiceManager.playingVoiceLineId === voiceLine.id ? t('panelCard.stopVoice') : t('panelCard.play')}
                                >
                                  <AppIcon name="play" className="w-3 h-3" />
                                </button>
                              ) : (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void voiceManager.handleGenerateAudio(voiceLine)
                                  }}
                                  disabled={isVoiceTaskRunning}
                                  className="flex-shrink-0 px-1.5 py-0.5 bg-[var(--glass-accent-from)] text-white rounded disabled:opacity-50"
                                  title={t('panelCard.generateAudio')}
                                >
                                  {isVoiceTaskRunning ? (
                                    <TaskStatusInline state={voiceAudioRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                  ) : (
                                    tCommon('generate')
                                  )}
                                </button>
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="text-[var(--glass-text-tertiary)]">{voiceLine.speaker}: </span>
                                <span className="text-[var(--glass-text-secondary)]">&ldquo;{voiceLine.content}&rdquo;</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
