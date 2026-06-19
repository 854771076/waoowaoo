/**
 * Regression guard for panel-grid-image feature.
 *
 * The `onRegeneratePanelImage` callback flows through 6+ files as a 4-arg
 * callback `(panelId, count?, force?, panelGridSize?) => void`. TypeScript
 * function parameter contravariance allows assigning a 3-arg implementation
 * to the 4-arg type, which silently drops `panelGridSize`. This bit us once
 * (StoryboardGroup.tsx wrapper). This test verifies every site that *calls*
 * `onRegeneratePanelImage` does so with 4 positional args (or none, when
 * passing it through as a prop).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const STORYBOARD_DIR = join(
  process.cwd(),
  'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard',
)

// Files that *call* onRegeneratePanelImage(...) (vs files that only forward it as a prop)
const CALLSITES: Array<{ file: string; expectedArgCount: number }> = [
  // ImageSection.tsx renderEmptyState's button click
  { file: 'ImageSection.tsx', expectedArgCount: 4 },
  // ImageSectionActionButtons.tsx ImageGenerationInlineCountButton onClick
  { file: 'ImageSectionActionButtons.tsx', expectedArgCount: 4 },
  // StoryboardGroup.tsx handleRegeneratePanelImage wrapper
  { file: 'StoryboardGroup.tsx', expectedArgCount: 4 },
]

function countArgs(callExpression: string): number {
  // strip function name + outer parens
  const match = callExpression.match(/onRegeneratePanelImage\s*\(([\s\S]*?)\)\s*$/)
  if (!match) return -1
  const argsRaw = match[1].trim()
  if (!argsRaw) return 0
  // split on top-level commas (ignore nested parens/braces)
  let depth = 0
  let count = 1
  for (const ch of argsRaw) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) count++
  }
  return count
}

describe('onRegeneratePanelImage callsite arity contract', () => {
  for (const { file, expectedArgCount } of CALLSITES) {
    it(`${file} calls onRegeneratePanelImage with ${expectedArgCount} positional args (panelGridSize forwarded)`, () => {
      const source = readFileSync(join(STORYBOARD_DIR, file), 'utf-8')
      // Find every `onRegeneratePanelImage(` followed by its argument list up to the matching paren.
      const callRegex = /onRegeneratePanelImage\s*\(/g
      const calls: string[] = []
      let m: RegExpExecArray | null
      while ((m = callRegex.exec(source)) !== null) {
        // Walk forward, tracking paren depth, to collect the full call expression
        let depth = 1
        let i = m.index + m[0].length
        while (i < source.length && depth > 0) {
          const ch = source[i]
          if (ch === '(') depth++
          else if (ch === ')') depth--
          i++
        }
        calls.push(source.slice(m.index, i))
      }

      // Filter out type-signature occurrences like `onRegeneratePanelImage:` (type) and JSX prop forms `onRegeneratePanelImage={...}`
      const actualCalls = calls.filter((c) => !/^onRegeneratePanelImage\s*\(\s*$/.test(c.trim()))

      expect(actualCalls.length).toBeGreaterThan(0)

      for (const call of actualCalls) {
        const arity = countArgs(call)
        expect(
          arity,
          `In ${file}, expected ${expectedArgCount} args but got ${arity} in: ${call.slice(0, 200)}`,
        ).toBe(expectedArgCount)
      }
    })
  }
})
