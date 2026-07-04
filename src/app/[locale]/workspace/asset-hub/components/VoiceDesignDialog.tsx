'use client'

import VoiceDesignDialogBase, {
  type VoiceDesignMutationPayload,
  type VoiceDesignMutationResult,
} from '@/components/voice/VoiceDesignDialogBase'
import type {
  CloneEngine,
  CosyVoiceLanguageHint,
  CosyVoiceTargetModel,
  VoiceDesignProvider,
} from '@/components/voice/voice-design-shared'
import { useDesignAssetHubVoice } from '@/lib/query/hooks'

interface VoiceDesignDialogProps {
  isOpen: boolean
  speaker: string
  hasExistingVoice?: boolean
  onClose: () => void
  onSave: (voiceId: string, audioBase64: string | undefined, provider: VoiceDesignProvider) => void
  cloneEngines?: CloneEngine[]
  onOmniClone?: (file: File) => Promise<void>
  onCosyClone?: (params: {
    file: File
    prefix: string
    targetModel: CosyVoiceTargetModel
    languageHint: CosyVoiceLanguageHint
    maxPromptAudioLength: number
    enablePreprocess: boolean
  }) => Promise<{ voiceId: string; audioBase64?: string }>
}

export default function VoiceDesignDialog({
  isOpen,
  speaker,
  hasExistingVoice = false,
  onClose,
  onSave,
  cloneEngines,
  onOmniClone,
  onCosyClone,
}: VoiceDesignDialogProps) {
  const designVoiceMutation = useDesignAssetHubVoice()

  const handleDesignVoice = async (
    payload: VoiceDesignMutationPayload,
  ): Promise<VoiceDesignMutationResult> => {
    return await designVoiceMutation.mutateAsync(payload)
  }

  return (
    <VoiceDesignDialogBase
      isOpen={isOpen}
      speaker={speaker}
      hasExistingVoice={hasExistingVoice}
      onClose={onClose}
      onSave={onSave}
      onDesignVoice={handleDesignVoice}
      cloneEngines={cloneEngines}
      onOmniClone={onOmniClone}
      onCosyClone={onCosyClone}
    />
  )
}
