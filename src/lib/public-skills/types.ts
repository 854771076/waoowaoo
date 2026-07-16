export type PublicSkillRiskLevel = 'low' | 'medium' | 'high'

export type PublicSkillEntrypoint = {
  name: string
  description: string
  requiredInputs: string[]
  optionalInputs: string[]
}

export type PublicSkillFlowStep = {
  state: string
  title: string
  exitCondition: string
  nextActions: string[]
}

export type PublicSkillCliCommand = {
  name: string
  command: string
  purpose: string
  required: boolean
}

export type PublicSkillCliContract = {
  binary: string
  minVersion: string
  requiredGlobalFlags: string[]
  commands: PublicSkillCliCommand[]
  successEnvelope: Record<string, unknown>
  errorEnvelope: Record<string, unknown>
}

export type PublicSkillSchema = {
  name: string
  description: string
  schema: Record<string, unknown>
}

export type PublicSkillExample = {
  userIntent: string
  selectedEntrypoint: string
  expectedFirstActions: string[]
}

export type PublicSkillManifest = {
  id: string
  version: string
  title: string
  description: string
  riskLevel: PublicSkillRiskLevel
  triggers: string[]
  entrypoints: PublicSkillEntrypoint[]
  requiredCli: {
    name: string
    minVersion: string
  }
  requiresConfirmation: string[]
  standardFlow: PublicSkillFlowStep[]
  outputs: string[]
}

export type PublicSkill = {
  manifest: PublicSkillManifest
  systemPrompt: string
  invocationPolicy: {
    maxClarifyingQuestions: number
    defaultingStrategy: string
    confirmationPolicy: string
    sessionPolicy: string
  }
  cliContract: PublicSkillCliContract
  schemas: PublicSkillSchema[]
  examples: PublicSkillExample[]
}

export type PublicSkillSummary = PublicSkillManifest & {
  promptUrl: string
  detailUrl: string
}
