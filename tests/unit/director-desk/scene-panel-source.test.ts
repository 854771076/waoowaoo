import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

const readSource = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), 'utf8')

describe('director desk scene panel', () => {
  it('lets imported panorama assets be switched after import', () => {
    const source = readSource('src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/ScenePanel.tsx')

    expect(source).toContain('const panoramaAssets = importedAssets.filter')
    expect(source).toContain("setSceneField('panoramaAssetId', asset.id)")
    expect(source).toContain("setSceneField('panoramaAssetId', null)")
    expect(source).toContain('设为背景')
    expect(source).toContain('取消背景')
  })
})
