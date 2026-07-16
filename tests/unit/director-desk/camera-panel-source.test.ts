import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

const readSource = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), 'utf8')

describe('director desk camera panel', () => {
  it('exposes global capture binding controls', () => {
    const source = readSource('src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/CameraPanel.tsx')

    expect(source).toContain('bindAllCaptures')
    expect(source).toContain('clearBoundCaptures')
    expect(source).toContain('全部机位绑定')
    expect(source).toContain('清空绑定')
  })
})
