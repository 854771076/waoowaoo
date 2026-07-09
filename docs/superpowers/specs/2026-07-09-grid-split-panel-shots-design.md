# 宫格拆分高清分镜 — Design Spec

**Date:** 2026-07-09
**Status:** Approved
**Branched from:** `feat/panel-media-history`

---

## 1. Problem & Overview

### 1.1 Bug

直接用九宫格（宫格）图作为视频模型输入时，输出视频前几秒甚至全程残留"宫格"结构——
因为视频模型把宫格边框和小格当作画面内容来处理，LLM 提示词重写（`rewriteGridVideoPrompt`）
无法从根本上改变模型把宫格图当作一张"真实画面"的行为。这是**输入层**的问题。

### 1.2 Solution (三阶段 pipeline)

1. **宫格静态图生成**（保留现有流程不变）：一次 prompt 生成包含 N 个分镜的宫格图，保证构图多样性。
2. **高清化拆分**（新增）：对宫格图几何裁剪出每一格 → 逐格 img2img 高清重绘 → 存为独立分镜帧。
3. **多帧视频生成**（增强）：用拆分后的高清分镜帧作为视频模型输入，**v1 使用首尾帧模式**（`firstlastframe`），首帧=帧1，尾帧=帧N，prompt 指导连贯运镜。不再把宫格大图喂给视频模型。

### 1.3 设计决策汇总

| 维度 | 决定 |
|---|---|
| 拆分方式 | 几何裁剪 + img2img 高清重绘（sharp + 现有图像模型） |
| 宫格语义 | 一个 panel 的多关键帧（1 panel → 1 段视频），对齐 director-desk 多 shot 方向 |
| 触发方式 | 用户手动点击"✂️ 拆分"按钮；未拆分仍走旧宫格→视频路径（两条路径并存） |
| 数据模型 | 新建 `NovelPromotionGridSplitFrame` 表（宫格拆分帧专用）；**不**改动已有的 `NovelPromotionDirectorShot` 表，两者独立 |
| 视频路径选择优先级 | directorShots（导演台机位）> gridSplitFrames（宫格拆分帧）> 旧宫格 LLM 重写路径 > 普通单图 |
| 视频生成模式 | v1 使用已有的 `firstlastframe` 模式（首帧+尾帧）；中间帧存表但不传模型（YAGNI） |
| 向后兼容 | 旧路径完整保留；未拆分/拆分失败都能回退，不阻塞用户生成视频 |

> **Note on 统一表 vs 独立表：** director-desk 已在使用 `NovelPromotionDirectorShot`（schema + 代码都已落
> 地），合并需要写数据迁移 + 改 director-desk 所有引用，超出本次"修九宫格视频"目标范围。
> 本次新建 `NovelPromotionGridSplitFrame`，未来如需统一再做一次迁移。

---

## 2. Data Model

### 2.1 新表：`NovelPromotionGridSplitFrame`

宫格拆分后的单个高清分镜帧。一个 panel 通过宫格拆分产出 N 个 frame，按 `frameIndex` 排序。

```prisma
model NovelPromotionGridSplitFrame {
  id           String   @id @default(uuid())
  panelId      String
  panel        NovelPromotionPanel @relation(fields: [panelId], references: [id], onDelete: Cascade)

  // 帧序号（0 起），与宫格小格顺序对应：从左到右、从上到下
  frameIndex   Int

  // 拆分后的高清分镜图（通过 MediaObject 统一媒体存储）
  imageMediaId String
  imageMedia   MediaObject @relation("NovelPromotionGridSplitFrameImage", fields: [imageMediaId], references: [id], onDelete: Cascade)

  // 在宫格原图中的裁剪区域（归一化坐标 0-1），供"重新裁剪/微调"使用
  cropX        Float
  cropY        Float
  cropW        Float
  cropH        Float

  // 重绘完成标记（拆分 = 裁剪 + 重绘两步；裁剪失败无此记录，重绘失败 redrawn=false）
  redrawn      Boolean  @default(false)

  // 本帧重绘错误（单帧失败时记录；成功为 null）
  error        String?  @db.Text

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([panelId])
  @@unique([panelId, frameIndex])
}
```

### 2.2 `MediaObject` 关系补充

```prisma
// 在 MediaObject 里加反查关系（参考已有 NovelPromotionDirectorShot 的模式）：
// （此行加到 MediaObject 的 relations 区域；不新建反查关系也可工作，Prisma 不强制。）
gridSplitFrames NovelPromotionGridSplitFrame[]
```

若 MediaObject 已有大量反向关系不想再加，可以省略反查关系字段，仅在 GridSplitFrame 侧声明正向 relation 即可。

### 2.3 `NovelPromotionPanel` 变更

```prisma
// 新增关系：
gridSplitFrames  NovelPromotionGridSplitFrame[]

// 新增宫格拆分状态字段：
gridSplitStatus  String?   // null | 'none' | 'splitting' | 'split' | 'split_failed'
gridSplitError   String?   @db.Text
gridSplitTaskId  String?

// 其他字段行为不变：
// imageLayout: 'single' | 'grid'  —— 主图布局；拆分后仍为 'grid'
// imageUrl: 保留宫格原图，可重新拆分/追溯
// gridGenerationContext: 保留，记录宫格生成元数据（含 panelGridSize）
// candidateImages: 保留单图候选语义
// directorLayout / directorShots: 保持不变（director-desk 已在用）
```

**关键：拆分后 `imageUrl` 不替换、`imageLayout` 不变**——宫格原图仍作为 panel 主图展示，
拆分帧是附加的"高清关键帧"供视频生成使用。这保持 UI 稳定，用户随时可以"重新拆分"换一批帧。

---

## 3. Task & Worker

### 3.1 新增 Task Kind：`panel-grid-split`

- `targetType: 'panel'`, `targetId: panelId`
- task key 前缀：`panel-grid-split:<panelId>`
- payload:
  ```ts
  {
    panelId: string
    modelId?: string   // 重绘模型；默认 projectConfig.storyboardModel
    gridSize?: number  // 默认从 panel.gridGenerationContext 读
    force?: boolean    // 强制重拆（忽略已有 split frames）
  }
  ```
- 幂等：`gridSplitStatus='split'` 且已有 GridSplitFrame 行且 `!force` → 直接 return `{ skipped: true }`

### 3.2 Worker：`handlePanelGridSplitTask`

新文件 `src/lib/workers/handlers/panel-grid-split-task-handler.ts`。

流程：

```
1. 前置校验
   - 读 panel（include: { gridSplitFrames: true } 用于幂等检查）
   - 校验 panel.imageLayout === 'grid' && panel.imageUrl
   - 解析 panel.gridGenerationContext → gridMetadata.panelGridSize（兜底 defaultGridSize=4）
   - 已有 gridSplitFrames 且 !force → return { skipped: true }

2. 裁剪（sharp，本地，无模型调用）
   - 下载宫格原图 → buffer
   - buildStoryboardGridLayout('grid_auto', gridSize) → columns/rows
   - 计算每格裁剪矩形：
       cellW = imgW / columns, cellH = imgH / rows
       for i in 0..panelCount-1:
         col = i % columns, row = floor(i / columns)
         cropRect = { left: col*cellW, top: row*cellH, width: cellW, height: cellH }
         sharp(buffer).extract(cropRect).jpeg({ quality: 92 }).toBuffer()
         保存为临时 buffer 列表
   - 空末格（capacity > panelCount）跳过
   - 进度：~20%

3. 逐格 img2img 重绘（AI 调用，并发上限 3）
   - 复用 buildPanelPromptContext 构造单格上下文
   - Prompt：用 buildPanelPrompt（NP_SINGLE_PANEL_IMAGE 模板）+ img2img 参考为裁剪图
     - 强度约 0.5-0.6（保留构图，补全细节）
     - 复用 resolveImageSourceFromGeneration 调用图像模型
   - 成功：上传 COS → ensureMediaObjectFromStorageKey → 记录 (imageMediaId, buffer)
   - 失败：重试 2 次（复用 BaseImageGenerator.generate 内建重试）；仍失败则该格记 error，跳过
   - 进度：20% + (i/panelCount)*70%

4. 持久化（prisma.$transaction）
   - 若 force：prisma.novelPromotionGridSplitFrame.deleteMany({ where: { panelId } })
   - 对每格 i：
     - 成功：create { panelId, frameIndex: i, imageMediaId, cropX/Y/W/H（归一化）, redrawn: true }
     - 失败：不创建 frame 行（或创建 redrawn=false + error 行；v1 选择不创建，让帧数量对应用户可见的"成功帧"）
   - 更新 panel：
     - 若有 ≥1 帧成功：gridSplitStatus='split'
     - 若全部失败：gridSplitStatus='split_failed', gridSplitError='All frames failed to redraw: ...'
     - gridSplitTaskId=null
     （imageUrl / imageLayout 不改动）

5. 失败处理
   - 部分格失败：成功格已持久化，gridSplitStatus='split'（partial success 是可用状态）
     - 只要首尾两格存在，视频即可走 firstlastframe 路径 B
     - gridSplitError 记录部分失败信息（如 "frame 3 failed: ..."）
   - 全部格失败：gridSplitStatus='split_failed'；视频生成自动回退旧路径
```

**复用（零新增基础设施）：**
- 图像下载/上传/COS：`uploadImageSourceToCos`、`ensureMediaObjectFromStorageKey`、`toSignedUrlIfCos`、`normalizeToBase64ForGeneration`
- AI 调用：`resolveImageSourceFromGeneration`（img2img 通过 referenceImages 传裁剪图）
- Prompt 上下文：`buildPanelPromptContext`、`buildPanelPrompt`
- 布局：`buildStoryboardGridLayout`
- 任务进度：`reportTaskProgress`

**依赖：** sharp（已在 `package.json:^0.34.5`），零新增依赖。

---

## 4. Video Generation Path Switching

修改 `src/lib/workers/video.worker.ts` 的 `generateVideoForPanel`：进入后先决议本次视频生成要走哪条路径。

### 4.1 关键帧选择（新文件 `src/lib/workers/handlers/grid-split/keyframes.ts`）

```ts
type KeyframeSelection = {
  mode: 'director' | 'grid_split' | 'grid_legacy' | 'single'
  generationMode: VideoGenerationMode  // 'normal' | 'firstlastframe'
  firstFrameImageUrl: string           // 签好的 COS URL
  lastFrameImageUrl?: string           // 可选尾帧（firstlastframe 时必传）
  prompt: string
}

function selectVideoKeyframes(params: {
  panel: PanelWithFrames
  basePrompt: string
  locale: 'zh' | 'en'
}): KeyframeSelection
```

优先级：

1. **路径 A — Director 机位帧**：`panel.directorShots` 非空（导演台已绑定机位）
   - `isActive` 那张作首帧；按 shot 顺序最后一张作尾帧
   - `generationMode = directorShots.length >= 2 ? 'firstlastframe' : 'normal'`
   - Prompt：basePrompt（不做 grid-video-prompt-rewriter 重写）
2. **路径 B — 宫格拆分帧**：`panel.gridSplitFrames.length >= 2`，按 frameIndex 排序
   - 帧[0] 作首帧，帧[N-1] 作尾帧
   - `generationMode = 'firstlastframe'`
   - Prompt：`buildMultiKeyframePrompt(basePrompt, N, locale)`（见 §4.2），跳过 grid-video-prompt-rewriter
   - 容错：只有 1 张 split frame → fallback 到路径 D（把它当普通单图）
3. **路径 C — 旧宫格路径**：`panel.imageLayout === 'grid'`
   - 保持现有逻辑：调 `resolveGridVideoPrompt` 做 LLM 提示词重写，single image → normal
4. **路径 D — 普通单图**：其他情况
   - `generationMode = 'normal'`，source=panel.imageUrl，prompt=basePrompt

**与用户手动首/尾帧的交互：** 若调用方显式传了 `firstLastFramePayload`（用户在视频阶段手动选首尾帧），**优先**走现有 first-last-frame 逻辑，不被 panel shots/frames 覆盖——用户显式选择 > 自动选择。

### 4.2 多关键帧 Prompt

新文件 `src/lib/workers/handlers/grid-split/prompt.ts`：

```ts
function buildMultiKeyframePrompt(basePrompt: string, frameCount: number, locale: 'zh' | 'en'): string
```

在 basePrompt 前追加稳定的"连贯运镜"指令：

```
zh:
"视频由 {N} 个连续分镜构成。从第一张图（起始画面）自然、流畅地运镜过渡到最后一张图（结束画面）。
运镜连贯，人物形象、服装、场景、光影全程保持一致，不跳变、不出现分屏或九宫格结构、不出现分镜边框。
{basePrompt}"

en:
"This video consists of {N} consecutive shots. Generate smooth, natural camera motion
that transitions seamlessly from the first frame (starting composition) to the last frame (ending composition).
Maintain consistent character appearance, costumes, scene, and lighting throughout the transition.
No split-screen, no grid structure, no panel borders.
{basePrompt}"
```

### 4.3 `generateVideoForPanel` 改造要点

- 取 panel 时，prisma include 加：
  ```
  directorShots: { orderBy: { ... } },
  gridSplitFrames: { orderBy: { frameIndex: 'asc' }, include: { imageMedia: true } }
  ```
  （注意：`directorShots` 已在 panel 关系里，image 字段为 `imageMedia`，已由 director-desk 代码路径查询；本路径同样需要 include）
- 按 §4.1 选择 keyframes → 得到 `{ firstFrameImageUrl, lastFrameImageUrl, prompt, generationMode }`
- 后续 source→base64、lastFrame→base64、调 `resolveVideoSourceFromGeneration`、上传——沿用现有逻辑
- 不再把宫格大图直接喂给视频模型（除非走到路径 C 旧宫格路径）

---

## 5. API Route

### 5.1 `POST /api/novel-promotion/[projectId]/panel/[panelId]/split`

新文件 `src/app/api/novel-promotion/[projectId]/panel/[panelId]/split/route.ts`。

模式参考 `src/app/api/novel-promotion/[projectId]/panel/route.ts` + `director-desk/save`：

- 鉴权：`requireProjectAuthLight(projectId)` + `apiHandler`
- Body: `{ force?: boolean; modelId?: string }`（都可选）
- Steps:
  1. 校验 panelId 存在 + 属于 project + `imageLayout==='grid'` + `imageUrl` 非空 → 否则 400
  2. 查询是否存在 running/pending 的 `panel-grid-split` task（幂等）；若存在且 !force → 返回 `{ async: true, taskId: existing.id, warning: 'already_running' }`
  3. 创建 BullMQ task（kind=`panel-grid-split`，targetType=`panel`，targetId=panelId，payload 来自 body）
  4. `prisma.novelPromotionPanel.update({ where: { id: panelId }, data: { gridSplitStatus: 'splitting', gridSplitTaskId: task.id, gridSplitError: null } })`
  5. 返回 `{ async: true, taskId: task.id }`

v1 不提供 DELETE/CANCEL 端点（拆分任务秒-分钟级，YAGNI）。

---

## 6. Frontend Integration

### 6.1 新 hook：`usePanelGridSplit`

位置：`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/usePanelGridSplit.ts`

仿照 `usePanelImageRegeneration`：
- 使用 `useSplitPanelGridMutation(projectId)`（新 tanstack mutation hook）
- 本地维护 `splittingPanelIds: Set<string>`
- 成功后：`onSilentRefresh()` + `refreshEpisode()` + `refreshStoryboards()`
- 失败 toast；`isAbortError` 静默
- 导出：`splitPanelGrid(panelId, opts?: { force?: boolean })`, `splittingPanelIds`

### 6.2 接入 `useStoryboardImageGeneration`（storyboard 阶段）

在现有 `src/app/.../hooks/useImageGeneration.ts` 中：
- 引入 `usePanelGridSplit`，把 `splitPanelGrid`、`splittingPanelIds` 透出给 Panel 卡片 UI

### 6.3 Panel 卡片工具栏按钮

在 storyboard 阶段 panel 的 image 工具栏（参考现有 history/modify/regenerate 按钮位置），针对 `imageLayout==='grid'` 的 panel 加一个"✂️ 拆分"按钮：

| 状态 | 按钮 |
|---|---|
| `gridSplitStatus` 空/`'none'`/null | "✂️ 拆分" |
| `'splitting'` 或 `splittingPanelIds.has(panelId)` | spinner + "拆分中..."，disabled |
| `'split'` | "✂️ 重新拆分"（force=true） |
| `'split_failed'` | "✂️ 拆分失败，重试"（title 显示 `gridSplitError`） |

点击 → `splitPanelGrid(panelId, { force: 重新拆分时为 true })`。

**主图不变**：panel 卡片仍显示宫格原图。v1 不展示拆分帧缩略图（YAGNI；director-desk 未来的 shot 预览组件可复用）。

### 6.4 视频阶段 `VideoPanel` 投影

在 `useVideoPanelsProjection.ts`：
- panel 数据需包含 `gridSplitFrames`（通过 storyboards 数据流带过来）
- `VideoPanel` 增加 `keyframeSource: 'director' | 'grid_split' | 'grid_legacy' | 'single'`
- 投影时根据 panel.directorShots/gridSplitFrames/imageLayout 计算该字段
- v1 只用于 debug/tooltip；正式 UI 提示后续再加

### 6.5 Task state 聚合

把 `panel-grid-split:<panelId>` task key 加入 storyboard 阶段的 task 状态聚合（仿照 `panel-video:*`、`panel-lip:*`、`grid-video-prompt:*` 现有注册方式），让"拆分中"spinner 响应 task 状态，不只依赖本地 `splittingPanelIds`。

### 6.6 Query 层

在 `src/lib/query/hooks` 相关 mutation 文件中新增 `useSplitPanelGridMutation(projectId)`，封装 POST split API。

---

## 7. Error Handling & Edge Cases

| 场景 | 行为 |
|---|---|
| 非 grid panel 调用 split API | 返回 400；前端不显示按钮 |
| panel.imageUrl 为空 | split API 400；前端按钮 disabled |
| 宫格原图下载后 sharp 无法解码 | task failed；`gridSplitError='Failed to decode source grid image'`；按钮显示重试 |
| 拆分中途部分格重绘失败 | 成功的格持久化（redrawn=true），`gridSplitStatus='split'`，`gridSplitError` 记录部分失败；只要首尾两帧存在视频即可走路径 B |
| 全部格重绘失败 | `gridSplitStatus='split_failed'`；视频生成自动回退路径 C |
| 已有 directorShots 又触发拆分 | 拆分正常执行；视频生成时 director 优先（路径 A），grid_split 仅作备用 |
| 用户重新拆分（force=true） | 事务内先 deleteMany gridSplitFrames，再重建；directorShots 不受影响 |
| 未拆分直接生成视频 | 走路径 C（现有 LLM 重写），完全向后兼容 |
| frame 图像存储/下载失败 | 该格视为失败，记录 error，不影响其他格 |
| 重复点击"拆分" | 前端 disabled + 后端幂等（running task 存在返回 existing taskId） |
| **拆分后用户重新生成宫格图** | 现有 `buildGridInvalidationPatch` 需扩展：重生成宫格图时重置 `gridSplitStatus/gridSplitError/gridSplitTaskId`，并 `deleteMany` 该 panel 的 `NovelPromotionGridSplitFrame` 行（防止新宫格图和旧拆分帧不匹配） |

---

## 8. Testing

### 8.1 单元测试

- `tests/unit/grid-split/crop.test.ts`
  - 3×2=6 格：每格 sharp 裁剪区域坐标/尺寸正确
  - 列/行数由 `buildStoryboardGridLayout` 决定
  - capacity > panelCount 时空末格跳过
  - 归一化 cropX/Y/W/H 正确落在 [0,1]

- `tests/unit/grid-split/keyframe-selection.test.ts`
  - directorShots 非空 → 路径 A，isActive 为首帧
  - gridSplitFrames ≥ 2 → 路径 B，首=frames[0]，尾=frames[N-1]，mode=firstlastframe
  - gridSplitFrames 只有 1 张 → fallback 到 single
  - 无 frames + imageLayout=grid → 路径 C grid_legacy
  - 无 frames + imageLayout=single → 路径 D single
  - directorShots 和 gridSplitFrames 同时存在 → director 优先

- `tests/unit/grid-split/buildMultiKeyframePrompt.test.ts`
  - prompt 包含帧数、连贯运镜指令、basePrompt
  - zh/en 输出对应语言

### 8.2 集成测试

- `tests/integration/api/panel/split.test.ts`
  - 非 grid panel → 400
  - grid + 无 imageUrl → 400
  - 正常触发 → `{ async: true, taskId }`；panel.gridSplitStatus='splitting'
  - 重复触发（running task 存在）→ 返回 existing taskId（幂等）
  - force=true → 删旧 frames + 创建新拆分任务
  - 权限：用户 B 不能拆用户 A panel → 403

### 8.3 Guard 测试

- `tests/guards/grid-split/no-frames-fallback.test.ts`：gridSplitFrames 为空时视频生成走旧路径（gridVideoPrompt 继续工作），零回归
- `tests/guards/grid-split/partial-failure-still-works.test.ts`：只有首尾 2 张 frames 仍可走 firstlastframe 路径
- `tests/guards/grid-split/director-shots-priority.test.ts`：directorShots 存在时 grid_split 被忽略
- `tests/guards/grid-split/regenerate-invalidates-split.test.ts`：宫格图重新生成后 split 状态被清空、旧 frames 被删

### 8.4 不测（YAGNI）

- sharp 裁剪像素级输出（视觉内容）
- img2img 重绘质量（AI 输出不可断言）
- 并发拆分限流（BullMQ concurrency 保证）
- 中间帧传递给视频模型（v1 未实现）

---

## 9. File Map (Approximate)

### 新增
```
prisma/migrations/<timestamp>_add_grid_split_frame/
  migration.sql

src/lib/workers/handlers/panel-grid-split-task-handler.ts
src/lib/workers/handlers/grid-split/crop.ts                 (sharp 裁剪，单测)
src/lib/workers/handlers/grid-split/keyframes.ts           (关键帧选择，单测)
src/lib/workers/handlers/grid-split/prompt.ts              (多帧 prompt 构造，单测)

src/app/api/novel-promotion/[projectId]/panel/[panelId]/split/route.ts

src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/
  hooks/usePanelGridSplit.ts

tests/unit/grid-split/crop.test.ts
tests/unit/grid-split/keyframe-selection.test.ts
tests/unit/grid-split/buildMultiKeyframePrompt.test.ts
tests/integration/api/panel/split.test.ts
tests/guards/grid-split/no-frames-fallback.test.ts
tests/guards/grid-split/partial-failure-still-works.test.ts
tests/guards/grid-split/director-shots-priority.test.ts
tests/guards/grid-split/regenerate-invalidates-split.test.ts
```

### 修改
```
prisma/schema.prisma
  - 新增 NovelPromotionGridSplitFrame model（加 @relation("NovelPromotionGridSplitFrameImage")）
  - NovelPromotionPanel 加 gridSplitFrames 关系 + gridSplitStatus/gridSplitError/gridSplitTaskId 字段
  - MediaObject 加反查关系 gridSplitFrames（可选；不加也工作）

src/lib/task/types.ts
  - 注册 'panel-grid-split' task kind 和 'panel-grid-split:' key 前缀

src/lib/workers/handlers/panel-image-grid-invalidate.ts
  - 扩展 buildGridInvalidationPatch：宫格重生成时清空 gridSplitStatus/gridSplitError/gridSplitTaskId
  - panel-image-task-handler 在重生成宫格图的事务里 deleteMany 旧的 NovelPromotionGridSplitFrame

src/lib/workers/video.worker.ts
  - getPanelForVideoTask（或取 panel 的地方）prisma include 加 gridSplitFrames: { include: { imageMedia: true } }
  - generateVideoForPanel 按 §4 加路径 A/B/C/D 分支，调用 keyframes.ts 里的选择函数

src/lib/workers/index.ts（或 worker 注册入口）
  - 注册 panel-grid-split task handler

src/lib/query/hooks（或对应 mutation 聚合文件）
  - 新增 useSplitPanelGridMutation

src/app/.../storyboard/hooks/useImageGeneration.ts
  - 接入 usePanelGridSplit，透出 splitPanelGrid/splittingPanelIds

src/app/.../storyboard/.../ImageSectionActionButtons.tsx（或实际承载宫格 toolbar 的组件）
  - 加"拆分"按钮和状态展示

src/app/.../video/types.ts
  - VideoPanel 加 keyframeSource?: 'director' | 'grid_split' | 'grid_legacy' | 'single'

src/lib/novel-promotion/stages/video-stage-runtime/useVideoPanelsProjection.ts
  - panel 数据取 gridSplitFrames，投影 keyframeSource 字段

src/lib/novel-promotion/stages/video-stage-runtime 下 task 聚合
  - 加 'panel-grid-split:' task key 前缀

messages/zh/storyboard.json
messages/en/storyboard.json
  - 加 i18n：storyboard.panelGridSplit.split / .splitting / .failed / .resplit
```

### 不改动
- `NovelPromotionDirectorShot` 表及 director-desk 相关代码（保持独立）
- 现有 `rewriteGridVideoPrompt` / `resolveGridVideoPrompt` 宫格提示词重写逻辑（路径 C 继续使用，未来当所有用户都切到拆分路径可考虑下线）
- 候选图选择（candidateImages）逻辑
- Lip sync / TTS / voice lines 流程
- Director desk UI 或 API

---

## 10. Follow-ups (post-v1, YAGNI 列表)

- **拆分帧预览 UI**：展示每帧缩略图，用户可浏览/单独重绘/删除/选首帧（director-desk 的 shot 预览组件未来可复用）
- **多帧视频模型（>2 frames）**：接入支持多关键帧的模型时，把中间 frames 作为 options 扩展字段传入，无需迁移数据
- **手动上传关键帧**：用户在视频阶段手动上传 1-2 张图作为关键帧（可在 Panel 上加 `source='manual'` 的帧表，或作为独立功能；本次不做）
- **拆分帧质量分级**：对每帧做质量检测，自动标记需重绘的帧
- **统一 GridSplitFrame 和 DirectorShot 到通用 PanelShot 表**：一次性数据迁移 + director-desk 代码改造，未来做
- **宫格拆分后主图可切换**：让用户选择 panel 主图显示宫格还是拆分首帧（v1 固定显示宫格，降低认知）
- **拆分帧作为 candidateImages**：让用户在拆分帧里挑一张作为"主图首帧"
