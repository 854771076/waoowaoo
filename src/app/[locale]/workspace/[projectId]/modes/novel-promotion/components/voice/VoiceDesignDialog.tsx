'use client'

import VoiceDesignDialogBase, {
  type VoiceDesignMutationPayload,
  type VoiceDesignMutationResult,
} from '@/components/voice/VoiceDesignDialogBase'
import { useDesignProjectVoice } from '@/lib/query/hooks'
import { useRecommendVoiceInstruct } from '@/lib/query/mutations/useVoiceMutations'

interface VoiceDesignDialogProps {
  isOpen: boolean
  speaker: string
  hasExistingVoice?: boolean
  onClose: () => void
  onSave: (voiceId: string, audioBase64: string) => void
  projectId: string
  characterId?: string
}

export default function VoiceDesignDialog({
  isOpen,
  speaker,
  hasExistingVoice = false,
  onClose,
  onSave,
  projectId,
  characterId,
}: VoiceDesignDialogProps) {
  const designVoiceMutation = useDesignProjectVoice(projectId)
  const recommendMutation = useRecommendVoiceInstruct(projectId, characterId ?? '')

  const handleDesignVoice = async (
    payload: VoiceDesignMutationPayload,
  ): Promise<VoiceDesignMutationResult> => {
    return await designVoiceMutation.mutateAsync(payload)
  }

  const handleRecommendInstruct = characterId
    ? async () => {
        const result = await recommendMutation.mutateAsync()
        return { instruct: result.instruct }
      }
    : undefined

  return (
    <VoiceDesignDialogBase
      isOpen={isOpen}
      speaker={speaker}
      hasExistingVoice={hasExistingVoice}
      onClose={onClose}
      onSave={onSave}
      onDesignVoice={handleDesignVoice}
      onRecommendInstruct={handleRecommendInstruct}
    />
  )
}
