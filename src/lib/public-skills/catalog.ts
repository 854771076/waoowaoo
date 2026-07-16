import type { PublicSkill, PublicSkillSummary } from './types'

const STANDARD_CREATION_FLOW = [
  {
    state: 'intent_collected',
    title: '识别用户目标',
    exitCondition: '已归类到模板创作、素材处理、调试或发布之一',
    nextActions: ['requirements_confirmed'],
  },
  {
    state: 'requirements_confirmed',
    title: '补齐关键需求',
    exitCondition: '缺失信息不超过可默认字段，费用和发布风险已识别',
    nextActions: ['context_checked'],
  },
  {
    state: 'context_checked',
    title: '检查 CLI 和登录上下文',
    exitCondition: 'platform version、whoami、project current 均返回 ok=true',
    nextActions: ['draft_generated'],
  },
  {
    state: 'draft_generated',
    title: '生成草稿配置',
    exitCondition: '本地草稿文件存在并满足 schema 结构',
    nextActions: ['validated', 'requirements_confirmed'],
  },
  {
    state: 'validated',
    title: '校验和 dry-run',
    exitCondition: 'validate 和 dry-run 均通过',
    nextActions: ['executed', 'draft_generated'],
  },
  {
    state: 'executed',
    title: '执行并轮询结果',
    exitCondition: '运行完成、失败可诊断或用户取消',
    nextActions: ['reviewed', 'debugged'],
  },
  {
    state: 'reviewed',
    title: '复盘结果',
    exitCondition: '用户确认继续迭代、保存或发布',
    nextActions: ['published', 'draft_generated'],
  },
]

const workflowSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    templateId: { type: 'string', minLength: 1 },
    inputs: { type: 'object' },
    defaults: { type: 'object' },
    risk: {
      type: 'object',
      properties: {
        chargeable: { type: 'boolean' },
        publishTarget: { type: ['string', 'null'] },
      },
    },
  },
  required: ['name', 'templateId', 'inputs'],
}

const sessionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    skillId: { type: 'string' },
    userIntent: { type: 'string' },
    state: { type: 'string' },
    commands: {
      type: 'array',
      items: { type: 'string' },
    },
    generatedFiles: {
      type: 'array',
      items: { type: 'string' },
    },
    nextActions: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['skillId', 'userIntent', 'state', 'commands', 'generatedFiles'],
}

const baseSuccessEnvelope = {
  ok: true,
  data: {},
  next: {},
}

const baseErrorEnvelope = {
  ok: false,
  code: 'MACHINE_READABLE_ERROR_CODE',
  message: 'human readable summary',
  recoverable: true,
  suggestion: {
    askUser: 'optional question',
    command: 'optional recovery command',
  },
}

export const PUBLIC_SKILLS: PublicSkill[] = [
  {
    manifest: {
      id: 'platform-agent',
      version: '1.0.0',
      title: '平台 Skill 路由器',
      description: '根据用户自然语言目标选择具体平台 Skill，并维护标准创作状态机。',
      riskLevel: 'low',
      triggers: ['我要创作', '创建应用', '生成工作流', '使用平台能力', '不知道用哪个 skill'],
      entrypoints: [
        {
          name: 'route_intent',
          description: '把用户目标映射到具体 Skill、模板和下一步问题。',
          requiredInputs: ['user_intent'],
          optionalInputs: ['current_session_id', 'project_hint'],
        },
      ],
      requiredCli: { name: 'platform', minVersion: '0.5.0' },
      requiresConfirmation: ['handoff_high_risk_operation'],
      standardFlow: STANDARD_CREATION_FLOW.slice(0, 3),
      outputs: ['recommendedSkillId', 'recommendedEntrypoint', 'missingInputs', 'nextQuestions'],
    },
    systemPrompt: [
      '你是平台 Skill 路由器，负责把用户自然语言目标稳定映射到一个具体 Skill。',
      '先识别目标类型：工作流创作、素材处理、失败诊断、发布上线或泛化咨询。',
      '最多一次询问 3 个关键问题；名称、描述、标签、比例、质量等非关键字段优先使用平台默认值。',
      '不要调用业务 API；只通过 platform CLI 或本 Skill 返回的下一步动作推进。',
      '遇到删除、发布、扣费运行、覆盖线上配置等动作，必须要求用户明确确认。',
    ].join('\n'),
    invocationPolicy: {
      maxClarifyingQuestions: 3,
      defaultingStrategy: '非关键字段使用平台模板默认值，先生成草稿再迭代。',
      confirmationPolicy: '高风险动作只输出待确认计划，不自动执行。',
      sessionPolicy: '每次路由结果都写入 .platform-sessions，便于继续、回滚和审计。',
    },
    cliContract: {
      binary: 'platform',
      minVersion: '0.5.0',
      requiredGlobalFlags: ['--json', '--non-interactive'],
      commands: [
        {
          name: 'plan',
          command: 'platform create plan --intent "<user intent>" --json',
          purpose: '让平台返回推荐 Skill、模板、缺失输入和下一步问题。',
          required: true,
        },
        {
          name: 'whoami',
          command: 'platform whoami --json',
          purpose: '确认 CLI 已登录，并获取用户和组织上下文。',
          required: false,
        },
      ],
      successEnvelope: baseSuccessEnvelope,
      errorEnvelope: baseErrorEnvelope,
    },
    schemas: [
      {
        name: 'route-result',
        description: 'Skill 路由结果。',
        schema: {
          type: 'object',
          properties: {
            recommendedSkillId: { type: 'string' },
            recommendedEntrypoint: { type: 'string' },
            missingInputs: { type: 'array', items: { type: 'string' } },
            nextQuestions: { type: 'array', maxItems: 3, items: { type: 'string' } },
          },
          required: ['recommendedSkillId', 'recommendedEntrypoint', 'missingInputs', 'nextQuestions'],
        },
      },
      { name: 'session', description: '本地创作会话记录。', schema: sessionSchema },
    ],
    examples: [
      {
        userIntent: '帮我做一个电商商品图生成流程',
        selectedEntrypoint: 'route_intent',
        expectedFirstActions: [
          'platform create plan --intent "帮我做一个电商商品图生成流程" --json',
          '如果缺少商品图，询问用户提供文件或 URL',
        ],
      },
    ],
  },
  {
    manifest: {
      id: 'platform-workflow-creator',
      version: '1.0.0',
      title: '平台工作流创作',
      description: '从用户目标生成、校验、试运行和迭代平台工作流。',
      riskLevel: 'medium',
      triggers: ['创建工作流', '工作流', '生成应用', '搭建流程', '创建模板', '运行任务'],
      entrypoints: [
        {
          name: 'create_workflow',
          description: '从需求选择模板并生成可运行 workflow.json。',
          requiredInputs: ['user_intent'],
          optionalInputs: ['template_id', 'input_assets', 'style', 'aspect_ratio'],
        },
        {
          name: 'iterate_workflow',
          description: '基于已有 workflow.json 或 session 继续修改。',
          requiredInputs: ['workflow_file_or_session_id', 'change_request'],
          optionalInputs: ['run_after_validate'],
        },
      ],
      requiredCli: { name: 'platform', minVersion: '0.5.0' },
      requiresConfirmation: ['chargeable_run', 'publish', 'overwrite_existing_workflow'],
      standardFlow: STANDARD_CREATION_FLOW,
      outputs: ['workflow.json', 'input.sample.json', 'validationResult', 'runId', 'artifactUrls'],
    },
    systemPrompt: [
      '你是平台工作流创作 Skill，目标是把用户意图变成可校验、可 dry-run、可运行的平台 workflow.json。',
      '优先通过 platform template list/get/explain 选择平台模板，不要从零猜测不存在的节点。',
      '缺少输入素材、计费确认或发布目标时必须停下来询问；其他字段可使用模板默认值。',
      '固定流程：检查 CLI -> 获取模板 -> 生成草稿 -> validate -> dry-run -> 用户确认 -> run -> status/logs -> 总结产物。',
      '所有 CLI 调用必须使用 --json；错误只根据 code、field、recoverable、suggestion 做恢复。',
      '每次生成或执行都维护 .platform-sessions/<timestamp>-create-workflow.json。',
    ].join('\n'),
    invocationPolicy: {
      maxClarifyingQuestions: 3,
      defaultingStrategy: '优先使用模板 defaultValues；没有模板默认值时选择 lowest-risk standard 配置。',
      confirmationPolicy: 'chargeable_run、publish、overwrite_existing_workflow 必须先给计划再等用户确认。',
      sessionPolicy: '记录用户意图、模板、生成文件、命令、runId、结果链接和下一步动作。',
    },
    cliContract: {
      binary: 'platform',
      minVersion: '0.5.0',
      requiredGlobalFlags: ['--json', '--non-interactive'],
      commands: [
        { name: 'version', command: 'platform version --json', purpose: '检查 CLI 版本。', required: true },
        { name: 'whoami', command: 'platform whoami --json', purpose: '检查登录状态。', required: true },
        { name: 'current-project', command: 'platform project current --json', purpose: '获取当前项目上下文。', required: true },
        { name: 'plan', command: 'platform create plan --intent "<user intent>" --json', purpose: '获取推荐模板和缺失输入。', required: true },
        { name: 'template-get', command: 'platform template get --id <template-id> --json', purpose: '读取模板 schema 和默认值。', required: true },
        { name: 'workflow-validate', command: 'platform workflow validate --file workflow.json --json', purpose: '校验草稿。', required: true },
        { name: 'workflow-dry-run', command: 'platform workflow run --file workflow.json --input input.sample.json --dry-run --json', purpose: '验证可执行性和费用风险。', required: true },
        { name: 'workflow-run', command: 'platform workflow run --file workflow.json --input input.sample.json --json', purpose: '用户确认后执行。', required: false },
        { name: 'run-status', command: 'platform workflow status --run-id <run-id> --json', purpose: '轮询运行状态。', required: false },
        { name: 'run-logs', command: 'platform workflow logs --run-id <run-id> --json', purpose: '失败时读取日志。', required: false },
      ],
      successEnvelope: baseSuccessEnvelope,
      errorEnvelope: baseErrorEnvelope,
    },
    schemas: [
      { name: 'workflow', description: '工作流草稿配置。', schema: workflowSchema },
      { name: 'session', description: '本地创作会话记录。', schema: sessionSchema },
    ],
    examples: [
      {
        userIntent: '创建一个商品白底图批量生成工作流',
        selectedEntrypoint: 'create_workflow',
        expectedFirstActions: [
          'platform version --json',
          'platform create plan --intent "创建一个商品白底图批量生成工作流" --json',
          'platform template get --id <recommended-template> --json',
        ],
      },
    ],
  },
  {
    manifest: {
      id: 'platform-asset-pipeline',
      version: '1.0.0',
      title: '平台素材管线',
      description: '上传、归档、引用和校验创作素材，给工作流提供稳定输入。',
      riskLevel: 'low',
      triggers: ['上传素材', '整理素材', '商品图', '图片 URL', '素材库'],
      entrypoints: [
        {
          name: 'prepare_assets',
          description: '把本地文件或 URL 上传为平台素材并生成输入引用。',
          requiredInputs: ['asset_source'],
          optionalInputs: ['project_id', 'labels', 'usage'],
        },
      ],
      requiredCli: { name: 'platform', minVersion: '0.5.0' },
      requiresConfirmation: ['delete_asset', 'overwrite_asset_label'],
      standardFlow: STANDARD_CREATION_FLOW.slice(0, 5),
      outputs: ['assetIds', 'assetUrls', 'input.patch.json'],
    },
    systemPrompt: [
      '你是平台素材管线 Skill，负责把本地文件、URL 或素材库对象转换为工作流可引用输入。',
      '优先使用 platform asset upload/import/list/get，不直接猜测存储 URL。',
      '当用户没有提供素材时，只询问素材文件或 URL；不要追问非必要标签。',
      '删除素材、覆盖标签或替换工作流输入前必须确认。',
    ].join('\n'),
    invocationPolicy: {
      maxClarifyingQuestions: 2,
      defaultingStrategy: '未提供 labels 时自动使用 intent、日期和素材类型。',
      confirmationPolicy: 'delete_asset 与 overwrite_asset_label 必须确认。',
      sessionPolicy: '记录素材来源、assetId、引用方式和可复用 input.patch.json。',
    },
    cliContract: {
      binary: 'platform',
      minVersion: '0.5.0',
      requiredGlobalFlags: ['--json', '--non-interactive'],
      commands: [
        { name: 'asset-upload', command: 'platform asset upload --file <path> --json', purpose: '上传本地素材。', required: false },
        { name: 'asset-import', command: 'platform asset import --url <url> --json', purpose: '导入远程素材。', required: false },
        { name: 'asset-get', command: 'platform asset get --id <asset-id> --json', purpose: '确认素材状态和引用 URL。', required: true },
      ],
      successEnvelope: baseSuccessEnvelope,
      errorEnvelope: baseErrorEnvelope,
    },
    schemas: [
      {
        name: 'asset-input',
        description: '素材输入引用。',
        schema: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            assetId: { type: 'string' },
            usage: { type: 'string' },
          },
          required: ['source'],
        },
      },
      { name: 'session', description: '本地创作会话记录。', schema: sessionSchema },
    ],
    examples: [
      {
        userIntent: '把 ./product.png 作为商品主图上传给刚才的工作流',
        selectedEntrypoint: 'prepare_assets',
        expectedFirstActions: ['platform asset upload --file ./product.png --json', '写入 input.patch.json'],
      },
    ],
  },
  {
    manifest: {
      id: 'platform-debugger',
      version: '1.0.0',
      title: '平台运行诊断',
      description: '诊断工作流校验、运行、日志和产物失败原因，并给出可恢复动作。',
      riskLevel: 'low',
      triggers: ['失败了', '诊断任务', '查看日志', '为什么没有结果', 'debug run'],
      entrypoints: [
        {
          name: 'debug_run',
          description: '读取 run 状态、日志、输入和错误建议。',
          requiredInputs: ['run_id_or_session_id'],
          optionalInputs: ['workflow_file'],
        },
      ],
      requiredCli: { name: 'platform', minVersion: '0.5.0' },
      requiresConfirmation: ['retry_chargeable_run', 'cancel_run'],
      standardFlow: [
        {
          state: 'target_identified',
          title: '定位失败对象',
          exitCondition: '已获得 runId、sessionId 或 workflow 文件',
          nextActions: ['evidence_collected'],
        },
        {
          state: 'evidence_collected',
          title: '收集状态和日志',
          exitCondition: 'status、logs、diagnose 至少两项可用',
          nextActions: ['fix_suggested'],
        },
        {
          state: 'fix_suggested',
          title: '给出修复或重试方案',
          exitCondition: '已区分用户输入问题、平台配置问题、额度问题或服务故障',
          nextActions: ['retry_planned'],
        },
      ],
      outputs: ['diagnosis', 'rootCause', 'recoveryCommands', 'userQuestions'],
    },
    systemPrompt: [
      '你是平台运行诊断 Skill，只基于 CLI 返回的结构化状态、日志和 diagnose 结果判断。',
      '不要盲目重试；先区分输入缺失、schema 错误、鉴权过期、额度不足、服务超时和平台故障。',
      '会产生费用的 retry 必须确认；不可恢复错误要停止并说明证据。',
    ].join('\n'),
    invocationPolicy: {
      maxClarifyingQuestions: 2,
      defaultingStrategy: '优先读取最近 session 的 runId；没有 runId 时询问用户。',
      confirmationPolicy: 'retry_chargeable_run 与 cancel_run 必须确认。',
      sessionPolicy: '把诊断证据、错误 code、日志摘要和恢复命令追加到原 session。',
    },
    cliContract: {
      binary: 'platform',
      minVersion: '0.5.0',
      requiredGlobalFlags: ['--json', '--non-interactive'],
      commands: [
        { name: 'status', command: 'platform workflow status --run-id <run-id> --json', purpose: '获取运行状态。', required: true },
        { name: 'logs', command: 'platform workflow logs --run-id <run-id> --json', purpose: '读取日志。', required: true },
        { name: 'diagnose', command: 'platform diagnose run --run-id <run-id> --json', purpose: '获取平台诊断。', required: false },
      ],
      successEnvelope: baseSuccessEnvelope,
      errorEnvelope: baseErrorEnvelope,
    },
    schemas: [
      {
        name: 'diagnosis',
        description: '诊断输出。',
        schema: {
          type: 'object',
          properties: {
            rootCause: { type: 'string' },
            recoverable: { type: 'boolean' },
            recoveryCommands: { type: 'array', items: { type: 'string' } },
          },
          required: ['rootCause', 'recoverable', 'recoveryCommands'],
        },
      },
      { name: 'session', description: '本地创作会话记录。', schema: sessionSchema },
    ],
    examples: [
      {
        userIntent: '刚才那个 run_123 为什么失败',
        selectedEntrypoint: 'debug_run',
        expectedFirstActions: ['platform workflow status --run-id run_123 --json', 'platform workflow logs --run-id run_123 --json'],
      },
    ],
  },
  {
    manifest: {
      id: 'platform-publisher',
      version: '1.0.0',
      title: '平台发布助手',
      description: '把已验证工作流发布到测试或线上环境，并保留审计和回滚信息。',
      riskLevel: 'high',
      triggers: ['发布', '上线', '部署', '回滚', '发布模板'],
      entrypoints: [
        {
          name: 'publish_workflow',
          description: '发布已验证工作流。',
          requiredInputs: ['workflow_id_or_file', 'target_environment'],
          optionalInputs: ['release_note', 'rollback_plan'],
        },
      ],
      requiredCli: { name: 'platform', minVersion: '0.5.0' },
      requiresConfirmation: ['publish_staging', 'publish_production', 'rollback_production'],
      standardFlow: [
        {
          state: 'release_candidate_checked',
          title: '检查发布候选',
          exitCondition: 'workflow 已验证且 dry-run 通过',
          nextActions: ['release_plan_confirmed'],
        },
        {
          state: 'release_plan_confirmed',
          title: '确认发布计划',
          exitCondition: '用户明确确认环境、影响范围、回滚方案',
          nextActions: ['published'],
        },
        {
          state: 'published',
          title: '发布并记录审计',
          exitCondition: '获得 releaseId、auditUrl 和 rollbackCommand',
          nextActions: ['monitored', 'rolled_back'],
        },
      ],
      outputs: ['releaseId', 'auditUrl', 'rollbackCommand', 'releaseSummary'],
    },
    systemPrompt: [
      '你是平台发布助手，所有发布、上线、回滚都属于高风险动作。',
      '先验证 workflow、目标环境、影响范围、费用和回滚路径，再请求用户明确确认。',
      '没有用户确认时只能输出发布计划，不得执行 publish 或 rollback。',
    ].join('\n'),
    invocationPolicy: {
      maxClarifyingQuestions: 3,
      defaultingStrategy: '发布说明可自动生成，目标环境和回滚策略不可默认。',
      confirmationPolicy: 'publish_staging、publish_production、rollback_production 均需用户明确确认。',
      sessionPolicy: '记录 releaseId、auditUrl、rollbackCommand 和发布前校验证据。',
    },
    cliContract: {
      binary: 'platform',
      minVersion: '0.5.0',
      requiredGlobalFlags: ['--json', '--non-interactive'],
      commands: [
        { name: 'validate', command: 'platform workflow validate --file workflow.json --json', purpose: '发布前校验。', required: true },
        { name: 'publish-plan', command: 'platform deploy plan --workflow <workflow-id> --env <env> --json', purpose: '生成发布计划。', required: true },
        { name: 'publish', command: 'platform deploy publish --workflow <workflow-id> --env <env> --yes --json', purpose: '用户确认后发布。', required: false },
        { name: 'rollback', command: 'platform deploy rollback --release-id <release-id> --yes --json', purpose: '用户确认后回滚。', required: false },
      ],
      successEnvelope: baseSuccessEnvelope,
      errorEnvelope: baseErrorEnvelope,
    },
    schemas: [
      {
        name: 'release-plan',
        description: '发布计划。',
        schema: {
          type: 'object',
          properties: {
            targetEnvironment: { type: 'string', enum: ['staging', 'production'] },
            impact: { type: 'string' },
            rollbackCommand: { type: 'string' },
          },
          required: ['targetEnvironment', 'impact', 'rollbackCommand'],
        },
      },
      { name: 'session', description: '本地创作会话记录。', schema: sessionSchema },
    ],
    examples: [
      {
        userIntent: '把这个工作流发布到测试环境',
        selectedEntrypoint: 'publish_workflow',
        expectedFirstActions: ['platform workflow validate --file workflow.json --json', 'platform deploy plan --workflow <workflow-id> --env staging --json'],
      },
    ],
  },
]

const SKILL_BY_ID = new Map(PUBLIC_SKILLS.map((skill) => [skill.manifest.id, skill]))

export function listPublicSkillSummaries(basePath = '/api/skills'): PublicSkillSummary[] {
  return PUBLIC_SKILLS.map((skill) => ({
    ...skill.manifest,
    detailUrl: `${basePath}/${skill.manifest.id}`,
    promptUrl: `${basePath}/${skill.manifest.id}/prompt`,
  }))
}

export function getPublicSkill(skillId: string): PublicSkill | null {
  return SKILL_BY_ID.get(skillId) || null
}

export function getPublicSkillPrompt(skillId: string): string | null {
  return getPublicSkill(skillId)?.systemPrompt || null
}

export function selectPublicSkillForIntent(intent: string): PublicSkill | null {
  const normalizedIntent = intent.trim().toLowerCase()
  if (!normalizedIntent) return null

  let best: { skill: PublicSkill; score: number } | null = null
  for (const skill of PUBLIC_SKILLS) {
    const score = skill.manifest.triggers.reduce((count, trigger) => {
      return normalizedIntent.includes(trigger.toLowerCase()) ? count + 1 : count
    }, 0)
    if (score > 0 && (!best || score > best.score)) {
      best = { skill, score }
    }
  }

  return best?.skill || getPublicSkill('platform-agent')
}
