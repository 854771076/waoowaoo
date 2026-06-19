# 镜头级分镜（N 宫格）图生成 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 N 宫格能力从片段级"AI生成故事板/拼接"下沉到镜头级生成图片入口的两个内联下拉（分镜数 1–16 + 候选数 1–4），删除片段层 UI 与 sharp 拼接服务。

**Architecture:** 镜头任务路由 `regenerate-panel-image` 透传新参数 `panelGridSize` 到 `handlePanelImageTask`；handler 在 N>1 时切换到新 prompt `NP_PANEL_GRID_IMAGE` 并注入 grid_layout 描述。前端 `ImageSection`/`ImageSectionActionButtons` 增加两个并列 `useImageGenerationCount` 下拉；新 scope `storyboard-grid` 用于持久化分镜数。

**Tech Stack:** Next.js 15 App Router、React 19、Prisma、BullMQ、Tailwind v4、next-intl、Vitest。

## Global Constraints

- 关联设计文档：`docs/superpowers/specs/2026-06-18-panel-grid-image-design.md`（每个任务的实现必须与该文档一致）
- 分镜数范围：`[1, 16]`，整数；用 `Math.max(1, Math.min(16, Number(...)))` 校验
- 候选数范围：`[1, 4]`，沿用 `storyboard-candidates` scope 的现有规则
- N=1 路径必须与今天 `handlePanelImageTask` 行为完全一致（回归不变）
- 整张宫格保持 `projectData.videoRatio`，子格被压缩；`aspectRatio` 仍传 `videoRatio`
- 后端 `handleStoryboardImageTask` + `NP_STORYBOARD_GRID_IMAGE` + `STORYBOARD_IMAGE` task type **保留**（仅清理 UI 入口）
- 新 prompt id 命名：`NP_PANEL_GRID_IMAGE`，prompt 模板 `pathStem='novel-promotion/panel_grid_image'`
- `dedupeKey` 包含 `panelGridSize` 字段，避免换分镜数时被去重打回
- 计费规则不变（仍按 `candidateCount` 计费，分镜数 N 不增加调用次数）
- 测试覆盖：每改一个 worker/路由分支必须在 `tests/unit/worker/` 加对应 case
- 提交规范：每个任务结尾 commit；commit message 中文/英文均可，前缀 `feat/refactor/test/chore`
- i18n：`messages/zh/` 与 `messages/en/` 必须同步增删
- 工作分支：`feat/panel-grid-image`（已创建并已提交 spec）

---

## File Structure

**新增**：
- `lib/prompts/novel-promotion/panel_grid_image.zh.txt` — 中文 prompt 模板
- `lib/prompts/novel-promotion/panel_grid_image.en.txt` — 英文 prompt 模板

**修改（核心改动）**：
- `src/lib/image-generation/count.ts` — 新 scope `storyboard-grid`
- `src/lib/prompt-i18n/prompt-ids.ts` — 新增 `NP_PANEL_GRID_IMAGE`
- `src/lib/prompt-i18n/catalog.ts` — 新增 catalog 条目
- `src/lib/workers/handlers/panel-image-task-handler.ts` — grid 分支
- `src/app/api/novel-promotion/[projectId]/regenerate-panel-image/route.ts` — `panelGridSize` 校验 + dedupeKey
- `src/lib/query/mutations/storyboard-panel-mutations.ts` — `useRegenerateProjectPanelImage` 入参扩展
- `src/app/[locale]/.../storyboard/hooks/usePanelImageRegeneration.ts` — `regeneratePanelImage` 签名
- `src/app/[locale]/.../storyboard/hooks/useImageGeneration.ts` — 暴露的 `regeneratePanelImage` 签名
- `src/app/[locale]/.../storyboard/ImageSection.tsx` — 空态双下拉
- `src/app/[locale]/.../storyboard/ImageSectionActionButtons.tsx` — 已有图态双下拉
- `messages/zh/storyboard.json`、`messages/en/storyboard.json` — 新增/删除 i18n key

**修改（清理改动）**：
- `src/app/[locale]/.../storyboard/StoryboardGroupActions.tsx` — 删除拼接/AI 生成按钮 + grid select
- `src/app/[locale]/.../storyboard/StoryboardGroup.tsx`、`StoryboardCanvas.tsx`、`StoryboardGroup.types.ts`、`StoryboardGroupDialogs.tsx`、`StoryboardCanvas.types.ts`（如有）— 收窄 prop 链
- `src/lib/storyboard-images/service.ts` — 删除 `composeGridImage`、`createCompositedStoryboardImage` 等 composite 相关函数
- `src/app/api/novel-promotion/[projectId]/storyboard-images/route.ts` — 删除 `mode: 'composited_storyboard'` 分支

**测试**：
- `tests/unit/worker/panel-image-task-handler.test.ts` — 扩展 panelGridSize 相关 case
- 删除 `composeGridImage` / `createCompositedStoryboardImage` 相关单测（如存在）

---

### Task 1: 新增 `storyboard-grid` count scope

**Files:**
- Modify: `src/lib/image-generation/count.ts`

**Interfaces:**
- Produces: `ImageGenerationCountScope` 联合类型新增 `'storyboard-grid'` 字面量；`getImageGenerationCountConfig('storyboard-grid')` 返回 `{ defaultValue: 1, min: 1, max: 16, storageKey: 'image-count:storyboard-grid' }`；`getImageGenerationCountOptions('storyboard-grid')` 返回 `[1, 2, 3, ..., 16]`

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/image-generation/storyboard-grid-scope.test.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import {
  getImageGenerationCountConfig,
  getImageGenerationCountOptions,
  normalizeImageGenerationCount,
} from '@/lib/image-generation/count'

describe('storyboard-grid scope', () => {
  it('exposes 1..16 options with default=1', () => {
    const config = getImageGenerationCountConfig('storyboard-grid')
    expect(config).toEqual({
      defaultValue: 1,
      min: 1,
      max: 16,
      storageKey: 'image-count:storyboard-grid',
    })
    expect(getImageGenerationCountOptions('storyboard-grid')).toEqual(
      Array.from({ length: 16 }, (_v, i) => i + 1),
    )
  })

  it('clamps out-of-range values', () => {
    expect(normalizeImageGenerationCount('storyboard-grid', 0)).toBe(1)
    expect(normalizeImageGenerationCount('storyboard-grid', 99)).toBe(16)
    expect(normalizeImageGenerationCount('storyboard-grid', '6')).toBe(6)
    expect(normalizeImageGenerationCount('storyboard-grid', 'abc')).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npx vitest run tests/unit/image-generation/storyboard-grid-scope.test.ts
```
预期：失败（`'storyboard-grid' is not assignable to ImageGenerationCountScope`）

- [ ] **Step 3: 实现 scope**

修改 `src/lib/image-generation/count.ts`：

```ts
// 1. 联合类型增加 'storyboard-grid'
export type ImageGenerationCountScope =
  | 'character'
  | 'location'
  | 'storyboard-candidates'
  | 'reference-to-character'
  | 'storyboard-grid'

// 2. 在 IMAGE_GENERATION_COUNT_CONFIG 对象里加一项
const IMAGE_GENERATION_COUNT_CONFIG: Record<ImageGenerationCountScope, ImageGenerationCountConfig> = {
  character: {
    defaultValue: 3,
    min: 1,
    max: 6,
    storageKey: 'image-count:character',
  },
  location: {
    defaultValue: 3,
    min: 1,
    max: 6,
    storageKey: 'image-count:location',
  },
  'storyboard-candidates': {
    defaultValue: 1,
    min: 1,
    max: 4,
    storageKey: 'image-count:storyboard-candidates',
  },
  'reference-to-character': {
    defaultValue: 3,
    min: 1,
    max: 6,
    storageKey: 'image-count:reference-to-character',
  },
  'storyboard-grid': {
    defaultValue: 1,
    min: 1,
    max: 16,
    storageKey: 'image-count:storyboard-grid',
  },
}
```

- [ ] **Step 4: 跑测试通过**

```bash
npx vitest run tests/unit/image-generation/storyboard-grid-scope.test.ts
```
预期：PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/image-generation/count.ts tests/unit/image-generation/storyboard-grid-scope.test.ts
git commit -m "feat(image-generation): add storyboard-grid count scope (1-16)"
```

---

### Task 2: 新增 prompt id + catalog 条目 + 模板文件

**Files:**
- Modify: `src/lib/prompt-i18n/prompt-ids.ts`
- Modify: `src/lib/prompt-i18n/catalog.ts`
- Create: `lib/prompts/novel-promotion/panel_grid_image.zh.txt`
- Create: `lib/prompts/novel-promotion/panel_grid_image.en.txt`

**Interfaces:**
- Produces: `PROMPT_IDS.NP_PANEL_GRID_IMAGE === 'np_panel_grid_image'`；catalog 条目 pathStem `'novel-promotion/panel_grid_image'`；变量列表 `['storyboard_text_json_input', 'source_text', 'aspect_ratio', 'style', 'grid_layout', 'panel_grid_size']`

- [ ] **Step 1: 注册 prompt id**

修改 `src/lib/prompt-i18n/prompt-ids.ts`，在 `PROMPT_IDS` 对象中（参照 `NP_STORYBOARD_GRID_IMAGE` 的位置）新增：

```ts
NP_PANEL_GRID_IMAGE: 'np_panel_grid_image',
```

- [ ] **Step 2: 注册 catalog**

修改 `src/lib/prompt-i18n/catalog.ts`，在 `NP_STORYBOARD_GRID_IMAGE` 条目下方新增：

```ts
[PROMPT_IDS.NP_PANEL_GRID_IMAGE]: {
  pathStem: 'novel-promotion/panel_grid_image',
  variableKeys: [
    'storyboard_text_json_input',
    'source_text',
    'aspect_ratio',
    'style',
    'grid_layout',
    'panel_grid_size',
  ],
},
```

- [ ] **Step 3: 写中文模板**

新建 `lib/prompts/novel-promotion/panel_grid_image.zh.txt`：

```
你是一名短剧分镜故事板视觉导演。请根据给定单镜头分镜 JSON 和原文片段，生成一张包含 {panel_grid_size} 个分镜格的宫格图。

要求：
1. 整张图为一张完整宫格图，不是单个镜头。
2. 按 {grid_layout} 排列，共 {panel_grid_size} 个分镜格，阅读顺序从左到右、从上到下。
3. 这 {panel_grid_size} 个分镜格围绕同一镜头的主体（角色/场景/动作），表现不同的 angle、瞬间、构图变体或动作分解，**而非 N 个独立故事板镜头**。
4. 全图保持统一画风：{style}
5. 整张图片比例为 {aspect_ratio}（每个子格被压缩到对应行列大小）。
6. 不要生成中文或英文文字、水印、编号、对白气泡和界面元素。
7. 分镜格之间需要有清晰边界，但不要让边框压过主体。
8. 角色外貌、服装、场景和道具需要在多个分镜格中保持一致。

镜头分镜 JSON：
{storyboard_text_json_input}

原文片段：
{source_text}
```

- [ ] **Step 4: 写英文模板**

新建 `lib/prompts/novel-promotion/panel_grid_image.en.txt`：

```
You are a storyboard visual director. Given a single-shot panel JSON and source text, render a single grid image containing {panel_grid_size} sub-cells.

Requirements:
1. The output is a single grid image, not separate panels.
2. Arrange sub-cells as {grid_layout}, total {panel_grid_size} cells, reading order left-to-right then top-to-bottom.
3. The {panel_grid_size} sub-cells should portray DIFFERENT angles, moments, composition variants, or action breakdowns of the SAME shot subject (character/location/action), NOT N independent storyboard shots.
4. Maintain unified art style across the whole image: {style}
5. Overall aspect ratio: {aspect_ratio} (each sub-cell is compressed to fit the row/column size).
6. No Chinese/English text, watermarks, numbering, dialogue bubbles, or UI elements.
7. Clear borders between sub-cells but the border should not overpower the subjects.
8. Character appearance, costume, location, and props must remain consistent across sub-cells.

Panel JSON:
{storyboard_text_json_input}

Source text:
{source_text}
```

- [ ] **Step 5: typecheck**

```bash
npm run typecheck
```
预期：PASS（catalog 类型检查通过）

- [ ] **Step 6: 提交**

```bash
git add src/lib/prompt-i18n/prompt-ids.ts src/lib/prompt-i18n/catalog.ts \
  lib/prompts/novel-promotion/panel_grid_image.zh.txt \
  lib/prompts/novel-promotion/panel_grid_image.en.txt
git commit -m "feat(prompt-i18n): add NP_PANEL_GRID_IMAGE prompt for panel-level N-grid"
```

---

### Task 3: Worker `handlePanelImageTask` 适配 grid 分支

**Files:**
- Modify: `src/lib/workers/handlers/panel-image-task-handler.ts`
- Modify: `tests/unit/worker/panel-image-task-handler.test.ts`

**Interfaces:**
- Consumes: `PROMPT_IDS.NP_PANEL_GRID_IMAGE`（Task 2）、`buildStoryboardGridLayout('grid_auto', N)` 既有函数
- Produces: payload 接收 `panelGridSize` 字段；N=1 走原 `NP_SINGLE_PANEL_IMAGE` 路径不变；N>1 调 `NP_PANEL_GRID_IMAGE` 并注入 `grid_layout` + `panel_grid_size` + `aspect_ratio`（仍为 `videoRatio`）；输出循环不变

- [ ] **Step 1: 在 panel-image handler 中提取 formatGridLayout（共用）**

> 当前 `formatGridLayout` 仅在 `storyboard-image-task-handler.ts` 内定义。把它内联复制到 `panel-image-task-handler.ts`（不跨 handler 抽公用模块，避免影响 storyboard handler 的回归）。

修改 `src/lib/workers/handlers/panel-image-task-handler.ts`，在文件顶部 import 区域新增：

```ts
import { buildStoryboardGridLayout } from '@/lib/storyboard-images/grid'
```

并在 `handlePanelImageTask` 之外新增辅助函数（参考 storyboard handler 写法）：

```ts
function formatPanelGridLayout(layout: ReturnType<typeof buildStoryboardGridLayout>, locale: TaskJobData['locale']) {
  if (locale === 'zh') {
    return `${layout.columns} 列 x ${layout.rows} 行`
  }
  return `${layout.columns} columns x ${layout.rows} rows`
}
```

- [ ] **Step 2: 写失败测试 — N=6 走 grid prompt**

修改 `tests/unit/worker/panel-image-task-handler.test.ts`，在文件顶部 prompt mock 部分把 `PROMPT_IDS` 扩展并 hoist `buildPromptAsync` 入参捕获：

```ts
// 替换原 prompt-i18n mock
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: {
    NP_SINGLE_PANEL_IMAGE: 'np_single_panel_image',
    NP_PANEL_GRID_IMAGE: 'np_panel_grid_image',
  },
  buildPrompt: promptMock.buildPrompt,
  buildPromptAsync: promptMock.buildPromptAsync,
}))
```

在 describe 末尾新增 case：

```ts
it('panelGridSize=1 -> uses single panel prompt (regression)', async () => {
  await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 1 }))
  expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
    expect.objectContaining({ promptId: 'np_single_panel_image' }),
  )
})

it('panelGridSize=6 -> switches to grid prompt with grid_layout + panel_grid_size', async () => {
  await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 6 }))
  expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      promptId: 'np_panel_grid_image',
      variables: expect.objectContaining({
        grid_layout: '3 列 x 2 行',
        panel_grid_size: '6',
        aspect_ratio: '16:9',
      }),
    }),
  )
})

it('panelGridSize clamped to [1,16]', async () => {
  await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 99 }))
  expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      promptId: 'np_panel_grid_image',
      variables: expect.objectContaining({ panel_grid_size: '16' }),
    }),
  )

  promptMock.buildPromptAsync.mockClear()
  await handlePanelImageTask(buildJob({ candidateCount: 1, panelGridSize: 0 }))
  expect(promptMock.buildPromptAsync).toHaveBeenCalledWith(
    expect.objectContaining({ promptId: 'np_single_panel_image' }),
  )
})

it('panelGridSize=6 with candidateCount=2 -> still produces 2 candidates', async () => {
  utilsMock.resolveImageSourceFromGeneration.mockReset()
  utilsMock.uploadImageSourceToCos.mockReset()
  utilsMock.resolveImageSourceFromGeneration
    .mockResolvedValueOnce('src-grid-1')
    .mockResolvedValueOnce('src-grid-2')
  utilsMock.uploadImageSourceToCos
    .mockResolvedValueOnce('cos/grid-1.png')
    .mockResolvedValueOnce('cos/grid-2.png')

  const result = await handlePanelImageTask(buildJob({ candidateCount: 2, panelGridSize: 6 }))
  expect(result.candidateCount).toBe(2)
  expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
    where: { id: 'panel-1' },
    data: {
      imageUrl: 'cos/grid-1.png',
      candidateImages: JSON.stringify(['cos/grid-1.png', 'cos/grid-2.png']),
    },
  })
})
```

- [ ] **Step 3: 跑测试看失败**

```bash
npx vitest run tests/unit/worker/panel-image-task-handler.test.ts -t 'panelGridSize'
```
预期：失败（`promptId` 仍是 single panel）

- [ ] **Step 4: 实现 grid 分支**

修改 `src/lib/workers/handlers/panel-image-task-handler.ts`：

在 `handlePanelImageTask` 函数体内、`const candidateCount = clampCount(...)` 之后插入：

```ts
const panelGridSize = clampCount(payload.panelGridSize, 1, 16, 1)
```

把现有的 `const prompt = await buildPanelPrompt({...})` 调用改造为分支：

```ts
const prompt = await (async () => {
  if (panelGridSize > 1) {
    const layout = buildStoryboardGridLayout('grid_auto', panelGridSize)
    return await buildPromptAsync({
      promptId: PROMPT_IDS.NP_PANEL_GRID_IMAGE,
      locale: job.data.locale,
      projectId: job.data.projectId,
      variables: {
        storyboard_text_json_input: contextJson,
        source_text: panel.srtSegment || panel.description || '',
        aspect_ratio: aspectRatio,
        style: artStyle || '与参考图风格一致',
        grid_layout: formatPanelGridLayout(layout, job.data.locale),
        panel_grid_size: String(panelGridSize),
      },
    })
  }
  return await buildPanelPrompt({
    projectId: job.data.projectId,
    locale: job.data.locale,
    aspectRatio,
    styleText: artStyle || '与参考图风格一致',
    sourceText: panel.srtSegment || panel.description || '',
    contextJson,
  })
})()
```

并把已有 logger.info `details` 增加 `panelGridSize` 字段以便排障：

```ts
details: {
  panelId,
  modelKey,
  candidateCount,
  panelGridSize,
  // ...rest
}
```

- [ ] **Step 5: 跑测试通过**

```bash
npx vitest run tests/unit/worker/panel-image-task-handler.test.ts
```
预期：所有 case PASS（包括原有 case）

- [ ] **Step 6: typecheck**

```bash
npm run typecheck
```

- [ ] **Step 7: 提交**

```bash
git add src/lib/workers/handlers/panel-image-task-handler.ts tests/unit/worker/panel-image-task-handler.test.ts
git commit -m "feat(worker): handlePanelImageTask supports panelGridSize 1-16 with NP_PANEL_GRID_IMAGE"
```

---

### Task 4: API 路由 `panelGridSize` 校验 + dedupeKey

**Files:**
- Modify: `src/app/api/novel-promotion/[projectId]/regenerate-panel-image/route.ts`

**Interfaces:**
- Consumes: 无新依赖
- Produces: 路由接收 body 字段 `panelGridSize`，校验后写入 task payload；`dedupeKey` 格式 `image_panel:${panelId}:${candidateCount}:${panelGridSize}`

- [ ] **Step 1: 修改路由**

修改 `src/app/api/novel-promotion/[projectId]/regenerate-panel-image/route.ts`：

在 `const candidateCount = ...` 行下方新增：

```ts
const panelGridSize = Math.max(1, Math.min(16, Number(body?.panelGridSize ?? 1)))
```

把 `billingPayload` 对象扩展：

```ts
const billingPayload = {
  ...body,
  candidateCount,
  panelGridSize,
  imageModel: projectModelConfig.storyboardModel,
  ...(Object.keys(capabilityOptions).length > 0 ? { generationOptions: capabilityOptions } : {})
}
```

把 `submitTask` 调用里的 `dedupeKey` 改为：

```ts
dedupeKey: `image_panel:${panelId}:${candidateCount}:${panelGridSize}`,
```

- [ ] **Step 2: typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: 手动 smoke（如已有 dev 环境，可选）**

启动 `npm run dev`，对一个 panel 触发 `panelGridSize=6` 的请求，确认返回 200 且 task 提交到队列；如无 dev 环境则跳过到 Step 4。

- [ ] **Step 4: 提交**

```bash
git add src/app/api/novel-promotion/[projectId]/regenerate-panel-image/route.ts
git commit -m "feat(api): regenerate-panel-image route accepts panelGridSize and updates dedupeKey"
```

---

### Task 5: 前端 mutation `useRegenerateProjectPanelImage` 入参扩展

**Files:**
- Modify: `src/lib/query/mutations/storyboard-panel-mutations.ts`

**Interfaces:**
- Consumes: 后端路由（Task 4）已支持 `panelGridSize`
- Produces: `useRegenerateProjectPanelImage().mutate({ panelId, count, panelGridSize })`；body JSON 包含 `panelGridSize`

- [ ] **Step 1: 修改 mutation**

修改 `src/lib/query/mutations/storyboard-panel-mutations.ts` 中 `useRegenerateProjectPanelImage`：

把 `mutationFn` 入参签名与 body 改为：

```ts
mutationFn: async ({ panelId, count, panelGridSize }: { panelId: string; count?: number; panelGridSize?: number }) => {
  const res = await apiFetch(`/api/novel-promotion/${projectId}/regenerate-panel-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      panelId,
      count: count ?? 1,
      panelGridSize: panelGridSize ?? 1,
    }),
  })
  // ...其余错误分支不变
  return res.json()
},
```

`onMutate` / `onError` 中只用 `panelId`，无需改动。

- [ ] **Step 2: typecheck**

```bash
npm run typecheck
```
预期：因 hook 调用方仍传旧签名，可能报 1-2 处 caller 类型错误（`usePanelImageRegeneration.ts` 的 `regeneratePanelMutation` 接口）。这些 caller 在 Task 6 会同步修。**这里允许 typecheck 暂时报错跨任务边界**，但确认错误只来自这两个已知文件。

- [ ] **Step 3: 提交**

```bash
git add src/lib/query/mutations/storyboard-panel-mutations.ts
git commit -m "feat(mutation): useRegenerateProjectPanelImage accepts panelGridSize"
```

---

### Task 6: Hook `usePanelImageRegeneration` + `useImageGeneration` 透传 panelGridSize

**Files:**
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/usePanelImageRegeneration.ts`
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/useImageGeneration.ts`

**Interfaces:**
- Consumes: `useRegenerateProjectPanelImage`（Task 5）
- Produces: `regeneratePanelImage(panelId, count?, force?, panelGridSize?)`；`useStoryboardImageGeneration` 暴露的同名函数透传第 4 个参数

- [ ] **Step 1: 修改 `usePanelImageRegeneration.ts`**

修改 `RegeneratePanelMutationLike` 接口：

```ts
interface RegeneratePanelMutationLike {
  mutateAsync: (payload: { panelId: string; count: number; panelGridSize: number }) => Promise<unknown>
}
```

修改 `regeneratePanelImage` 实现：

```ts
const regeneratePanelImage = useCallback(
  async (panelId: string, count: number = 1, force: boolean = false, panelGridSize: number = 1) => {
    if (!force && submittingPanelImageIds.has(panelId)) return

    setSubmittingPanelImageIds((previous) => new Set(previous).add(panelId))

    let handoffToTaskState = false
    try {
      const data = await regeneratePanelMutation.mutateAsync({ panelId, count, panelGridSize })
      // ...其余逻辑保持不变
```

`regenerateAllPanelsIndividually` 里的 `regeneratePanelImage(panel.id)` 调用保持原样（依赖默认参数 `panelGridSize=1`，与今天行为一致）。

- [ ] **Step 2: 修改 `useImageGeneration.ts` 透传（无需改实现细节，只确保导出函数签名足够宽）**

`useStoryboardImageGeneration` 直接 return `regeneratePanelImage`，已天然支持新签名，无需改动。但要把 `useCreateProjectStoryboardImage`、`createCompositedStoryboardImage`、`createAiStoryboardImage` 暂时**保留**（Task 11 才删除），避免本任务破坏面太大。

- [ ] **Step 3: typecheck**

```bash
npm run typecheck
```
预期：之前 Task 5 引入的类型错误现在应该消失（mutation 签名匹配）。

- [ ] **Step 4: 跑现有测试看不破坏**

```bash
npx vitest run tests/unit/worker/panel-image-task-handler.test.ts
```
预期：仍 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/usePanelImageRegeneration.ts \
  src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/useImageGeneration.ts
git commit -m "feat(hooks): regeneratePanelImage forwards panelGridSize to mutation"
```

---

### Task 7: ImageSection 空态新增双下拉

**Files:**
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSection.tsx`
- Modify: `messages/zh/storyboard.json`、`messages/en/storyboard.json`

**Interfaces:**
- Consumes: `useImageGenerationCount('storyboard-grid')`（Task 1）+ `useImageGenerationCount('storyboard-candidates')`（已有）
- Produces: `ImageSectionProps.onRegeneratePanelImage` 类型扩展为 `(panelId: string, count?: number, force?: boolean, panelGridSize?: number) => void`

- [ ] **Step 1: 增加 i18n key**

修改 `messages/zh/storyboard.json` 在 `image` 节点下新增：

```json
"panelGridSize": "分镜数",
"candidateCount": "候选数",
```

修改 `messages/en/storyboard.json` 对应位置：

```json
"panelGridSize": "Cells",
"candidateCount": "Candidates",
```

- [ ] **Step 2: 修改 ImageSection.tsx**

在文件顶部 imports 增加：

```tsx
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'
```

修改 `ImageSectionProps.onRegeneratePanelImage` 类型：

```ts
onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean, panelGridSize?: number) => void
```

替换 `renderEmptyState`：

```tsx
const renderEmptyState = () => {
  // hooks 必须在组件顶层；下面这两个在组件函数体提取
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-tertiary)] p-3">
      <AppIcon name="imagePreview" className="w-8 h-8" />
      <span className="text-xs">{t('video.toolbar.showPending')}</span>
      <GlassButton
        variant="primary"
        size="sm"
        onClick={() => {
          triggerPulse()
          onRegeneratePanelImage(panelId, candidateCount, false, panelGridSize)
        }}
      >
        {t('panel.generateImage')}
      </GlassButton>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--glass-text-tertiary)]">
        <label className="flex items-center gap-1">
          <span>{t('image.panelGridSize')}</span>
          <select
            value={panelGridSize}
            onChange={(e) => setPanelGridSize(Number(e.target.value))}
            className="bg-transparent border border-[var(--glass-stroke-base)] rounded px-1 text-[10px]"
          >
            {getImageGenerationCountOptions('storyboard-grid').map((n) => (
              <option key={n} value={n} className="text-black">{n}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span>{t('image.candidateCount')}</span>
          <select
            value={candidateCount}
            onChange={(e) => setCandidateCount(Number(e.target.value))}
            className="bg-transparent border border-[var(--glass-stroke-base)] rounded px-1 text-[10px]"
          >
            {getImageGenerationCountOptions('storyboard-candidates').map((n) => (
              <option key={n} value={n} className="text-black">{n}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
```

并在 `ImageSection` 函数体顶部（紧跟 `const t = useTranslations('storyboard')` 之后）新增两个 hook 调用：

```ts
const { count: candidateCount, setCount: setCandidateCount } = useImageGenerationCount('storyboard-candidates')
const { count: panelGridSize, setCount: setPanelGridSize } = useImageGenerationCount('storyboard-grid')
```

> 注意：原 `ImageSectionActionButtons` 也用了 `storyboard-candidates` 的 hook，由于 `useImageGenerationCount` 内部以 `localStorage` 为真源，两处实例对同一 scope 自动同步，不会冲突。

- [ ] **Step 3: typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: lint**

```bash
npx eslint src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSection.tsx
```
预期：PASS

- [ ] **Step 5: 提交**

```bash
git add src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSection.tsx \
  messages/zh/storyboard.json messages/en/storyboard.json
git commit -m "feat(ui): ImageSection empty state adds panelGridSize + candidateCount selectors"
```

---

### Task 8: ImageSectionActionButtons 已有图态新增分镜数下拉

**Files:**
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSectionActionButtons.tsx`

**Interfaces:**
- Consumes: `useImageGenerationCount('storyboard-grid')`、Task 6 的扩展回调
- Produces: `ImageSectionActionButtonsProps.onRegeneratePanelImage` 类型扩展同 Task 7；按钮 `onClick` 透传 `panelGridSize`

- [ ] **Step 1: 修改 props 类型**

修改 `ImageSectionActionButtonsProps`：

```ts
interface ImageSectionActionButtonsProps {
  panelId: string
  imageUrl: string | null
  previousImageUrl?: string | null
  isSubmittingPanelImageTask: boolean
  isModifying: boolean
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean, panelGridSize?: number) => void
  onOpenEditModal: () => void
  onOpenAIDataModal: () => void
  onUndo?: (panelId: string) => void
  triggerPulse: () => void
}
```

- [ ] **Step 2: 增加分镜数 hook + 在原 ImageGenerationInlineCountButton 旁加一个原生 select**

在文件顶部 imports 区，确保已有：

```ts
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
```

在 `ImageSectionActionButtons` 函数体内 `const { count, setCount } = useImageGenerationCount('storyboard-candidates')` 之后新增：

```ts
const { count: panelGridSize, setCount: setPanelGridSize } = useImageGenerationCount('storyboard-grid')
```

修改原 `ImageGenerationInlineCountButton` 的 `onClick` 回调：

```ts
onClick={() => {
  _ulogInfo('[ImageSection] 🔄 左下角重新生成按钮被点击')
  _ulogInfo('[ImageSection] isSubmittingPanelImageTask:', isSubmittingPanelImageTask)
  _ulogInfo('[ImageSection] panelGridSize:', panelGridSize)
  triggerPulse()
  onRegeneratePanelImage(panelId, count, isSubmittingPanelImageTask, panelGridSize)
}}
```

在原 `<div className="w-px h-3 bg-..." />` 分隔线之后、"查看AI数据"按钮之前，**插入分镜数下拉**：

```tsx
<div className="w-px h-3 bg-[var(--glass-stroke-base)]" />
<label className="flex items-center gap-0.5 px-1.5 text-[10px] text-[var(--glass-text-secondary)]">
  <span>{t('image.panelGridSize')}</span>
  <select
    value={String(panelGridSize)}
    onChange={(e) => setPanelGridSize(Number(e.target.value))}
    aria-label={t('image.panelGridSize')}
    disabled={isSubmittingPanelImageTask}
    className="appearance-none bg-transparent border-0 pr-2 text-[10px] font-semibold text-[var(--glass-text-primary)] outline-none cursor-pointer"
  >
    {getImageGenerationCountOptions('storyboard-grid').map((n) => (
      <option key={n} value={n} className="text-black">{n}</option>
    ))}
  </select>
</label>
```

- [ ] **Step 3: 修改 PanelCard.tsx 与上层透传**

> `PanelCard.tsx` 把 `onRegeneratePanelImage` 透传给 `ImageSection`，`ImageSection` 透传给 `ImageSectionActionButtons`。`PanelCard` 自身的 prop 签名也要扩展。

修改 `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/PanelCard.tsx` 中：

```ts
onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean, panelGridSize?: number) => void
```

`StoryboardPanelList.tsx` 的对应 prop 也同步扩展（grep `onRegeneratePanelImage` 找到所有透传点）：

```bash
grep -rn "onRegeneratePanelImage" src/app/\[locale\]/workspace/\[projectId\]/modes/novel-promotion/components/storyboard/ | head
```

把每一处类型签名都加上第 4 参数 `panelGridSize?: number`。

- [ ] **Step 4: typecheck**

```bash
npm run typecheck
```
预期：PASS

- [ ] **Step 5: lint**

```bash
npm run lint:all
```
预期：PASS

- [ ] **Step 6: 提交**

```bash
git add src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/
git commit -m "feat(ui): ImageSectionActionButtons adds panelGridSize selector and forwards through props"
```

---

### Task 9: 端到端手动验证（不写代码，仅勾选）

> 此任务无代码改动，仅做人工验证。开发者按列表逐项手测；如果项目运行环境不可用可跳过这一任务，但仍要通过 Task 10 之后的 verify:commit 兜底。

- [ ] **Step 1: 启动开发环境**

```bash
docker compose up mysql redis minio -d
npm run dev
```

打开 `http://localhost:3000` 进入 storyboard 编辑页。

- [ ] **Step 2: 验证 N=1 回归**

选择一个空 panel，分镜数=1、候选数=1，点击"生成图片"。
预期：与今天行为一致，生成单张图后落入 `imageUrl`。

- [ ] **Step 3: 验证 N=6 单候选**

分镜数=6、候选数=1，点击"生成图片"。
预期：生成 1 张 6 宫格大图（2×3 排列），保持 `videoRatio`。`panel.imageUrl` 直接是宫格图。

- [ ] **Step 4: 验证 N=6 + 候选数 2**

分镜数=6、候选数=2，点击"生成图片"。
预期：生成 2 张 6 宫格大图，进入候选选择模式（`ImageSectionCandidateMode`），可挑 1 张确认。

- [ ] **Step 5: 验证 N=16 极端值**

分镜数=16，点击"生成图片"。
预期：生成 1 张 16 宫格图（4×4 或近似），仍可生成；模型质量自评但不报错。

- [ ] **Step 6: 验证 localStorage 记忆**

刷新页面，下拉默认值与上次选择一致。

- [ ] **Step 7: 记录验证结果**

如果任何一步失败，在团队群/issue 中记录后回到 Task 3 / 7 / 8 修复。

---

### Task 10: 清理 — `StoryboardGroupActions` 删除拼接 + AI 生成按钮

**Files:**
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardGroupActions.tsx`

**Interfaces:**
- Produces: `StoryboardGroupActionsProps` 收窄；移除 `gridPreset`、`isCompositingStoryboardImage`、`canCompositeStoryboardImage`、`isSubmittingStoryboardTask`、`onCreateAiStoryboardImage`、`onCreateCompositedStoryboardImage`、`onGridPresetChange` 这些字段

- [ ] **Step 1: 重写 StoryboardGroupActions.tsx**

完整替换文件内容：

```tsx
'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { GlassButton } from '@/components/ui/primitives'
import { AppIcon } from '@/components/ui/icons'

interface StoryboardGroupActionsProps {
  hasAnyImage: boolean
  isSubmittingStoryboardTextTask: boolean
  currentRunningCount: number
  pendingCount: number
  panelCount: number
  onRegenerateText: () => void
  onGenerateAllIndividually: () => void
  onAddPanel: () => void
  onDeleteStoryboard: () => void
}

export default function StoryboardGroupActions({
  hasAnyImage,
  isSubmittingStoryboardTextTask,
  currentRunningCount,
  pendingCount,
  panelCount,
  onRegenerateText,
  onGenerateAllIndividually,
  onAddPanel,
  onDeleteStoryboard,
}: StoryboardGroupActionsProps) {
  const t = useTranslations('storyboard')

  const textTaskRunningState = useMemo(() => {
    if (!isSubmittingStoryboardTextTask) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: 'regenerate',
      resource: 'text',
      hasOutput: true,
    })
  }, [isSubmittingStoryboardTextTask])

  const panelTaskRunningState = useMemo(() => {
    if (currentRunningCount <= 0) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: hasAnyImage ? 'regenerate' : 'generate',
      resource: 'image',
      hasOutput: hasAnyImage,
    })
  }, [currentRunningCount, hasAnyImage])

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <GlassButton
        variant="secondary"
        size="sm"
        onClick={onRegenerateText}
        disabled={isSubmittingStoryboardTextTask}
      >
        {isSubmittingStoryboardTextTask ? (
          <TaskStatusInline state={textTaskRunningState} />
        ) : (
          <>
            <AppIcon name="refresh" className="h-3 w-3" />
            <span>{t('group.regenerateText')}</span>
          </>
        )}
      </GlassButton>

      {pendingCount > 0 && (
        <GlassButton
          variant="primary"
          size="sm"
          onClick={onGenerateAllIndividually}
          disabled={currentRunningCount > 0 || panelCount <= 0}
          title={t('group.generateMissingImages')}
        >
          {currentRunningCount > 0 ? (
            <TaskStatusInline state={panelTaskRunningState} />
          ) : (
            <>
              <AppIcon name="plus" className="h-3 w-3" />
              <span>{t('group.generateAll')}</span>
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-white/25 text-white">{pendingCount}</span>
            </>
          )}
        </GlassButton>
      )}

      <GlassButton
        variant="secondary"
        size="sm"
        onClick={onAddPanel}
      >
        <AppIcon name="plusMd" className="h-3.5 w-3.5" />
        <span>{t('group.addPanel')}</span>
      </GlassButton>

      <GlassButton
        variant="danger"
        size="sm"
        onClick={onDeleteStoryboard}
        title={t('common.delete')}
      >
        <AppIcon name="trashAlt" className="h-3.5 w-3.5" />
        <span>{t('common.delete')}</span>
      </GlassButton>
    </div>
  )
}
```

- [ ] **Step 2: typecheck**

```bash
npm run typecheck
```
预期：报告 `StoryboardGroup.tsx`、`StoryboardCanvas.tsx`、`StoryboardGroup.types.ts`、`StoryboardGroupDialogs.tsx` 等多处类型错误（旧 props 不再存在）。这些在 Task 11 修复。

- [ ] **Step 3: 提交（带破坏性，下一任务必须紧跟）**

```bash
git add src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardGroupActions.tsx
git commit -m "refactor(ui): drop AI/composite buttons from StoryboardGroupActions"
```

---

### Task 11: 清理 — 上层 props 链 + useImageGeneration 移除拼接相关字段

**Files:**
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardGroup.tsx`
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardCanvas.tsx`
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardGroup.types.ts`
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardGroupDialogs.tsx`
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/useImageGeneration.ts`

**Interfaces:**
- Produces: 上述文件不再有 `gridPreset`、`onCreateAiStoryboardImage`、`onCreateCompositedStoryboardImage`、`compositingStoryboardIds`、`submittingAiStoryboardIds`、`isCompositingStoryboardImage`、`canCompositeStoryboardImage` 等概念

- [ ] **Step 1: 用 grep 锁定所有引用点**

```bash
grep -rn "gridPreset\|onCreateAiStoryboardImage\|onCreateCompositedStoryboardImage\|compositingStoryboardIds\|submittingAiStoryboardIds\|canCompositeStoryboardImage\|isCompositingStoryboardImage\|createAiStoryboardImage\|createCompositedStoryboardImage" \
  src/app/\[locale\]/workspace/\[projectId\]/modes/novel-promotion/components/storyboard/
```

记录每一处文件 + 行号。

- [ ] **Step 2: 删除 `StoryboardGroup.tsx` 中相关 prop / hook 调用**

`StoryboardGroup.tsx`：
- 删除 import `STORYBOARD_GRID_PRESETS`、`StoryboardGridPreset`
- 从 `StoryboardGroupProps` 中删除 `gridPreset`、`onGridPresetChange`、`isCompositingStoryboardImage`、`canCompositeStoryboardImage`、`isSubmittingStoryboardTask`、`onCreateAiStoryboardImage`、`onCreateCompositedStoryboardImage`
- 在传给 `StoryboardGroupActions` 的 props 里只保留 Task 10 的新签名所列字段

`StoryboardGroup.types.ts`：删除 `StoryboardGridPreset` 引用与对应字段。

- [ ] **Step 3: 删除 `StoryboardCanvas.tsx` 中相关 state 与 prop**

- 删除 import `StoryboardGridPreset`
- 删除 `gridPreset` 相关 state（如 `useState<StoryboardGridPreset>(...)`）与 `setGridPreset` 调用
- 删除 `submittingStoryboardIds`、`compositingStoryboardIds` 的传递（从 `useStoryboardImageGeneration` 解构里移除，并不要再向 `StoryboardGroup` 传）
- 删除 `createAiStoryboardImage`、`createCompositedStoryboardImage` 解构与 prop 透传

`StoryboardGroupDialogs.tsx`（如有相关错误对话框）：删除"拼接故事板失败" / "AI 生成故事板失败"对应分支与文案。

- [ ] **Step 4: 修改 `useImageGeneration.ts`**

- 删除 import `useCreateProjectStoryboardImage`
- 删除 import `StoryboardGridPreset`
- 删除 state `submittingAiStoryboardIds`、`compositingStoryboardIds`
- 删除 函数 `createAiStoryboardImage`、`createCompositedStoryboardImage`
- 删除 `submittingStoryboardIds` 的 `Set` 合并逻辑（改为只取 `localStoryboards.filter(...storyboardTaskRunning).map(...).id` 形成集合即可）
- 在 return 对象里移除 `submittingAiStoryboardIds`、`compositingStoryboardIds`、`createAiStoryboardImage`、`createCompositedStoryboardImage`

修改后 return 对象示例（参考但不限于）：

```ts
return {
  submittingStoryboardIds,
  submittingPanelImageIds,
  selectingCandidateIds,
  panelCandidateIndex,
  setPanelCandidateIndex,
  editingPanel,
  setEditingPanel,
  modifyingPanels,
  isDownloadingImages,
  previewImage,
  setPreviewImage,
  regeneratePanelImage,
  regenerateAllPanelsIndividually,
  selectPanelCandidate: confirmPanelCandidate,
  selectPanelCandidateIndex,
  cancelPanelCandidate,
  getPanelCandidates,
  modifyPanelImage,
  downloadAllImages,
  clearStoryboardError,
}
```

- [ ] **Step 5: 删除 `useCreateProjectStoryboardImage` mutation hook（YAGNI）**

确认无其他 caller：

```bash
grep -rn "useCreateProjectStoryboardImage" src/
```

如只剩 `src/lib/query/mutations/storyboard-panel-mutations.ts`（定义处）和 `src/lib/query/hooks/index.ts`（re-export）：删除两处的定义/导出。

- [ ] **Step 6: typecheck**

```bash
npm run typecheck
```
预期：PASS（所有引用都已消除）

- [ ] **Step 7: lint**

```bash
npm run lint:all
```
预期：PASS

- [ ] **Step 8: 提交**

```bash
git add src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ \
  src/lib/query/mutations/storyboard-panel-mutations.ts \
  src/lib/query/hooks/index.ts
git commit -m "refactor(storyboard): remove AI/composite storyboard image flow from frontend"
```

---

### Task 12: 清理 — 后端 `composeGridImage` / 拼接服务下线

**Files:**
- Modify: `src/lib/storyboard-images/service.ts`
- Modify: `src/app/api/novel-promotion/[projectId]/storyboard-images/route.ts`

**Interfaces:**
- Produces: `service.ts` 不再导出 `composeGridImage`、`createCompositedStoryboardImage`、`StoryboardImageCreationResult` 中只服务 composite 的字段；保留 `persistAiStoryboardImage`、`findStoryboardForProject` 等被 worker 使用的函数。`storyboard-images` 路由只接受 `mode: 'ai_storyboard'`

- [ ] **Step 1: 删除 service composite 相关函数**

修改 `src/lib/storyboard-images/service.ts`：
- 删除 `composeGridImage` 函数体
- 删除 `fetchPanelImageBuffer`、`resolveCellSize`、`resolveGap`、`buildSourcePanelsSnapshot`
- 删除 `createCompositedStoryboardImage`
- 删除 `StoryboardPanelForComposite` 类型（如该类型只用于 composite）
- 删除该文件顶部不再使用的 `import sharp from 'sharp'`、`import { StoryboardPanelImageMissingError } from '...'` 等悬空 import

> 复用与保留：`persistAiStoryboardImage`、`findStoryboardForProject` / `findStoryboardForImageTask`、`isStoryboardGridRuleError`（如 worker 仍调用）必须保留。改动后用编译器找悬空 import。

- [ ] **Step 2: 删除路由 composite 分支**

修改 `src/app/api/novel-promotion/[projectId]/storyboard-images/route.ts`：
- 移除 `mode: 'composited_storyboard'` 分支
- 路由现在只接受 `mode: 'ai_storyboard'`；可考虑直接删整个 mode 字段并简化路由
- 如果整个路由仅用于 composite 且 ai_storyboard 已经走 task 系统提交（实际由 `submitTask` 触发，路由可能确实变成无用），删除整个路由文件

> 实施判断：先改成只支持 `ai_storyboard`；如发现前端无任何 caller 在 Task 11 后还引用此路由，则在本任务的 Step 4 直接删除整个路由目录。

- [ ] **Step 3: typecheck**

```bash
npm run typecheck
```
预期：PASS

- [ ] **Step 4: 路由是否需要保留？**

```bash
grep -rn "/storyboard-images\|storyboard-images/route" src/ --include="*.ts" --include="*.tsx" | grep -v "src/app/api/novel-promotion/\[projectId\]/storyboard-images/route.ts"
```

如输出为空，删除整个目录：

```bash
rm -rf src/app/api/novel-promotion/[projectId]/storyboard-images
```

如有引用，保留路由，但保持仅 `ai_storyboard` 一个分支。

- [ ] **Step 5: 收尾 grep — 确认无残留**

```bash
grep -rn "composited_storyboard\|composeGridImage\|createCompositedStoryboardImage\|fetchPanelImageBuffer" src/
```

预期：输出为空（或仅剩历史 fixture/migration 中的字符串，那些不动）。

- [ ] **Step 6: 删除拼接相关单测（如存在）**

```bash
find tests -name "*compose*" -o -name "*composite*" 2>/dev/null
```

逐个检查并删除内容仅围绕 `composeGridImage` / `createCompositedStoryboardImage` 的测试文件。

- [ ] **Step 7: 全量测试**

```bash
npm run test:unit:all
```
预期：PASS（如有失败必为本任务漏删的 caller，回到 Step 1-2 修补）

- [ ] **Step 8: 提交**

```bash
git add src/lib/storyboard-images/service.ts \
  src/app/api/novel-promotion/[projectId]/storyboard-images/ \
  tests/
git commit -m "refactor(storyboard-images): drop sharp composite service and route branch"
```

---

### Task 13: 清理 i18n key + 最终验收

**Files:**
- Modify: `messages/zh/storyboard.json`、`messages/en/storyboard.json`

**Interfaces:**
- Produces: 不再有 `storyboard.storyboardImage.compose / aiGenerate / gridPreset / grid3 / grid6 / grid9 / gridAuto / missingPanelImages` 等 key

- [ ] **Step 1: 删除中文 key**

修改 `messages/zh/storyboard.json`，删除整个 `storyboardImage` 节点（如除"finalImage / preview"以外仅剩拼接/AI 相关 key，可以全删；保留 `finalImage / preview` 如果未来还会用到）。

```bash
grep -rn "storyboardImage\." src/ --include="*.ts" --include="*.tsx"
```

如输出为空，则中文 + 英文 `storyboardImage` 节点整体删除。

- [ ] **Step 2: 删除英文 key**

`messages/en/storyboard.json` 同步操作。

- [ ] **Step 3: 跑 i18n 校验（如项目有相关 guard 测试）**

```bash
npm run test:guards 2>/dev/null || echo "no guard target"
```

如失败：补齐 key 或在英文/中文中删干净（避免单语缺失）。

- [ ] **Step 4: 全量验证**

```bash
npm run verify:commit
```

预期：lint + typecheck + test 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add messages/
git commit -m "chore(i18n): remove obsolete storyboard composite/AI image keys"
```

- [ ] **Step 6: 推送分支**

```bash
git push origin feat/panel-grid-image
```

---

## Self-Review

### 1. Spec coverage

| Spec 节 / 要求 | 实现任务 |
|---|---|
| UI 镜头层双下拉（空态 + 已有图态） | Task 7、Task 8 |
| 片段层移除 AI/拼接/grid select | Task 10、Task 11 |
| 前端 mutation 透传 panelGridSize | Task 5 |
| Hook 链 `regeneratePanelImage` 签名扩展 | Task 6 |
| 后端 API panelGridSize 校验 + dedupeKey | Task 4 |
| Worker grid 分支 + 新 prompt | Task 3、Task 2 |
| 新 `storyboard-grid` count scope | Task 1 |
| Prompt 模板 zh/en | Task 2 |
| 删除 composeGridImage 拼接服务 | Task 12 |
| 删除拼接相关 i18n key | Task 13 |
| 保留后端 STORYBOARD_IMAGE worker | （未变动，符合 spec） |
| 测试：N=1 回归、N=6 grid prompt、clamping、N=6+K=2 候选 | Task 3 |
| 端到端手动验证 | Task 9 |

无遗漏。

### 2. Placeholder scan

无 TBD / "实现 X 的逻辑" / "类似 Task N" 模式残留。所有代码块均给出实际可粘贴的内容。

### 3. Type consistency

- `panelGridSize` 在 mutation、hook、props、handler、API 均声明为 `number`，并默认值 1
- `useImageGenerationCount('storyboard-grid')` 在 Task 1 注册，在 Task 7 / 8 使用
- `PROMPT_IDS.NP_PANEL_GRID_IMAGE` 字符串值 `'np_panel_grid_image'` 在 Task 2 与 Task 3 测试中保持一致
- `formatPanelGridLayout` 与 storyboard handler 中的 `formatGridLayout` 同名但分别定义在两个 handler 文件中（避免跨文件抽公用模块影响 storyboard handler 回归）
- `dedupeKey` 格式 `image_panel:${panelId}:${candidateCount}:${panelGridSize}` 在 Task 4 实现、与 Task 3 的测试断言一致

无类型不一致。
