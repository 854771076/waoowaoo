/**
 * OmniVoice `instruct` 受控词表。
 *
 * OmniVoice 后端不接受自由文本 instruct,只接受由其受控词表里的 token
 * 拼成的字符串。中文用「、」分隔、英文用「, 」分隔,且不能混用。
 *
 * 词表内容从 OmniVoice-Studio 后端在拒绝 instruct 时返回的 detail
 * 错误信息里抽取(模式:`Valid Chinese items: ...` / `Valid English items: ...`)。
 * 升级后端时若词表变化,需要从 `/Users/xiaomao/Documents/fuyang/OmniVoice-Studio`
 * 的 instruct validator 处同步更新。
 */

/** 性别(中文) */
export const OMNIVOICE_ZH_GENDER = ['男', '女'] as const

/** 年龄(中文) */
export const OMNIVOICE_ZH_AGE = ['儿童', '少年', '青年', '中年', '老年'] as const

/** 音调(中文) */
export const OMNIVOICE_ZH_PITCH = [
  '极低音调',
  '低音调',
  '中音调',
  '高音调',
  '极高音调',
  '耳语',
] as const

/** 口音/方言(中文) */
export const OMNIVOICE_ZH_ACCENT = [
  '东北话',
  '云南话',
  '四川话',
  '宁夏话',
  '桂林话',
  '河南话',
  '济南话',
  '甘肃话',
  '石家庄话',
  '贵州话',
  '陕西话',
  '青岛话',
] as const

/** 完整中文词表(性别 + 年龄 + 音调 + 口音)。 */
export const OMNIVOICE_ZH_VOCABULARY = [
  ...OMNIVOICE_ZH_GENDER,
  ...OMNIVOICE_ZH_AGE,
  ...OMNIVOICE_ZH_PITCH,
  ...OMNIVOICE_ZH_ACCENT,
] as const

/**
 * 中文词表按 chip 面板分组(给 UI 渲染)。每组对应一个 i18n 标题
 * (voice.voiceDesign.omnivoiceChips.group*)。
 */
export const OMNIVOICE_ZH_CHIP_GROUPS = [
  { key: 'gender', tokens: OMNIVOICE_ZH_GENDER },
  { key: 'age', tokens: OMNIVOICE_ZH_AGE },
  { key: 'pitch', tokens: OMNIVOICE_ZH_PITCH },
  { key: 'accent', tokens: OMNIVOICE_ZH_ACCENT },
] as const

export type OmnivoiceChipGroupKey = (typeof OMNIVOICE_ZH_CHIP_GROUPS)[number]['key']

/** 英文词表(目前 vvicat UI 只展示中文词表,英文路径保留以备将来扩展)。 */
export const OMNIVOICE_EN_VOCABULARY = [
  'american accent',
  'australian accent',
  'british accent',
  'canadian accent',
  'child',
  'chinese accent',
  'elderly',
  'female',
  'high pitch',
  'indian accent',
  'japanese accent',
  'korean accent',
  'low pitch',
  'male',
  'middle-aged',
  'moderate pitch',
  'portuguese accent',
  'russian accent',
  'teenager',
  'very high pitch',
  'very low pitch',
  'whisper',
  'young adult',
] as const

const ZH_SET = new Set<string>(OMNIVOICE_ZH_VOCABULARY)
const EN_SET = new Set<string>(OMNIVOICE_EN_VOCABULARY)

const ZH_SEPARATOR = '、'
const EN_SEPARATOR = ','

/** 检测一个 token 大致是中文还是英文。 */
function isChineseToken(token: string): boolean {
  return /[一-鿿]/.test(token)
}

export interface OmnivoiceInstructValidationOk {
  ok: true
  /** 规范化后的 instruct(已 trim、按规则分隔符重新拼装)。 */
  normalized: string
  /** 检出的语言;空字符串走 'zh' 默认(后端要求至少传一种)。 */
  language: 'zh' | 'en'
}

export interface OmnivoiceInstructValidationError {
  ok: false
  errorCode:
    | 'OMNIVOICE_INSTRUCT_EMPTY'
    | 'OMNIVOICE_INSTRUCT_MIXED_LANGUAGE'
    | 'OMNIVOICE_INSTRUCT_UNKNOWN_TOKEN'
  /** 给用户的中文提示。 */
  message: string
  /** 触发错误的具体 token(如有)。 */
  unknownTokens?: string[]
}

export type OmnivoiceInstructValidation =
  | OmnivoiceInstructValidationOk
  | OmnivoiceInstructValidationError

/**
 * 验证并规范化用户提供的 OmniVoice instruct 字符串。
 *
 * 接受的输入形态(都先 trim):
 * - 中文:用「、」或「,」或「,」分隔的中文词,如 `男、青年、中音调`
 * - 英文:用 `, ` 分隔的英文短语,如 `male, young adult, low pitch`
 * - 不允许中英文混用(后端约束)。
 *
 * 返回:
 * - `{ ok: true, normalized, language }` — normalized 已用规则分隔符
 *   重新拼装,可直接交给 SDK。
 * - `{ ok: false, errorCode, message, unknownTokens? }` — 提示用户修正。
 */
export function validateOmnivoiceInstruct(
  raw: string | null | undefined,
): OmnivoiceInstructValidation {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) {
    return {
      ok: false,
      errorCode: 'OMNIVOICE_INSTRUCT_EMPTY',
      message: '请填写或选择至少一个声音特征',
    }
  }

  // 把中英文常见分隔符都拆成 token,再按 token 类型判定语言
  // 中文常见:「、」「,」(全角逗号)「 ,」(英文逗号也兼容,见下)
  // 英文:「, 」「,」
  const candidates = trimmed
    .split(/[、,，]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  if (candidates.length === 0) {
    return {
      ok: false,
      errorCode: 'OMNIVOICE_INSTRUCT_EMPTY',
      message: '请填写或选择至少一个声音特征',
    }
  }

  const zhTokens: string[] = []
  const enTokens: string[] = []
  const unknown: string[] = []

  for (const token of candidates) {
    if (isChineseToken(token)) {
      if (ZH_SET.has(token)) {
        zhTokens.push(token)
      } else {
        unknown.push(token)
      }
    } else {
      const lower = token.toLowerCase()
      if (EN_SET.has(lower)) {
        enTokens.push(lower)
      } else {
        unknown.push(token)
      }
    }
  }

  if (zhTokens.length > 0 && enTokens.length > 0) {
    return {
      ok: false,
      errorCode: 'OMNIVOICE_INSTRUCT_MIXED_LANGUAGE',
      message: 'OmniVoice 不接受中英文混用,请只用中文或只用英文标签',
    }
  }

  if (unknown.length > 0) {
    const sample = unknown.slice(0, 3).join('、')
    return {
      ok: false,
      errorCode: 'OMNIVOICE_INSTRUCT_UNKNOWN_TOKEN',
      message: `OmniVoice 不识别这些标签: ${sample}${
        unknown.length > 3 ? ` (共 ${unknown.length} 项)` : ''
      }。请改用预设按钮或下方词表里的词`,
      unknownTokens: unknown,
    }
  }

  if (zhTokens.length > 0) {
    return {
      ok: true,
      normalized: dedupePreserveOrder(zhTokens).join(ZH_SEPARATOR),
      language: 'zh',
    }
  }

  return {
    ok: true,
    normalized: dedupePreserveOrder(enTokens).join(`${EN_SEPARATOR} `),
    language: 'en',
  }
}

function dedupePreserveOrder<T>(items: readonly T[]): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}
