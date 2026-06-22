# Task 2.3 自动字幕报告

## 状态
DONE

## 实现决策
- 选择 A：不依赖 `@twick/workflow` 的 caption runtime API。原因是 POC 已发现该包运行时导出与 `.d.ts` 子路径声明不一致，MVP 用本地纯函数更稳定、可单测、避免类型解析坑。
- 字幕来源：直接使用 `NovelPromotionVoiceLine.content`，不做 Whisper/ASR 转写。
- 时间轴：每条可用 voice line 生成一条 caption element，按 voice line 顺序累加 `audioDuration` / `audioMedia.durationMs` / 默认 2s 排布。
- 样式：复用 `voiceLineToCaptionElement` 默认样式（32px、白色填充、黑色描边、居中）。`CaptionStylePanel` 当前是 MVP 占位/说明面板，暂不编辑样式。

## 字幕生成逻辑
- `src/lib/twick/project-builder.ts`
  - 新增 `buildCaptionTrack`：把 voice line 文本转换为 Twick `caption` track，元素结构为 `type: 'caption'`、`t`、`s`、`e`、`props`、`metadata`。
  - 新增 `mergeCaptionTrackIntoProject`：保留现有非字幕轨道，替换已有 caption track，再写入新的 caption track。
  - 新增 `applyCaptionsToProject`：组合构建和合并，返回 `captionCount` 与 `totalDurationSeconds`。
- 不重建整个 editor project；只读取现有 `projectData`，替换/新增 caption track 后保存。

## Worker / 计费
- 新增 handler：`src/lib/workers/handlers/editor-caption-task-handler.ts`
  - 解析 `episodeId` / `editorProjectId`。
  - 校验 editor project 归属 episode。
  - 读取 `novelPromotionVoiceLine` 的真实字段：`content`、`audioDuration`、`audioMedia.durationMs`、`speaker`。
  - 空字幕保护：没有可生成字幕时抛 `CAPTION_NO_VOICE_LINES`，不更新 project，交给 `withTaskLifecycle` 退款/回滚。
  - 成功后更新 `NovelPromotionEditorProject.projectData` 并 `version + 1`。
- Worker 注册：`src/lib/workers/text.worker.ts` 增加 `TASK_TYPE.EDITOR_AI_CAPTION` case。
- 计费量：handler 返回 `actualQuantity = max(0.01, totalDurationSeconds / 60)`，让结算按实际字幕覆盖分钟数执行；路由预冻结仍按前端估算 `durationMinutes`，最低 0.01 分钟。

## API 路由
- `src/app/api/novel-promotion/[projectId]/editor/ai/caption/route.ts`
  - 复用 Task 2.2 的 `createEditorAiRoute` 模式。
  - taskType: `EDITOR_AI_CAPTION`。
  - billingItem: `editor_caption_generate`。
  - beforeSubmit 查询 voice lines，拒绝无文本/全空白内容，返回 `CAPTION_NO_VOICE_LINES`。
  - dedupeKey 使用 `_shared.ts` 默认逻辑（requestId 优先，否则 body hash）。

## 前端
- 新增 `CaptionPanel.tsx`，结构照搬 `SmartCutPanel.tsx`：
  - 发起前 `await flushProjectSave()`。
  - POST `/api/novel-promotion/${projectId}/editor/ai/caption`。
  - 提交 `durationMinutes` 作为预冻结估算。
  - 使用 SSE + 2.5s polling fallback 监听任务完成。
  - 完成后 invalidate tasks 并 `reloadProject()`。
- `RightPanel.tsx` 将原 captions 占位卡替换为真实 `CaptionPanel`。
- 新增 `CaptionStylePanel.tsx` 占位，说明默认样式与后续编辑范围。
- 中英文 i18n 已补充。

## 复用 Task 2.2 模式
- Handler 的 payload 解析、project 查询、progress 上报、`assertTaskActive`、更新 project/version、返回 `actualQuantity`。
- 路由的 `createEditorAiRoute`、billing、dedupe、beforeSubmit 空数据校验。
- 前端的 flush、提交任务、SSE 完成刷新、polling fallback、错误显示。

## 测试命令与输出

### 1. 初次尝试
命令：
```bash
npm run test:unit -- tests/unit/lib/twick/project-builder.test.ts tests/unit/worker/editor-caption-task-handler.test.ts tests/unit/worker/editor-smart-cut-task-handler.test.ts tests/integration/api/editor-ai-routes.test.ts
```
输出：
```text
Exit code 1
npm error Missing script: "test:unit"
npm error
npm error To see a list of scripts, run:
npm error   npm run
npm error A complete log of this run can be found in: /Users/xiaomao/.npm/_logs/2026-06-22T07_27_26_121Z-debug-0.log
```

### 2. 相关测试
命令：
```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/lib/twick/project-builder.test.ts tests/unit/worker/editor-caption-task-handler.test.ts tests/unit/worker/editor-smart-cut-task-handler.test.ts tests/integration/api/editor-ai-routes.test.ts
```
最终输出摘要：
```text
RUN  v2.1.9 /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor

✓ tests/integration/api/editor-ai-routes.test.ts (33 tests) 227ms
✓ tests/unit/worker/editor-smart-cut-task-handler.test.ts (6 tests) 6ms
✓ tests/unit/worker/editor-caption-task-handler.test.ts (5 tests) 5ms
✓ tests/unit/lib/twick/project-builder.test.ts (7 tests) 4ms

Test Files  4 passed (4)
Tests  51 passed (51)
Start at  15:31:29
Duration  1.55s (transform 282ms, setup 16ms, collect 374ms, tests 242ms, environment 0ms, prepare 150ms)
```
说明：integration route 测试中预期 404/400/402 分支会打印 error 日志；断言均通过。

### 3. 需求指定过滤 typecheck
命令：
```bash
npm run typecheck 2>&1 | grep -iE "caption|editor.*handler|Caption"
```
输出：
```text

```
说明：无 caption/editor handler 相关 TypeScript 诊断。

### 4. 全量 typecheck
命令：
```bash
npm run typecheck
```
输出：
```text
Exit code 1

> vvicat@0.4.1 typecheck
> tsc --noEmit

tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(2,52): error TS2307: Cannot find module '@testing-library/react' or its corresponding type declarations.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(58,54): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(59,61): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(60,56): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(61,65): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(62,59): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(75,69): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(76,71): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(77,73): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(114,54): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(115,61): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(116,56): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(117,65): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(118,59): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(135,25): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(139,27): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(193,69): error TS2339: Property 'toBeDisabled' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(218,36): error TS2339: Property 'toBeDisabled' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(235,40): error TS2339: Property 'toBeDisabled' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(284,58): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(322,83): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(353,46): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(381,46): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(398,54): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(411,56): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx(426,59): error TS2339: Property 'toHaveValue' does not exist on type 'Assertion<any>'.
tests/unit/storyboard-images/grid-video-prompt.test.ts(100,9): error TS1117: An object literal cannot have multiple properties with the same name.
tests/unit/storyboard-images/grid-video-prompt.test.ts(126,11): error TS1117: An object literal cannot have multiple properties with the same name.
```
说明：全量 typecheck 失败来自既有测试依赖/断言类型与 grid-video-prompt 重复字段问题；过滤 typecheck 无本任务相关错误。
