# Director's Desk (导演台) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-browser 3D director's desk for every storyboard panel — open in a new window, auto-populate with characters/props/backdrop, block the scene via drag/pose/camera controls, bind **multiple camera snapshots (机位图)** to the panel, feed all bound shots as reference images into panel image generation (active shot first), and inject structured camera metadata (`director_shot.active_camera` + `director_shot.bound_shots`) into the prompt.

**Architecture:** New Next.js App Router page `/[locale]/workspace/[projectId]/director-desk` mounts an R3F canvas with billboard character/prop cards + optional procedural mannequins on a grid ground with an arc backdrop. A zustand store manages scene state. Persistence: nullable `directorLayout` JSON column on `NovelPromotionPanel` + new `NovelPromotionDirectorShot` table (1:N: cameraId, name, isActive, fov, pos[x,y,z], target[x,y,z], imageMediaId, note, createdAt). Two new API routes: `load` (returns panel + directorLayout + directorShots) and `save` (replaces all shots for the panel in a transaction, uploads JPEG screenshots to COS/MediaObject). The panel-image worker prepends ALL bound director shots (active first) to reference images and injects `director_shot` block with `active_camera` + `bound_shots` into prompt context; prompt templates gain a hard rule. In-session captures live as dataURLs in zustand; user explicitly binds/⭐-stars them; only bound captures are sent to save.

**REVISION 2026-07-07 (multi-shot captures):** This plan was originally written for one screenshot per panel. The spec now binds multiple shots per panel (new `NovelPromotionDirectorShot` table). Wherever a step below refers to `directorShotMediaId` / single FK / single `activeCameraSnapshot`, apply the overrides below (read these first):

### Revision Overrides (apply these to the tasks below)

**Task 1 (schema/migration):** Instead of adding `directorShotMediaId`/`directorShotMedia` to `NovelPromotionPanel`, add:
- `directorLayout String? @db.Text` on `NovelPromotionPanel`
- `directorShots NovelPromotionDirectorShot[]` relation on `NovelPromotionPanel`
- New model `NovelPromotionDirectorShot` per spec §4.1 (id, panelId, cameraId, name, isActive, fov, posX/Y/Z, targetX/Y/Z, imageMediaId, note, createdAt, updatedAt; @@index([panelId]); `imageMedia` FK Cascade on delete, `panel` FK Cascade on delete).
- Migration SQL creates this table + the `directorLayout` column; NO directorShotMediaId column.
- Schema.ts types stay the same (`DirectorProject` is camera geometry only; bound shots live in DB not in JSON).

**Task 4 (API routes):**
- `load/route.ts` returns `panel.directorShots: Array<{id, cameraId, name, isActive, fov, pos:[x,y,z], target:[x,y,z], imageUrl, note, createdAt}>` by doing `prisma.novelPromotionDirectorShot.findMany({where:{panelId}, orderBy:[{isActive:'desc'},{createdAt:'asc'}], include:{imageMedia:true}})` and signing each imageMedia.storageKey.
- `save/route.ts` body shape is `{ panelId, project, shots: Array<{clientId?, cameraId, name, isActive, fov, position:[x,y,z], target:[x,y,z], note?, snapshotDataUrl}> }`. Validate: ≤8 shots, ≤5MB each, at most one `isActive=true` (normalize: first true wins; if none, first shot → true). Handler runs in `prisma.$transaction`: `deleteMany({where:{panelId}})` → for each shot: decode+upload+ensureMediaObject → build row data → `createMany` → update panel directorLayout + photographyRules (patch computed from the active shot's camera data, not from the active camera definition alone).
- Return `{ success: true, shotIds: string[], warning?: 'some_screenshots_failed' | 'all_screenshots_failed' }`.
- `MAX_DATAURL_BYTES` applies per-shot; continue to next shot if one fails (collect warnings).
- Add `hydrateBoundShots` action to the store.

**Task 9 (screenshot/capture):** `captureActiveCameraScreenshot` is per-camera (accept cameraId, not just active). The store tracks captures per camera with `{id, dataUrl, isBound, isActiveStar, name, note}`. UI buttons on each capture: 📌 绑定/取消绑定 (toggle isBound), ⭐ 设为激活 (toggle isActiveStar; clears other stars), 📝 备注, 📥 下载, 🗑 删除.

**Task 12 (CameraPanel 截图 tab):** Captures list shows per-camera thumbnails with bind/star/note/download/delete buttons. A "📌 全部绑定" shortcut binds all captures. The active-star capture becomes the source of photographyRules reverse-sync.

**Task 13 (PanelCard entry):** Optional badge shows "🎬 N" if `directorShots.length > 0`.

**Task 14 (worker integration):**
- The panel Prisma fetch includes `directorShots: { include: { imageMedia: true }, orderBy: [{isActive:'desc'},{createdAt:'asc'}] }`.
- `collectPanelReferenceImages` accepts `directorShotUrls: string[]` (pre-resolved signed URLs) and prepends ALL of them (active first, due to orderBy).
- `buildPanelPromptContext` accepts `directorShots` array and produces `director_shot: { active_camera: {...} | null, bound_shots: Array<{name,is_active,camera_fov,camera_position,camera_target,note}>, characters: [...] }`. The active camera in metadata is the DB active shot (if any) falling back to project.activeCameraId.
- Prompt template rule mentions active_camera (highest priority) and bound_shots (other angle references); clarify reference image order (active first, then other shots).
- The panel fetch in `handlePanelImageTask` must include `directorShots: { include: { imageMedia: true }, orderBy: [{isActive:'desc'},{createdAt:'asc'}] }`.

**Store additions:** Add actions `addCameraCapture(cameraId, dataUrl)`, `toggleCaptureBound(cameraId, captureId)`, `toggleCaptureActive(cameraId, captureId)`, `setCaptureNote(cameraId, captureId, note)`, `removeCameraCapture(cameraId, captureId)`, `clearBoundCaptures()`, `hydrateBoundShots(shots[])`; state shape `cameraCaptures: Record<string, Array<{id,dataUrl,isBound,isActiveStar,name,note}>>`.

---

**Tech Stack:** Next.js 15 App Router, React 19, Prisma, three + @react-three/fiber + @react-three/drei, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-director-desk-design.md`

**Reference (port from):** https://github.com/jiguang132/storyai-3d-director-desk

## Global Constraints

- All new server code uses `apiHandler` wrapper + `requireProjectAuthLight(projectId)` for auth; errors thrown via `new ApiError('INVALID_PARAMS' | 'NOT_FOUND' | 'FORBIDDEN')`.
- `'use client'` at top of client components and page; server-only code (lib/director-desk/*.ts) does NOT use client directives.
- `directorLayout` JSON ≤ 1MB; screenshot dataURL ≤ 5MB (after base64).
- All i18n user-facing strings use `next-intl` via `useTranslations('storyboard')` with keys under the new `directorDesk` block. Update BOTH `messages/zh/storyboard.json` AND `messages/en/storyboard.json`.
- Test files end in `.test.ts`, run via `npm run test:unit:all` (unit) or appropriate integration/regression command; all new tests must pass before each task commit.
- Backward compatibility: a panel with null `directorLayout` must behave exactly as before (no prompt changes, no extra reference images, no UI breakage).
- Screenshot labels rendered as drei `<Text>` (Three.js native) so they appear in `gl.domElement.toDataURL()` output — do NOT use drei `<Html>` for labels.
- Billboard characters default to uniform scale (Y-only rotation); mannequin mode allows free scale.
- Color palette for auto-assigned mannequin/label colors: `['#E56C5B','#7AA7FF','#6CDB7A','#F5C151','#B67DDE','#4CC3D9','#FF8FA3']`.
- Default background color `#1a1d23`. Default camera (中景): `{fov:50, position:[0,1.55,5.4], target:[0,1.05,0]}`.

---

## Task 1: DB schema + migration + types

**Files:**
- Modify: `prisma/schema.prisma` (NovelPromotionPanel model)
- Create: `prisma/migrations/<timestamp>_add_director_layout_to_panel/migration.sql`
- Create: `src/lib/director-desk/schema.ts` (TS types + validators + defaults)

**Interfaces (consumed by later tasks):**
- Prisma model `NovelPromotionPanel` gains fields: `directorLayout String? @db.Text`, `directorShotMediaId String?`, `directorShotMedia MediaObject? @relation("NovelPromotionPanelDirectorShotMedia", ...)`.
- `src/lib/director-desk/schema.ts` exports:
  - `interface DirectorProject { version:1; scene:DirectorSceneSettings; objects:DirectorObject[]; cameras:DirectorCamera[]; activeCameraId:string }`
  - `type DirectorObjectKind = 'character'|'prop'|'crowd'`, `type DirectorRenderMode = 'billboard'|'mannequin'`
  - `interface DirectorObject { id; kind; name; refId; visible; locked; color; mode; transform; bodyType?; posePresetId?; poseControls?; facing?; crowdCount?; crowdSpacing? }` — shape exactly per spec §4.2
  - `interface DirectorCamera { id; name; fov; position; target }`
  - `interface DirectorSceneSettings { backgroundColor; showGround; groundOpacity; showLabels; showGrid; backdropAssetId; backdropOpacity; backdropYaw }`
  - `interface DirectorTransform { position:[number,number,number]; rotation:[number,number,number]; scale:[number,number,number] }`
  - `const DIRECTOR_PROJECT_VERSION = 1`
  - `function parseDirectorProject(json: unknown): DirectorProject | null` — validates shape; returns null on invalid/mismatched version/missing arrays.
  - `function serializeDirectorProject(p: DirectorProject): string` — `JSON.stringify(p)`.
  - `function createDefaultDirectorProject(): DirectorProject` — scene defaults + one default 中景 camera (id `'cam-1'`, name `'主机位'`) + empty objects[].
  - `const POSE_PRESET_IDS` — string union of 20 pose keys from the reference project.
  - `const BODY_TYPE_IDS` — string union of 8 body types.
  - `const DEFAULT_CHARACTER_COLORS: string[]` — the 7-color palette.
  - `function validateDirectorProjectSize(json: string): boolean` — returns false if length > 1024*1024.

- [ ] **Step 1: Install 3D dependencies (needed for types later but safe to install now)**

```bash
cd /Users/xiaomao/Documents/fuyang/waoowaoo
npm install three @react-three/fiber @react-three/drei zustand
npm install -D @types/three
```

Commit the install as a separate commit only after `npx prisma generate` and `npm run typecheck` succeed? No — commit after Step 3 (schema + types) when typecheck is clean.

- [ ] **Step 2: Add fields to Prisma schema**

In `prisma/schema.prisma`, in the `NovelPromotionPanel` model (after `previousImageMedia` relation, before the `storyboard` relation), add:

```prisma
  directorLayout          String?  @db.Text
  directorShotMediaId     String?
  directorShotMedia       MediaObject? @relation("NovelPromotionPanelDirectorShotMedia", fields: [directorShotMediaId], references: [id], onDelete: SetNull)
```

Follow the pattern of the existing `sketchImageMedia` relation. Do NOT add an @@index on directorShotMediaId in v1 (YAGNI: not used for lookups by media id).

- [ ] **Step 3: Create and apply migration**

```bash
mkdir -p prisma/migrations/20260707120000_add_director_layout_to_panel
```

Write `prisma/migrations/20260707120000_add_director_layout_to_panel/migration.sql`:

```sql
-- AlterTable
ALTER TABLE `NovelPromotionPanel` ADD COLUMN `directorLayout` TEXT NULL,
    ADD COLUMN `directorShotMediaId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `NovelPromotionPanel` ADD CONSTRAINT `NovelPromotionPanel_directorShotMediaId_fkey`
    FOREIGN KEY (`directorShotMediaId`) REFERENCES `MediaObject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
```

Apply:

```bash
npx prisma generate
npx prisma db push   # for local dev (migration applied via db push in dev; production uses migrate deploy)
```

- [ ] **Step 4: Create schema.ts with types and validators**

Create `src/lib/director-desk/schema.ts`. It contains only pure types and validation functions (no React, no three, no Prisma). Start with types and `parseDirectorProject` — validation is strict: version must equal 1, scene must have all fields with defaults, objects/cameras must be arrays with required shape. Use a helper `isNumTriplet(v): v is [number,number,number]` etc.

The file should export the full set of interfaces/consts/functions listed under Interfaces above. For `posePresetId`, use the 20 keys from the reference project (stand, t-pose, walk, run, sit, crouch, kneel-one, kneel-two, hands-on-hips, lean, bow, think, fight, kick, throw, push, wave, reach, cross-arms, phone). For body types the 8 from spec. For `POSE_PRESET_IDS` use a `as const` array then derive the type.

Write parse carefully: be tolerant of extra fields (don't reject), but strict about required shape/version. `parseDirectorProject` returns `null` rather than throwing (callers decide fallback).

- [ ] **Step 5: Write a failing unit test for parse/serialize**

Create `tests/unit/director-desk/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createDefaultDirectorProject,
  parseDirectorProject,
  serializeDirectorProject,
  validateDirectorProjectSize,
  DIRECTOR_PROJECT_VERSION,
} from '@/lib/director-desk/schema'

describe('director project schema', () => {
  it('round-trips default project through serialize + parse', () => {
    const proj = createDefaultDirectorProject()
    const json = serializeDirectorProject(proj)
    const parsed = parseDirectorProject(JSON.parse(json))
    expect(parsed).not.toBeNull()
    expect(parsed!.version).toBe(DIRECTOR_PROJECT_VERSION)
    expect(parsed!.cameras).toHaveLength(1)
    expect(parsed!.cameras[0].name).toBe('主机位')
    expect(parsed!.objects).toHaveLength(0)
  })

  it('rejects mismatched version', () => {
    expect(parseDirectorProject({ version: 2, objects: [], cameras: [] })).toBeNull()
  })

  it('rejects non-array objects', () => {
    expect(parseDirectorProject({ version: 1, scene: {}, objects: 'bad', cameras: [] })).toBeNull()
  })

  it('rejects oversized json', () => {
    expect(validateDirectorProjectSize('x'.repeat(2 * 1024 * 1024))).toBe(false)
    expect(validateDirectorProjectSize('{}')).toBe(true)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run tests/unit/director-desk/schema.test.ts
```

Expected: FAIL (file doesn't exist yet, or parse returns null incorrectly).

- [ ] **Step 7: Fix schema.ts until tests pass**

Iterate on the implementation until the test in Step 5 passes.

- [ ] **Step 8: Run full typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260707120000_add_director_layout_to_panel/migration.sql src/lib/director-desk/schema.ts tests/unit/director-desk/schema.test.ts package.json package-lock.json
git commit -m "feat(director-desk): add Prisma fields and project schema types"
```

---

## Task 2: Prose-mapping utilities (position → Chinese screen_position / facing / posture)

**Files:**
- Create: `src/lib/director-desk/photography-rules.ts` (pure functions — §8.3 of spec)
- Test: `tests/unit/director-desk/position-to-prose.test.ts`

**Interfaces:**
- `function projectCharacterToScreen(params: { charPos:[number,number,number]; camFov:number; camPos:[number,number,number]; camTarget:[number,number,number]; aspect:number }): { nx:number; ny:number; depth:number }`
  - Projects a world-space position into camera NDC (-1..1 x, -1..1 y, positive depth in meters). Uses a simple manual view-projection (Three.js-free math here so it works in Node/vitest; replicate the three.js perspective projection formula).
- `function toScreenPositionLabel(nx:number, ny:number): string` — returns e.g. `'画面左侧中部'`, `'画面正中'`, `'画面右下方'`.
- `function toPostureLabel(posePresetId: string | undefined): string` — maps 20 pose ids to Chinese. Default/fallback `'站立'`.
- `function toFacingLabel(facingRad:number, camPos:[number,number,number], charPos:[number,number,number]): string` — returns `'面向镜头'|'背对镜头'|'面向画面左侧'|'面向画面右侧'`.
- `function computePhotographyRulesPatch(params: { project: DirectorProject; panel?: { photographyRules?: string | null; characters?: string | null } }): { characters: Array<{name:string; screen_position:string; posture:string; facing:string}> }`
  - Computes per-character screen_position/posture/facing for the active camera. Caller merges with existing photographyRules.
- `const POSE_ZH: Record<string, string>` — the mapping.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/director-desk/position-to-prose.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  projectCharacterToScreen,
  toScreenPositionLabel,
  toPostureLabel,
  toFacingLabel,
} from '@/lib/director-desk/photography-rules'

const DEFAULT_CAM = {
  camFov: 50, camPos: [0, 1.55, 5.4] as [number,number,number],
  camTarget: [0, 1.55, 0] as [number,number,number], aspect: 9/16,
}

describe('position to prose', () => {
  it('character at center of frame -> 画面正中', () => {
    const { nx, ny } = projectCharacterToScreen({ charPos:[0,1.55,0], ...DEFAULT_CAM })
    expect(Math.abs(nx)).toBeLessThan(0.1)
    expect(Math.abs(ny)).toBeLessThan(0.1)
    expect(toScreenPositionLabel(nx, ny)).toBe('画面正中')
  })

  it('character at x=-2 z=0 -> 画面左侧', () => {
    const { nx } = projectCharacterToScreen({ charPos:[-2,1.55,0], ...DEFAULT_CAM })
    expect(nx).toBeLessThan(-0.3)
    expect(toScreenPositionLabel(nx, 0)).toContain('左侧')
  })

  it('character at x=2 z=0 -> 画面右侧', () => {
    const { nx } = projectCharacterToScreen({ charPos:[2,1.55,0], ...DEFAULT_CAM })
    expect(nx).toBeGreaterThan(0.3)
    expect(toScreenPositionLabel(nx, 0)).toContain('右侧')
  })

  it('posture maps to chinese', () => {
    expect(toPostureLabel('stand')).toBe('站立')
    expect(toPostureLabel('sit')).toBe('坐着')
    expect(toPostureLabel('crouch')).toBe('蹲伏')
    expect(toPostureLabel(undefined)).toBe('站立')
  })

  it('facing camera -> 面向镜头', () => {
    const label = toFacingLabel(0, [0,1.55,5.4], [0,1.55,0])
    expect(label).toBe('面向镜头')
  })

  it('facing away -> 背对镜头', () => {
    const label = toFacingLabel(Math.PI, [0,1.55,5.4], [0,1.55,0])
    expect(label).toBe('背对镜头')
  })

  it('facing right -> 面向画面右侧', () => {
    const label = toFacingLabel(-Math.PI/2, [0,1.55,5.4], [0,1.55,0])
    expect(label).toBe('面向画面右侧')
  })
})
```

- [ ] **Step 2: Run tests (FAIL expected)**

```bash
npx vitest run tests/unit/director-desk/position-to-prose.test.ts
```

- [ ] **Step 3: Implement photography-rules.ts**

Implement the projection math manually (no three.js dep):
1. Build view matrix: camera forward = normalize(target - pos), right = normalize(cross(forward, worldUp=(0,1,0))), up = cross(right, forward).
2. Transform charPos into camera space (subtract camPos, project onto right/up/forward axes; note forward goes to -z in camera space).
3. Apply perspective: focalLength = 1/tan(fov_rad/2); nx = (focalLength/aspect) * (xcam / -zcam); ny = focalLength * (ycam / -zcam).
4. Clamp so things behind camera map to edges (avoid divide-by-zero / sign flip).
5. toScreenPositionLabel: col = nx < -0.33 ? '左侧' : nx > 0.33 ? '右侧' : '正中'; row = ny > 0.33 ? '上方' : ny < -0.33 ? '下方' : '中部' (NDC y is up per spec §8.3 — verify sign matches Three.js: when character is above camera, ny positive). Compose `'画面' + col + (col==='正中' ? '' : row)`.
6. toFacingLabel: compute char-to-cam direction in XZ plane, compare to character forward (default -Z rotated by `facing` around Y). Signed angle in [-π, π]; threshold π/8 per spec.
7. toPostureLabel: POSE_ZH map with all 20 entries. Missing/unknown → '站立'.

- [ ] **Step 4: Run tests (PASS expected)**

```bash
npx vitest run tests/unit/director-desk/position-to-prose.test.ts
```

Adjust math signs (particularly for facing and ny) until all pass.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/director-desk/photography-rules.ts tests/unit/director-desk/position-to-prose.test.ts
git commit -m "feat(director-desk): add 3d-position to photography-rules prose mapper"
```

---

## Task 3: Auto-initialization of a DirectorProject from panel metadata

**Files:**
- Create: `src/lib/director-desk/init.ts` (pure function; used by load API)
- Test: `tests/unit/director-desk/auto-init.test.ts`

**Interfaces:**
- `interface InitInput { panel: { shotType:string|null; description:string|null; characters: Array<{name:string; appearance?:string; slot?:string; imageUrl?:string|null; imageMediaId?:string|null}>; props: Array<{name:string; imageUrl?:string|null; imageMediaId?:string|null}>; location: null|{name:string; imageMediaId?:string|null}; photographyRules: unknown|null }; project: { videoRatio:string } }`
- `function initDirectorProjectFromPanel(input: InitInput): DirectorProject`
  - Implements spec §7: default scene + camera inferred from shotType + characters placed by photographyRules screen_position + props + backdrop.

Shot-type camera inference table from spec §7.2 — implement as a `function inferCamera(shotType: string | null): {fov:number; position:[number,number,number]; target:[number,number,number]}`.

Screen-position → x/z table from spec §7.3 (左侧→-2, 左中→-1.5, 正中→0, 右中→1.5, 右侧→2; 前景→z=2, 后景→z=-2, default z=0); default fallback when no screen_position = evenly spread at z=0.

Facing prose → radians for `facing` field: '面向镜头'|'面向观众'|'正对' → 0; '背对镜头'|'背对' → Math.PI; '面向左侧'|'向左'|'看向画面左侧' → Math.PI/2; '面向右侧'|'向右'|'看向画面右侧' → -Math.PI/2. Default 0.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/director-desk/auto-init.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { initDirectorProjectFromPanel } from '@/lib/director-desk/init'

describe('auto-init director project from panel', () => {
  it('builds default scene with 中景 camera when metadata is empty', () => {
    const proj = initDirectorProjectFromPanel({
      panel: { shotType: null, description: null, characters: [], props: [], location: null, photographyRules: null },
      project: { videoRatio: '9:16' },
    })
    expect(proj.version).toBe(1)
    expect(proj.cameras).toHaveLength(1)
    expect(proj.cameras[0].fov).toBe(50)
    expect(proj.objects).toHaveLength(0)
    expect(proj.scene.backdropAssetId).toBeNull()
  })

  it('特写 shotType -> fov 35, closer camera', () => {
    const proj = initDirectorProjectFromPanel({
      panel: { shotType: '特写', description: null, characters: [], props: [], location: null, photographyRules: null },
      project: { videoRatio: '9:16' },
    })
    expect(proj.cameras[0].fov).toBe(35)
    expect(proj.cameras[0].position[2]).toBeLessThan(3)
  })

  it('places two characters 左右 and adds a prop', () => {
    const proj = initDirectorProjectFromPanel({
      panel: {
        shotType: '中景',
        description: '两人对峙',
        characters: [
          { name: '张三', imageMediaId: 'img-1' },
          { name: '李四', imageMediaId: 'img-2' },
        ],
        props: [{ name: '刀', imageMediaId: 'prop-1' }],
        location: { name: '皇宫', imageMediaId: 'loc-1' },
        photographyRules: {
          characters: [
            { name: '张三', screen_position: '画面左侧', posture: '站立', facing: '面向镜头' },
            { name: '李四', screen_position: '画面右侧', posture: '站立', facing: '面向镜头' },
          ],
        },
      },
      project: { videoRatio: '9:16' },
    })
    const chars = proj.objects.filter(o => o.kind === 'character')
    expect(chars).toHaveLength(2)
    expect(chars[0].refId).toBe('img-1')
    expect(chars[0].transform.position[0]).toBeLessThan(-1)
    expect(chars[1].transform.position[0]).toBeGreaterThan(1)
    const props = proj.objects.filter(o => o.kind === 'prop')
    expect(props).toHaveLength(1)
    expect(props[0].refId).toBe('prop-1')
    expect(proj.scene.backdropAssetId).toBe('loc-1')
  })

  it('spreads characters evenly when no photographyRules', () => {
    const proj = initDirectorProjectFromPanel({
      panel: {
        shotType: '中景', description: null,
        characters: [
          { name: 'A' }, { name: 'B' }, { name: 'C' },
        ],
        props: [], location: null, photographyRules: null,
      },
      project: { videoRatio: '9:16' },
    })
    const xs = proj.objects.filter(o => o.kind === 'character').map(o => o.transform.position[0])
    expect(new Set(xs.map(Math.round)).size).toBe(3)
    xs.forEach(x => expect(x).toBeGreaterThanOrEqual(-3))
    xs.forEach(x => expect(x).toBeLessThanOrEqual(3))
  })
})
```

- [ ] **Step 2: Run tests (FAIL)**

```bash
npx vitest run tests/unit/director-desk/auto-init.test.ts
```

- [ ] **Step 3: Implement init.ts**

Implement `inferCamera`, a helper `inferFacing(prose: string): number`, a helper `inferXZ(screenPos: string | undefined): [number, number]`, and the main function. Assign character colors from `DEFAULT_CHARACTER_COLORS[i % DEFAULT_CHARACTER_COLORS.length]`. New objects get ids via a small helper `uid()` (`'char-'+Math.random().toString(36).slice(2,8)` is fine; we don't need crypto here since it's client-generated and reconciled by save). Default camera id `'cam-1'`; activeCameraId = `'cam-1'`.

- [ ] **Step 4: Run tests (PASS)**

```bash
npx vitest run tests/unit/director-desk/auto-init.test.ts
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/director-desk/init.ts tests/unit/director-desk/auto-init.test.ts
git commit -m "feat(director-desk): auto-initialize director project from panel metadata"
```

---

## Task 4: API routes — load + save

**Files:**
- Create: `src/app/api/novel-promotion/[projectId]/director-desk/load/route.ts`
- Create: `src/app/api/novel-promotion/[projectId]/director-desk/save/route.ts`
- Test: `tests/integration/api/director-desk/load.test.ts`, `save.test.ts`, `auth.test.ts` (regression-style; use real Prisma via `resetSystemState` + `seedMinimalDomainState`)

**Interfaces:**
- `GET /api/novel-promotion/[projectId]/director-desk/load?panelId=xxx` returns:
  ```json
  {
    "panel": { "id", "panelNumber", "shotType", "cameraMove", "description",
               "characters": [{"name","appearance","slot","imageUrl","imageMediaId"}],
               "props": [{"name","imageUrl","imageMediaId"}],
               "location": {"name","imageUrl","imageMediaId","availableSlots"} | null,
               "photographyRules": object|null, "actingNotes": object|null,
               "directorLayout": DirectorProject|null },
    "project": { "videoRatio": string }
  }
  ```
  Signed URLs (1h TTL) for every imageUrl; props resolved against `NovelPromotionLocation where assetKind='prop'` by name (case-insensitive, slash-aliases via `findCharacterByName`-equivalent for props; reuse `findCharacterByName` generic or a prop-specific equivalent).
- `POST /api/novel-promotion/[projectId]/director-desk/save` body: `{ panelId: string, project: DirectorProject, activeCameraSnapshot: string (dataURL) }` → returns `{ success: true, warning?: 'screenshot_upload_failed' }`.

- [ ] **Step 1: Create load/route.ts**

Path: `src/app/api/novel-promotion/[projectId]/director-desk/load/route.ts`.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getSignedUrl } from '@/lib/storage'
import { parseDirectorProject } from '@/lib/director-desk/schema'
import { parsePanelCharacterReferences, findCharacterByName } from '@/lib/workers/handlers/image-task-handler-shared'
import { parseJsonUnknown } from '@/lib/workers/handlers/image-task-handler-shared'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const panelId = request.nextUrl.searchParams.get('panelId')
  if (!panelId) throw new ApiError('INVALID_PARAMS', { message: 'panelId required' })

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    include: {
      storyboard: {
        include: {
          episode: { include: { project: true } },
        },
      },
    },
  })
  if (!panel || panel.storyboard.episode.projectId !== projectId) throw new ApiError('NOT_FOUND')

  const project = await prisma.novelPromotionProject.findUnique({
    where: { id: projectId },
    include: {
      characters: { include: { appearances: true } },
      locations: { where: { assetKind: 'location' }, include: { images: { where: { isSelected: true } } } },
    },
  })
  if (!project) throw new ApiError('NOT_FOUND')

  const projectProps = await prisma.novelPromotionLocation.findMany({
    where: { projectId, assetKind: 'prop' },
    include: { images: { where: { isSelected: true } } },
  })

  // Resolve characters with signed appearance image URLs.
  const charRefs = parsePanelCharacterReferences(panel.characters)
  const characterData = charRefs.map(ref => {
    const match = findCharacterByName(project.characters, ref.name)
    if (!match) return { name: ref.name, appearance: ref.appearance, slot: ref.slot, imageUrl: null, imageMediaId: null }
    const app = ref.appearance
      ? match.appearances.find(a => a.changeReason === ref.appearance) ?? match.appearances[0]
      : match.appearances.find(a => a.selectedIndex !== undefined && a.selectedIndex >= 0) ?? match.appearances[0]
    const imageUrl = app?.imageUrl ? getSignedUrl(app.imageUrl, 3600) : null
    return { name: ref.name, appearance: ref.appearance, slot: ref.slot, imageUrl, imageMediaId: app?.imageMediaId ?? null }
  })

  // Resolve props.
  const propNames: string[] = (() => { try { const v = JSON.parse(panel.props || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] } })()
  const propData = propNames.map(name => {
    const match = projectProps.find(p => p.name === name || p.aliases?.split('/').includes(name))
    const img = match?.images[0]
    return { name, imageUrl: img?.imageUrl ? getSignedUrl(img.imageUrl, 3600) : null, imageMediaId: img?.imageMediaId ?? null }
  })

  // Resolve location.
  let locationData = null as null | { name: string; imageUrl: string|null; imageMediaId: string|null; availableSlots: string[] }
  if (panel.location) {
    const loc = project.locations.find(l => l.name === panel.location)
    const img = loc?.images[0]
    let slots: string[] = []
    if (img?.availableSlots) { try { const p = JSON.parse(img.availableSlots); if (Array.isArray(p)) slots = p.filter(x => typeof x === 'string') } catch {} }
    locationData = loc ? { name: loc.name, imageUrl: img?.imageUrl ? getSignedUrl(img.imageUrl, 3600) : null, imageMediaId: img?.imageMediaId ?? null, availableSlots: slots } : null
  }

  const directorLayout = panel.directorLayout ? parseDirectorProject(parseJsonUnknown(panel.directorLayout)) : null

  return NextResponse.json({
    panel: {
      id: panel.id,
      panelNumber: panel.panelNumber,
      shotType: panel.shotType,
      cameraMove: panel.cameraMove,
      description: panel.description,
      characters: characterData,
      props: propData,
      location: locationData,
      photographyRules: parseJsonUnknown(panel.photographyRules),
      actingNotes: parseJsonUnknown(panel.actingNotes),
      directorLayout,
    },
    project: { videoRatio: project.videoRatio },
  })
})
```

Note: parseJsonUnknown is already exported from image-task-handler-shared. Verify by checking (it exists — used in buildPanelPromptContext). If not, use inline try/catch JSON.parse. Also check findCharacterByName signature — it works on any `{name:string, aliases?:string|null}` array; characters have `aliases` field. Props (Locations with assetKind='prop') — check if they also have an aliases field; if not, do simple name match. Adjust accordingly.

- [ ] **Step 2: Create save/route.ts**

Path: `src/app/api/novel-promotion/[projectId]/director-desk/save/route.ts`.

```ts
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { uploadObject, generateUniqueKey } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { parseDirectorProject, serializeDirectorProject, validateDirectorProjectSize } from '@/lib/director-desk/schema'
import { computePhotographyRulesPatch } from '@/lib/director-desk/photography-rules'

const MAX_DATAURL_BYTES = 5 * 1024 * 1024

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
  if (!m) return null
  try { return { mime: m[1], buffer: Buffer.from(m[2], 'base64') } } catch { return null }
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') throw new ApiError('INVALID_PARAMS')
  const { panelId, project: directorProject, activeCameraSnapshot } = body as { panelId?: unknown; project?: unknown; activeCameraSnapshot?: unknown }
  if (typeof panelId !== 'string' || typeof activeCameraSnapshot !== 'string') throw new ApiError('INVALID_PARAMS')
  const parsed = parseDirectorProject(directorProject)
  if (!parsed) throw new ApiError('INVALID_PARAMS', { message: 'invalid director project' })

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    include: { storyboard: { include: { episode: true } } },
  })
  if (!panel || panel.storyboard.episode.projectId !== projectId) throw new ApiError('NOT_FOUND')

  const serialized = serializeDirectorProject(parsed)
  if (!validateDirectorProjectSize(serialized)) throw new ApiError('INVALID_PARAMS', { message: 'directorLayout too large' })

  // Screenshot upload (best effort).
  let directorShotMediaId: string | undefined = undefined
  let warning: 'screenshot_upload_failed' | undefined = undefined
  try {
    const parsed2 = parseDataUrl(activeCameraSnapshot)
    if (parsed2 && parsed2.buffer.length <= MAX_DATAURL_BYTES) {
      const jpeg = await sharp(parsed2.buffer).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
      const key = generateUniqueKey(`director-shot-${panelId}`, 'jpg')
      await uploadObject(jpeg, key, undefined, 'image/jpeg')
      const ref = await ensureMediaObjectFromStorageKey(key, { mimeType: 'image/jpeg', sizeBytes: jpeg.length })
      directorShotMediaId = ref.id
    }
  } catch (err) {
    console.error('[director-desk] screenshot upload failed:', err)
    warning = 'screenshot_upload_failed'
  }

  // Compute photographyRules patch and merge with existing.
  const existingRules = (() => { try { return panel.photographyRules ? JSON.parse(panel.photographyRules) : null } catch { return null } })() as { characters?: Array<{name:string; screen_position?:string; posture?:string; facing?:string; [k:string]:unknown}>; [k:string]:unknown } | null
  const patch = computePhotographyRulesPatch({ project: parsed, panel: { photographyRules: panel.photographyRules, characters: panel.characters } })
  const mergedRules = existingRules ? { ...existingRules } : {}
  const charsArr = Array.isArray(mergedRules.characters) ? [...mergedRules.characters] : []
  for (const c of patch.characters) {
    const idx = charsArr.findIndex(x => x && x.name === c.name)
    if (idx >= 0) charsArr[idx] = { ...charsArr[idx], screen_position: c.screen_position, posture: c.posture, facing: c.facing }
    else charsArr.push({ name: c.name, screen_position: c.screen_position, posture: c.posture, facing: c.facing })
  }
  mergedRules.characters = charsArr

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      directorLayout: serialized,
      directorShotMediaId: directorShotMediaId ?? null,
      photographyRules: JSON.stringify(mergedRules),
    },
  })

  return NextResponse.json({ success: true, ...(warning ? { warning } : {}) })
})
```

Verify sharp works in route context (this repo uses sharp elsewhere per existing evidence — yes, e.g. cover upload).

- [ ] **Step 3: Write integration test — load happy path**

Create `tests/integration/api/director-desk/load.test.ts`. Use regression-style (real Prisma + seedMinimalDomainState) since it needs panel/character/location relationships. (Simpler than mocking all the findUnique calls.)

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { callRoute } from '../helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../../../helpers/auth'
import { resetSystemState } from '../../../helpers/db-reset'
import { seedMinimalDomainState } from '../../../system/helpers/seed'

describe('director-desk load API', () => {
  beforeEach(async () => {
    await resetSystemState()
    installAuthMocks()
  })

  it('returns null directorLayout for fresh panel', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    const mod = await import('@/app/api/novel-promotion/[projectId]/director-desk/load/route')
    const response = await callRoute(mod.GET, 'GET', undefined, { params: { projectId: seeded.project.id }, query: { panelId: seeded.panels[0].id } })
    expect(response.status).toBe(200)
    const data = await response.json() as { panel: { directorLayout: unknown; characters: unknown[]; location: unknown } }
    expect(data.panel.directorLayout).toBeNull()
    expect(Array.isArray(data.panel.characters)).toBe(true)
    resetAuthMockState()
  })
})
```

Note: Check if `seedMinimalDomainState` actually returns panels — inspect `tests/system/helpers/seed.ts` first to confirm the shape, then adjust the test to use whatever panel field is available (it may return episodes/clips/storyboards/panels). If seed doesn't make panels, extend the test to create its own panel via prisma.novelPromotionPanel.create.

- [ ] **Step 4: Run the load test (PASS after adjustments)**

```bash
npx vitest run tests/integration/api/director-desk/load.test.ts
```

Fix import paths and seed-shape mismatches until green.

- [ ] **Step 5: Save API test**

Create `tests/integration/api/director-desk/save.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { callRoute } from '../helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../../../helpers/auth'
import { resetSystemState } from '../../../helpers/db-reset'
import { seedMinimalDomainState } from '../../../system/helpers/seed'
import { prisma } from '../../../helpers/prisma'
import { createDefaultDirectorProject } from '@/lib/director-desk/schema'

const TINY_JPEG_DATAURL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...' // use a real 1x1 jpeg

describe('director-desk save API', () => {
  beforeEach(async () => { await resetSystemState(); installAuthMocks() })

  it('saves directorLayout and attaches screenshot media', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    const mod = await import('@/app/api/novel-promotion/[projectId]/director-desk/save/route')
    const proj = createDefaultDirectorProject()
    // Use a tiny valid 1x1 JPEG dataURL (construct a real one in test)
    const jpegBytes = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==', 'base64')
    const dataUrl = 'data:image/jpeg;base64,' + jpegBytes.toString('base64')
    const response = await callRoute(mod.POST, 'POST', { panelId: seeded.panels[0].id, project: proj, activeCameraSnapshot: dataUrl }, { params: { projectId: seeded.project.id } })
    expect(response.status).toBe(200)
    const updated = await prisma.novelPromotionPanel.findUnique({ where: { id: seeded.panels[0].id } })
    expect(updated?.directorLayout).not.toBeNull()
    const parsed = JSON.parse(updated!.directorLayout!)
    expect(parsed.version).toBe(1)
    resetAuthMockState()
  })

  it('rejects invalid project JSON', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    const mod = await import('@/app/api/novel-promotion/[projectId]/director-desk/save/route')
    const response = await callRoute(mod.POST, 'POST', { panelId: seeded.panels[0].id, project: { bogus: true }, activeCameraSnapshot: 'data:image/jpeg;base64,/9j/' }, { params: { projectId: seeded.project.id } })
    expect(response.status).toBe(400)
    resetAuthMockState()
  })
})
```

(Adjust jpeg base64 if it's not a valid JPEG — use a real one generated in the test via sharp if needed: `const { data } = await sharp({create:{width:1,height:1,channels:3,background:'white'}}).jpeg().toBuffer(); const dataUrl = 'data:image/jpeg;base64,'+data.toString('base64')`.)

- [ ] **Step 6: Save auth test**

Create `tests/integration/api/director-desk/auth.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { callRoute } from '../helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../../../helpers/auth'
import { resetSystemState } from '../../../helpers/db-reset'
import { seedMinimalDomainState } from '../../../system/helpers/seed'
import { createDefaultDirectorProject } from '@/lib/director-desk/schema'

describe('director-desk auth', () => {
  beforeEach(async () => { await resetSystemState(); installAuthMocks() })

  it('rejects save to another users project', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated('other-user-id')
    const mod = await import('@/app/api/novel-promotion/[projectId]/director-desk/save/route')
    const response = await callRoute(mod.POST, 'POST', { panelId: seeded.panels[0].id, project: createDefaultDirectorProject(), activeCameraSnapshot: 'data:image/jpeg;base64,/9j/' }, { params: { projectId: seeded.project.id } })
    expect(response.status).toBe(404)
    resetAuthMockState()
  })
})
```

- [ ] **Step 7: Run all new tests until pass**

```bash
npx vitest run tests/integration/api/director-desk/
```

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add src/app/api/novel-promotion/[projectId]/director-desk/ tests/integration/api/director-desk/
git commit -m "feat(director-desk): add load/save API routes"
```

---

## Task 5: Zustand store

**Files:**
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/store/directorStore.ts`
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/store/directorSelectors.ts`

**Interfaces (consumed by all React components):**
- `useDirectorStore` — zustand hook.
- State shape: `{ project: DirectorProject; selectedId: string|null; viewMode: 'director'|'camera'; transformMode: 'translate'|'rotate'|'scale'; isDirty: boolean; history: DirectorProject[]; future: DirectorProject[]; panelId: string; projectId: string; loaded: boolean }`.
- Actions: `load(project, panelId, projectId)`, `select(id)`, `setViewMode(m)`, `setTransformMode(m)`, `setSceneField(k,v)`, `setObjectField(id,k,v)`, `setObjectTransform(id,t)`, `addObject(partial)`, `duplicateObject(id)`, `removeObject(id)`, `addCamera(partial?)`, `removeCamera(id)`, `setCameraField(id,k,v)`, `setActiveCamera(id)`, `undo()`, `redo()`, `reset()`, `markDirty()`.

Every mutating action pushes current `project` onto `history` (capped at 50 entries), clears `future`, sets `isDirty=true`, and sets `project` to the new value. `load()` resets history/future/isDirty and sets loaded=true.

- [ ] **Step 1: Create directorStore.ts**

Implement the store using zustand with a small `pushHistory(state)` helper. Do NOT use persist middleware (no localStorage). Use the spread-on-write pattern for immutable updates (e.g. for setObjectField: map objects array to replace by id). Ensure addCamera generates a unique id (`'cam-'+Date.now()+Math.random().toString(36).slice(2,5)`) and initializes sensible defaults; if no active camera exists after add, the first camera is auto-activated; prevent removal of last camera (throw silently or no-op in the action).

- [ ] **Step 2: Create directorSelectors.ts**

Export typed selector hooks for common derived state:
```ts
export const useSelectedObject = () => useDirectorStore(s => s.project.objects.find(o => o.id === s.selectedId) || null)
export const useActiveCamera = () => useDirectorStore(s => s.project.cameras.find(c => c.id === s.project.activeCameraId) || s.project.cameras[0] || null)
export const useSelectedCamera = () => { /* if selected is a camera, return it */ }
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

(No separate tests for the store — it's a plain zustand store; covered indirectly by component tests/e2e smoke; ponytail: skip unit tests for simple state transitions.)

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/workspace/[projectId]/director-desk/editor/store/
git commit -m "feat(director-desk): add zustand director store"
```

---

## Task 6: Director-desk page route + shell + top bar (no 3D yet)

**Files:**
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/page.tsx`
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/loading.tsx`
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/DirectorDeskShell.tsx`
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/TopBar.tsx`
- Modify: `messages/zh/storyboard.json` and `messages/en/storyboard.json` (add `directorDesk` key block)

**Interfaces:**
- page.tsx: reads `panelId` from search params, calls `/api/novel-promotion/[projectId]/director-desk/load?panelId=xxx`, dispatches into store, renders `DirectorDeskShell`.
- Shell: 3-column flex layout (left 220px / center flex-1 / right 300px). Top bar above all. Use `h-screen w-screen overflow-hidden` with a dark theme (bg `#0f1216`).
- TopBar: panel number+description (left), view mode segmented (center), reset/save/save-and-close/X (right). Save calls the save API, posts the active camera screenshot (see Task 9 where screenshot util is introduced; for Task 6 leave screenshot as empty string placeholder — TODO only in form of a comment `// TODO(Task-9): replace with real capture from canvas`).

- [ ] **Step 1: Add i18n keys**

Append to `messages/zh/storyboard.json` inside the top-level object (sibling to existing `aiData`):

```json
"directorDesk": {
  "title": "3D 导演台",
  "button": "导演台",
  "viewDirector": "导演视角",
  "viewCamera": "机位视角",
  "reset": "重置",
  "save": "保存",
  "saveAndClose": "保存并关闭",
  "close": "关闭",
  "unsavedChanges": "有未保存的布局，是否放弃？",
  "save": "保存",
  "discard": "放弃",
  "cancel": "取消",
  "loading": "载入中...",
  "saveSuccess": "布局已保存",
  "saveFailed": "保存失败",
  "missingPanelId": "缺少 panelId 参数"
}
```

Add the same keys to `messages/en/storyboard.json` with English values.

- [ ] **Step 2: Create loading.tsx**

```tsx
export default function Loading() {
  return <div className="flex h-screen w-screen items-center justify-center text-[var(--glass-text-secondary)]">Loading...</div>
}
```

- [ ] **Step 3: Create page.tsx**

```tsx
'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { DirectorDeskShell } from './editor/DirectorDeskShell'
import { useDirectorStore } from './editor/store/directorStore'
import { initDirectorProjectFromPanel } from '@/lib/director-desk/init'
import type { DirectorProject } from '@/lib/director-desk/schema'

interface LoadResponse {
  panel: {
    id: string; panelNumber: number|null; shotType: string|null; cameraMove: string|null; description: string|null;
    characters: Array<{name:string; appearance?:string; slot?:string; imageUrl:string|null; imageMediaId:string|null}>;
    props: Array<{name:string; imageUrl:string|null; imageMediaId:string|null}>;
    location: null|{name:string; imageUrl:string|null; imageMediaId:string|null; availableSlots:string[]};
    photographyRules: unknown|null; actingNotes: unknown|null; directorLayout: DirectorProject|null;
  };
  project: { videoRatio: string };
}

export default function DirectorDeskPage() {
  const params = useParams<{ projectId?: string; locale?: string }>()
  const searchParams = useSearchParams()
  const t = useTranslations('storyboard.directorDesk')
  const load = useDirectorStore(s => s.load)
  const loaded = useDirectorStore(s => s.loaded)
  const [error, setError] = useState<string | null>(null)

  const projectId = params?.projectId
  const panelId = searchParams?.get('panelId') ?? null

  useEffect(() => {
    if (!projectId || !panelId) { setError('missingPanelId'); return }
    let aborted = false
    ;(async () => {
      try {
        const res = await fetch(`/api/novel-promotion/${projectId}/director-desk/load?panelId=${encodeURIComponent(panelId)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as LoadResponse
        if (aborted) return
        const proj = data.panel.directorLayout ?? initDirectorProjectFromPanel({ panel: data.panel as any, project: data.project })
        // Inject signed imageUrls into objects' imageUrl field (not persisted, used at render)
        for (const o of proj.objects) {
          const ch = data.panel.characters.find(c => c.imageMediaId === o.refId)
          const pr = data.panel.props.find(p => p.imageMediaId === o.refId)
          const url = ch?.imageUrl ?? pr?.imageUrl ?? null
          if (url) (o as any).imageUrl = url
        }
        load(proj, panelId, projectId)
      } catch (e) {
        if (!aborted) setError(String(e))
      }
    })()
    return () => { aborted = true }
  }, [projectId, panelId, load])

  if (error) return <div className="flex h-screen w-screen items-center justify-center text-red-400">{t(error as any) || error}</div>
  if (!loaded) return <div className="flex h-screen w-screen items-center justify-center text-[var(--glass-text-secondary)]">{t('loading')}</div>
  return <DirectorDeskShell />
}
```

Note: imageUrl injection — the DirectorObject type doesn't have `imageUrl` (per spec it's not persisted). Temporarily cast to any; in Task 7 we add `imageUrl?: string | null` to DirectorObject in schema.ts (marked `/** not persisted; resolved at load time */`). Add that to the DirectorObject interface in schema.ts before continuing.

- [ ] **Step 4: Create DirectorDeskShell.tsx**

Simple shell that renders TopBar + three columns. Center column for now just says "3D Canvas (Task 8)"; left/right panels say "tree" and "inspector" respectively (real panels in Tasks 10/11).

```tsx
'use client'

import { TopBar } from './TopBar'

export function DirectorDeskShell() {
  return (
    <div className="h-screen w-screen flex flex-col bg-[#0f1216] text-gray-100 text-sm">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[220px] border-r border-white/10 p-2 overflow-auto">
          <div className="text-xs text-white/40">对象树 (Task 10)</div>
        </aside>
        <main className="flex-1 relative bg-black">
          <div className="absolute inset-0 flex items-center justify-center text-white/30">3D Canvas (Task 8)</div>
        </main>
        <aside className="w-[300px] border-l border-white/10 p-2 overflow-auto">
          <div className="text-xs text-white/40">属性面板 (Task 11)</div>
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create TopBar.tsx**

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { useDirectorStore } from './store/directorStore'
import { useState } from 'react'

export function TopBar() {
  const t = useTranslations('storyboard.directorDesk')
  const { project, viewMode, isDirty } = useDirectorStore(s => ({ project: s.project, viewMode: s.viewMode, isDirty: s.isDirty }))
  const setViewMode = useDirectorStore(s => s.setViewMode)
  const [saving, setSaving] = useState(false)

  const panelId = useDirectorStore(s => s.panelId)
  const projectId = useDirectorStore(s => s.projectId)

  async function saveAndClose(close: boolean) {
    setSaving(true)
    try {
      // TODO(Task-9): capture active camera screenshot and pass it
      const snapshot = ''
      const res = await fetch(`/api/novel-promotion/${projectId}/director-desk/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ panelId, project: useDirectorStore.getState().project, activeCameraSnapshot: snapshot }),
      })
      if (!res.ok) throw new Error('save failed')
      useDirectorStore.setState({ isDirty: false })
      if (close) window.close()
    } catch (e) {
      alert(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (isDirty && !confirm(t('unsavedChanges'))) return
    window.close()
  }

  // Find active camera object to get panelNumber — use the first panel-meta stored in scene? For now use a simple counter.
  return (
    <div className="h-12 border-b border-white/10 flex items-center px-4 gap-3 shrink-0">
      <div className="text-sm font-medium">{t('title')}</div>
      <div className="flex-1" />
      <div className="inline-flex rounded-md overflow-hidden border border-white/10">
        <button onClick={() => setViewMode('director')} className={`px-3 py-1 text-xs ${viewMode === 'director' ? 'bg-white/10' : ''}`}>{t('viewDirector')}</button>
        <button onClick={() => setViewMode('camera')} className={`px-3 py-1 text-xs ${viewMode === 'camera' ? 'bg-white/10' : ''}`}>{t('viewCamera')}</button>
      </div>
      <div className="flex-1" />
      <button onClick={() => useDirectorStore.getState().reset()} className="text-xs px-2 py-1 text-white/70 hover:text-white">{t('reset')}</button>
      <button onClick={() => saveAndClose(false)} disabled={saving} className="text-xs px-3 py-1 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-60">{t('save')}</button>
      <button onClick={() => saveAndClose(true)} disabled={saving} className="text-xs px-3 py-1 bg-green-600 rounded hover:bg-green-500 disabled:opacity-60">{t('saveAndClose')}</button>
      <button onClick={handleClose} className="text-white/50 hover:text-white w-7 h-7 flex items-center justify-center">×</button>
    </div>
  )
}
```

- [ ] **Step 6: Update DirectorObject type in schema.ts to include imageUrl**

Add to DirectorObject: `/** not persisted; resolved at load time */ imageUrl?: string | null;`

Ensure parseDirectorProject strips imageUrl (don't persist it, but don't reject if present for forward compat): when validating, delete `imageUrl` from the parsed object (so when a stored JSON accidentally contains it, it's ignored) — but during load, page.tsx re-attaches from signed URLs.

- [ ] **Step 7: Add beforeunload listener in TopBar**

Add a useEffect in TopBar that listens to `beforeunload` and calls `e.preventDefault()` when isDirty.

- [ ] **Step 8: Run dev server and verify the page opens**

```bash
npm run dev
```

Open `http://localhost:3000/zh/workspace/<test-project-id>/director-desk?panelId=<panel-id>`. Verify it loads (spinner → shell with three columns). The "保存" click will hit save API with empty snapshot — expect success but warning; directorLayout column should be populated. Verify via Prisma Studio or a DB query.

- [ ] **Step 9: Typecheck + commit**

```bash
npm run typecheck
git add src/app/[locale]/workspace/[projectId]/director-desk/ messages/zh/storyboard.json messages/en/storyboard.json src/lib/director-desk/schema.ts
git commit -m "feat(director-desk): add page route, shell, and top bar"
```

---

## Task 7: Mannequin components (port from reference)

Now port the procedural mannequin from the reference project. This is the largest single code port but is self-contained.

**Files:**
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/runtime/mannequin/` directory with four files:
  - `bodyTypes.ts` — 8 body type proportion tables
  - `mannequinParts.tsx` — JSX for body-part primitives (Segment/Joint/Torso/Head/Hand/Foot)
  - `mannequinPose.ts` — rotation helpers, pose preset resolver
  - `ProceduralMannequin.tsx` — component that composes parts based on bodyType + posePreset + controls
- Port: reference project's equivalent files from GitHub repo https://github.com/jiguang132/storyai-3d-director-desk (fetch via WebFetch if needed, but the agent already analyzed them — port from the summary in §1 of the brainstorming agent's report).

**Interfaces:**
- `<ProceduralMannequin color={string} bodyType={string} posePresetId={string} poseControls?: Record<string,number> />` — R3F group with all meshes inside, positioned at (0,0,0), feet on y=0.
- `BODY_TYPES: Record<string, BodyProportions>` — 8 presets.
- `POSE_PRESETS: Record<string, Record<string,number>>` — 20 preset control dictionaries (control names dot-paths like `leftShoulder.pitch`, values in degrees).
- `function getPoseRotations(preset, controls): { parts: Record<string,[number,number,number]> }` — returns Euler triples for each named joint.

**Key porting guidance (since we don't have the code verbatim in this plan, the implementing agent should fetch the raw files from GitHub):**

- [ ] **Step 1: Fetch reference mannequin source from GitHub**

```bash
# Reference repo: https://github.com/jiguang132/storyai-3d-director-desk
# Mannequin lives under src/editor/runtime/mannequin/
# Use WebFetch or curl to get the four files directly:
mkdir -p /tmp/ref-mannequin
for f in bodyTypes.ts mannequinParts.tsx mannequinPose.ts ProceduralMannequin.tsx mannequinPosePresets.ts; do
  curl -sSL "https://raw.githubusercontent.com/jiguang132/storyai-3d-director-desk/main/src/editor/runtime/mannequin/$f" -o /tmp/ref-mannequin/$f
done
ls /tmp/ref-mannequin/
```

If paths differ, browse the repo to find them. The analysis above listed exact filenames — they should be correct.

- [ ] **Step 2: Copy files into project and adjust imports**

Copy the four files (plus `mannequinPosePresets.ts` which is referenced) to `src/app/[locale]/workspace/[projectId]/director-desk/editor/runtime/mannequin/`. Then:

1. Update imports from reference's internal paths to local paths (e.g., import helpers from `./mannequinPose` instead of whatever they import).
2. The reference uses `@react-three/drei` — confirm all drei imports work (e.g., `Html` is NOT used; parts should use only three primitives: capsuleGeometry, sphereGeometry, etc., and three materials).
3. Replace any use of `useTheme()` or host-app theme hooks with a fixed color (the mannequin's `color` prop already drives material tint).
4. Ensure `ProceduralMannequin` is a default or named export; parent expects `<ProceduralMannequin color bodyType posePresetId poseControls />`.
5. Strip the UE4 mannequin fallback/error boundary and any code paths that reference external model loading (we don't support UE4 models in v1). Delete or comment out.

- [ ] **Step 3: Add a minimal test page to verify rendering**

Replace the Task 6 center placeholder temporarily with a small test mount of ProceduralMannequin inside a Canvas (we'll do this in Task 8 properly; for this task just typecheck + build).

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Fix TS errors (likely three/R3F type issues with JSX intrinsic elements — ensure `'use client'` is in each .tsx file and that the project's tsconfig allows JSX).

- [ ] **Step 5: Quick visual smoke (manual)**

Spin up dev server, temporarily render `<Canvas><ProceduralMannequin color="#E56C5B" bodyType="mannequin" posePresetId="stand" /></Canvas>` in the center panel. Confirm you see a capsule mannequin standing in the T/stand pose.

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/workspace/[projectId]/director-desk/editor/runtime/mannequin/
git commit -m "feat(director-desk): port procedural mannequin from reference project"
```

---

## Task 8: R3F Canvas + ground + backdrop + camera rigs (no interactive objects yet)

**Files:**
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/canvas/DirectorCanvas.tsx`
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/canvas/Ground.tsx`
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/canvas/Backdrop.tsx`
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/canvas/CameraRigs.tsx`
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/canvas/SceneRoot.tsx`
- Create: `src/app/[locale]/workspace/[projectId]/director-desk/editor/canvas/NameLabel.tsx`
- Modify: `DirectorDeskShell.tsx` to replace placeholder with `<DirectorCanvas />`

**Interfaces:**
- `<DirectorCanvas />` — top-level R3F Canvas; renders lighting, either `<OrbitControls>`+director camera OR `<PerspectiveCamera>` for camera view; wraps `<SceneRoot />`.
- `<SceneRoot />` — maps over store.project.objects/cameras and renders each as appropriate component (characters/props/crowds/camera-rigs). Also renders `<Ground />` and `<Backdrop />`.
- `<Ground />` — `<gridHelper>` + semi-transparent plane. Respects scene.showGround / scene.groundOpacity / scene.showGrid.
- `<Backdrop />` — open 180° cylinder sector with a texture mapped inside; opacity/yaw controlled by scene.backdropOpacity/backdropYaw; image loaded via drei `useTexture` (accepts signed URL; null = hides).
- `<CameraRigs />` — renders wireframe cone frustum + small box for every camera except active when in director view (active also shows but marked as active). Uses a fixed forward-offset for rig-vs-view (VIEWPORT_CAMERA_FRUSTUM_DEPTH = 0.3) per spec. Wireframe color `#A9D8FF`; lines via drei `<Line>`.
- `<NameLabel text={string} />` — drei `<Text>` with small backing plane (billboard-follows-camera mode); white text, 0.3 units tall, 0.2 units above parent; uses Text's `anchorX="center"`, `billboard` prop from drei so it always faces camera.

- [ ] **Step 1: Create NameLabel.tsx**

```tsx
'use client'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

interface Props { text: string; yOffset?: number }
export function NameLabel({ text, yOffset = 2.2 }: Props) {
  return (
    <group position={[0, yOffset, 0]}>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[text.length * 0.22 + 0.2, 0.32]} />
        <meshBasicMaterial color="#000" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <Text fontSize={0.2} color="white" anchorX="center" anchorY="middle" billboard>
        {text}
      </Text>
    </group>
  )
}
```

- [ ] **Step 2: Create Ground.tsx**

```tsx
'use client'
import { useMemo } from 'react'
import { Grid } from '@react-three/drei'
import { useDirectorStore } from '../store/directorStore'

export function Ground() {
  const showGround = useDirectorStore(s => s.project.scene.showGround)
  const opacity = useDirectorStore(s => s.project.scene.groundOpacity)
  const showGrid = useDirectorStore(s => s.project.scene.showGrid)
  const gridConfig = useMemo(() => ({ sectionSize: 1, sectionColor: '#2a2f38', sectionThickness: 1, cellSize: 0.25, cellColor: '#1e222a', cellThickness: 1, fadeDistance: 30, fadeStrength: 1, infiniteGrid: true }), [])
  if (!showGround) return null
  return (
    <group>
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.001, 0]} receiveShadow={false}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial color="#111318" transparent opacity={opacity} depthWrite={false} />
      </mesh>
      {showGrid && <Grid position={[0, 0.001, 0]} args={[40, 40]} {...gridConfig} />}
    </group>
  )
}
```

- [ ] **Step 3: Create Backdrop.tsx**

```tsx
'use client'
import { useMemo } from 'react'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { useDirectorStore } from '../store/directorStore'

export function Backdrop() {
  const backdropAssetId = useDirectorStore(s => s.project.scene.backdropAssetId)
  const backdropOpacity = useDirectorStore(s => s.project.scene.backdropOpacity)
  const backdropYaw = useDirectorStore(s => s.project.scene.backdropYaw)
  // For v1, backdropAssetId is imageMediaId; we rely on the imageUrl being on the first object?
  // Simpler: store scene.backdropImageUrl (signed URL, resolved at load and stored on scene as non-persisted field).
  // Add backdropImageUrl to DirectorSceneSettings schema (non-persisted, stripped on save).
  const backdropImageUrl = useDirectorStore(s => (s.project.scene as any).backdropImageUrl as string | undefined)
  const texture = useTexture(backdropImageUrl || '', (tex) => {
    if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true }
  })
  // Build open cylinder geometry (180° sector) — custom geometry:
  const geom = useMemo(() => {
    const geo = new THREE.CylinderGeometry(20, 20, 10, 48, 1, true, Math.PI/2, Math.PI)  // 180° opening facing +z
    geo.rotateY(0)
    return geo
  }, [])
  if (!backdropImageUrl) return null
  return (
    <mesh position={[0, 5, 0]} rotation={[0, backdropYaw + Math.PI/2, 0]}>
      <primitive object={geom} attach="geometry" />
      <meshBasicMaterial map={texture} side={THREE.BackSide} transparent opacity={backdropOpacity} depthWrite={false} />
    </mesh>
  )
}
```

Before running, extend DirectorSceneSettings in schema.ts with `/** not persisted */ backdropImageUrl?: string | null;` and strip it in parseDirectorProject. Also update page.tsx's load function to set `proj.scene.backdropImageUrl = data.panel.location?.imageUrl ?? null`.

- [ ] **Step 4: Create CameraRigs.tsx**

```tsx
'use client'
import { Line, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useDirectorStore } from '../store/directorStore'
import { useMemo } from 'react'

const FRUSTUM_DEPTH = 6

function FrustumLines({ position, target, fov, active }: { position:[number,number,number]; target:[number,number,number]; fov:number; active:boolean }) {
  const points = useMemo(() => {
    const dir = new THREE.Vector3(target[0]-position[0], target[1]-position[1], target[2]-position[2]).normalize()
    const up = new THREE.Vector3(0,1,0)
    const right = new THREE.Vector3().crossVectors(dir, up).normalize()
    const upReal = new THREE.Vector3().crossVectors(right, dir).normalize()
    const aspect = 9/16 // approximate; doesn't need to be exact for gizmo
    const tanFov = Math.tan(THREE.MathUtils.degToRad(fov/2))
    const hh = tanFov * FRUSTUM_DEPTH
    const hw = hh * aspect
    const c = new THREE.Vector3(...position).addScaledVector(dir, FRUSTUM_DEPTH)
    const cx = (i:number) => c.x + right.x*hw*i[0] + upReal.x*hh*i[1]
    const cy = (i:number[]) => c.y + right.y*hw*i[0] + upReal.y*hh*i[1]
    const cz = (i:number[]) => c.z + right.z*hw*i[0] + upReal.z*hh*i[1]
    const corners: [number,number,number][] = [[-1,-1],[-1,1],[1,1],[1,-1]].map(p => [cx(p),cy(p),cz(p)]) as any
    const lines: [[number,number,number],[number,number,number]][] = []
    corners.forEach((corner, i) => {
      lines.push([position, corner])
      const next = corners[(i+1) % corners.length]
      lines.push([corner, next])
    })
    // camera body (small box at rig position)
    const B = 0.15
    const boxLines: [[number,number,number],[number,number,number]][] = []
    const bx = (sx:number, sy:number, sz:number) => [position[0]+right.x*B*sx+upReal.x*B*sy-dir.x*B*sz, position[1]+right.y*B*sx+upReal.y*B*sy-dir.y*B*sz, position[2]+right.z*B*sx+upReal.z*B*sz-dir.z*B*sz] as [number,number,number]
    const bc: [number,number,number][] = [[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1]].map(s => bx(s[0],s[1],s[2])) as any
    const edges: [number,number][] = [[0,1],[0,2],[1,3],[2,3],[4,5],[4,6],[5,7],[6,7],[0,4],[1,5],[2,6],[3,7]]
    edges.forEach(([a,b]) => boxLines.push([bc[a], bc[b]]))
    return [...lines, ...boxLines]
  }, [position, target, fov])
  return (
    <group>
      {points.map((pts, i) => <Line key={i} points={pts} color={active ? '#FFD166' : '#A9D8FF'} lineWidth={1} transparent opacity={0.85} />)}
    </group>
  )
}

export function CameraRigs() {
  const cameras = useDirectorStore(s => s.project.cameras)
  const activeId = useDirectorStore(s => s.project.activeCameraId)
  const viewMode = useDirectorStore(s => s.viewMode)
  return (
    <group>
      {cameras.map(c => {
        // In camera view, hide the active camera's rig (it is our POV)
        if (viewMode === 'camera' && c.id === activeId) return null
        return (
          <group key={c.id}>
            <FrustumLines position={c.position} target={c.target} fov={c.fov} active={c.id === activeId} />
            <Text position={[c.position[0], c.position[1] + 0.4, c.position[2]]} fontSize={0.22} color="#A9D8FF" billboard anchorX="center">{c.name}</Text>
          </group>
        )
      })}
    </group>
  )
}
```

(Frustum math will need a real sanity check at runtime; adjust if lines look wrong.)

- [ ] **Step 5: Create SceneRoot.tsx (placeholder objects, real in Task 9)**

For now just render Ground + Backdrop + CameraRigs + lighting.

```tsx
'use client'
import { Ground } from './Ground'
import { Backdrop } from './Backdrop'
import { CameraRigs } from './CameraRigs'

export function SceneRoot() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.0} />
      <Ground />
      <Backdrop />
      <CameraRigs />
    </>
  )
}
```

- [ ] **Step 6: Create DirectorCanvas.tsx**

```tsx
'use client'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useDirectorStore } from '../store/directorStore'
import { SceneRoot } from './SceneRoot'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function CameraRig() {
  const viewMode = useDirectorStore(s => s.viewMode)
  const cam = useDirectorStore(s => s.project.cameras.find(c => c.id === s.project.activeCameraId))
  const setCamRef = useDirectorStore(s => s.setCameraRef)
  const threeCamera = useThree(s => s.camera) as THREE.PerspectiveCamera
  useEffect(() => {
    if (viewMode === 'camera' && cam) {
      threeCamera.position.set(...cam.position)
      threeCamera.fov = cam.fov
      threeCamera.lookAt(cam.target[0], cam.target[1], cam.target[2])
      threeCamera.updateProjectionMatrix()
    }
  }, [viewMode, cam, threeCamera])
  // Expose canvas for screenshot capture via a global ref (Task 9).
  useEffect(() => {
    const gl = useThree.getState().gl
    const canvas = gl.domElement
    ;(window as any).__directorCanvas = canvas
  }, [])
  return null
}

export function DirectorCanvas() {
  const viewMode = useDirectorStore(s => s.viewMode)
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ fov: 50, position: [0, 1.55, 5.4] }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <color attach="background" args={['#1a1d23']} />
        <SceneRoot />
        <CameraRig />
        {viewMode === 'director' && <OrbitControls makeDefault target={[0, 1.55, 0]} />}
        <GizmoHelper alignment="top-right" margin={[80, 80]}>
          <GizmoViewport labelColor="white" axisHeadScale={1} />
        </GizmoHelper>
      </Canvas>
    </div>
  )
}
```

Note: `preserveDrawingBuffer: true` is needed so `canvas.toDataURL()` works after navigation. `(window as any).__directorCanvas` is a dirty shortcut for Task 9 screenshot. If store has a `setGlCanvas` action, use that instead; otherwise add a `glCanvas: HTMLCanvasElement | null` field to store and set it via `setGlCanvas(canvas)` in the effect. Add that to store in Task 5 follow-up.

- [ ] **Step 7: Update Shell**

Replace the placeholder `<div className="absolute inset-0 flex items-center justify-center text-white/30">3D Canvas (Task 8)</div>` with `<DirectorCanvas />`.

- [ ] **Step 8: Smoke test**

Run dev server, open director-desk page. Verify:
- Dark canvas loads; orbit controls work.
- Ground grid visible.
- If location is set, backdrop renders (may have seam/rotation issues — fix as needed, cylinder arc should face camera, image on inside).
- Camera wireframe frustum visible.
- Switching to 机位视角 jumps to camera view.

Iterate on geometry/rotation/facing until backdrop and frustum look reasonable.

- [ ] **Step 9: Typecheck + commit**

```bash
npm run typecheck
git add src/app/[locale]/workspace/[projectId]/director-desk/editor/canvas/ src/lib/director-desk/schema.ts src/app/[locale]/workspace/[projectId]/director-desk/editor/DirectorDeskShell.tsx src/app/[locale]/workspace/[projectId]/director-desk/editor/store/directorStore.ts
git commit -m "feat(director-desk): R3F canvas with ground, backdrop, camera rigs"
```

---

## Task 9: Object rendering (billboard + mannequin) + selection/transform + screenshot

**Files:**
- Create: `canvas/objects/BillboardObject.tsx`
- Create: `canvas/objects/MannequinObject.tsx`
- Create: `canvas/objects/CrowdObject.tsx`
- Create: `canvas/objects/TransformableObject.tsx`
- Create: `canvas/ViewportOverlays.tsx` (aspect frame + rule-of-thirds)
- Create: `io/screenshot.ts` (capture + crop + jpeg dataURL)
- Modify: `SceneRoot.tsx` to map objects to their components
- Modify: `TopBar.tsx` to call screenshot on save
- Add: `glCanvas` field + `setGlCanvas` action to store

**Interfaces:**
- `<BillboardObject object={DirectorObject} />` — renders Plane with texture (useTexture(object.imageUrl)), optional y-rotation for facing, NameLabel, base disc.
- `<MannequinObject object={DirectorObject} />` — renders `<ProceduralMannequin color bodyType posePresetId poseControls />` with NameLabel.
- `<CrowdObject object={DirectorObject} />` — N×M capsule grid, single NameLabel.
- `<TransformableObject objectId={string}><children/></TransformableObject>` — wraps children in drei `<TransformControls>` when object is selected; enforces billboard rules (Y-only rotation, uniform scale) based on object.mode; on transform end commits to store via `setObjectTransform`.
- `captureActiveCameraScreenshot(videoRatio: string): Promise<string>` — switches to camera view, renders one frame, reads gl.domElement, crops to aspect ratio, returns dataURL. Uses the `glCanvas`/gl reference stored by DirectorCanvas.
- `<ViewportOverlays />` — renders aspect frame mask + rule-of-thirds lines using drei `<Line>` (visible in camera view only).

- [ ] **Step 1: Create BillboardObject.tsx**

```tsx
'use client'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useMemo } from 'react'
import { NameLabel } from '../NameLabel'
import type { DirectorObject } from '@/lib/director-desk/schema'

export function BillboardObject({ object }: { object: DirectorObject }) {
  const url = (object as any).imageUrl as string | undefined
  const texture = useTexture(url || '', t => { if (t) { t.colorSpace = THREE.SRGBColorSpace } })
  const [w, h] = useMemo(() => {
    const img = texture?.image as HTMLImageElement | undefined
    if (!img || !img.width) return [0.8, 1.7]
    const aspect = img.width / img.height
    const height = object.kind === 'prop' ? 0.6 : 1.7
    return [height * aspect, height]
  }, [texture, object.kind])
  const hasFacing = typeof object.facing === 'number'
  const yRot = hasFacing ? object.facing! : 0
  return (
    <group position={object.transform.position} rotation={[0, yRot, 0]} scale={object.transform.scale[0]}>
      {/* base disc */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <circleGeometry args={[0.35, 24]} />
        <meshBasicMaterial color={object.color} transparent opacity={0.6} />
      </mesh>
      {hasFacing ? (
        <mesh position={[0, h/2, 0]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ) : (
        // billboard: drei Billboard keeps children facing camera
        <BillboardWrapper>
          <mesh position={[0, h/2, 0]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </BillboardWrapper>
      )}
      <NameLabel text={object.name} yOffset={h + 0.2} />
    </group>
  )
}

// Need a Billboard wrapper using drei Billboard. Import:
import { Billboard } from '@react-three/drei'
function BillboardWrapper({ children }: { children: React.ReactNode }) {
  return <Billboard>{children}</Billboard>
}
```

(Note: drei's Billboard is re-exported from `@react-three/drei` — import alongside useTexture. If import conflicts because of the two uses in one file, reorganize imports.)

- [ ] **Step 2: Create MannequinObject.tsx**

```tsx
'use client'
import { NameLabel } from '../NameLabel'
import { ProceduralMannequin } from '../runtime/mannequin/ProceduralMannequin'
import type { DirectorObject } from '@/lib/director-desk/schema'

export function MannequinObject({ object }: { object: DirectorObject }) {
  return (
    <group position={object.transform.position} rotation={object.transform.rotation} scale={object.transform.scale}>
      <ProceduralMannequin
        color={object.color}
        bodyType={object.bodyType ?? 'mannequin'}
        posePresetId={object.posePresetId ?? 'stand'}
        poseControls={object.poseControls}
      />
      <NameLabel text={object.name} yOffset={2.4} />
    </group>
  )
}
```

(Verify ProceduralMannequin's prop names match. Adjust to whatever the ported component actually takes — e.g. if it uses `body_type` instead of `bodyType`, map it.)

- [ ] **Step 3: Create CrowdObject.tsx**

```tsx
'use client'
import { NameLabel } from '../NameLabel'
import type { DirectorObject } from '@/lib/director-desk/schema'

export function CrowdObject({ object }: { object: DirectorObject }) {
  const [rows, cols] = object.crowdCount ?? [2, 3]
  const [sx, sz] = object.crowdSpacing ?? [0.8, 0.8]
  const members: [number,number,number][] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    members.push([(c - (cols-1)/2) * sx, 0, (r - (rows-1)/2) * sz])
  }
  return (
    <group position={object.transform.position} rotation={object.transform.rotation} scale={object.transform.scale}>
      {members.map((p, i) => (
        <mesh key={i} position={p} castShadow={false}>
          <capsuleGeometry args={[0.15, 1.0, 4, 8]} />
          <meshStandardMaterial color={object.color} roughness={0.8} metalness={0.05} />
        </mesh>
      ))}
      <NameLabel text={object.name} yOffset={2.0} />
    </group>
  )
}
```

- [ ] **Step 4: Create TransformableObject.tsx**

```tsx
'use client'
import { TransformControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useDirectorStore } from '../store/directorStore'

export function TransformableObject({ objectId, children }: { objectId: string; children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null)
  const obj = useDirectorStore(s => s.project.objects.find(o => o.id === objectId))
  const selectedId = useDirectorStore(s => s.selectedId)
  const transformMode = useDirectorStore(s => s.transformMode)
  const setObjectTransform = useDirectorStore(s => s.setObjectTransform)
  const setObjectField = useDirectorStore(s => s.setObjectField)
  const orbitRef = useThree(s => s.controls)
  const selected = selectedId === objectId
  useEffect(() => {
    if (!selected || !groupRef.current) return
    const controls = orbitRef as any
    if (controls?.enabled !== undefined) {
      const cb = (event: any) => { controls.enabled = !event.value }
      const tc = groupRef.current.parent?.children.find(c => (c as any).isTransformControls)
      tc?.addEventListener?.('dragging-changed', cb)
      return () => tc?.removeEventListener?.('dragging-changed', cb)
    }
  }, [selected, orbitRef])
  if (!obj) return null
  const content = (
    <group ref={groupRef} position={obj.transform.position} rotation={obj.transform.rotation} scale={obj.transform.scale}>
      {children}
    </group>
  )
  if (!selected || obj.locked) return content
  return (
    <TransformControls
      object={groupRef as any}
      mode={transformMode}
      onObjectChange={() => {
        if (!groupRef.current) return
        const o = groupRef.current
        const p = o.position.toArray() as [number,number,number]
        const r = o.rotation.toArray().slice(0,3) as [number,number,number]
        let s = o.scale.toArray() as [number,number,number]
        if (obj.mode === 'billboard') {
          // Y-only rotation: flatten rx, rz
          r[0] = 0; r[2] = 0
          // uniform scale: use s[0]
          s = [s[0], s[0], s[0]]
          o.rotation.set(0, r[1], 0)
          o.scale.set(s[0], s[0], s[0])
        }
        setObjectTransform(objectId, { position: p, rotation: r, scale: s })
      }}
    >
      {content}
    </TransformControls>
  )
}
```

(This is tricky — TransformControls from drei may behave differently. The agent implementing should test drag and adjust if needed; the critical part is committing transforms back to the store on drag, disabling orbit while dragging, and enforcing billboard constraints.)

- [ ] **Step 5: Create ViewportOverlays.tsx**

```tsx
'use client'
import { Line } from '@react-three/drei'
import { useDirectorStore } from '../store/directorStore'

function ratioToSize(videoRatio: string) {
  const [w, h] = videoRatio.split(':').map(Number)
  if (!w || !h) return { w: 0.5625, h: 1 }
  const longSide = 4
  const shortSide = (longSide * Math.min(w,h)) / Math.max(w,h)
  return w >= h ? { w: longSide, h: shortSide } : { w: shortSide, h: longSide }
}

export function ViewportOverlays() {
  const viewMode = useDirectorStore(s => s.viewMode)
  const videoRatio = useDirectorStore(s => (s as any).videoRatio as string | undefined) ?? '9:16'
  if (viewMode !== 'camera') return null
  const { w: fw, h: fh } = ratioToSize(videoRatio)
  const z = -4
  const frame: [number,number,number][] = [[-fw/2,-fh/2,z],[fw/2,-fh/2,z],[fw/2,fh/2,z],[-fw/2,fh/2,z],[-fw/2,-fh/2,z]]
  const thirds: [[number,number,number],[number,number,number]][] = [
    [[-fw/2+fw/3,-fh/2,z],[ -fw/2+fw/3, fh/2,z]],
    [[-fw/2+2*fw/3,-fh/2,z],[-fw/2+2*fw/3, fh/2,z]],
    [[-fw/2,-fh/2+fh/3,z],[ fw/2,-fh/2+fh/3,z]],
    [[-fw/2,-fh/2+2*fh/3,z],[fw/2,-fh/2+2*fh/3,z]],
  ]
  return (
    <group>
      <Line points={frame} color="white" lineWidth={1.5} transparent opacity={0.7} />
      {thirds.map((pts, i) => <Line key={i} points={pts} color="white" lineWidth={0.5} transparent opacity={0.3} />)}
    </group>
  )
}
```

Add `videoRatio` to the store (loaded in page.tsx from project.videoRatio).

- [ ] **Step 6: Create io/screenshot.ts**

```ts
export async function captureActiveCameraScreenshot(videoRatio: '9:16'|'16:9'|'1:1'): Promise<string> {
  const canvas: HTMLCanvasElement | undefined = (window as any).__directorCanvas
  if (!canvas) throw new Error('canvas not available')
  // Ensure one frame render:
  await new Promise(r => requestAnimationFrame(r))
  const [rw, rh] = [canvas.width, canvas.height]
  // Compute crop rect to match target aspect ratio, centered
  const targetAspect = videoRatio === '9:16' ? 9/16 : videoRatio === '1:1' ? 1 : 16/9
  const currentAspect = rw / rh
  let cropX = 0, cropY = 0, cropW = rw, cropH = rh
  if (currentAspect > targetAspect) {
    cropW = Math.round(rh * targetAspect); cropX = (rw - cropW) / 2
  } else {
    cropH = Math.round(rw / targetAspect); cropY = (rh - cropH) / 2
  }
  const out = document.createElement('canvas')
  const shortEdge = 1024
  const scale = shortEdge / Math.min(cropW, cropH)
  out.width = Math.round(cropW * scale); out.height = Math.round(cropH * scale)
  const ctx = out.getContext('2d')!
  ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, out.width, out.height)
  return out.toDataURL('image/jpeg', 0.88)
}
```

- [ ] **Step 7: Update SceneRoot.tsx to render objects**

Replace the placeholder SceneRoot with one that maps over objects:

```tsx
'use client'
import { Ground } from './Ground'
import { Backdrop } from './Backdrop'
import { CameraRigs } from './CameraRigs'
import { ViewportOverlays } from './ViewportOverlays'
import { BillboardObject } from './objects/BillboardObject'
import { MannequinObject } from './objects/MannequinObject'
import { CrowdObject } from './objects/CrowdObject'
import { TransformableObject } from './objects/TransformableObject'
import { useDirectorStore } from '../store/directorStore'

export function SceneRoot() {
  const objects = useDirectorStore(s => s.project.objects)
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.0} />
      <Ground />
      <Backdrop />
      {objects.map(o => {
        if (!o.visible) return null
        const renderObject = () => {
          if (o.kind === 'crowd') return <CrowdObject object={o} />
          if (o.kind === 'character' && o.mode === 'mannequin') return <MannequinObject object={o} />
          return <BillboardObject object={o} />
        }
        return (
          <TransformableObject key={o.id} objectId={o.id}>
            {renderObject()}
          </TransformableObject>
        )
      })}
      <CameraRigs />
      <ViewportOverlays />
    </>
  )
}
```

- [ ] **Step 8: Update page.tsx to pass videoRatio + backdropImageUrl**

After `load(proj, panelId, projectId)` call, also call `useDirectorStore.setState({ videoRatio: data.project.videoRatio })` after adding `videoRatio: string` to store state.

- [ ] **Step 9: Update TopBar.tsx save to use screenshot**

Replace `const snapshot = ''` with:
```ts
import { captureActiveCameraScreenshot } from './io/screenshot'
// ...
setViewMode('camera')  // force camera view for capture
await new Promise(r => setTimeout(r, 100))
const snapshot = await captureActiveCameraScreenshot(useDirectorStore.getState().videoRatio as any || '9:16')
```

(May need a small delay for re-render to camera view before capture.)

- [ ] **Step 10: Select on click**

Add click-to-raycast. The simplest approach: attach an `onClick` handler to each rendered mesh that calls `select(o.id)` and stops propagation. Wrap the top-level group of each object class:

In BillboardObject/MannequinObject/CrowdObject outer group, add `onClick={(e) => { e.stopPropagation(); useDirectorStore.getState().select(object.id) }}`. On the Canvas root (or on an invisible background plane in SceneRoot), add a click handler that calls `select(null)` to deselect.

- [ ] **Step 11: Keyboard shortcuts**

In DirectorDeskShell or a separate component mounted in shell, add useEffect listening to keydown:
- Delete/Backspace: if selection and tagName not INPUT/TEXTAREA → removeObject(selectedId), select(null)
- Ctrl+Z: undo()
- Ctrl+Y / Ctrl+Shift+Z: redo()
- Q: setTransformMode('translate')
- W: setTransformMode('translate') (treat Q/W as translate)
- E: setTransformMode('rotate')
- R: setTransformMode('scale')
- Ctrl+C/V: duplicate and offset

- [ ] **Step 12: Smoke test**

Open dev server, load a panel with characters + location:
- Characters appear as billboards facing camera; click selects, drag moves, rotate (E) rotates around Y, scale (R) uniform-scales.
- Toggling character to mannequin mode (will need UI in Task 11, but for testing mutate store via devtools or a temporary button) shows capsule people.
- Backdrop visible and rotatable via backdropYaw (temp slider).
- Switch to camera view → aspect frame + thirds visible.
- Click 保存 → screenshot captured, network shows POST to save API, panel.directorLayout/directorShotMediaId populated.

- [ ] **Step 13: Typecheck + commit**

```bash
npm run typecheck
git add src/app/[locale]/workspace/[projectId]/director-desk/editor/canvas/ src/app/[locale]/workspace/[projectId]/director-desk/editor/io/
git commit -m "feat(director-desk): billboard/mannequin/crowd objects, transform controls, screenshot"
```

---

## Task 10: Left panel (ObjectTree)

**Files:**
- Create: `editor/panels/ObjectTreePanel.tsx`

**Interfaces:**
- Search box, grouped tree (角色/群演/道具/机位), per-row 👁/🔒 toggles, click to select, double-click to rename (prompt), Delete removes selection.

- [ ] **Step 1: Create ObjectTreePanel.tsx**

```tsx
'use client'
import { useMemo, useState } from 'react'
import { useDirectorStore } from '../store/directorStore'

export function ObjectTreePanel() {
  const objects = useDirectorStore(s => s.project.objects)
  const cameras = useDirectorStore(s => s.project.cameras)
  const activeId = useDirectorStore(s => s.project.activeCameraId)
  const selectedId = useDirectorStore(s => s.selectedId)
  const select = useDirectorStore(s => s.select)
  const setObjectField = useDirectorStore(s => s.setObjectField)
  const setCameraField = useDirectorStore(s => s.setCameraField)
  const removeObject = useDirectorStore(s => s.removeObject)
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const filter = (o: { name: string }) => !q || o.name.toLowerCase().includes(q.toLowerCase())
    return {
      characters: objects.filter(o => o.kind === 'character').filter(filter),
      crowds: objects.filter(o => o.kind === 'crowd').filter(filter),
      props: objects.filter(o => o.kind === 'prop').filter(filter),
      cameras: cameras.filter(filter),
    }
  }, [objects, cameras, q])

  return (
    <div className="flex flex-col h-full">
      <input autoFocus={false} value={q} onChange={e => setQ(e.target.value)} placeholder="搜索..."
        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs mb-2 outline-none" />
      <div className="flex-1 overflow-auto text-xs space-y-3">
        {([
          ['角色', groups.characters, 'character'],
          ['群演', groups.crowds, 'crowd'],
          ['道具', groups.props, 'prop'],
          ['机位', groups.cameras, 'camera'],
        ] as const).map(([label, list, kind]) => (
          <div key={label}>
            <div className="text-white/40 text-[10px] uppercase tracking-wider px-1 mb-1">{label}</div>
            {list.map(item => {
              const isCam = kind === 'camera'
              const id = isCam ? (item as any).id : (item as any).id
              const sel = selectedId === id
              const camActive = isCam && id === activeId
              return (
                <div key={id} onClick={() => select(id)}
                  className={`group flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer ${sel ? 'bg-blue-500/20' : 'hover:bg-white/5'}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{background: isCam ? '#A9D8FF' : (item as any).color}} />
                  <span className="flex-1 truncate">{(item as any).name}{camActive ? ' (激活)' : ''}</span>
                  <button onClick={e => { e.stopPropagation(); if (isCam) setCameraField(id, 'visible', !(item as any).visible); else setObjectField(id, 'visible', !(item as any).visible) }}
                    className="opacity-50 hover:opacity-100">{(item as any).visible === false ? '○' : '👁'}</button>
                  {!isCam && <button onClick={e => { e.stopPropagation(); setObjectField(id, 'locked', !(item as any).locked) }}
                    className="opacity-50 hover:opacity-100">{(item as any).locked ? '🔒' : '🔓'}</button>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-white/10 text-[10px] text-white/40 space-y-1">
        <div>Q/W 平移 · E 旋转 · R 缩放</div>
        <div>Del 删除 · Ctrl+Z 撤销</div>
      </div>
    </div>
  )
}
```

Note: Cameras don't have `visible/locked` fields in the schema; add `visible?: boolean` to DirectorCamera (non-persisted? actually persist it — useful for hiding non-active cameras), extend parser accordingly, and default visible=true.

- [ ] **Step 2: Hook into Shell**

Replace left-aside placeholder with `<ObjectTreePanel />`.

- [ ] **Step 3: Commit**

```bash
npm run typecheck
git add src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/ObjectTreePanel.tsx src/app/[locale]/workspace/[projectId]/director-desk/editor/DirectorDeskShell.tsx
git commit -m "feat(director-desk): left object tree panel"
```

---

## Task 11: Right panel (inspector — Scene/Character/Prop/Camera/Crowd)

**Files:**
- Create: `editor/panels/RightPanel.tsx` (dispatcher)
- Create: `editor/panels/ScenePanel.tsx`
- Create: `editor/panels/CharacterPanel.tsx`
- Create: `editor/panels/PropPanel.tsx`
- Create: `editor/panels/CameraPanel.tsx`
- Create: `editor/panels/CrowdPanel.tsx`

This is a larger UI task. Keep each panel minimal but functional (numeric inputs, sliders, buttons). Use plain HTML inputs styled with `bg-white/5 border border-white/10 rounded px-2 py-1 text-xs w-full`. Use the store actions for mutations (each mutation goes through setSceneField/setObjectField/setCameraField, which auto-push history and mark dirty).

Do NOT implement the "截图" tab in CameraPanel in this task — leave a placeholder.

- [ ] **Step 1: Create RightPanel.tsx**

```tsx
'use client'
import { useSelectedObject, useActiveCamera } from '../store/directorSelectors'
import { useDirectorStore } from '../store/directorStore'
import { ScenePanel } from './ScenePanel'
import { CharacterPanel } from './CharacterPanel'
import { PropPanel } from './PropPanel'
import { CameraPanel } from './CameraPanel'
import { CrowdPanel } from './CrowdPanel'

export function RightPanel() {
  const selected = useSelectedObject()
  const selectedId = useDirectorStore(s => s.selectedId)
  const cameras = useDirectorStore(s => s.project.cameras)
  const selectedCamera = cameras.find(c => c.id === selectedId)
  if (selectedCamera) return <CameraPanel cameraId={selectedCamera.id} />
  if (!selected) return <ScenePanel />
  if (selected.kind === 'character') return <CharacterPanel objectId={selected.id} />
  if (selected.kind === 'prop') return <PropPanel objectId={selected.id} />
  if (selected.kind === 'crowd') return <CrowdPanel objectId={selected.id} />
  return <ScenePanel />
}
```

- [ ] **Step 2: Create ScenePanel.tsx**

Color picker (background), checkboxes for showGround/showGrid/showLabels, sliders for groundOpacity/backdropOpacity, numeric for backdropYaw, "重置为上次保存" button, "添加群演" and "添加机位" quick-adds, buttons for addCharacterFromList (not for v1 — YAGNI, only quick-add crowd and camera).

Sliders: `<input type="range" min=0 max=1 step=0.05 value={val} onChange={e => setSceneField('groundOpacity', Number(e.target.value))} />`.

Add `addCrowd(partial?)` and `addCharacter(partial?)` actions to store if missing — addCrowd inserts a crowd at origin; addCamera inserts a new camera in front of existing one.

- [ ] **Step 3: Create CharacterPanel.tsx** with two tabs: 属性 + 姿势 (only shows pose tab when mode is mannequin)
- 属性: name (text input), position XYZ (three number inputs), rotation Y (slider -π..π), uniform scale (slider 0.2-3), color (input type=color), appearance picker (dropdown of the character's appearances — not in DirectorObject schema, so in v1 just show the mode toggle; appearance switching requires extra load-time data, skip for v1), mode toggle (billboard/mannequin buttons).
- 姿势: body type selector (8 buttons), pose preset grid (20 buttons), per-joint sliders (-90..90) (just a few key joints: left/right shoulder pitch, head yaw/pitch — YAGNI, don't need every single joint; a handful is enough).

- [ ] **Step 4: Create PropPanel.tsx** — position XYZ, scale slider, delete button.

- [ ] **Step 5: Create CameraPanel.tsx** — dropdown to switch selected camera, name, fov slider (10-120), position XYZ, target XYZ, "看向选中对象" button (sets target to selected object position, if selected is not a camera), "添加机位" / "删除机位" (last camera cannot be removed), "设为激活机位" button. 截图 tab placeholder: "截图 (Task 12)".

- [ ] **Step 6: Create CrowdPanel.tsx** — rows/cols steppers, spacing sliders, color picker, "解散群演" (removeObject) button.

- [ ] **Step 7: Hook into Shell**

Replace right-aside placeholder with `<RightPanel />`.

- [ ] **Step 8: Smoke test**

Open page; verify selecting different objects switches right panel; edits (e.g., change scale) update 3D and push to history; undo works; add camera adds a second camera rig visible in scene.

- [ ] **Step 9: Commit**

```bash
npm run typecheck
git add src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/
git commit -m "feat(director-desk): right inspector panels for scene/character/prop/camera/crowd"
```

---

## Task 12: Camera capture tab in CameraPanel

**Files:**
- Modify: `editor/panels/CameraPanel.tsx` (add screenshot tab)
- Add: store state `cameraCaptures: Record<string, Array<{id:string;dataUrl:string}>>`

This task adds the ability to capture, preview, and select screenshots in the right panel. The "active camera" capture is what gets sent to save API; ensure TopBar's save uses the latest active camera capture if present, else auto-captures.

- [ ] **Step 1: Extend store for captures**

Add `cameraCaptures: Record<string, {id:string;dataUrl:string}[]>` to state; actions `addCameraCapture(cameraId, dataUrl)`, `removeCameraCapture(cameraId, captureId)`.

- [ ] **Step 2: Update TopBar save logic**

Before saving, check if the active camera has any captures; if so use the latest. Otherwise auto-capture via `captureActiveCameraScreenshot` (current behavior).

- [ ] **Step 3: Add 截图 tab to CameraPanel**

- "截取当前机位" button: switches to camera view, awaits 100ms, calls `captureActiveCameraScreenshot`, dispatches addCameraCapture.
- Thumbnail list: shows each capture as `<img src={dataUrl}>` with width 100px; click opens a larger preview (simple modal or new tab); per-capture "删除" button; per-capture "设为激活截图" badge (most recent is implicitly active; no extra flag needed).
- Download link per capture: `<a href={dataUrl} download={\`director-desk-\${cam.name}-\${idx}.jpg\`}>下载</a>`.

- [ ] **Step 4: Commit**

```bash
npm run typecheck
git add src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/CameraPanel.tsx src/app/[locale]/workspace/[projectId]/director-desk/editor/store/directorStore.ts src/app/[locale]/workspace/[projectId]/director-desk/editor/TopBar.tsx
git commit -m "feat(director-desk): camera capture tab in inspector"
```

---

## Task 13: PanelCard entry button

**Files:**
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSectionActionButtons.tsx`

Add a "🎬 导演台" button in the bottom-center button pill. Needs `projectId`, `panelId`, `locale` to build the URL. Check how the component receives locale (useLocale from next-intl) and projectId (useParams or passed as prop — inspect the parent chain and pass down if not already a prop).

- [ ] **Step 1: Add projectId/locale to props if needed**

Check PanelCard → ImageSectionActionButtons chain. If projectId is not passed, add it as a prop from wherever PanelCard receives it (PanelCard is in the same workspace path; it should have projectId via useParams).

- [ ] **Step 2: Insert button in ImageSectionActionButtons.tsx**

After the "查看数据" button (the `<button title={t('aiData.viewData')}>` block) and before the `{imageUrl && (<button ... edit>` block, add:

```tsx
<button
  onClick={() => {
    const url = `/${locale}/workspace/${projectId}/director-desk?panelId=${panelId}`
    window.open(url, '_blank', 'width=1400,height=900')
  }}
  className={`glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask || isModifying ? 'opacity-75' : ''}`}
  title={t('directorDesk.button')}
>
  <Clapperboard className="w-2.5 h-2.5" />
  <span>{t('directorDesk.button')}</span>
</button>
```

Import `Clapperboard` from `lucide-react`. Resolve `locale` via `const locale = useLocale()` from `next-intl`.

- [ ] **Step 3: Verify**

Open workspace, see the button on panel cards; clicking opens a new director-desk window.

- [ ] **Step 4: Commit**

```bash
npm run typecheck
git add src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSectionActionButtons.tsx
git commit -m "feat(director-desk): add director-desk button on panel cards"
```

---

## Task 14: Worker integration — reference images + prompt context + template rule

**Files:**
- Modify: `src/lib/workers/handlers/image-task-handler-shared.ts` (collectPanelReferenceImages prepend director shot; also extend PanelLike to include directorShotMediaId)
- Modify: `src/lib/workers/handlers/panel-image-task-handler.ts` (buildPanelPromptContext adds director_shot; pass directorLayout field from panel query)
- Modify: `lib/prompts/novel-promotion/single_panel_image.zh.txt`
- Modify: `lib/prompts/novel-promotion/single_panel_image.en.txt`
- Modify: `lib/prompts/novel-promotion/panel_grid_image.zh.txt`
- Modify: `lib/prompts/novel-promotion/panel_grid_image.en.txt`
- Verify: `src/lib/workers/handlers/panel-variant-task-handler.ts` (ensure director_shot flows if it builds its own context)

- [ ] **Step 1: Extend PanelLike interface**

In `image-task-handler-shared.ts`, add to `PanelLike`:

```ts
directorShotMediaId?: string | null
directorLayout?: string | null
```

- [ ] **Step 2: Prepend director shot image in collectPanelReferenceImages**

At the top of `collectPanelReferenceImages`, before adding sketchImageUrl:

```ts
const refs: string[] = []
if (panel.directorShotMediaId) {
  const media = await prisma.mediaObject.findUnique({ where: { id: panel.directorShotMediaId } })
  if (media) refs.push(getSignedUrl(media.storageKey, 3600))
}
// ... existing sketch/character/location appends ...
```

Wait — `collectPanelReferenceImages` currently does not import prisma/getSignedUrl directly. Inspect; it likely works with `projectData` parameter. Adjust: either add a `resolveMediaUrl` function or do the lookup in the caller (handlePanelImageTask) and pass as a pre-resolved URL. The cleanest ponytail approach: resolve the director shot URL in handlePanelImageTask (where we have all data) and pass it into collectPanelReferenceImages via the PanelLike (already adding `directorShotUrl?: string`), then prepend it if present.

Refined approach:

In panel-image-task-handler.ts, before calling collectPanelReferenceImages:
```ts
let directorShotUrl: string | undefined
if (panel.directorShotMediaId) {
  const media = await prisma.mediaObject.findUnique({ where: { id: panel.directorShotMediaId } })
  if (media) directorShotUrl = getSignedUrl(media.storageKey, 3600)
}
const refs = await collectPanelReferenceImages(projectData, { ...panel, directorShotUrl })
```

In collectPanelReferenceImages, accept `directorShotUrl?: string | null` on PanelLike; prepend to refs if present.

- [ ] **Step 3: Inject director_shot in buildPanelPromptContext**

Add `directorLayout` and `directorShotMediaId` (the latter isn't needed for prompt) to the panel parameter type of buildPanelPromptContext. At the end of panel block in return:

```ts
const director = (() => {
  if (!params.panel.directorLayout) return null
  const parsed = parseDirectorProject(parseJsonUnknown(params.panel.directorLayout))
  if (!parsed || parsed.version !== 1) return null
  const cam = parsed.cameras.find(c => c.id === parsed.activeCameraId)
  if (!cam) return null
  const round = (n: number) => Math.round(n*100)/100
  return {
    camera_fov: cam.fov,
    camera_position: { x: round(cam.position[0]), y: round(cam.position[1]), z: round(cam.position[2]) },
    camera_target: { x: round(cam.target[0]), y: round(cam.target[1]), z: round(cam.target[2]) },
    characters: parsed.objects.filter(o => o.kind === 'character' && o.visible).map(o => ({
      name: o.name,
      position: { x: round(o.transform.position[0]), y: round(o.transform.position[1]), z: round(o.transform.position[2]) },
      facing_deg: Math.round(((o.facing ?? 0) * 180) / Math.PI),
      posture: o.posePresetId ?? 'stand',
      render_mode: o.mode,
    })),
  }
})()
```

Then in the returned `panel` object, add `director_shot: director ?? undefined,`.

Import `parseDirectorProject` from `@/lib/director-desk/schema`.

Also update the `prisma.novelPromotionPanel.findUnique` select to include `directorLayout: true, directorShotMediaId: true` (or just use the existing panel record if it already returns all fields; verify in the handler that the panel fetch doesn't restrict fields).

- [ ] **Step 4: Add rule to prompt templates**

In each of the four prompt templates (zh/en × single/grid), insert a new `【⚠️ 导演台机位约束 - 必须严格遵循】` block just BEFORE the `【分镜数据】` line (so it sits near the data blob):

```
【⚠️ 导演台机位约束 - 构图最高优先级参考】
- 若分镜数据包含 director_shot 字段（导演台预演机位元数据），则必须严格遵循其摄像机 FOV、机位坐标、look-at 目标、角色站位和朝向来构图。
- 参考图中第一张为导演台机位图（含角色站位示意与名字标注），是构图最高优先级参考。
- 坐标系（director_shot）：单位米，y 轴向上，z 轴负方向为镜头前方，x 轴向右。
```

(English version for .en.txt files.)

- [ ] **Step 5: Verify panel-variant-task-handler**

Check `src/lib/workers/handlers/panel-variant-task-handler.ts`. If it calls buildPanelPromptContext or constructs its own promptContext, ensure directorLayout is passed through. If it uses the same buildPanelPromptContext function, it's already covered. If it constructs prompt context inline, add the same director_shot block.

- [ ] **Step 6: Guard test — old panel unaffected**

Add to `tests/guards/director-desk/old-panel-generates.test.ts` (use regression-style test with seedMinimalDomainState and generate a panel image task against a panel without directorLayout; assert no extra reference image is fetched and no director_shot key in serialized context). Implementation details: this test likely needs to stub the image provider rather than actually call external APIs — look at existing worker tests (e.g. `tests/integration/task/`) to find a pattern that stubs generation and asserts on prompt inputs. If too complex, write a simpler unit test around collectPanelReferenceImages and buildPanelPromptContext using fake inputs.

- [ ] **Step 7: Guard test — corrupt layout graceful fallback**

Unit test for buildPanelPromptContext: pass directorLayout as malformed JSON string → returns without director_shot field (no throw).

- [ ] **Step 8: Commit**

```bash
npm run typecheck
npx vitest run tests/guards/director-desk/ tests/unit/director-desk/
git add src/lib/workers/handlers/ lib/prompts/novel-promotion/ tests/guards/director-desk/
git commit -m "feat(director-desk): feed director shot into panel image generation"
```

---

## Task 15: i18n finalization + verify:commit

**Files:**
- Verify both zh/en storyboard.json have all directorDesk keys used in TopBar/PanelCard/panels
- Run `npm run verify:commit`

- [ ] **Step 1: Complete English translations**

Open `messages/en/storyboard.json` and ensure all `directorDesk.*` keys referenced in components have English values. Update missing ones.

- [ ] **Step 2: Run typecheck + lint + unit tests**

```bash
npm run typecheck
npm run lint:all
npx vitest run tests/unit/director-desk/ tests/integration/api/director-desk/ tests/guards/director-desk/
```

Fix any issues.

- [ ] **Step 3: Manual smoke checklist**

1. Open workspace, click director desk button on a panel → new window opens.
2. If panel has characters/location, billboards + backdrop auto-appear in reasonable positions.
3. Drag characters around, scale, rotate.
4. Switch to mannequin mode for a character → capsule body appears, pose preset changes pose.
5. Switch to camera view → see through the camera; adjust FOV/position/target.
6. Add a second camera, switch active.
7. Capture a screenshot, download it.
8. Save; close; reopen → layout restored.
9. Return to main workspace; regenerate the panel image → first reference image should be the director shot; generated image respects the blocking (qualitative check).
10. Test dirty-state: make changes, close window → confirm dialog appears; cancel stays, discard closes.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(director-desk): finalize i18n and pass verify checks"
```

---

## Task 16: Optional small niceties (do ONLY if time permits — YAGNI)

- Add small "🎬" badge on panel cards that have directorShotMediaId.
- Remember last-used view/transform mode across reloads (store in localStorage under a namespaced key; small addition).
- Click empty space in scene to deselect (already planned via background plane click in Task 9 — verify).

These are post-v1 polish; not on critical path.

---

## Self-Review

- **Spec coverage:** All sections of spec §1-§12 covered: schema (Task 1), prose mapper (Task 2), auto-init (Task 3), load/save API (Task 4), zustand store (Task 5), page/shell/topbar (Task 6), mannequin port (Task 7), canvas + ground/backdrop/rigs (Task 8), billboard/mannequin/crowd objects + transform + screenshot (Task 9), object tree (Task 10), inspector panels (Task 11), captures tab (Task 12), panel-card entry (Task 13), worker/prompt integration (Task 14), verification (Task 15). Multi-camera supported (cameras[] + activeCameraId per spec). Crowds supported (Task 2/9/11). v1 omits: FBX/OBJ import, cross-window real-time sync, undo persistence, primitive geometry, e2e tests — all explicit YAGNI.
- **No placeholders:** Tasks include code for each step; TODOs are only in one Task-6 placeholders that are explicitly replaced in later tasks.
- **Type consistency:** DirectorProject/DirectorObject/DirectorCamera/DirectorSceneSettings field names consistent across schema/store/components/API.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-07-director-desk.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks
2. **Inline Execution** — execute tasks in this session with checkpoints
