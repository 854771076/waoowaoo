import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

const readSource = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), 'utf8')

describe('grid video frontend entry', () => {
  it('removes the legacy grid video prompt regeneration action from the panel card', () => {
    const bodySource = readSource('src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardBody.tsx')
    const runtimeSource = readSource('src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/videoPanelRuntimeCore.tsx')

    expect(bodySource).not.toContain('onRegenerateGridVideoPrompt')
    expect(bodySource).not.toContain('regenerateGridVideoPrompt')
    expect(runtimeSource).not.toContain('useRegenerateGridVideoPrompt')
    expect(runtimeSource).not.toContain('onRegenerateGridVideoPrompt')
  })

  it('shows grid split video generation as the grid panel video entry', () => {
    const bodySource = readSource('src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardBody.tsx')

    expect(bodySource).toContain('generateGridSplitVideo')
    expect(bodySource).toContain('regenerateGridSplitVideo')
    expect(bodySource).toContain('gridSplitVideoHint')
  })
})
