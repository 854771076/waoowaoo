# 宫格视频提示词 LLM 重写 — 设计文档

**日期**：2026-06-23
**作者**：fuyang + Claude
**关联**：`2026-06-18-panel-grid-image-design.md`（宫格图生成）

## 1. 背景与问题

短剧制作流程中，分镜面板（`NovelPromotionPanel`）可以渲染成「宫格图」（`imageLayout='grid'`）：一张图包含 N 个分镜格，表现同一镜头主体的不同 angle / 瞬间 / 动作分解（见 `lib/prompts/novel-promotion/panel_grid_image.zh.txt`）。

视频生成阶段，宫格面板走 `video.worker` 的宫格分支（`src/lib/workers/video.worker.ts:123`），当前调用 `buildGridVideoPrompt`（`src/lib/storyboard-images/grid-video-prompt.ts:41`）。

**核心问题**：`buildGridVideoPrompt` 只是**模板填充**——它把面板原有的 `videoPrompt`/`description` 文本塞进一个固定的「请把各格补间成连续镜头」包装模板里，**没有任何 LLM 真正理解宫格的内容**。结果是 Seedance 收到的本质上还是用于「生成宫格图」的描述，并不是一条符合 Seedance 视频规范的提示词，导致宫格生成视频效果差。

**用户诉求**：用 LLM 真正理解宫格里每一个分镜格，按 Seedance 规范重写成视频提示词，写入 `video_prompt` 字段，再用该字段生成视频。

## 2. 目标与非目标

### 目标
- 宫格面板生成视频时，先用 LLM（文本，基于结构化上下文）把宫格理解为「同一连续镜头的关键帧序列」，按 Seedance 时间戳分镜规范重写出一条视频提示词。
- 重写结果回写到 `panel.videoPrompt`，在视频阶段 UI 中可见、可手动编辑。
- 带缓存：已重写且用户未手改时，复用，不重复调 LLM。
- 提供「重新生成宫格视频提示词」的手动按钮，让用户主动触发重写。

### 非目标
- **不**做视觉理解（不把宫格图喂给多模态模型）。仅基于面板的结构化文本上下文（description / shot_type / camera_move / characters / location / srtSegment 等）。
- **不**把宫格拆成 N 条独立视频。输出仍是**一条**提示词、一条视频；用时间戳分镜在单条提示词内串联各格。
- **不**改动宫格图生成逻辑。
- **不**改动非宫格（single）面板的视频提示词路径。

## 3. 关键设计决策（已与用户确认）

| 决策点 | 选择 |
| --- | --- |
| LLM 输入 | 仅文本上下文（不喂图） |
| 输出形态 | 一条提示词 · Seedance 时间戳分镜（不拆 N 条） |
| 执行时机 | 实时重写 + 回写 `video_prompt` 字段 |
| 缓存策略 | 缓存 + 手动重生按钮（复用优先，用户手改优先） |
| 架构 | 方案 A：video.worker 内联实时重写 + 独立重生 task |

## 4. 架构与数据流

### 4.1 总览

```
[生成宫格视频] ──► video.worker 宫格分支
                     │
                     ├─ 判断：是否需要 LLM 重写？
                     │    ├─ videoPrompt 已是宫格重写版（缓存标记命中）且用户未手改 ──► 直接复用，跳过 LLM
                     │    └─ 否则 ──► 调用 rewriteGridVideoPrompt(LLM) ──► 回写 panel.videoPrompt + 缓存标记
                     │
                     └─ 用最终 videoPrompt 生成视频

[UI: 重新生成宫格视频提示词按钮] ──► enqueue AI_GRID_VIDEO_PROMPT (text task)
                                        └─ rewriteGridVideoPrompt(LLM) ──► 回写 panel.videoPrompt + 缓存标记 ──► UI 刷新
```

### 4.2 新增 / 改动的单元

**① `rewriteGridVideoPrompt`（新，核心 LLM 重写函数）**
- 位置：`src/lib/storyboard-images/grid-video-prompt.ts`（与现有 `buildGridVideoPrompt` 同文件，逐步替代其角色；保留 `isGridLayout`）。
- 职责：给定面板上下文 + 宫格布局 + locale + 模型，调用 `executeAiTextStep` 让 LLM 按 Seedance 规范输出一条时间戳分镜视频提示词。
- 依赖：`resolveAnalysisModel`（解析项目/用户分析模型）、`executeAiTextStep`（`@/lib/ai-runtime`）、`buildPromptAsync`（新 prompt 模板）。
- 输入：`{ panelContext, gridSize, shotType, cameraMove, locale, projectId, userId, model, jobMeta }`。
- 输出：`{ prompt: string; usage: TokenUsage } | null`（失败返回 null，调用方回退到原 basePrompt）。
- 解析：LLM 返回纯文本提示词（必要时去掉 markdown 代码块包裹）。

**② Prompt 模板（新）**
- 复用现有 `np_panel_grid_video` 的 prompt id 与文件 `lib/prompts/novel-promotion/panel_grid_video.{zh,en}.txt`，但**改写内容**：从「给视频模型的包装指令」改为「给 LLM 的重写指令」——要求 LLM 阅读结构化分镜上下文，理解 N 格为同一镜头关键帧，输出符合 Seedance 2.0 规范（时间戳分镜、镜头语言、音效、禁止项）的中文视频提示词。
- 变量：`storyboard_context_json`（面板结构化上下文）、`grid_layout`、`panel_grid_size`、`shot_type`、`camera_move`、`base_prompt`（原 videoPrompt/description 作为参考）。
- 与现有 `panel_grid_image` 模板风格一致（结构化分镜 JSON 输入）。

**③ video.worker 宫格分支改造**
- 文件：`src/lib/workers/video.worker.ts`（`generateVideoForPanel`）。
- 原 `buildGridVideoPrompt(...)` 调用替换为缓存判断 + `rewriteGridVideoPrompt(...)`：
  - 缓存命中（见 4.3）→ 直接用 `panel.videoPrompt`。
  - 否则调 LLM 重写 → 回写 `panel.videoPrompt` + 缓存标记 → 用新提示词生成视频。
- LLM token 计费：**不能**累加进 video task 的计费 payload —— 计费架构是「一个 task = 单一 `apiType` + 单一 `model`」，video task 用单一视频模型结算（`resolveTaskActual` / `settleTaskBilling`，`src/lib/billing/service.ts`），没有「视频费之外附加一笔文本费」的机制。改用 `withTextBilling(userId, analysisModel, maxIn, maxOut, recordParams, fn)`（`src/lib/billing/service.ts:624`）在重写调用处即时、独立地记一笔 text 费用。
- 失败回退：`rewriteGridVideoPrompt` 返回 null 时，退回当前 basePrompt，不阻塞视频生成（仅记日志）。

**④ 缓存标记字段（新，Prisma schema）**
- 在 `NovelPromotionPanel` 增加字段（见 4.3）。

**⑤ 重写 task（新，手动重生）**
- 新增 `TASK_TYPE.AI_GRID_VIDEO_PROMPT = 'ai_grid_video_prompt'`，路由到 text 队列。
- handler：`src/lib/workers/handlers/grid-video-prompt-rewrite.ts`，调用 `rewriteGridVideoPrompt` 并回写。
- 进度 / intent 接线参照 `AI_MODIFY_SHOT_PROMPT` 现有模式（`intent.ts` / `progress-message.ts`）。
- **计费（与自动路径不同）**：手动 task 本身就是一个 text task，计费走标准 task 生命周期——创建该 task 的 route/mutation 需在 `billingInfo` 里以 `apiType='text'` + analysisModel 冻结，`withTaskLifecycle` 自动结算（正是 commit `616f851` 给 route 补 analysisModel 的模式）。**handler 内不要再调 `withTextBilling`**，否则重复计费。

> 计费两条路径小结：自动路径（video.worker 内嵌）用 `withTextBilling` 即时记账；手动路径（独立 text task）靠创建时冻结的 `billingInfo` 经生命周期结算。两者都按 analysisModel 的 text 价计费，但接入点不同，实现时勿混用。

**⑥ UI：手动重生按钮**
- 位置：视频阶段面板卡片提示词编辑区（`panel-card/runtime/hooks` + `useVideoMutations`）。现有 `useUpdateProjectPanelVideoPrompt`（`src/lib/query/mutations/useVideoMutations.ts:51`）已提供 videoPrompt 回写通道，可在其旁新增一个触发 `AI_GRID_VIDEO_PROMPT` task 的 mutation。
- 仅对宫格面板（`imageLayout==='grid'`）显示「重新生成宫格视频提示词」。
- 触发 mutation → enqueue `AI_GRID_VIDEO_PROMPT` → task 完成后刷新 `videoPrompt`。

### 4.3 缓存与手改判定

**新增字段**（`NovelPromotionPanel`）：`gridVideoPromptAt DateTime?` —— 非空即表示「该面板的 `videoPrompt` 已由 LLM 宫格重写过」。

**判定规则**（两条入口、一个字段）：

| 入口 | 条件 | 行为 |
| --- | --- | --- |
| 自动（生成视频时） | `gridVideoPromptAt` 为空 | 调 LLM 重写 → 回写 `videoPrompt` + 置 `gridVideoPromptAt` |
| 自动（生成视频时） | `gridVideoPromptAt` 非空 | 直接复用现有 `videoPrompt`（含用户手改版），不调 LLM |
| 手动按钮 | —— | 强制重写并覆盖 `videoPrompt`，刷新 `gridVideoPromptAt` |

**设计理由**：自动路径只认「是否已重写过」这一个布尔信号，因此一旦重写过就不再自动覆盖——既实现缓存（省 LLM 调用），又天然保护用户手改（手改后的内容就是被复用的 `videoPrompt`）。需要重新生成时，用户走手动按钮主动触发。

> 备选方案（已否决）：用 `videoPrompt` 内容 hash 区分「重写产物 vs 用户手改」。否决原因：徒增复杂度，且自动路径无论如何都不该覆盖手改，hash 带来的「检测到手改」信息没有用武之地。`gridVideoPromptAt` 作为布尔标记（用时间戳类型，便于排查）已足够。

**边界——重新生成宫格图后的失效**：若用户重新生成了宫格图（cells 内容变了），旧的 `videoPrompt` 会变陈旧，但 `gridVideoPromptAt` 仍非空，自动路径不会重新重写。处理方式：在宫格图重新生成的写库点（`panel-image-task-handler.ts` 写 `imageLayout='grid'` 处）**一并清空 `gridVideoPromptAt`**，使下次生成视频时自动重写。详见 §8 开放问题。

## 5. 错误处理

- LLM 调用失败 / 返回空：`rewriteGridVideoPrompt` 返回 null。
  - 自动路径：回退到当前 basePrompt 继续生成视频，记 warn 日志，不阻塞。
  - 手动 task：task 失败，UI 提示用户重试（不改 `videoPrompt`）。
- 分析模型未配置：`resolveAnalysisModel` 抛错。自动路径捕获后回退 basePrompt；手动 task 直接失败并提示「请先配置分析模型」。
- 非宫格面板：完全不走此逻辑（`isGridLayout` 守卫）。
- 计费：用 `withTextBilling` 包裹重写 LLM 调用，独立记一笔 text 费用。失败/回退（返回 null）时该笔费用按其正常结算逻辑处理（实际 usage 为 0 / 调用未发生则不产生费用）。

## 6. 测试策略

- **单测 `rewriteGridVideoPrompt`**：mock `executeAiTextStep`，验证：宫格上下文正确组装进 prompt 变量；返回提示词被正确解析/去包裹；失败返回 null。
- **单测缓存判定**：`gridVideoPromptAt` 为空→触发重写；非空→自动路径复用；手动强制→重写。
- **单测 video.worker 宫格分支**：mock 重写函数，验证命中缓存时不调 LLM、未命中时回写字段与时间戳、重写失败时回退 basePrompt。
- **handler 单测**：`AI_GRID_VIDEO_PROMPT` task 回写 `videoPrompt` + `gridVideoPromptAt`；LLM 调用被 `withTextBilling` 包裹（验证传入的 model 为 analysisModel）。
- **单测宫格图失效**：重新生成宫格图（写 `imageLayout='grid'`）时清空 `gridVideoPromptAt`。
- 既有 `tests/unit/storyboard-images/grid-video-prompt.test.ts` 需相应更新（当前测的是模板填充行为）。

## 7. 影响面 / 迁移

- Prisma：新增 `gridVideoPromptAt`，需 `prisma db push` / migration。
- i18n：新增按钮文案、task 进度文案（`messages/{zh,en}`）。
- Prompt 模板内容改写：`panel_grid_video.{zh,en}.txt`（这两个文件已在 commit `f8dcec4` 提交、当前工作区干净；需在现有「视频模型包装指令」内容基础上**改写为「给 LLM 的重写指令」**）。
- TASK_TYPE / 队列路由 / intent / progress-message 新增 `AI_GRID_VIDEO_PROMPT` 接线。队列路由无需改动 `getQueueTypeByTaskType`——未列入 IMAGE/VIDEO/VOICE 集合的 type 默认进 text 队列（`src/lib/task/queues.ts:71`）；但需在 `text.worker.ts` 的 switch 中注册 handler（参照 `AI_MODIFY_SHOT_PROMPT`，`text.worker.ts:691`）。
- 宫格图失效：`panel-image-task-handler.ts` 写 `imageLayout='grid'` 的两处 `prisma.novelPromotionPanel.update`（首次生成 / 重新生成）需在 `data` 中一并写 `gridVideoPromptAt: null`，使宫格图变更后下次生成视频自动重写。

## 8. 开放问题

- **`gridVideoPromptAt` 命名/类型**：用时间戳还是布尔，实现时可微调，不影响整体设计（语义上只用作布尔标记）。
- **宫格图失效的清空时机**（已决议，列此备查）：在宫格图写库点清空 `gridVideoPromptAt`（见 §4.3 边界、§7）。若后续发现宫格图还有其他变更入口（如 modify/variant），需同样补清空逻辑——实现时应搜索所有写 `imageLayout='grid'` 的位置统一处理。

## 9. 审计记录（2026-06-23）

对照实际代码核实假设，修正两处错误：

1. **计费**（实质修正）：原 spec 称「把 LLM token 累加进 video task 计费 payload」。核实 `resolveTaskActual`/`settleTaskBilling`（`src/lib/billing/service.ts`）后确认：计费是「一 task = 单一 apiType + 单一 model」，video task 无法附加文本费。最终方案为两条路径：自动路径（video.worker 内）用 `withTextBilling`（`service.ts:624`）即时独立计费；手动路径（独立 text task）按 commit `616f851` 模式在创建时冻结 analysisModel 计费、经生命周期结算（见 §4.2 ⑤）。
2. **模板状态**（事实修正）：原 spec 称两个 `panel_grid_video` 模板「有未提交改动」。实际它们已在 commit `f8dcec4` 提交、工作区干净。

核实无误的假设：text 队列路由（默认分支，无需改 `getQueueTypeByTaskType`）；`text.worker.ts` switch 注册 handler 的模式（`AI_MODIFY_SHOT_PROMPT`）；`executeAiTextStep` + `resolveAnalysisModel` 复用路径；UI 回写通道 `useUpdateProjectPanelVideoPrompt` 已存在；现有 grid 测试 `tests/unit/storyboard-images/grid-video-prompt.test.ts` 测的是模板填充行为，需更新。
