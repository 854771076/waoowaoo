# StarRouter 视频参数面板补齐 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 StarRouter 的 `dreamina-seedance-2-0-fast-260128` 视频模型在前端展示与 Ark Seedance 2.0 Fast 一致的参数面板（生成音频 / 时长 / 分辨率），并将这些参数透传到 StarRouter 上游 API。

**Architecture:** 前端参数面板由 `usePanelVideoModel` 数据驱动 —— 在 `standards/capabilities/image-video.catalog.json` 追加该模型的 `capabilities.video` 即可触发 UI 渲染（零前端改动）。后端 [`src/lib/providers/starrouter/video.ts`](../../../src/lib/providers/starrouter/video.ts) 扩展 submit body 接受新字段并转换为 snake_case 写入上游请求。

**Tech Stack:** Next.js 15、TypeScript、JSON capability catalog、Vitest（仅运行现有测试，不新增）。

## Global Constraints

- 字段命名：catalog / 前端 / generator options 用 camelCase；starrouter submit body 用 snake_case（与现有 `aspect_ratio`、`input_image_url` 一致）。
- 禁止改动：BullMQ、计费、定价层、首尾帧支持、`fieldI18n`、`standards/pricing/image-video.pricing.json`。
- 不新增单元测试（与现有 `starrouter/video.ts` 无覆盖测试的现状对齐）。
- catalog 字段必须在 `VIDEO_ALLOWED_FIELDS` 内合法（`generationModeOptions`、`generateAudioOptions`、`durationOptions`、`fpsOptions`、`resolutionOptions`、`firstlastframe`、`supportGenerateAudio`、`fieldI18n`）。
- `generationModeOptions` 必须包含 `"normal"`（链路依赖默认模式）。
- 工作分支：`feat/starrouter-video-params`（已创建，spec 已提交在该分支）。所有任务在此分支上 commit。

---

## File Structure

| 文件 | 角色 | 改动类型 |
|------|------|----------|
| [`standards/capabilities/image-video.catalog.json`](../../../standards/capabilities/image-video.catalog.json) | 视频/图片模型能力条目数组 | 在数组末尾追加 1 条 starrouter 视频条目 |
| [`src/lib/providers/starrouter/video.ts`](../../../src/lib/providers/starrouter/video.ts) | StarRouter 视频生成上游适配器 | 修改 3 处：submit body interface / `buildSubmitRequest` / `assertNoUnsupportedOptions` 白名单 |

---

## Task 1: 追加 StarRouter Dreamina Seedance 视频能力条目

**Files:**
- Modify: `standards/capabilities/image-video.catalog.json`（在末尾 `]` 之前追加一条对象）

**Interfaces:**
- Consumes: 现有 [`validateVideoCapabilities`](../../../src/lib/model-config-contract.ts) 在 catalog 加载时自动校验。
- Produces: `findBuiltinCapabilities('video', 'starrouter', 'dreamina-seedance-2-0-fast-260128')` 返回非空 `ModelCapabilities`，进而 `usePanelVideoModel` 渲染参数面板。

**Background：** 该 JSON 文件为根级数组，目前最后一条目以 `}` 结尾、文件末两行是 `  }` 和 `]`。需要把新条目插在最后一个 `}` 之后、`]` 之前，并把上一条末尾的 `}` 改为 `},` 让 JSON 仍合法。

- [ ] **Step 1: 验证文件当前末尾结构**

Run: `tail -12 standards/capabilities/image-video.catalog.json`

Expected: 看到最后一条目的结尾，倒数第二行为 `  }`，最后一行为 `]`。如果与下面 Edit 的 `old_string` 不一致，先停下检查。

- [ ] **Step 2: 在 catalog 末尾追加 starrouter 视频能力条目**

把 catalog 文件末尾的 `  }\n]\n` 替换为追加新条目的版本。Use the Edit tool with this exact replacement (relies on the file ending exactly as Step 1 verified):

`old_string`：
```
        "firstlastframe": true,
        "supportGenerateAudio": false
      }
    }
  }
]
```

`new_string`：
```
        "firstlastframe": true,
        "supportGenerateAudio": false
      }
    }
  },
  {
    "modelType": "video",
    "provider": "starrouter",
    "modelId": "dreamina-seedance-2-0-fast-260128",
    "capabilities": {
      "video": {
        "generationModeOptions": ["normal"],
        "generateAudioOptions": [true, false],
        "durationOptions": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        "resolutionOptions": ["480p", "720p"],
        "supportGenerateAudio": true
      }
    }
  }
]
```

注意：把上一条目末尾的 `  }` 改为 `  },` 以保持 JSON 合法。

- [ ] **Step 3: 验证 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('standards/capabilities/image-video.catalog.json','utf8')); console.log('ok')"`

Expected: stdout 为 `ok`。如果报 `SyntaxError`，回到 Step 2 检查逗号位置。

- [ ] **Step 4: 验证 capability schema 校验通过**

Run: `node -e "
const { findBuiltinCapabilities, resetBuiltinCapabilityCatalogCacheForTest } = require('./src/lib/model-capabilities/catalog.ts');
" 2>&1 || true`

由于 catalog.ts 是 TypeScript，直接 require 会失败。改用 typecheck 路径：

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`

Expected: 无新报错（catalog 是 .json，不会进 typecheck，但同时验证 spec 引用的类型仍然合法）。

- [ ] **Step 5: 启动 dev server 验证 catalog 加载不报错**

Run: `npm run dev:next 2>&1 | head -30 &  sleep 8; curl -s http://127.0.0.1:3000/ -o /dev/null -w "%{http_code}\n"; kill %1 2>/dev/null; wait 2>/dev/null`

Expected: HTTP 200 或 307（重定向到 locale）；`stderr` / `stdout` 中**不**出现 `CAPABILITY_CATALOG_INVALID` 或 `CAPABILITY_CATALOG_DUPLICATE`。如果 dev:next 还在跑（已经 kill 了仍提示 port busy），手动 `lsof -ti :3000 | xargs kill -9`。

> 备注：如果用户已有 dev server 在跑，跳过 dev server 检查，转而依赖 Step 3 + 后续 typecheck。catalog 的运行时校验会在第一次访问 `/api/user/models` 等触发 `findBuiltinCapabilities` 的接口时跑。

- [ ] **Step 6: Commit**

```bash
git add standards/capabilities/image-video.catalog.json
git commit -m "feat(catalog): add StarRouter dreamina-seedance-2-0-fast video capabilities"
```

---

## Task 2: 后端 starrouter/video.ts —— 扩展 submit body interface

**Files:**
- Modify: `src/lib/providers/starrouter/video.ts:41-47`

**Interfaces:**
- Consumes: 无新依赖。
- Produces: `StarRouterVideoSubmitBody` 接口扩展为可选 `resolution?: string`、`generate_audio?: boolean`，供后续 Task 3 在 `buildSubmitRequest` 中赋值。

- [ ] **Step 1: 修改 `StarRouterVideoSubmitBody` interface**

文件 `src/lib/providers/starrouter/video.ts` 第 41-47 行的 interface 定义改为：

`old_string`：
```ts
interface StarRouterVideoSubmitBody {
  model: string
  prompt?: string
  input_image_url?: string
  duration?: number
  aspect_ratio?: string
}
```

`new_string`：
```ts
interface StarRouterVideoSubmitBody {
  model: string
  prompt?: string
  input_image_url?: string
  duration?: number
  aspect_ratio?: string
  resolution?: string
  generate_audio?: boolean
}
```

- [ ] **Step 2: typecheck 确认无新报错**

Run: `npm run typecheck 2>&1 | tail -20`

Expected: `tsc` 退出码 0，stderr 没有新增报错。Interface 扩展是非破坏性的（只新增可选字段），不应影响任何调用方。

- [ ] **Step 3: 暂不 commit**

本任务的 interface 改动单独 commit 没意义（没人使用新字段）。继续 Task 3，把读取 + 写入逻辑加进去后再一起 commit。

---

## Task 3: 后端 starrouter/video.ts —— 读取并透传新参数 + 扩白名单

**Files:**
- Modify: `src/lib/providers/starrouter/video.ts:53-80`（`readOptionalBoolean` 新增 + `assertNoUnsupportedOptions` 白名单）
- Modify: `src/lib/providers/starrouter/video.ts:82-117`（`buildSubmitRequest` 内读取/写入新字段）

**Interfaces:**
- Consumes: Task 2 扩展过的 `StarRouterVideoSubmitBody`。
- Produces: `buildSubmitRequest` 在 `params.options` 含 `resolution` / `generateAudio` 时把它们写入 submit body 的 `resolution` / `generate_audio`（snake_case），并允许这两个 key 通过 `assertNoUnsupportedOptions`。

- [ ] **Step 1: 在 `readOptionalPositiveInteger` 之后新增 `readOptionalBoolean` 工具函数**

`old_string`：
```ts
function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`STARSTONE_VIDEO_OPTION_INVALID_${fieldName.toUpperCase()}`)
  }
  return value
}

function assertNoUnsupportedOptions(options: StarRouterGenerateRequestOptions): void {
```

`new_string`：
```ts
function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`STARSTONE_VIDEO_OPTION_INVALID_${fieldName.toUpperCase()}`)
  }
  return value
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function assertNoUnsupportedOptions(options: StarRouterGenerateRequestOptions): void {
```

- [ ] **Step 2: 把 `generateAudio` 加入 `assertNoUnsupportedOptions` 白名单**

`old_string`：
```ts
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'prompt',
    'duration',
    'aspectRatio',
    'aspect_ratio',
    'outputFormat',
    'resolution',
    'fps',
  ])
```

`new_string`：
```ts
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'prompt',
    'duration',
    'aspectRatio',
    'aspect_ratio',
    'outputFormat',
    'resolution',
    'fps',
    'generateAudio',
  ])
```

- [ ] **Step 3: 在 `buildSubmitRequest` 内读取并写入两个新字段**

`old_string`：
```ts
  const prompt = readTrimmedString(params.prompt) || readTrimmedString(params.options.prompt)
  const duration = readOptionalPositiveInteger(params.options.duration, 'duration')
  const aspectRatio = readTrimmedString(params.options.aspectRatio) || readTrimmedString(params.options.aspect_ratio)

  const submitBody: StarRouterVideoSubmitBody = {
    model: modelId,
    input_image_url: toFetchableUrl(imageUrl),
  }
  if (prompt) {
    submitBody.prompt = prompt
  }
  if (typeof duration === 'number') {
    submitBody.duration = duration
  }
  if (aspectRatio) {
    submitBody.aspect_ratio = aspectRatio
  }
```

`new_string`：
```ts
  const prompt = readTrimmedString(params.prompt) || readTrimmedString(params.options.prompt)
  const duration = readOptionalPositiveInteger(params.options.duration, 'duration')
  const aspectRatio = readTrimmedString(params.options.aspectRatio) || readTrimmedString(params.options.aspect_ratio)
  const resolution = readTrimmedString(params.options.resolution)
  const generateAudio = readOptionalBoolean(params.options.generateAudio)

  const submitBody: StarRouterVideoSubmitBody = {
    model: modelId,
    input_image_url: toFetchableUrl(imageUrl),
  }
  if (prompt) {
    submitBody.prompt = prompt
  }
  if (typeof duration === 'number') {
    submitBody.duration = duration
  }
  if (aspectRatio) {
    submitBody.aspect_ratio = aspectRatio
  }
  if (resolution) {
    submitBody.resolution = resolution
  }
  if (typeof generateAudio === 'boolean') {
    submitBody.generate_audio = generateAudio
  }
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck 2>&1 | tail -20`

Expected: tsc 退出码 0，无新增报错。

- [ ] **Step 5: lint**

Run: `npm run lint:all 2>&1 | tail -30`

Expected: 退出码 0，无新增 lint 错误。如果项目 lint 因其它历史问题已有 warning，只要不**新增** error 即可。

- [ ] **Step 6: 跑现有 starrouter 相关测试（如有）**

Run: `npx vitest run src/lib/providers/starrouter 2>&1 | tail -30`

Expected: 所有测试通过；如无对应测试文件输出 "No test files found"，也算通过（与 spec 非目标一致：本次不新增 starrouter/video.ts 单测）。

- [ ] **Step 7: 跑 capability 相关测试，确认 catalog 改动不破坏现有约束**

Run: `npx vitest run tests/unit/model-capabilities 2>&1 | tail -30`

Expected: 全部通过。

- [ ] **Step 8: Commit Task 2 + Task 3 的全部改动**

```bash
git add src/lib/providers/starrouter/video.ts
git commit -m "feat(starrouter): pass resolution and generate_audio to upstream video API"
```

---

## Task 4: 验收 —— 静态检查 + 手测

**Files:** 无修改。本任务是验收门，对应 spec §5。

**Interfaces:**
- Consumes: Task 1 + Task 3 的产物。
- Produces: 手测结论。

- [ ] **Step 1: 完整 typecheck**

Run: `npm run typecheck 2>&1 | tail -10`

Expected: 退出码 0。

- [ ] **Step 2: 完整 lint**

Run: `npm run lint:all 2>&1 | tail -10`

Expected: 退出码 0（与基线一致；如基线本来就有 warning，只要不是本次新增即可）。

- [ ] **Step 3: 启动开发栈**

Run（在另一终端窗口或 tmux 中）：
```bash
npm run dev
```

等到 Next.js 报 `Ready in ...`、worker 进程也启动后继续。

- [ ] **Step 4: 手测前端面板**

操作步骤：
1. 浏览器打开 `http://127.0.0.1:3000/zh/workspace/<任意已有 projectId>?stage=videos`
2. 在某个 panel 上展开模型下拉，选择 StarRouter 的 **Dreamina Seedance 2.0 Fast**
3. 模型卡内"参数配置"区应**展开**，包含以下三个字段：
   - 生成音频（开 / 关 切换）
   - 时长（下拉，含 4–15 共 12 个秒数选项）
   - 分辨率（480p / 720p 二选一）

如果三项都出现 → 通过。如未出现，对照 spec §1.1 / §3.1 复查 catalog 条目格式。

- [ ] **Step 5: 手测后端透传**

操作步骤：
1. 接 Step 4 的页面，把分辨率切到 720p、生成音频切到开、时长切到 8
2. 点击"生成视频"
3. 在 `dev:worker` 进程的日志（或 `npm run dev:board` 即 `http://localhost:3010/admin/queues` 的视频任务详情）中找到这次 submit 的请求体 / job data
4. 确认 submit body 同时包含：
   - `"resolution": "720p"`
   - `"generate_audio": true`
   - `"duration": 8`

如果三项都正确 → 通过。

> **降级方案**：若日志没把上游 request body 直接打出来，可在 `src/lib/providers/starrouter/video.ts` 的 `generateStarRouterVideo` 函数 `fetch` 之前临时插一行 `console.log('[STARROUTER_VIDEO_SUBMIT]', JSON.stringify(submitRequest.body))`，验完**务必删除**并不 commit。

- [ ] **Step 6: 关闭 dev 进程**

Run: `lsof -ti :3000 :3010 | xargs kill 2>/dev/null; pkill -f "tsx watch" 2>/dev/null; true`

- [ ] **Step 7: 验收无新 commit**

本任务不产生代码改动，无需 commit。如果 Step 5 调试时改了文件，确认 `git diff` 为空。

Run: `git diff --stat`

Expected: 输出为空（没有未暂存改动）。

---

## Task 5: 推送分支并标注完成

**Files:** 无修改。

- [ ] **Step 1: 查看本次分支提交摘要**

Run: `git log --oneline main..HEAD`

Expected: 看到 3 条 commit：spec、spec audit fix、catalog feat、starrouter video feat。

- [ ] **Step 2: 推送分支**

```bash
git push -u origin feat/starrouter-video-params
```

Expected: 远端创建分支并显示 PR 创建链接。

- [ ] **Step 3: 通知用户**

提示用户：
- 分支：`feat/starrouter-video-params`
- 改动：catalog 1 条新增 + `starrouter/video.ts` ~10 行
- 验收：参见 [docs/superpowers/specs/2026-06-18-starrouter-video-params-design.md](../specs/2026-06-18-starrouter-video-params-design.md) §5

> 本计划不在仓库内创建 PR。如需 PR，由用户决定 base 分支与描述。
