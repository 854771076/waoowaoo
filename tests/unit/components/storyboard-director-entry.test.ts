import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

const readSource = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), 'utf8')

describe('storyboard director desk entry', () => {
  it('keeps a director desk entry visible in the empty image state', () => {
    const source = readSource('src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSection.tsx')

    expect(source).toContain('openDirectorDesk')
    expect(source).toContain('director-desk?panelId')
    expect(source).toContain("t('directorDesk.button')")
    expect(source).toContain('renderEmptyState')
  })
})
