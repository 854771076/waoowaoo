# Task 2.2 Report: Twick Editor Smart Cut MVP

## Status
DONE_WITH_CONCERNS

## Handler 实现
- 新增 `src/lib/workers/handlers/editor-smart-cut-task-handler.ts`。
- `handleEditorSmartCutTask(job)` 从真实 `TaskJobData.payload` 读取 `episodeId` / `editorProjectId` / 可选 `panelIds`。
- 后端直接查询：
  - `NovelPromotionEditorProject`：校验 editor project 属于当前 episode，并读取 `projectData`。
  - `NovelPromotionStoryboard` + `panels`：按 `clip.start` + `createdAt` 排序，panel 按 `panelIndex` 排序。
  - `NovelPromotionVoiceLine`：按 `lineIndex` 排序，读取 `audioMediaId` / `audioDuration` / matched panel 字段。
- 转换为 Task 1.2 类型：
  - `PanelVideoSource[]` 使用真实字段 `panel.videoMediaId` / `panel.videoMedia.id`，duration 优先 `videoMedia.durationMs` 转秒，fallback `panel.duration` 秒，再 fallback 3 秒。
  - `VoiceLineSource[]` 使用 `voiceLine.audioMediaId` / `audioMedia.id`，duration 按 DB `audioDuration` 毫秒转秒，fallback `audioMedia.durationMs`，再 fallback 2 秒。
- 调用 `buildInitialProject(panelVideos, voiceSources, { includeAudio: true, includeCaptions: false })` 重建 Twick timeline。
- 更新 `NovelPromotionEditorProject.projectData`，`version: { increment: 1 }`。
- 返回 `{ actualQuantity: 1 }` 以便 editor per_use 结算路径明确记录实际数量。

## Worker 注册
- 注册在 `src/lib/workers/text.worker.ts`：`TASK_TYPE.EDITOR_AI_SMART_CUT -> handleEditorSmartCutTask(job)`。
- 原因：Smart Cut MVP 是分析/组装类任务，无视频生成/渲染外部资源消耗；`getQueueTypeByTaskType()` 对未列入 image/video/voice 的任务默认走 text queue，因此 route 提交的 `EDITOR_AI_SMART_CUT` 已进入 text queue。

## 结算路径
- 没有在 handler 内显式 `commit` / `refund`。
- 真实项目使用 `withTaskLifecycle` 统一结算：
  - 成功：`settleTaskBilling({ billingInfo }, { result })`，editor per_use 通过 `BILLING_ITEM.EDITOR_SMART_CUT` 解析，actualQuantity=1。
  - 失败：`rollbackTaskBilling({ id: taskId, billingInfo })` 自动回滚冻结金额。
- 新增 `tests/unit/worker/editor-smart-cut-billing-lifecycle.test.ts` 覆盖成功结算和失败退款路径。

## 前端触发与刷新
- 新增 `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/editor/right-panel/ai/SmartCutPanel.tsx`。
- `RightPanel` AI tab 中将原“智能粗剪”disabled 占位替换为真实 `SmartCutPanel`。
- 使用 `useWorkspaceProvider()` 获取 `projectId` / `episodeId` / SSE task event subscription。
- 使用 `useEditorStageRuntime()` 获取 `editorProjectId` / `hasVideoPanels` / `reloadProject()`。
- 点击按钮 POST `/api/novel-promotion/${projectId}/editor/ai/smart-cut`，显示 active task progress。
- 任务完成后通过 SSE 或 task snapshot fallback 调用 `reloadProject()`，触发 runtime 的 `projectReloadRevision` remount 机制刷新 Twick timeline。

## 测试命令与输出

### Smart Cut worker + billing lifecycle + route tests
命令：
```bash
npx cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/worker/editor-smart-cut-task-handler.test.ts tests/unit/worker/editor-smart-cut-billing-lifecycle.test.ts tests/integration/api/editor-ai-routes.test.ts
```
输出摘要：
```text
Test Files  3 passed (3)
Tests       37 passed (37)
```
说明：`editor-ai-routes.test.ts` 中 404 / 402 用例会按既有 api logger 输出 error 日志，但断言通过。

### 要求的 filtered typecheck
命令：
```bash
npx tsc --noEmit 2>&1 | grep -iE "smart-cut|editor.*handler|SmartCut"
```
输出：
```text
(no output)
```

### Full typecheck
命令：
```bash
npm run typecheck
```
输出摘要：失败，但仅为既有无关测试类型错误：
```text
tests/unit/components/art-style-library/ArtStyleEditor.test.tsx: missing @testing-library/react / jest-dom matcher typings
tests/unit/storyboard-images/grid-video-prompt.test.ts: duplicate object literal properties
```

## 与 brief 偏差
- brief 建议新建 `src/lib/workers/editor-ai.worker.ts`，真实队列架构已由 `getQueueTypeByTaskType()` 将 editor smart-cut 默认送入 text queue；因此实际注册到 `text.worker.ts`。
- brief 使用 `videoMediaObjectId` / `audioMediaObjectId` 字段名，真实 Prisma 字段为 `videoMediaId` / `audioMediaId`，关系为 `videoMedia` / `audioMedia`。
- brief 示例显式 `commitTransaction/refundTransaction`，真实项目由 `withTaskLifecycle` 自动 `settleTaskBilling/rollbackTaskBilling`。
- brief 提到 `src/lib/twick/ai-patch-adapter.ts` 和 `useEditorAIActions.ts`，当前真实代码中未发现这两个文件/接口；MVP 直接接入 RightPanel + runtime context。

## MVP 范围
- 无 AI 智能排序、无 LLM 调用、无智能裁切。
- 仅按 storyboard/panel 顺序重建 Twick timeline，并按 matched voice line 优先、lineIndex 顺序 fallback 对齐音频。
