# StarRouter 视频模型参数面板补齐设计

**日期**：2026-06-18
**范围**：Provider `starrouter` 的视频生成 —— 在前端模型下拉中显示与 Ark Seedance 一致的参数面板（生成音频 / 时长 / 分辨率），并在后端把这些参数透传到 StarRouter 上游。

---

## 1. 背景

### 1.1 现状

- 视频参数面板（生成音频 / 时长 / 分辨率）由 [`usePanelVideoModel`](../../../src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/hooks/usePanelVideoModel.ts) 数据驱动渲染，遍历 `selectedOption.capabilities.video.*Options` 自动生成表单字段。
- Ark provider 的视频模型在 [`standards/capabilities/image-video.catalog.json`](../../../standards/capabilities/image-video.catalog.json) 中已配置完整 `capabilities.video`（如 `doubao-seedance-2-0-fast-260128` 的 generateAudioOptions / durationOptions / resolutionOptions），所以 UI 自动显示参数面板。
- StarRouter provider 的视频模型 `dreamina-seedance-2-0-fast-260128`：
  - **catalog 中没有对应条目** → 前端拿到的 `capabilities.video` 为空 → 不渲染参数面板。
  - 后端 [`src/lib/providers/starrouter/video.ts`](../../../src/lib/providers/starrouter/video.ts) 的 submit body 仅支持 `duration` 和 `aspect_ratio`，未支持 `resolution` 和 `generateAudio`。

### 1.2 目标

让 StarRouter 的 Dreamina Seedance 2.0 Fast 模型在前端展示与 Ark Seedance 2.0 Fast 一致的参数面板（生成音频开关、时长 4–15 秒、分辨率 480p/720p），且这些参数能正确发送到 StarRouter 上游。

### 1.3 非目标

- 不引入首尾帧（firstlastframe）支持。StarRouter 上游未文档化首尾帧参数，本次先保守关闭。
- 不调整 BullMQ 任务调度、计费、定价层。沿用现有视频任务流程。
- 不为 `buildSubmitRequest` 新增单元测试（与项目当前 `starrouter/video.ts` 无覆盖测试的现状对齐；如后续需要可单独补）。
- **不在 [`standards/pricing/image-video.pricing.json`](../../../standards/pricing/image-video.pricing.json) 中新增 starrouter 条目**。当前该文件零 starrouter 条目，本次不动它（详见 §4 边界 1）。如需为 starrouter 视频建立精细计费 tier，应另起设计。
- 不调整 `fieldI18n`。Label / 单位 / 选项文案沿用现有渲染机制（UI 端 `toFieldLabel` + `messages/{locale}/video.json` 的 `capability.*` key），与 Ark 当前 catalog 行为一致。

---

## 2. 架构

### 2.1 数据流（不变）

```
catalog json  →  findBuiltinCapabilities()  →  VideoModelOption.capabilities
                                                          ↓
                              usePanelVideoModel.capabilityFields
                                                          ↓
                                   ModelDropdown 渲染参数面板
                                                          ↓
                                 用户选择 → generationOptions
                                                          ↓
                          buildPanelVideoTargets → BatchVideoGenerationParams
                                                          ↓
                                    video.worker.ts → generateVideo()
                                                          ↓
                       generators/factory → starrouter/video.ts.buildSubmitRequest()
                                                          ↓
                               POST starrouter.io/v1/videos/createVideoGeneration
```

本次改动只触及链路的两端：**catalog（输入）** 和 **buildSubmitRequest（输出）**，中间链路保持不变。

### 2.2 改动范围

| 文件 | 改动 |
|------|------|
| [`standards/capabilities/image-video.catalog.json`](../../../standards/capabilities/image-video.catalog.json) | 新增 1 条 `starrouter::dreamina-seedance-2-0-fast-260128` 视频能力条目 |
| [`src/lib/providers/starrouter/video.ts`](../../../src/lib/providers/starrouter/video.ts) | 扩展 submit body interface、`buildSubmitRequest` 字段透传、`assertNoUnsupportedOptions` 白名单 |

零前端改动。

---

## 3. 详细设计

### 3.1 catalog 条目

在 `standards/capabilities/image-video.catalog.json` 数组中追加：

```json
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
```

**字段说明**：
- `generationModeOptions: ["normal"]` —— 必须有 `"normal"` 默认值，链路依赖。`buildPanelVideoTargets` 在 [`src/lib/novel-promotion/stages/video-stage-runtime/task-targets.ts`](../../../src/lib/novel-promotion/stages/video-stage-runtime/task-targets.ts) 与 hook 默认 `generationMode: 'normal'` 协同工作。本设计不开 `"firstlastframe"`。
- `generateAudioOptions: [true, false]` + `supportGenerateAudio: true` —— 与 Ark Seedance 2.0 Fast 一致。
- `durationOptions: [4..15]` —— 与 Ark Seedance 2.0 Fast 同区间。
- `resolutionOptions: ["480p", "720p"]` —— 与 Ark Seedance 2.0 Fast 一致。

加载时由 [`validateVideoCapabilities`](../../../src/lib/model-config-contract.ts) 自动校验：字段必须在 `VIDEO_ALLOWED_FIELDS` 内、值类型与数组形态合法。

**注**：Ark 的 catalog 条目同样不含 `fieldI18n`，UI 通过 `toFieldLabel`（camelCase → "Generate Audio"）和 `messages/{locale}/video.json` 的 `capability.*` key 解决文案。本设计沿用，无需新增 i18n。

### 3.2 后端透传（starrouter/video.ts）

**a) 扩展 submit body interface**：
```ts
interface StarRouterVideoSubmitBody {
  model: string
  prompt?: string
  input_image_url?: string
  duration?: number
  aspect_ratio?: string
  resolution?: string         // 新增
  generate_audio?: boolean    // 新增（snake_case，与 aspect_ratio 风格一致）
}
```

**b) `buildSubmitRequest` 读取并写入**：
```ts
const resolution = readTrimmedString(params.options.resolution)
const generateAudio = readOptionalBoolean(params.options.generateAudio)
// ...
if (resolution) submitBody.resolution = resolution
if (typeof generateAudio === 'boolean') submitBody.generate_audio = generateAudio
```

新增 `readOptionalBoolean` 工具函数（4 行，与 bailian/video.ts 同款实现，保持 starrouter 模块自包含）：
```ts
function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}
```

**c) `assertNoUnsupportedOptions` 白名单**：
- `resolution` 已在白名单中，无需再加。
- 新增 `generateAudio`。

修改后白名单：
```ts
const allowedOptionKeys = new Set([
  'provider', 'modelId', 'modelKey', 'prompt',
  'duration', 'aspectRatio', 'aspect_ratio',
  'outputFormat', 'resolution', 'fps',
  'generateAudio',  // 新增
])
```

### 3.3 字段命名约定

- **catalog / 前端 / generator options**：camelCase（`generateAudio`、`resolution`），与 Ark / Bailian 保持一致。
- **starrouter submit body**：snake_case（`generate_audio`、`resolution`），跟随现有 `aspect_ratio`、`input_image_url` 的命名风格。

转换发生在 `buildSubmitRequest` 内部，对外接口保持 camelCase。

---

## 4. 错误处理 & 边界

| 场景 | 行为 |
|------|------|
| **starrouter 在 pricing 文件中无对应条目**（当前事实） | [`/api/user/models`](../../../src/app/api/user/models/route.ts) 不会给 `option.videoPricingTiers` 赋值，[`resolveEffectiveVideoCapabilityFields`](../../../src/lib/model-capabilities/video-effective.ts) 走 `tiers.length === 0 → options.slice()` 全集分支，UI 显示 catalog 中所有值。**计费链路若依赖 tier，需要单独验证**——本设计不解决计费精细化，等需要时另起 spec |
| catalog 字段值非法（如 duration 数组含字符串） | 启动时 `validateVideoCapabilities` 抛 `CAPABILITY_CATALOG_INVALID`，构建失败 |
| 用户选了 `resolution=720p`，但上游静默忽略 | 视频仍能生成，分辨率不生效；非阻塞，验收时观察 |
| 前端传入超出能力范围的值（如 duration=20） | `usePanelVideoModel` / `normalizeVideoGenerationSelections` 已限制下拉只能选合法值，不会传到后端 |
| 未识别字段（如 `frames`）传到 starrouter | `assertNoUnsupportedOptions` 抛 `STARSTONE_VIDEO_OPTION_UNSUPPORTED` —— 现有行为不变 |
| StarRouter 上游 timeout | 现有 `STARSTONE_VIDEO_SUBMIT_TIMEOUT(30000ms)` 兜底 —— 行为不变 |
| 后续若给 starrouter 加 pricing tier | tier 的 `when` 子句必须能覆盖 catalog 全部组合，否则 UI 选项会自动收窄。计费扩展时需要回头核对本 catalog 条目 |

---

## 5. 验收

### 5.1 静态检查
- `npm run typecheck` 通过
- `npm run lint:all` 通过
- 启动 Next（`npm run dev:next`）不报 `CAPABILITY_CATALOG_INVALID` / `CAPABILITY_CATALOG_DUPLICATE`

### 5.2 功能手测
1. 进入项目工作区 → 视频阶段 → 选择 StarRouter 的 `Dreamina Seedance 2.0 Fast`
2. 模型下拉展开"参数配置"区，应包含三个字段：
   - 生成音频（开 / 关）
   - 时长（4–15 秒，下拉）
   - 分辨率（480p / 720p）
3. 调整任一参数 → 点"生成视频"
4. 在 BullMQ board (`http://localhost:3010/admin/queues`) 或 `dev:worker` 日志中确认 submit body 携带 `resolution` 和 `generate_audio` 字段，值与 UI 选择一致

---

## 6. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| StarRouter 上游忽略 `resolution` / `generate_audio` | 低 | 仅参数不生效，不报错；联调时观察上游响应 |
| 文档外字段被严格校验拒绝 | 极低 | 现有 `aspect_ratio` 也是文档外字段且已工作；同站点行为一致性高 |
| 后续模型扩充时 catalog 重复 | 低 | `buildCache` 已内置 `CAPABILITY_CATALOG_DUPLICATE` 校验 |
| **计费空白**：starrouter 视频在 pricing catalog 中无 tier，按"无 pricing"分支处理 | 中 | 本设计不解决；视频任务能跑通，但若现有计费链路对未配置 pricing 的视频任务有断言/日志告警，需在验收时观察。需要精细计费时另起 spec 处理 |

---

## 7. 后续可扩展

- 当确认 StarRouter 上游支持首尾帧时，可在 catalog 加 `"firstlastframe": true` + `generationModeOptions` 增加 `"firstlastframe"`，并在 `buildSubmitRequest` 增加首尾帧分支。
- 当 starrouter 接入更多模型时，按本设计模式追加 catalog 条目即可，无需改 video.ts 主体。
