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

## 修复轮次

### 修复 1：空素材不入队 / 不扣费 / 不覆盖 timeline
- route 层：`src/app/api/novel-promotion/[projectId]/editor/ai/smart-cut/route.ts` 在 `createEditorAiRoute` 的 `beforeSubmit` 前置钩子中统计当前 episode（以及可选 `panelIds` 范围）有 `videoMediaId` 的 panel 数；为 0 时抛 `ApiError('INVALID_PARAMS', { message: 'SMART_CUT_NO_VIDEO_PANELS' })`，因此不调用 `submitTask`、不预扣费、不入队。
- shared route：`src/app/api/novel-promotion/[projectId]/editor/ai/_shared.ts` 新增 `beforeSubmit` 钩子，位置在归属校验之后、billingInfo 构建和 `submitTask` 之前。
- handler 层兜底：`src/lib/workers/handlers/editor-smart-cut-task-handler.ts` 在 `buildSmartCutProject` 后、写库前判断 `panelCount === 0`，抛 `SMART_CUT_NO_VIDEO_PANELS`，不会执行 `novelPromotionEditorProject.update`，避免覆盖已有 `projectData`。
- 退款确认：失败会向外抛给 worker 的 `withTaskLifecycle`；现有 `editor-smart-cut-billing-lifecycle.test.ts` 已覆盖 handler 失败时 rollback，本轮又在 handler 测试中验证该错误能经 `withTaskLifecycle` 传播。

### 修复 2：SSE 漏事件后的完成轮询 fallback
- `src/lib/query/hooks/useTaskStatus.ts` 给 `useActiveTasks` / `useTaskSnapshot` / `useTaskStatus` 增加可选 `refetchInterval`，不改变默认调用方行为。
- `SmartCutPanel` 在存在 `submittedTaskId` 时传 `refetchInterval: 2500`，terminal 后停止。
- SSE 和轮询共用 `handleCompletedTask(taskId)`，用 `completedTaskIdsRef` 去重，确保正常 SSE 与轮询补偿不会重复 `reloadProject()`。

### 修复 3：发起 smart-cut 前 flush 未保存编辑
- `src/lib/novel-promotion/stages/editor-stage-runtime/useEditorProjectSync.ts` 新增 `flushProjectSave()`：flush debounce/pending save，并等待当前保存 mutation 结束；失败或超时会抛错阻止 smart-cut 提交。
- `src/lib/novel-promotion/stages/editor-stage-runtime-core.tsx` 将 `flushProjectSave` 暴露到 editor runtime context。
- `SmartCutPanel` 在 POST smart-cut 前先 `await flushProjectSave()`，避免 worker 基于服务端旧 editor project 重建并覆盖用户未保存 timeline 编辑。

### 测试命令与完整输出

命令：
```bash
npx cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/worker/editor-smart-cut-task-handler.test.ts tests/unit/worker/editor-smart-cut-billing-lifecycle.test.ts tests/integration/api/editor-ai-routes.test.ts --reporter=dot
```
完整输出：
```text
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor

stderr | tests/integration/api/editor-ai-routes.test.ts > editor AI route skeletons > 'smart-cut' returns 404 for another project editorProject
{"ts":"2026-06-22T14:17:08.490+08:00","level":"ERROR","service":"vvicat","audit":false,"module":"api","action":"api.request.error","message":"Resource not found","requestId":"767936a8-8db7-4ad1-b9ac-9a326d96fd5d","projectId":"project-1","errorCode":"NOT_FOUND","retryable":false,"durationMs":7,"details":{"method":"POST","path":"/api/novel-promotion/project-1/editor/ai/smart-cut","errorType":"ApiError"}}

stderr | tests/integration/api/editor-ai-routes.test.ts > editor AI route skeletons > 'caption' returns 404 for another project editorProject
{"ts":"2026-06-22T14:17:08.533+08:00","level":"ERROR","service":"vvicat","audit":false,"module":"api","action":"api.request.error","message":"Resource not found","requestId":"4b4fc1e5-7df6-4592-9786-b775c3c64da8","projectId":"project-1","errorCode":"NOT_FOUND","retryable":false,"durationMs":4,"details":{"method":"POST","path":"/api/novel-promotion/project-1/editor/ai/caption","errorType":"ApiError"}}

stderr | tests/integration/api/editor-ai-routes.test.ts > editor AI route skeletons > 'enhance restore' returns 404 for another project editorProject
{"ts":"2026-06-22T14:17:08.537+08:00","level":"ERROR","service":"vvicat","audit":false,"module":"api","action":"api.request.error","message":"Resource not found","requestId":"9cc5fdbb-5fd6-46cc-85ab-bed919d1f6a7","projectId":"project-1","errorCode":"NOT_FOUND","retryable":false,"durationMs":0,"details":{"method":"POST","path":"/api/novel-promotion/project-1/editor/ai/enhance","errorType":"ApiError"}}

stderr | tests/integration/api/editor-ai-routes.test.ts > editor AI route skeletons > 'enhance smart crop' returns 404 for another project editorProject
{"ts":"2026-06-22T14:17:08.545+08:00","level":"ERROR","service":"vvicat","audit":false,"module":"api","action":"api.request.error","message":"Resource not found","requestId":"ed7ae182-cd3f-4e33-adca-e39cd27e1c27","projectId":"project-1","errorCode":"NOT_FOUND","retryable":false,"durationMs":5,"details":{"method":"POST","path":"/api/novel-promotion/project-1/editor/ai/enhance","errorType":"ApiError"}}

stderr | tests/integration/api/editor-ai-routes.test.ts > editor AI route skeletons > 'voice-optimize durationSeconds' returns 404 for another project editorProject
{"ts":"2026-06-22T14:17:08.547+08:00","level":"ERROR","service":"vvicat","audit":false,"module":"api","action":"api.request.error","message":"Resource not found","requestId":"cba3f802-d0e7-4dd4-87f8-80ebe7e2496e","projectId":"project-1","errorCode":"NOT_FOUND","retryable":false,"durationMs":1,"details":{"method":"POST","path":"/api/novel-promotion/project-1/editor/ai/voice-optimize","errorType":"ApiError"}}

stderr | tests/integration/api/editor-ai-routes.test.ts > editor AI route skeletons > 'voice-optimize maxSeconds fallback' returns 404 for another project editorProject
{"ts":"2026-06-22T14:17:08.554+08:00","level":"ERROR","service":"vvicat","audit":false,"module":"api","action":"api.request.error","message":"Resource not found","requestId":"f611ddf1-3df6-4d6a-af24-bef44c596f42","projectId":"project-1","errorCode":"NOT_FOUND","retryable":false,"durationMs":1,"details":{"method":"POST","path":"/api/novel-promotion/project-1/editor/ai/voice-optimize","errorType":"ApiError"}}

stderr | tests/integration/api/editor-ai-routes.test.ts > editor AI route skeletons > 'transition' returns 404 for another project editorProject
{"ts":"2026-06-22T14:17:08.559+08:00","level":"ERROR","service":"vvicat","audit":false,"module":"api","action":"api.request.error","message":"Resource not found","requestId":"f05c4268-dece-4119-8c84-d6bad90c1321","projectId":"project-1","errorCode":"NOT_FOUND","retryable":false,"durationMs":0,"details":{"method":"POST","path":"/api/novel-promotion/project-1/editor/ai/transition","errorType":"ApiError"}}

stderr | tests/integration/api/editor-ai-routes.test.ts > editor AI route skeletons > smart-cut returns 400 and does not enqueue when the episode has no video panels
{"ts":"2026-06-22T14:17:08.626+08:00","level":"ERROR","service":"vvicat","audit":false,"module":"api","action":"api.request.error","message":"SMART_CUT_NO_VIDEO_PANELS","requestId":"5e9bb62a-5043-42d1-9588-335968671d8c","projectId":"project-1","errorCode":"INVALID_PARAMS","retryable":false,"durationMs":1,"details":{"method":"POST","path":"/api/novel-promotion/project-1/editor/ai/smart-cut","errorType":"ApiError"}}

stderr | tests/integration/api/editor-ai-routes.test.ts > editor AI route skeletons > smart-cut propagates insufficient balance from task submission as 402
{"ts":"2026-06-22T14:17:08.643+08:00","level":"ERROR","service":"vvicat","audit":false,"module":"api","action":"api.request.error","message":"Insufficient balance","requestId":"8c01c0be-4616-47e8-8fe8-976bbedc182a","projectId":"project-1","errorCode":"INSUFFICIENT_BALANCE","retryable":false,"durationMs":3,"details":{"method":"POST","path":"/api/novel-promotion/project-1/editor/ai/smart-cut","errorType":"ApiError"}}

 ✓ tests/integration/api/editor-ai-routes.test.ts (32 tests) 1741ms
   ✓ editor AI route skeletons > 'smart-cut' returns 401 when unauthenticated 1406ms
 ✓ tests/unit/worker/editor-smart-cut-task-handler.test.ts (6 tests) 42ms
 ✓ tests/unit/worker/editor-smart-cut-billing-lifecycle.test.ts (2 tests) 49ms

 Test Files  3 passed (3)
      Tests  40 passed (40)
   Start at  14:17:01
   Duration  11.28s (transform 2.61s, setup 69ms, collect 4.08s, tests 1.83s, environment 2ms, prepare 699ms)
```

命令：
```bash
npx tsc --noEmit 2>&1 | grep -iE "smart-cut|editor.*handler|SmartCut"
```
完整输出：
```text
(no output)
```

补充 full typecheck 命令：
```bash
npx tsc --noEmit
```
输出：仍失败于既有无关测试类型问题（`@testing-library/react` / jest-dom matcher typings 缺失、`grid-video-prompt.test.ts` 重复对象属性），未出现 smart-cut/editor handler 相关错误。
