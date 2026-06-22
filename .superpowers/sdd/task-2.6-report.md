# Task 2.6 Smart Transition Report

## Status
DONE_WITH_CONCERNS

## Requirements/source notes
- `.superpowers/sdd/task-2.6-brief.md` was not present in this worktree.
- Read `docs/superpowers/specs/2026-06-20-twick-editor-integration-design.md` section 6.5 and `.superpowers/sdd/twick-api-findings.md`.

## Twick transition real structure
Confirmed from `node_modules/@twick/timeline/dist/src/types.d.ts` and `timeline.editor.d.ts`:
- Element transition is a top-level element field: `transition?: { toElementId: string; duration: number; kind: string }`.
- `TimelineEditor` exposes `addTransition(fromElementId, toElementId, kind, duration): boolean` and `removeTransition(elementId): boolean`.
- No exported `TransitionKind` enum/union exists in the installed Twick type declarations; `kind` is typed as `string`.
- The design/POC mentions `fade / dissolve / slide / zoom`; MVP constrains recommendations to these four kinds only to avoid unsupported invented names.

## Implementation choice: synchronous API
Chose synchronous API (`POST /api/novel-promotion/[projectId]/editor/ai/transition`) instead of BullMQ task.
Reason:
- Smart Transition is rule-based and local, no provider call.
- Immediate calculation is cheaper and simpler than enqueueing a free task.
- Existing `_shared.ts` forces task submission, so transition uses a dedicated route with the same auth/ownership pattern.

## Recommendation rules
Pure function: `recommendSmartTransitions` in `src/lib/novel-promotion/editor/smart-transition.ts`.
- Same `metadata.storyboardId` → prefer `dissolve`, then `fade`, `slide`, `zoom`.
- Different/missing storyboard → prefer `fade`, then `dissolve`, `slide`, `zoom`.
- `slide` is included when panels differ to emphasize generated-panel progression.
- Returns 3-5 recommendations; current MVP returns 4 unique recommendations with kind, duration, confidence, reason.

## Setting transition
Frontend `TransitionPanel`:
- Uses `useTimelineContext()` to read `present`, selected item, and `editor`.
- Finds the next video/image clip on the same track after the selected clip.
- Fetches recommendations from the synchronous API.
- Applies selection via `setTimelineElementTransition`, which calls Twick `editor.addTransition(fromElementId, toElementId, kind, duration)`.
- Calls `flushProjectSave()` after applying so runtime persistence saves the updated top-level `transition` field.

## Free/billing
- Route returns `{ free: true, billing: null }`.
- Does not call `submitTask`.
- Does not construct billing info, freeze balance, or invoke any provider.

## Test commands and output

### Initial wrong command
Command:
```bash
npm test -- tests/unit/twick/smart-transition.test.ts tests/integration/api/editor-ai-routes.test.ts
```
Output:
```text
Exit code 1
npm error Missing script: "test"
npm error
npm error To see a list of scripts, run:
npm error   npm run
npm error A complete log of this run can be found in: /Users/xiaomao/.npm/_logs/2026-06-22T11_08_55_851Z-debug-0.log
```

### Initial wrong-root command
Command:
```bash
npx vitest run /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor/tests/unit/twick/smart-transition.test.ts /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor/tests/integration/api/editor-ai-routes.test.ts
```
Output:
```text
Exit code 1
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /Users/xiaomao/Documents/fuyang/waoowaoo

filter:  /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor/tests/unit/twick/smart-transition.test.ts, /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor/tests/integration/api/editor-ai-routes.test.ts
include: **/*.test.ts
exclude:  **/node_modules/**, **/dist/**, **/.next/**, **/.worktrees/**, **/.claude/worktrees/**

No test files found, exiting with code 1
```

### Targeted tests
Command:
```bash
npm --prefix /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor exec vitest -- --root /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor run tests/unit/twick/smart-transition.test.ts tests/integration/api/editor-ai-routes.test.ts
```
Output summary (full output contained expected route error logs for negative tests and sourcemap warnings):
```text
✓ tests/integration/api/editor-ai-routes.test.ts (40 tests) 429ms
✓ tests/unit/twick/smart-transition.test.ts (5 tests) 4ms

Test Files  2 passed (2)
Tests  45 passed (45)
Start at  19:10:28
Duration  1.34s (transform 408ms, setup 10ms, collect 284ms, tests 433ms, environment 0ms, prepare 100ms)
```

### Required transition-filtered typecheck
Command:
```bash
npm --prefix /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor exec tsc -- --noEmit 2>&1 | grep -iE "transition|Transition"
```
Output:
```text
(no output)
```
Meaning: no transition-related typecheck errors after fixing the route `ApiError` constructor usage.

### Full typecheck
Command:
```bash
npm --prefix /Users/xiaomao/Documents/fuyang/waoowaoo/.claude/worktrees/twick-editor run typecheck
```
Output:
```text
Exit code 2

> vvicat@0.4.1 typecheck
> tsc --noEmit

src/app/api/novel-promotion/[projectId]/editor/ai/transition/route.ts(104,44): error TS2345: Argument of type 'string' is not assignable to parameter of type 'Record<string, unknown>'.
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
Follow-up: fixed the transition route error by passing `{ message: error.message }` to `ApiError`. The remaining full-typecheck errors are unrelated pre-existing test dependency/matcher/duplicate-key issues; the required transition-filtered typecheck then produced no output.

## Concerns
- Twick package exposes transition `kind` as `string`; no installed type enum was found. MVP uses the four kinds documented by design/POC: `fade`, `dissolve`, `slide`, `zoom`.
- Full typecheck is still blocked by unrelated existing test errors outside this task.
