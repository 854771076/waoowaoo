import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

const readSource = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), 'utf8')

describe('director desk object tree panel', () => {
  it('exposes camera management shortcuts from the camera list', () => {
    const source = readSource('src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/ObjectTreePanel.tsx')

    expect(source).toContain('duplicateCamera')
    expect(source).toContain('removeCamera')
    expect(source).toContain('setActiveCamera')
    expect(source).toContain('复制机位')
    expect(source).toContain('删除机位')
    expect(source).toContain('设为激活')
  })

  it('exposes object duplicate and delete shortcuts from object rows', () => {
    const source = readSource('src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/ObjectTreePanel.tsx')

    expect(source).toContain('duplicateObject')
    expect(source).toContain('removeObject')
    expect(source).toContain('复制对象')
    expect(source).toContain('删除对象')
  })

  it('exposes copy paste and delete controls for multi-selected objects', () => {
    const source = readSource('src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/ObjectTreePanel.tsx')

    expect(source).toContain('copySelectedObjects')
    expect(source).toContain('pasteClipboardObjects')
    expect(source).toContain('removeSelectedObjects')
    expect(source).toContain('复制选中')
    expect(source).toContain('粘贴对象')
    expect(source).toContain('删除选中')
  })
})
