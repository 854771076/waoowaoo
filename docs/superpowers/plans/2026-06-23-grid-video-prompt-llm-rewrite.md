# 宫格视频提示词 LLM 重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让宫格分镜面板生成视频前，先用 LLM 把宫格理解为「同一连续镜头的关键帧序列」、按 Seedance 时间戳分镜规范重写出一条视频提示词并回写 `videoPrompt`，再用它生成视频。

**Architecture:** 方案 A——在 `video.worker` 宫格分支内联实时重写（缓存 + `withTextBilling` 即时计费），并新增一个独立 text task `AI_GRID_VIDEO_PROMPT` 供 UI 手动重生。缓存用新字段 `NovelPromotionPanel.gridVideoPromptAt`（非空=已重写过；自动路径仅在为空时重写，宫格图重新生成时清空，手动按钮强制重写）。

**Tech Stack:** Next.js 15 / Prisma(MySQL) / BullMQ / next-intl / Vitest。LLM 走 `executeAiTextStep`，模型由 `resolveAnalysisModel` 解析。

## Global Constraints

- 所有提示词（视频提示词 + 模板内容）必须用中文编写；模板有 zh/en 两版（`lib/prompts/novel-promotion/panel_grid_video.{zh,en}.txt`）。
- `@引用` 用官方命名（`@图片1`/`@视频1`/`@音频1`）—— 本特性是纯文本重写，通常不涉及，但模板若示例引用须遵此规范。
- 计费两条路径互斥，**不可同时**：自动路径（video.worker 内）用 `withTextBilling`；手动 task 靠创建时 `buildDefaultTaskBillingInfo` 冻结、生命周期结算。handler 内**禁止**再调 `withTextBilling`。
- 非宫格面板（`imageLayout !== 'grid'`）完全不走本逻辑（`isGridLayout` 守卫）。
- 现有 `buildGridVideoPrompt`（模板填充）保留导出不删，新增 `rewriteGridVideoPrompt` 并在 video.worker 切换使用；`isGridLayout` 保持不变。
- 所有用户可见文案需 zh/en 双语（`messages/{zh,en}/`）。
- 提交粒度：每个 Task 末尾提交一次。

---

## File Structure

- `prisma/schema.prisma` — 新增字段 `gridVideoPromptAt DateTime?`（Task 1）
- `lib/prompts/novel-promotion/panel_grid_video.{zh,en}.txt` — 改写为「给 LLM 的重写指令」（Task 2）
- `src/lib/storyboard-images/grid-video-prompt.ts` — 新增 `rewriteGridVideoPrompt` + `parseRewrittenPrompt`（Task 3）
- `src/lib/workers/video.worker.ts` — 宫格分支改用缓存判断 + `rewriteGridVideoPrompt` + `withTextBilling`（Task 4）
- `src/lib/workers/handlers/panel-image-task-handler.ts` — 写 `imageLayout='grid'` 时清空 `gridVideoPromptAt`（Task 5）
- `src/lib/task/types.ts` + `intent.ts` + `progress-message.ts` + `src/lib/billing/task-policy.ts` + `src/lib/llm-observe/task-policy.ts` — 注册 `AI_GRID_VIDEO_PROMPT`（Task 6）
- `src/lib/workers/handlers/grid-video-prompt-rewrite.ts` — 新 handler（Task 7）
- `src/lib/workers/text.worker.ts` — switch 注册 handler（Task 7）
- `src/app/api/novel-promotion/[projectId]/ai-grid-video-prompt/route.ts` — 创建 task 的 route（Task 8）
- `messages/{zh,en}/progress.json` + 相关 UI 文案（Task 6 / Task 9）
- `src/lib/query/mutations/useVideoMutations.ts` + 面板卡片提示词编辑区 UI（Task 9）

---

### Task 1: Prisma 字段 `gridVideoPromptAt`

**Files:**
- Modify: `prisma/schema.prisma:209`（`videoPrompt` 行附近，`model NovelPromotionPanel`）

**Interfaces:**
- Produces: `NovelPromotionPanel.gridVideoPromptAt: DateTime | null`（Prisma client 类型）

- [ ] **Step 1: 加字段**

在 `prisma/schema.prisma` 的 `model NovelPromotionPanel` 中，`videoGenerationMode` 行（约 212 行）之后插入：

```prisma
  gridVideoPromptAt DateTime?                 // 宫格视频提示词 LLM 重写标记：非空=已重写过
```

- [ ] **Step 2: 生成 client + 推送 schema**

Run: `npx prisma generate && npx prisma db push`
Expected: 输出 `Your database is now in sync with your Prisma schema.`，client 重新生成无错。

- [ ] **Step 3: 类型校验**

Run: `npm run typecheck`
Expected: 通过（新字段已在 client 类型中）。

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): 为宫格视频提示词重写新增 gridVideoPromptAt 字段"
```

---

### Task 2: 改写 Seedance 重写提示词模板

**Files:**
- Modify: `lib/prompts/novel-promotion/panel_grid_video.zh.txt`（整体改写）
- Modify: `lib/prompts/novel-promotion/panel_grid_video.en.txt`（整体改写）

**Interfaces:**
- Produces: 模板变量契约 `{ storyboard_context_json, grid_layout, panel_grid_size, shot_type, camera_move, base_prompt }`（Task 3 的 `rewriteGridVideoPrompt` 必须按此名传入）

> 说明：模板从「给视频模型的包装指令」改为「给 LLM 的重写指令」。LLM 读结构化分镜上下文，把 N 格理解为同一连续镜头的关键帧，输出**一条**符合 Seedance 2.0 规范（时间戳分镜、镜头语言、音效、禁止项）的中文视频提示词，**仅输出提示词正文本身，不要解释、不要 markdown 代码块包裹**。

- [ ] **Step 1: 写 zh 模板**

把 `lib/prompts/novel-promotion/panel_grid_video.zh.txt` 全文替换为：

```
你是一名专业的 AI 视频提示词工程师，为字节跳动即梦平台的 Seedance 2.0 视频生成模型编写中文提示词。

下面给你一张宫格分镜图对应的结构化信息。这张宫格图是 {grid_layout}、共 {panel_grid_size} 格的"分镜关键帧表"：按阅读顺序（从左到右、从上到下），每一格是同一个镜头在时间上依次推进的关键帧——第 1 格是起始瞬间，最后一格是结束瞬间。

【你的任务】
把这 {panel_grid_size} 个关键帧理解透彻，重写成一条可直接用于 Seedance 2.0 的视频提示词，让画面从第 1 格的状态自然演变到最后一格的状态，成片是一个无宫格、无边框、铺满全屏的单一连续镜头。

【输出要求】
1. 使用 Seedance 时间戳分镜法，按本镜头时长把动作拆成若干时间段（如 0-3秒 / 4-8秒 / …），逐段描述画面、动作递进与镜头语言。
2. 充分利用结构化信息中的镜头类型（{shot_type}）与运动方式（{camera_move}），并保持角色外貌/服装/场景/光影在整条提示词中前后一致。
3. 把各关键帧之间缺失的中间动作补全，使动作、表情、走位连贯递进。
4. 需要时加入音效/环境声描述，单独成行。
5. 绝对不要出现宫格、分格、拼贴、分屏、边框等字样或形态；这是一条连续实拍镜头。
6. 只输出视频提示词正文本身，不要任何解释、标题或 markdown 代码块包裹。

【结构化分镜信息（JSON）】
{storyboard_context_json}

【原始参考提示词（可借鉴其意图，但需按上述要求重写）】
{base_prompt}
```

- [ ] **Step 2: 写 en 模板**

把 `lib/prompts/novel-promotion/panel_grid_video.en.txt` 全文替换为：

```
You are a professional AI video prompt engineer writing Chinese prompts for ByteDance Jimeng's Seedance 2.0 video generation model.

Below is the structured information for a grid storyboard image. This grid is a "keyframe storyboard table" of {panel_grid_size} cells arranged as {grid_layout}: in reading order (left-to-right, top-to-bottom), each cell is a keyframe of ONE shot advancing through time — the first cell is the starting moment, the last cell is the ending moment.

[Your task]
Understand these {panel_grid_size} keyframes and rewrite them into ONE prompt directly usable by Seedance 2.0, letting the picture evolve naturally from cell 1 to the final cell. The result is a single continuous live-action shot with no grid, no borders, filling the whole frame.

[Output requirements]
1. Use Seedance timestamp segmentation (e.g. 0-3s / 4-8s / ...), describing the picture, action progression, and camera language per segment.
2. Make full use of the shot type ({shot_type}) and camera movement ({camera_move}) from the structured info, and keep character appearance/costume/scene/lighting consistent throughout.
3. Fill in the missing in-between action between keyframes so motion, expressions, and blocking progress coherently.
4. Add sound/ambient audio descriptions on their own line where appropriate.
5. Never output the words or form of grid, sub-cells, collage, split-screen, or borders; this is one continuous live-action shot.
6. Output ONLY the video prompt body itself in Chinese — no explanation, no title, no markdown code fences.

[Structured storyboard info (JSON)]
{storyboard_context_json}

[Original reference prompt (you may borrow its intent, but rewrite per the requirements above)]
{base_prompt}
```

- [ ] **Step 3: Commit**

```bash
git add lib/prompts/novel-promotion/panel_grid_video.zh.txt lib/prompts/novel-promotion/panel_grid_video.en.txt
git commit -m "feat(prompts): 宫格视频提示词模板改写为 LLM 重写指令"
```

---

### Task 3: `rewriteGridVideoPrompt` 核心重写函数

**Files:**
- Modify: `src/lib/storyboard-images/grid-video-prompt.ts`
- Test: `tests/unit/storyboard-images/grid-video-prompt.test.ts`（在现有文件追加 describe 块）

**Interfaces:**
- Consumes: `buildPromptAsync`/`PROMPT_IDS.NP_PANEL_GRID_VIDEO`（`@/lib/prompt-i18n`）、`executeAiTextStep`（`@/lib/ai-runtime`）、`buildStoryboardGridLayout`（`./grid`）
- Produces:
  ```ts
  interface RewriteGridVideoPromptParams {
    panelContext: Record<string, unknown> // 面板结构化上下文（description/shot_type/camera_move/characters/location/srtSegment 等）
    basePrompt: string
    gridSize: number
    shotType: string
    cameraMove: string
    locale: 'zh' | 'en'
    projectId: string | null
    userId: string
    model: string
  }
  // 成功返回重写后的提示词与 token 估算；失败/空返回 null
  function rewriteGridVideoPrompt(params: RewriteGridVideoPromptParams): Promise<{ prompt: string; promptTokens: number; completionTokens: number } | null>
  // 去除 markdown 代码块包裹、trim
  function parseRewrittenPrompt(raw: string): string
  ```

- [ ] **Step 1: 写失败测试**

在 `tests/unit/storyboard-images/grid-video-prompt.test.ts` 顶部的 `vi.mock('@/lib/prompt-i18n', ...)` 之外，追加对 `@/lib/ai-runtime` 的 mock 与新 describe。先在文件顶部 mock 区追加：

```typescript
const aiMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(),
}))

vi.mock('@/lib/ai-runtime', () => ({
  executeAiTextStep: aiMock.executeAiTextStep,
}))
```

然后在文件末尾追加：

```typescript
import { rewriteGridVideoPrompt, parseRewrittenPrompt } from '@/lib/storyboard-images/grid-video-prompt'

describe('parseRewrittenPrompt', () => {
  it('strips markdown code fences and trims', () => {
    expect(parseRewrittenPrompt('```\n0-3秒：画面\n```')).toBe('0-3秒：画面')
  })
  it('returns plain text unchanged', () => {
    expect(parseRewrittenPrompt('  0-3秒：画面  ')).toBe('0-3秒：画面')
  })
})

describe('rewriteGridVideoPrompt', () => {
  beforeEach(() => {
    aiMock.executeAiTextStep.mockReset()
    promptMock.buildPromptAsync.mockReset()
  })

  it('builds prompt with grid context vars and returns rewritten text', async () => {
    promptMock.buildPromptAsync.mockResolvedValue('FILLED_TEMPLATE')
    aiMock.executeAiTextStep.mockResolvedValue({
      text: '0-3秒：男人推门进入。\n音效：开门声。',
      usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
    })

    const result = await rewriteGridVideoPrompt({
      panelContext: { description: '男人下班回家' },
      basePrompt: '男人开门',
      gridSize: 4,
      shotType: '中景',
      cameraMove: '跟拍',
      locale: 'zh',
      projectId: 'p1',
      userId: 'u1',
      model: 'ark:doubao',
    })

    expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(expect.objectContaining({
      promptId: 'np_panel_grid_video',
      variables: expect.objectContaining({
        panel_grid_size: '4',
        shot_type: '中景',
        camera_move: '跟拍',
        base_prompt: '男人开门',
      }),
    }))
    expect(aiMock.executeAiTextStep).toHaveBeenCalledWith(expect.objectContaining({
      model: 'ark:doubao',
      userId: 'u1',
      projectId: 'p1',
    }))
    expect(result).toEqual({
      prompt: '0-3秒：男人推门进入。\n音效：开门声。',
      promptTokens: 120,
      completionTokens: 80,
    })
  })

  it('returns null when gridSize <= 1', async () => {
    const result = await rewriteGridVideoPrompt({
      panelContext: {}, basePrompt: 'x', gridSize: 1, shotType: '', cameraMove: '',
      locale: 'zh', projectId: null, userId: 'u1', model: 'm',
    })
    expect(result).toBeNull()
    expect(aiMock.executeAiTextStep).not.toHaveBeenCalled()
  })

  it('returns null when LLM returns empty text', async () => {
    promptMock.buildPromptAsync.mockResolvedValue('FILLED')
    aiMock.executeAiTextStep.mockResolvedValue({ text: '   ', usage: {} })
    const result = await rewriteGridVideoPrompt({
      panelContext: {}, basePrompt: 'x', gridSize: 4, shotType: '', cameraMove: '',
      locale: 'zh', projectId: null, userId: 'u1', model: 'm',
    })
    expect(result).toBeNull()
  })

  it('returns null when LLM throws', async () => {
    promptMock.buildPromptAsync.mockResolvedValue('FILLED')
    aiMock.executeAiTextStep.mockRejectedValue(new Error('llm down'))
    const result = await rewriteGridVideoPrompt({
      panelContext: {}, basePrompt: 'x', gridSize: 4, shotType: '', cameraMove: '',
      locale: 'zh', projectId: null, userId: 'u1', model: 'm',
    })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:unit -- tests/unit/storyboard-images/grid-video-prompt.test.ts`
Expected: FAIL — `rewriteGridVideoPrompt`/`parseRewrittenPrompt` 未导出。

（若 `test:unit` 脚本不接受路径参数，用 `npx vitest run tests/unit/storyboard-images/grid-video-prompt.test.ts`。）

- [ ] **Step 3: 实现**

在 `src/lib/storyboard-images/grid-video-prompt.ts` 顶部补充 import：

```typescript
import { executeAiTextStep } from '@/lib/ai-runtime'
```

在文件末尾（`isGridLayout` 之后）追加：

```typescript
export interface RewriteGridVideoPromptParams {
  panelContext: Record<string, unknown>
  basePrompt: string
  gridSize: number
  shotType: string
  cameraMove: string
  locale: 'zh' | 'en'
  projectId: string | null
  userId: string
  model: string
}

/** 去掉 markdown 代码块包裹并 trim。 */
export function parseRewrittenPrompt(raw: string): string {
  const trimmed = (raw || '').trim()
  const fenced = trimmed.match(/^```[a-zA-Z]*\n?([\s\S]*?)\n?```$/)
  return (fenced ? fenced[1] : trimmed).trim()
}

/**
 * 用 LLM 把宫格分镜理解为同一连续镜头的关键帧序列，按 Seedance 规范重写成一条视频提示词。
 * 失败/空返回 null，调用方应回退到原 basePrompt。
 */
export async function rewriteGridVideoPrompt(
  params: RewriteGridVideoPromptParams,
): Promise<{ prompt: string; promptTokens: number; completionTokens: number } | null> {
  const { panelContext, basePrompt, gridSize, shotType, cameraMove, locale, projectId, userId, model } = params
  if (gridSize <= 1) return null
  if (!model) return null

  try {
    const layout = buildStoryboardGridLayout('grid_auto', gridSize)
    const gridLayoutText = formatGridLayoutText(layout, locale)
    const filledPrompt = await buildPromptAsync({
      promptId: PROMPT_IDS.NP_PANEL_GRID_VIDEO,
      locale,
      projectId,
      variables: {
        storyboard_context_json: JSON.stringify(panelContext, null, 2),
        base_prompt: basePrompt || '',
        grid_layout: gridLayoutText,
        panel_grid_size: String(gridSize),
        shot_type: shotType || (locale === 'zh' ? '中景' : 'medium shot'),
        camera_move: cameraMove || (locale === 'zh' ? '平滑连贯运镜' : 'smooth continuous camera move'),
      },
    })

    const completion = await executeAiTextStep({
      userId,
      model,
      messages: [{ role: 'user', content: filledPrompt }],
      temperature: 0.7,
      projectId: projectId || undefined,
      action: 'grid_video_prompt_rewrite',
      meta: {
        stepId: 'grid_video_prompt_rewrite',
        stepTitle: locale === 'zh' ? '宫格视频提示词重写' : 'Grid video prompt rewrite',
        stepIndex: 1,
        stepTotal: 1,
      },
    })

    const prompt = parseRewrittenPrompt(completion.text || '')
    if (!prompt) return null
    return {
      prompt,
      promptTokens: completion.usage?.promptTokens || 0,
      completionTokens: completion.usage?.completionTokens || 0,
    }
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.warn('[rewriteGridVideoPrompt] failed, caller should fall back:', error)
    }
    return null
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:unit -- tests/unit/storyboard-images/grid-video-prompt.test.ts`
Expected: PASS（含原有 `isGridLayout`/`buildGridVideoPrompt` 用例）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/storyboard-images/grid-video-prompt.ts tests/unit/storyboard-images/grid-video-prompt.test.ts
git commit -m "feat(grid-video): 新增 rewriteGridVideoPrompt LLM 重写函数"
```

---

### Task 4: video.worker 宫格分支接入（缓存 + 重写 + 计费）

**Files:**
- Modify: `src/lib/workers/video.worker.ts:116-142`（宫格分支）
- Modify: `src/lib/workers/video.worker.ts`（import 区）
- Test: `tests/unit/workers/grid-video-rewrite-branch.test.ts`（新建）

**Interfaces:**
- Consumes: `rewriteGridVideoPrompt`（Task 3）、`isGridLayout`（现有）、`resolveAnalysisModel`（`./handlers/resolve-analysis-model`）、`withTextBilling`（`@/lib/billing`）、`prisma`
- Produces: 宫格分支：缓存命中复用 `panel.videoPrompt`；未命中调 LLM 重写并 `withTextBilling` 计费、回写 `panel.videoPrompt` + 置 `gridVideoPromptAt`；失败回退 basePrompt

> 说明：自动路径的缓存语义=「`panel.gridVideoPromptAt` 非空即复用，不再重写」。仅 `gridVideoPromptAt` 为空时重写。`firstLastFrame` 模式不走重写（与现有 `!firstLastFramePayload` 守卫一致）。

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/workers/grid-video-rewrite-branch.test.ts`。该测试只验证一个可独立抽取的纯函数 `resolveGridVideoPrompt`（决定复用还是重写），以便单测不依赖 BullMQ：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rewriteMock = vi.hoisted(() => ({ rewriteGridVideoPrompt: vi.fn() }))
vi.mock('@/lib/storyboard-images/grid-video-prompt', async (orig) => {
  const actual = await orig() as Record<string, unknown>
  return { ...actual, rewriteGridVideoPrompt: rewriteMock.rewriteGridVideoPrompt }
})

import { resolveGridVideoPrompt } from '@/lib/workers/grid-video-prompt-resolver'

describe('resolveGridVideoPrompt', () => {
  beforeEach(() => rewriteMock.rewriteGridVideoPrompt.mockReset())

  const baseArgs = {
    basePrompt: '男人开门',
    panelContext: { description: '男人下班回家' },
    gridSize: 4,
    shotType: '中景',
    cameraMove: '跟拍',
    locale: 'zh' as const,
    projectId: 'p1',
    userId: 'u1',
    model: 'ark:doubao',
  }

  it('reuses existing prompt when alreadyRewritten=true (cache hit)', async () => {
    const res = await resolveGridVideoPrompt({ ...baseArgs, alreadyRewritten: true })
    expect(res).toEqual({ prompt: '男人开门', rewritten: false, usage: null })
    expect(rewriteMock.rewriteGridVideoPrompt).not.toHaveBeenCalled()
  })

  it('rewrites when not yet rewritten and returns new prompt + usage', async () => {
    rewriteMock.rewriteGridVideoPrompt.mockResolvedValue({ prompt: '0-3秒：推门', promptTokens: 10, completionTokens: 5 })
    const res = await resolveGridVideoPrompt({ ...baseArgs, alreadyRewritten: false })
    expect(res).toEqual({ prompt: '0-3秒：推门', rewritten: true, usage: { promptTokens: 10, completionTokens: 5 } })
  })

  it('falls back to basePrompt when rewrite returns null', async () => {
    rewriteMock.rewriteGridVideoPrompt.mockResolvedValue(null)
    const res = await resolveGridVideoPrompt({ ...baseArgs, alreadyRewritten: false })
    expect(res).toEqual({ prompt: '男人开门', rewritten: false, usage: null })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:unit -- tests/unit/workers/grid-video-rewrite-branch.test.ts`
Expected: FAIL — `@/lib/workers/grid-video-prompt-resolver` 不存在。

- [ ] **Step 3: 实现 resolver 纯函数**

新建 `src/lib/workers/grid-video-prompt-resolver.ts`：

```typescript
import { rewriteGridVideoPrompt } from '@/lib/storyboard-images/grid-video-prompt'

export interface ResolveGridVideoPromptParams {
  basePrompt: string
  panelContext: Record<string, unknown>
  gridSize: number
  shotType: string
  cameraMove: string
  locale: 'zh' | 'en'
  projectId: string | null
  userId: string
  model: string
  alreadyRewritten: boolean
}

export interface ResolveGridVideoPromptResult {
  prompt: string
  rewritten: boolean
  usage: { promptTokens: number; completionTokens: number } | null
}

/**
 * 决定宫格视频提示词：已重写过则复用 basePrompt（缓存命中）；否则调 LLM 重写，失败回退 basePrompt。
 */
export async function resolveGridVideoPrompt(
  params: ResolveGridVideoPromptParams,
): Promise<ResolveGridVideoPromptResult> {
  if (params.alreadyRewritten) {
    return { prompt: params.basePrompt, rewritten: false, usage: null }
  }
  const result = await rewriteGridVideoPrompt({
    panelContext: params.panelContext,
    basePrompt: params.basePrompt,
    gridSize: params.gridSize,
    shotType: params.shotType,
    cameraMove: params.cameraMove,
    locale: params.locale,
    projectId: params.projectId,
    userId: params.userId,
    model: params.model,
  })
  if (!result) {
    return { prompt: params.basePrompt, rewritten: false, usage: null }
  }
  return {
    prompt: result.prompt,
    rewritten: true,
    usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:unit -- tests/unit/workers/grid-video-rewrite-branch.test.ts`
Expected: PASS。

- [ ] **Step 5: 接入 video.worker 宫格分支**

在 `src/lib/workers/video.worker.ts` import 区（第 22 行附近）补充：

```typescript
import { isGridLayout } from '@/lib/storyboard-images/grid-video-prompt'
import { resolveGridVideoPrompt } from '@/lib/workers/grid-video-prompt-resolver'
import { resolveAnalysisModel } from './handlers/resolve-analysis-model'
import { withTextBilling } from '@/lib/billing'
```

（注意：第 22 行原 `import { buildGridVideoPrompt, isGridLayout } from ...` 改为只 import `isGridLayout`；`buildGridVideoPrompt` 不再使用。）

将 `src/lib/workers/video.worker.ts:121-142` 的宫格分支：

```typescript
  let prompt = basePrompt
  let usedGridPrompt = false
  if (isGridImage && !firstLastFramePayload) {
    const payloadGridSize = typeof payload.gridSize === 'number' ? payload.gridSize : null
    const gridSize = payloadGridSize && payloadGridSize > 1
      ? payloadGridSize
      : (defaultGridSize > 1 ? defaultGridSize : 4)
    const gridPrompt = await buildGridVideoPrompt({
      basePrompt,
      panelDescription: panel.description || basePrompt,
      gridSize,
      shotType: panel.shotType || '',
      cameraMove: panel.cameraMove || '',
      locale: (job.data.locale as 'zh' | 'en') || 'zh',
      projectId: job.data.projectId,
    })
    if (gridPrompt) {
      prompt = gridPrompt
      usedGridPrompt = true
    }
  }
```

替换为：

```typescript
  let prompt = basePrompt
  let usedGridPrompt = false
  if (isGridImage && !firstLastFramePayload) {
    const payloadGridSize = typeof payload.gridSize === 'number' ? payload.gridSize : null
    const gridSize = payloadGridSize && payloadGridSize > 1
      ? payloadGridSize
      : (defaultGridSize > 1 ? defaultGridSize : 4)
    const alreadyRewritten = panel.gridVideoPromptAt != null
    let analysisModel = ''
    try {
      analysisModel = (await resolveAnalysisModel(job.data.projectId, job.data.userId)).analysisModel
    } catch (error) {
      logger.warn({ message: 'grid video prompt rewrite skipped: analysis model unresolved', details: { panelId: panel.id, error: String(error) } })
    }
    const locale = (job.data.locale as 'zh' | 'en') || 'zh'
    const panelContext = {
      shot_type: panel.shotType || '',
      camera_move: panel.cameraMove || '',
      description: panel.description || '',
      location: panel.location || '',
      characters: panel.characters || '',
      text_segment: panel.srtSegment || '',
    }

    const runResolve = () => resolveGridVideoPrompt({
      basePrompt,
      panelContext,
      gridSize,
      shotType: panel.shotType || '',
      cameraMove: panel.cameraMove || '',
      locale,
      projectId: job.data.projectId,
      userId: job.data.userId,
      model: analysisModel,
      alreadyRewritten,
    })

    // 缓存命中或无可用模型：不计费直接解析；需要重写时用 withTextBilling 包裹
    const resolved = (alreadyRewritten || !analysisModel)
      ? await runResolve()
      : await withTextBilling(
          job.data.userId,
          analysisModel,
          3000,
          1200,
          { projectId: job.data.projectId, action: 'grid_video_prompt_rewrite', metadata: { panelId: panel.id } },
          runResolve,
        )

    prompt = resolved.prompt
    usedGridPrompt = resolved.prompt !== basePrompt
    if (resolved.rewritten) {
      await prisma.novelPromotionPanel.update({
        where: { id: panel.id },
        data: { videoPrompt: resolved.prompt, gridVideoPromptAt: new Date() },
      })
    }
  }
```

- [ ] **Step 6: 类型检查 + 全量单测**

Run: `npm run typecheck && npm run test:unit -- tests/unit/workers/grid-video-rewrite-branch.test.ts tests/unit/storyboard-images/grid-video-prompt.test.ts`
Expected: typecheck 通过；测试 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/lib/workers/video.worker.ts src/lib/workers/grid-video-prompt-resolver.ts tests/unit/workers/grid-video-rewrite-branch.test.ts
git commit -m "feat(video-worker): 宫格分支接入 LLM 重写 + 缓存 + withTextBilling 计费"
```

---

### Task 5: 宫格图重新生成时清空缓存标记

**Files:**
- Modify: `src/lib/workers/handlers/panel-image-task-handler.ts:364-385`（两处 update 写 `imageLayout`）
- Test: `tests/unit/workers/panel-image-grid-invalidate.test.ts`（新建，测纯函数）

**Interfaces:**
- Produces: 当写入 `imageLayout='grid'` 时，update data 同时含 `gridVideoPromptAt: null`；写 `single` 时不动该字段

> 说明：抽一个小纯函数 `buildPanelImageUpdateData` 决定写入字段，便于单测；handler 调用它。

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/workers/panel-image-grid-invalidate.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { buildGridInvalidationPatch } from '@/lib/workers/handlers/panel-image-grid-invalidate'

describe('buildGridInvalidationPatch', () => {
  it('clears gridVideoPromptAt when layout is grid', () => {
    expect(buildGridInvalidationPatch('grid')).toEqual({ gridVideoPromptAt: null })
  })
  it('returns empty patch when layout is single', () => {
    expect(buildGridInvalidationPatch('single')).toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:unit -- tests/unit/workers/panel-image-grid-invalidate.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现纯函数**

新建 `src/lib/workers/handlers/panel-image-grid-invalidate.ts`：

```typescript
/**
 * 宫格图重新生成时，清空旧的宫格视频提示词重写标记，使下次生成视频自动重写。
 * 非宫格布局返回空 patch。
 */
export function buildGridInvalidationPatch(imageLayout: 'grid' | 'single'): { gridVideoPromptAt?: null } {
  return imageLayout === 'grid' ? { gridVideoPromptAt: null } : {}
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:unit -- tests/unit/workers/panel-image-grid-invalidate.test.ts`
Expected: PASS。

- [ ] **Step 5: 接入 handler 两处 update**

在 `src/lib/workers/handlers/panel-image-task-handler.ts` import 区追加：

```typescript
import { buildGridInvalidationPatch } from './panel-image-grid-invalidate'
```

`src/lib/workers/handlers/panel-image-task-handler.ts:364` 处 `const imageLayout = panelGridSize > 1 ? 'grid' : 'single'` 之后，两处 `prisma.novelPromotionPanel.update` 的 `data` 对象内各加入展开：

第一处（`isFirstGeneration` 分支，约 369-376 行）`data` 内 `imageLayout,` 行之后加：

```typescript
        ...buildGridInvalidationPatch(imageLayout),
```

第二处（else 分支，约 379-385 行）`data` 内 `imageLayout,` 行之后加：

```typescript
        ...buildGridInvalidationPatch(imageLayout),
```

- [ ] **Step 6: 类型检查**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 7: Commit**

```bash
git add src/lib/workers/handlers/panel-image-task-handler.ts src/lib/workers/handlers/panel-image-grid-invalidate.ts tests/unit/workers/panel-image-grid-invalidate.test.ts
git commit -m "feat(panel-image): 宫格图重新生成时清空 gridVideoPromptAt 缓存标记"
```

---

### Task 6: 注册 `AI_GRID_VIDEO_PROMPT` task 类型与各登记表

**Files:**
- Modify: `src/lib/task/types.ts:67`（TASK_TYPE）
- Modify: `src/lib/task/intent.ts:51`（intent 映射）
- Modify: `src/lib/task/progress-message.ts:30`（label）
- Modify: `src/lib/billing/task-policy.ts:43`（BILLABLE_TASK_TYPES）+ `:295`（buildTextTaskInfo 分支）
- Modify: `src/lib/llm-observe/task-policy.ts:55`（policy 映射）
- Modify: `messages/zh/progress.json:73` + `messages/en/progress.json`（taskType 文案）

**Interfaces:**
- Produces: `TASK_TYPE.AI_GRID_VIDEO_PROMPT = 'ai_grid_video_prompt'`，并在 intent/progress/billing/llm-policy 中登记为 text 类计费任务（model 取 analysisModel）

> 说明：本任务是登记接线，无独立测试；正确性由 Task 7/8 的集成与 typecheck 保证。注意 `intent.ts` 的 `TASK_INTENT_BY_TYPE` 是 `Record<TaskType, ...>`（穷举），漏登记会 typecheck 报错——这是验证手段。

- [ ] **Step 1: TASK_TYPE 新增**

`src/lib/task/types.ts` 的 `TASK_TYPE` 对象内，`AI_MODIFY_SHOT_PROMPT: 'ai_modify_shot_prompt',` 行之后加：

```typescript
  AI_GRID_VIDEO_PROMPT: 'ai_grid_video_prompt',
```

- [ ] **Step 2: intent 映射**

`src/lib/task/intent.ts` 的 `TASK_INTENT_BY_TYPE` 内，`[TASK_TYPE.AI_MODIFY_SHOT_PROMPT]: 'modify',` 行之后加：

```typescript
  [TASK_TYPE.AI_GRID_VIDEO_PROMPT]: 'regenerate',
```

- [ ] **Step 3: progress label**

`src/lib/task/progress-message.ts` 的 `TASK_TYPE_LABELS` 内，`[TASK_TYPE.AI_MODIFY_SHOT_PROMPT]: 'progress.taskType.aiModifyShotPrompt',` 行之后加：

```typescript
  [TASK_TYPE.AI_GRID_VIDEO_PROMPT]: 'progress.taskType.aiGridVideoPrompt',
```

- [ ] **Step 4: 计费登记**

`src/lib/billing/task-policy.ts` 的 `BILLABLE_TASK_TYPES` 集合内，`TASK_TYPE.AI_MODIFY_SHOT_PROMPT,` 行之后加：

```typescript
  TASK_TYPE.AI_GRID_VIDEO_PROMPT,
```

同文件 `buildDefaultTaskBillingInfo` 的 switch 中，`case TASK_TYPE.AI_MODIFY_SHOT_PROMPT:` 行之后加一行 case（与其共用 `buildTextTaskInfo` 返回）：

```typescript
    case TASK_TYPE.AI_GRID_VIDEO_PROMPT:
```

- [ ] **Step 5: LLM-observe policy**

`src/lib/llm-observe/task-policy.ts` 的 `POLICY_BY_TASK_TYPE` 内，`[TASK_TYPE.AI_MODIFY_SHOT_PROMPT]: LLM_STANDARD_POLICY,` 行之后加：

```typescript
  [TASK_TYPE.AI_GRID_VIDEO_PROMPT]: LLM_STANDARD_POLICY,
```

- [ ] **Step 6: i18n 文案**

`messages/zh/progress.json` 的 `taskType` 对象内，`"aiModifyShotPrompt": "镜头提示词修改",` 行之后加：

```json
    "aiGridVideoPrompt": "宫格视频提示词重写",
```

`messages/en/progress.json` 的 `taskType` 对象内，对应 `aiModifyShotPrompt` 行之后加：

```json
    "aiGridVideoPrompt": "Grid video prompt rewrite",
```

- [ ] **Step 7: 类型检查**

Run: `npm run typecheck`
Expected: 通过（`TASK_INTENT_BY_TYPE` 穷举完整）。

- [ ] **Step 8: Commit**

```bash
git add src/lib/task/types.ts src/lib/task/intent.ts src/lib/task/progress-message.ts src/lib/billing/task-policy.ts src/lib/llm-observe/task-policy.ts messages/zh/progress.json messages/en/progress.json
git commit -m "feat(task): 注册 AI_GRID_VIDEO_PROMPT 任务类型与计费/进度登记"
```

---

### Task 7: 手动重生 handler + text.worker 接线

**Files:**
- Create: `src/lib/workers/handlers/grid-video-prompt-rewrite.ts`
- Modify: `src/lib/workers/text.worker.ts:691`（switch）+ import 区
- Test: `tests/unit/workers/grid-video-prompt-rewrite-handler.test.ts`（新建）

**Interfaces:**
- Consumes: `rewriteGridVideoPrompt`（Task 3）、`resolveAnalysisModel`（`./resolve-analysis-model`）、`prisma`、`reportTaskProgress`/`assertTaskActive`
- Produces: `handleGridVideoPromptRewriteTask(job): Promise<{ panelId: string; rewritten: boolean }>`，回写 `panel.videoPrompt` + `gridVideoPromptAt`（强制重写）。**不调 `withTextBilling`**（计费由 task 生命周期负责）。

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/workers/grid-video-prompt-rewrite-handler.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rewriteMock = vi.hoisted(() => ({ rewriteGridVideoPrompt: vi.fn() }))
const prismaMock = vi.hoisted(() => ({ update: vi.fn(), findUnique: vi.fn() }))
const modelMock = vi.hoisted(() => ({ resolveAnalysisModel: vi.fn() }))

vi.mock('@/lib/storyboard-images/grid-video-prompt', () => ({
  rewriteGridVideoPrompt: rewriteMock.rewriteGridVideoPrompt,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { novelPromotionPanel: { update: prismaMock.update, findUnique: prismaMock.findUnique } },
}))
vi.mock('@/lib/workers/handlers/resolve-analysis-model', () => ({
  resolveAnalysisModel: modelMock.resolveAnalysisModel,
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn() }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: vi.fn() }))

import { handleGridVideoPromptRewriteTask } from '@/lib/workers/handlers/grid-video-prompt-rewrite'

const job = {
  data: {
    userId: 'u1', projectId: 'p1', locale: 'zh',
    targetType: 'NovelPromotionPanel', targetId: 'panel-1',
    payload: { gridSize: 4 },
  },
} as never

describe('handleGridVideoPromptRewriteTask', () => {
  beforeEach(() => {
    rewriteMock.rewriteGridVideoPrompt.mockReset()
    prismaMock.update.mockReset()
    prismaMock.findUnique.mockReset()
    modelMock.resolveAnalysisModel.mockReset()
    modelMock.resolveAnalysisModel.mockResolvedValue({ analysisModel: 'ark:doubao' })
    prismaMock.findUnique.mockResolvedValue({
      id: 'panel-1', description: '男人下班回家', shotType: '中景', cameraMove: '跟拍',
      location: '走廊', characters: '[]', srtSegment: '', videoPrompt: '旧提示词', imageLayout: 'grid',
    })
  })

  it('rewrites and persists videoPrompt + gridVideoPromptAt', async () => {
    rewriteMock.rewriteGridVideoPrompt.mockResolvedValue({ prompt: '0-3秒：推门', promptTokens: 10, completionTokens: 5 })
    const result = await handleGridVideoPromptRewriteTask(job)
    expect(prismaMock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'panel-1' },
      data: expect.objectContaining({ videoPrompt: '0-3秒：推门', gridVideoPromptAt: expect.any(Date) }),
    }))
    expect(result).toEqual({ panelId: 'panel-1', rewritten: true })
  })

  it('throws when rewrite returns null (no persist)', async () => {
    rewriteMock.rewriteGridVideoPrompt.mockResolvedValue(null)
    await expect(handleGridVideoPromptRewriteTask(job)).rejects.toThrow()
    expect(prismaMock.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:unit -- tests/unit/workers/grid-video-prompt-rewrite-handler.test.ts`
Expected: FAIL — handler 模块不存在。

- [ ] **Step 3: 实现 handler**

新建 `src/lib/workers/handlers/grid-video-prompt-rewrite.ts`：

```typescript
import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { rewriteGridVideoPrompt } from '@/lib/storyboard-images/grid-video-prompt'
import { resolveAnalysisModel } from './resolve-analysis-model'

type AnyObj = Record<string, unknown>

/**
 * 手动重生宫格视频提示词：强制用 LLM 重写并回写 videoPrompt + gridVideoPromptAt。
 * 计费由 task 生命周期负责（创建时已冻结 analysisModel），此处不再调 withTextBilling。
 */
export async function handleGridVideoPromptRewriteTask(
  job: Job<TaskJobData>,
): Promise<{ panelId: string; rewritten: boolean }> {
  const payload = (job.data.payload || {}) as AnyObj
  const panelId = job.data.targetType === 'NovelPromotionPanel' && job.data.targetId
    ? job.data.targetId
    : (typeof payload.panelId === 'string' ? payload.panelId : '')
  if (!panelId) throw new Error('AI_GRID_VIDEO_PROMPT: panelId missing')

  const panel = await prisma.novelPromotionPanel.findUnique({ where: { id: panelId } })
  if (!panel) throw new Error('AI_GRID_VIDEO_PROMPT: panel not found')

  await reportTaskProgress(job, 20, { stage: 'received' })
  await assertTaskActive(job, 'grid_video_prompt_rewrite_prepare')

  const { analysisModel } = await resolveAnalysisModel(job.data.projectId, job.data.userId)

  const payloadGridSize = typeof payload.gridSize === 'number' ? payload.gridSize : null
  const gridSize = payloadGridSize && payloadGridSize > 1 ? payloadGridSize : 4
  const locale = (job.data.locale as 'zh' | 'en') || 'zh'
  const basePrompt = panel.videoPrompt || panel.description || ''

  const result = await rewriteGridVideoPrompt({
    panelContext: {
      shot_type: panel.shotType || '',
      camera_move: panel.cameraMove || '',
      description: panel.description || '',
      location: panel.location || '',
      characters: panel.characters || '',
      text_segment: panel.srtSegment || '',
    },
    basePrompt,
    gridSize,
    shotType: panel.shotType || '',
    cameraMove: panel.cameraMove || '',
    locale,
    projectId: job.data.projectId,
    userId: job.data.userId,
    model: analysisModel,
  })

  if (!result) throw new Error('AI_GRID_VIDEO_PROMPT: rewrite returned empty')

  await assertTaskActive(job, 'grid_video_prompt_rewrite_persist')
  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: { videoPrompt: result.prompt, gridVideoPromptAt: new Date() },
  })

  await reportTaskProgress(job, 96, { stage: 'grid_video_prompt_rewrite_done' })
  return { panelId, rewritten: true }
}
```

- [ ] **Step 4: text.worker switch 接线**

`src/lib/workers/text.worker.ts` import 区（其他 handler import 附近）追加：

```typescript
import { handleGridVideoPromptRewriteTask } from './handlers/grid-video-prompt-rewrite'
```

`processTextTask` 的 switch 中，`case TASK_TYPE.INSERT_PANEL:` 分支之前加：

```typescript
    case TASK_TYPE.AI_GRID_VIDEO_PROMPT:
      return await handleGridVideoPromptRewriteTask(job)
```

- [ ] **Step 5: 跑测试 + typecheck**

Run: `npm run typecheck && npm run test:unit -- tests/unit/workers/grid-video-prompt-rewrite-handler.test.ts`
Expected: typecheck 通过；测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/workers/handlers/grid-video-prompt-rewrite.ts src/lib/workers/text.worker.ts tests/unit/workers/grid-video-prompt-rewrite-handler.test.ts
git commit -m "feat(text-worker): 新增宫格视频提示词手动重生 handler"
```

---

### Task 8: 创建重生 task 的 API route

**Files:**
- Create: `src/app/api/novel-promotion/[projectId]/ai-grid-video-prompt/route.ts`

**Interfaces:**
- Consumes: `requireProjectAuth`/`isErrorResponse`（`@/lib/api-auth`）、`apiHandler`/`ApiError`（`@/lib/api-errors`）、`maybeSubmitLLMTask`（`@/lib/llm-observe/route-task`）、`TASK_TYPE`
- Produces: `POST /api/novel-promotion/[projectId]/ai-grid-video-prompt`，body `{ panelId, episodeId?, gridSize? }` → 提交 `AI_GRID_VIDEO_PROMPT` task（billing 由 `maybeSubmitLLMTask` 自动注入 analysisModel）

> 说明：参照 `ai-modify-shot-prompt/route.ts`。`maybeSubmitLLMTask` 会在 `isBillableTaskType` 命中时自动补 `analysisModel` 到 payload 并构建 billingInfo（Task 6 已登记），无需手写计费。

- [ ] **Step 1: 实现 route**

新建 `src/app/api/novel-promotion/[projectId]/ai-grid-video-prompt/route.ts`：

```typescript
import { NextRequest } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({}))
  const panelId = typeof body?.panelId === 'string' ? body.panelId.trim() : ''
  if (!panelId) {
    throw new ApiError('INVALID_PARAMS')
  }
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId: episodeId || null,
    type: TASK_TYPE.AI_GRID_VIDEO_PROMPT,
    targetType: 'NovelPromotionPanel',
    targetId: panelId,
    routePath: `/api/novel-promotion/${projectId}/ai-grid-video-prompt`,
    body,
    dedupeKey: `ai_grid_video_prompt:${panelId}`,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/novel-promotion/[projectId]/ai-grid-video-prompt/route.ts"
git commit -m "feat(api): 新增宫格视频提示词重生 route"
```

---

### Task 9: UI 手动重生按钮 + mutation

**Files:**
- Modify: `src/lib/query/mutations/useVideoMutations.ts`（新增 mutation hook）
- Modify: 面板卡片提示词编辑区（`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/...`，在 videoPrompt 编辑 UI 旁加按钮）
- Modify: `messages/zh/*.json` + `messages/en/*.json`（按钮文案）

**Interfaces:**
- Consumes: 新 route `POST /api/novel-promotion/[projectId]/ai-grid-video-prompt`
- Produces: `useRegenerateGridVideoPrompt(projectId)` mutation hook；面板卡片在 `imageLayout==='grid'` 时显示「重新生成宫格视频提示词」按钮

> 说明：先确认面板卡片提示词编辑区的确切组件文件与 `imageLayout`/`videoPrompt` 可见性（执行时用 `codegraph_explore "VideoRenderPanel usePanelPromptEditor panel-card videoPrompt"` 定位）。本任务以 mutation hook 为可测交付物；按钮接线随组件结构就地完成。

- [ ] **Step 1: 新增 mutation hook**

在 `src/lib/query/mutations/useVideoMutations.ts` 末尾新增（参照同文件 `useListProjectEpisodeVideoUrls` 的 `requestJsonWithError` 用法）：

```typescript
export function useRegenerateGridVideoPrompt(projectId: string) {
  return useMutation({
    mutationFn: async (payload: { panelId: string; episodeId?: string; gridSize?: number }) =>
      await requestJsonWithError(
        `/api/novel-promotion/${projectId}/ai-grid-video-prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        '重新生成宫格视频提示词失败',
      ),
  })
}
```

（`requestJsonWithError` 已在文件顶部 import，无需新增导入。）

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 3: 接线按钮（就地）**

在面板卡片 videoPrompt 编辑区，仅当 `panel.imageLayout === 'grid'` 时渲染按钮，onClick 调用 `useRegenerateGridVideoPrompt(...).mutateAsync({ panelId, episodeId, gridSize })`，提交后刷新面板数据（复用该区现有的 refresh/invalidate 逻辑）。按钮文案用新 i18n key。

在 `messages/zh/<相关命名空间>.json` 加：

```json
"regenerateGridVideoPrompt": "重新生成宫格视频提示词"
```

在 `messages/en/<相关命名空间>.json` 加：

```json
"regenerateGridVideoPrompt": "Regenerate grid video prompt"
```

（命名空间以该面板卡片实际使用的 `useTranslations('<ns>')` 为准。）

- [ ] **Step 4: lint + typecheck**

Run: `npm run lint:all && npm run typecheck`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/query/mutations/useVideoMutations.ts src/app/\[locale\]/workspace messages/zh messages/en
git commit -m "feat(ui): 宫格面板新增重新生成宫格视频提示词按钮"
```

---

### Task 10: 端到端校验与回归

**Files:**
- 无新增

- [ ] **Step 1: 全量单测**

Run: `npm run test:unit:all`
Expected: 全部 PASS（重点：`grid-video-prompt`、两个 worker 测试、handler 测试）。

- [ ] **Step 2: typecheck + lint**

Run: `npm run verify:commit`
Expected: 通过（lint + typecheck + tests）。

- [ ] **Step 3: 提交校验快照（如有变更）**

```bash
git add -A
git commit -m "chore: 宫格视频提示词重写 端到端校验" --allow-empty
```

---

## Self-Review

**Spec coverage：**
- §4.2① `rewriteGridVideoPrompt` → Task 3 ✅
- §4.2② Prompt 模板改写 → Task 2 ✅
- §4.2③ video.worker 宫格分支 + `withTextBilling` → Task 4 ✅
- §4.2④ Prisma 字段 → Task 1 ✅
- §4.2⑤ 手动重生 task + handler（不调 withTextBilling）→ Task 6 + Task 7 ✅
- §4.2⑥ UI 按钮 → Task 9 ✅
- §4.3 缓存判定（gridVideoPromptAt 非空即复用，手动强制）→ Task 4（resolver）+ Task 7 ✅
- §4.3 宫格图失效清空 → Task 5 ✅
- §5 错误处理（失败回退 / 模型未配置）→ Task 4（try/catch + 无模型跳过）、Task 3（返回 null）、Task 7（抛错不持久化）✅
- §6 测试策略全部映射到各 Task 的测试步骤 ✅
- §7 影响面（Prisma/i18n/模板/TASK_TYPE 接线/宫格失效）→ Task 1/2/5/6 ✅

**Placeholder scan：** 无 TBD/TODO；每个改动步骤含完整代码。Task 9 的按钮接线因依赖组件结构，明确标注「执行时用 codegraph 定位」并给出可测交付物（mutation hook）——这是真实的就地集成，非占位。

**Type consistency：** `rewriteGridVideoPrompt` 返回 `{ prompt, promptTokens, completionTokens } | null`（Task 3）在 Task 4 resolver、Task 7 handler 中一致使用；`resolveGridVideoPrompt` 返回 `{ prompt, rewritten, usage }`（Task 4）一致；`buildGridInvalidationPatch`（Task 5）名一致；`AI_GRID_VIDEO_PROMPT`/`gridVideoPromptAt` 全程一致。
