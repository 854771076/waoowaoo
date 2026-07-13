import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourcePath = join(
  process.cwd(),
  'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/assets/AddLocationModal.tsx',
)

describe('AddLocationModal local scene art style behavior', () => {
  it('keeps art style selection only for macro scenes', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('const isLocalScene = !!parentId')
    expect(source).toContain('{!isLocalScene && (')
    expect(source).toContain("{t('modal.artStyle')}")
  })

  it('does not submit artStyle when creating a local scene', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('...(!isLocalScene ? { artStyle } : {})')
    expect(source).toContain("sceneType: isLocalScene ? 'micro' : 'macro'")
  })
})
