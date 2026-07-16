'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { VideoPanelCardShellProps } from '../types'
import type { GridVideoSource, VideoGenerationOptions } from '../../types'
import { EMPTY_RUNNING_VOICE_LINE_IDS } from './shared'
import { usePanelTaskStatus } from './hooks/usePanelTaskStatus'
import { usePanelVideoModel } from './hooks/usePanelVideoModel'
import { usePanelPlayer } from './hooks/usePanelPlayer'
import { usePanelPromptEditor } from './hooks/usePanelPromptEditor'
import { usePanelVoiceManager } from './hooks/usePanelVoiceManager'
import { usePanelLipSync } from './hooks/usePanelLipSync'
import {
  buildVideoReferenceImageChoices,
  getDefaultSelectedVideoReferenceImageIds,
  MAX_VIDEO_REFERENCE_IMAGES,
  resolveSelectedVideoReferenceImages,
} from '@/lib/novel-promotion/video-reference-images'

export function useVideoPanelActions({
  panel,
  panelIndex,
  defaultVideoModel,
  capabilityOverrides,
  videoRatio = '16:9',
  userVideoModels,
  characters = [],
  locations = [],
  projectId,
  episodeId,
  runningVoiceLineIds = EMPTY_RUNNING_VOICE_LINE_IDS,
  matchedVoiceLines = [],
  onLipSync,
  showLipSyncVideo,
  onToggleLipSyncVideo,
  isLinked,
  isLastFrame,
  nextPanel,
  prevPanel,
  hasNext,
  flModel,
  flModelOptions,
  flGenerationOptions,
  flCapabilityFields,
  flMissingCapabilityFields,
  flCustomPrompt,
  defaultFlPrompt,
  localPrompt,
  isSavingPrompt,
  onUpdateLocalPrompt,
  onSavePrompt,
  onGenerateVideo,
  onUpdatePanelVideoModel,
  onToggleLink,
  onFlModelChange,
  onFlCapabilityChange,
  onFlCustomPromptChange,
  onResetFlPrompt,
  onGenerateFirstLastFrame,
  onPreviewImage,
  onOpenGridSplit,
}: VideoPanelCardShellProps) {
  const t = useTranslations('video')
  const tCommon = useTranslations('common')
  const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
  const hasGridSplitImages = panel.imageLayout === 'grid' && (panel.gridSplitImages?.length || 0) > 0
  const directorStoryboardBoards = useMemo(
    () => panel.directorStoryboardBoards ?? [],
    [panel.directorStoryboardBoards],
  )
  const [gridVideoSourceState, setGridVideoSourceState] = useState<{ value: GridVideoSource; touched: boolean }>({
    value: hasGridSplitImages ? 'split' : 'original',
    touched: false,
  })
  const [directorStoryboardBoardId, setDirectorStoryboardBoardId] = useState<string>(directorStoryboardBoards[0]?.id || '')
  const generatedDuration = typeof panel.textPanel?.duration === 'number'
    && Number.isFinite(panel.textPanel.duration)
    && panel.textPanel.duration > 0
    ? Math.round(panel.textPanel.duration)
    : null
  const generatedDurationText = generatedDuration ? String(generatedDuration) : ''
  const durationPanelKey = `${panel.panelId || panel.storyboardId}-${panel.panelIndex}`
  const [durationState, setDurationState] = useState({
    panelKey: durationPanelKey,
    text: generatedDurationText,
    touched: false,
  })

  useEffect(() => {
    if (!hasGridSplitImages || gridVideoSourceState.touched) return
    setGridVideoSourceState({ value: 'split', touched: false })
  }, [gridVideoSourceState.touched, hasGridSplitImages])

  useEffect(() => {
    if (directorStoryboardBoards.length === 0) {
      setDirectorStoryboardBoardId('')
      return
    }
    setDirectorStoryboardBoardId((previous) =>
      directorStoryboardBoards.some((board) => board.id === previous)
        ? previous
        : directorStoryboardBoards[0].id,
    )
  }, [directorStoryboardBoards, gridVideoSourceState.value, hasGridSplitImages])

  useEffect(() => {
    setDurationState((previous) => {
      if (previous.panelKey !== durationPanelKey) {
        return { panelKey: durationPanelKey, text: generatedDurationText, touched: false }
      }
      if (!previous.touched && previous.text !== generatedDurationText) {
        return { ...previous, text: generatedDurationText }
      }
      return previous
    })
  }, [durationPanelKey, generatedDurationText])

  const isFirstLastFrameOutput = panel.videoGenerationMode === 'firstlastframe' && !!panel.videoUrl
  const [includeCharacterSheet, setIncludeCharacterSheet] = useState(false)
  const referenceChoices = useMemo(() => buildVideoReferenceImageChoices({
    panel,
    nextPanel,
    characters,
    locations,
    includeLastFrame: isLinked && !!nextPanel?.imageUrl,
    includeCharacterSheet,
    directorStoryboardBoardId,
    gridVideoSource: gridVideoSourceState.value,
  }), [characters, directorStoryboardBoardId, gridVideoSourceState.value, includeCharacterSheet, isLinked, locations, nextPanel, panel])
  const defaultReferenceIds = useMemo(
    () => getDefaultSelectedVideoReferenceImageIds(referenceChoices),
    [referenceChoices],
  )
  const [manualReferenceIds, setManualReferenceIds] = useState<Set<string> | null>(null)
  const selectedReferenceIds = manualReferenceIds ?? defaultReferenceIds

  useEffect(() => {
    setManualReferenceIds((previous) => {
      if (!previous) return previous
      const next = new Set<string>()
      for (const choice of referenceChoices) {
        if (choice.required || previous.has(choice.id)) next.add(choice.id)
      }
      if (next.size === previous.size && [...next].every((id) => previous.has(id))) return previous
      return next
    })
  }, [referenceChoices])

  const selectedReferenceImages = useMemo(
    () => resolveSelectedVideoReferenceImages(referenceChoices, selectedReferenceIds),
    [referenceChoices, selectedReferenceIds],
  )

  const toggleReferenceChoice = (choiceId: string) => {
    setManualReferenceIds((previous) => {
      const next = new Set(previous ?? defaultReferenceIds)
      const choice = referenceChoices.find((item) => item.id === choiceId)
      if (!choice || choice.required) return next
      if (next.has(choiceId)) next.delete(choiceId)
      else if (next.size < MAX_VIDEO_REFERENCE_IMAGES) next.add(choiceId)
      for (const requiredChoice of referenceChoices) {
        if (requiredChoice.required) next.add(requiredChoice.id)
      }
      return next
    })
  }

  const setCharacterSheetSelected = (selected: boolean) => {
    setIncludeCharacterSheet(selected)
    setManualReferenceIds((previous) => {
      const next = new Set(previous ?? defaultReferenceIds)
      for (const choice of referenceChoices) {
        if (choice.required) {
          next.add(choice.id)
          continue
        }
        if (choice.kind !== 'characterSheet') continue
        if (selected && next.size < MAX_VIDEO_REFERENCE_IMAGES) next.add(choice.id)
        else next.delete(choice.id)
      }
      return next
    })
  }

  const visibleBaseVideoUrl = (() => {
    if (isLinked) return isFirstLastFrameOutput ? panel.videoUrl : undefined
    if (isLastFrame) return undefined
    return panel.videoUrl
  })()
  const hasVisibleBaseVideo = !!visibleBaseVideoUrl

  const taskStatus = usePanelTaskStatus({
    panel,
    hasVisibleBaseVideo,
    tCommon: (key: string) => tCommon(key as never),
  })

  const videoModel = usePanelVideoModel({
    defaultVideoModel,
    capabilityOverrides,
    userVideoModels,
  })

  const player = usePanelPlayer({
    videoRatio,
    imageUrl: panel.imageUrl,
    videoUrl: visibleBaseVideoUrl,
    lipSyncVideoUrl: panel.lipSyncVideoUrl,
    showLipSyncVideo,
    onPreviewImage,
  })

  const promptEditor = usePanelPromptEditor({
    localPrompt,
    onUpdateLocalPrompt,
    onSavePrompt,
  })

  const voiceManager = usePanelVoiceManager({
    projectId,
    episodeId,
    matchedVoiceLines,
    runningVoiceLineIds,
    audioFailedMessage: t('panelCard.error.audioFailed'),
  })

  const lipSync = usePanelLipSync({
    panel,
    matchedVoiceLines,
    onLipSync,
  })

  const showLipSyncSection = voiceManager.hasMatchedVoiceLines
  const canLipSync = hasVisibleBaseVideo && voiceManager.hasMatchedAudio && !taskStatus.isLipSyncTaskRunning
  const parsedDuration = Number(durationState.text.trim())
  const effectiveDuration = durationState.text.trim() && Number.isFinite(parsedDuration) && parsedDuration > 0
    ? Math.round(parsedDuration)
    : generatedDuration
  const withDuration = (options: VideoGenerationOptions = {}): VideoGenerationOptions => ({
    ...options,
    ...(effectiveDuration ? { duration: effectiveDuration } : {}),
  })

  return {
    t,
    tCommon,
    panel,
    panelIndex,
    panelKey,
    media: {
      showLipSyncVideo,
      onToggleLipSyncVideo,
      onPreviewImage,
      baseVideoUrl: visibleBaseVideoUrl,
      currentVideoUrl: player.currentVideoUrl,
    },
    taskStatus,
    videoModel,
    player,
    promptEditor: {
      ...promptEditor,
      localPrompt,
      isSavingPrompt,
    },
    voiceManager,
    lipSync,
    duration: {
      generatedDuration,
      durationText: durationState.text,
      setDurationText: (text: string) => setDurationState((previous) => ({
        ...previous,
        text,
        touched: true,
      })),
      effectiveDuration,
      withDuration,
    },
    videoReference: {
      choices: referenceChoices,
      selectedIds: selectedReferenceIds,
      selectedImages: selectedReferenceImages,
      maxSelectedCount: MAX_VIDEO_REFERENCE_IMAGES,
      includeCharacterSheet,
      setIncludeCharacterSheet: setCharacterSheetSelected,
      toggleChoice: toggleReferenceChoice,
    },
    layout: {
      isLinked,
      isLastFrame,
      nextPanel,
      prevPanel,
      hasNext,
      flModel,
      flModelOptions,
      flGenerationOptions,
      flCapabilityFields,
      flMissingCapabilityFields,
      flCustomPrompt,
      defaultFlPrompt,
      videoRatio,
    },
    actions: {
      onGenerateVideo,
      onUpdatePanelVideoModel,
      onToggleLink,
      onFlModelChange,
      onFlCapabilityChange,
      onFlCustomPromptChange,
      onResetFlPrompt,
      onGenerateFirstLastFrame,
      onOpenGridSplit,
      onGridVideoSourceChange: (value: GridVideoSource) => setGridVideoSourceState({ value, touched: true }),
      onDirectorStoryboardBoardChange: setDirectorStoryboardBoardId,
    },
    computed: {
      showLipSyncSection,
      canLipSync,
      hasVisibleBaseVideo,
      gridVideoSource: gridVideoSourceState.value,
      hasGridSplitImages,
      directorStoryboardBoards,
      directorStoryboardBoardId,
    },
  }
}

export type VideoPanelRuntime = ReturnType<typeof useVideoPanelActions>
