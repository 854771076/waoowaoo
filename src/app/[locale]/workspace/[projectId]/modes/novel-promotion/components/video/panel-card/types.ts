import type { GridVideoSource, VideoPanel, MatchedVoiceLine, VideoModelOption, FirstLastFrameParams, VideoGenerationOptions } from '../types'
import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'
import type { Character, Location } from '@/types/project'

export interface VideoPanelCardShellProps {
  panel: VideoPanel
  panelIndex: number
  defaultVideoModel: string
  capabilityOverrides: CapabilitySelections
  videoRatio?: string
  userVideoModels?: VideoModelOption[]
  characters?: Character[]
  locations?: Location[]
  projectId: string
  episodeId?: string
  runningVoiceLineIds?: Set<string>
  matchedVoiceLines?: MatchedVoiceLine[]
  onLipSync?: (storyboardId: string, panelIndex: number, voiceLineId: string, panelId?: string) => Promise<void>
  showLipSyncVideo: boolean
  onToggleLipSyncVideo: (panelKey: string, value: boolean) => void
  isLinked: boolean
  isLastFrame: boolean
  nextPanel: VideoPanel | null
  prevPanel: VideoPanel | null
  hasNext: boolean
  flModel: string
  flModelOptions: VideoModelOption[]
  flGenerationOptions: VideoGenerationOptions
  flCapabilityFields: Array<{
    field: string
    label: string
    options: CapabilityValue[]
    disabledOptions?: CapabilityValue[]
    value: CapabilityValue | undefined
  }>
  flMissingCapabilityFields: string[]
  flCustomPrompt: string
  defaultFlPrompt: string
  localPrompt: string
  isSavingPrompt: boolean
  onUpdateLocalPrompt: (value: string) => void
  onSavePrompt: (value: string) => Promise<void>
  onGenerateVideo: (
    storyboardId: string,
    panelIndex: number,
    videoModel?: string,
    firstLastFrame?: FirstLastFrameParams,
    generationOptions?: VideoGenerationOptions,
    panelId?: string,
    imageLayout?: 'single' | 'grid',
    gridSize?: number,
    gridVideoSource?: GridVideoSource,
    videoReferenceImages?: string[],
    directorStoryboardBoardId?: string,
  ) => void
  onUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => void
  onToggleLink: (panelKey: string, storyboardId: string, panelIndex: number) => void
  onFlModelChange: (model: string) => void
  onFlCapabilityChange: (field: string, rawValue: string) => void
  onFlCustomPromptChange: (panelKey: string, value: string) => void
  onResetFlPrompt: (panelKey: string) => void
  onGenerateFirstLastFrame: (
    firstStoryboardId: string,
    firstPanelIndex: number,
    lastStoryboardId: string,
    lastPanelIndex: number,
    panelKey: string,
    generationOptions?: VideoGenerationOptions,
    firstPanelId?: string,
    videoReferenceImages?: string[],
  ) => void
  onPreviewImage?: (imageUrl: string) => void
  onOpenGridSplit?: () => void
}
