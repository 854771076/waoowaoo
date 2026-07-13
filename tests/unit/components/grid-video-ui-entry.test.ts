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

    expect(bodySource).not.toContain('generateGridSplitVideo')
    expect(bodySource).not.toContain('regenerateGridSplitVideo')
    expect(bodySource).toContain("t('panelCard.generateVideo')")
    expect(bodySource).toContain("t('panelCard.regenerateVideo')")
    expect(bodySource).toContain('gridSplitVideoHint')
    expect(bodySource).toContain('splitGrid')
    expect(bodySource).toContain('useSplitGridVideo')
    expect(bodySource).toContain('useOriginalGridVideo')
    expect(bodySource).toContain('onGridVideoSourceChange')
    expect(bodySource).toContain('gridVideoSource')
  })

  it('mounts the grid split dialog from the video panel card layout', () => {
    const layoutSource = readSource('src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardLayout.tsx')
    const dialogSource = readSource('src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/GridSplitDialog.tsx')

    expect(layoutSource).toContain('GridSplitDialog')
    expect(layoutSource).toContain('onOpenGridSplit')
    expect(dialogSource).toContain('useSplitGridPanel')
    expect(dialogSource).toContain('toDisplayImageUrl')
    expect(dialogSource).toContain('enhanceAllSplitGrid')
    expect(dialogSource).toContain('enhanceSingleSplitGrid')
    expect(dialogSource).toContain('handleEnhance(image.cellIndex)')
    expect(dialogSource).toContain('startGridSplit')
    expect(dialogSource).toContain('resplitGrid')
  })
})
