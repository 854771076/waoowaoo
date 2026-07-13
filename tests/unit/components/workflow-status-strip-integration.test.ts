import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function readWorkspaceFile(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('WorkflowStatusStrip integrations', () => {
  it('is wired into the P1 operational surfaces', () => {
    const integrations = [
      {
        path: 'src/app/[locale]/admin/config-center/components/ArtStyleLibraryPanel.tsx',
        titleKey: 'statusStrip.title',
      },
      {
        path: 'src/app/[locale]/admin/config-center/components/PromptLibraryPanel.tsx',
        titleKey: 'statusStrip.title',
      },
      {
        path: 'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceAssetLibraryModal.tsx',
        titleKey: 'statusStrip.title',
      },
      {
        path: 'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/voice-stage/VoiceControlPanel.tsx',
        titleKey: 'statusStrip.title',
      },
    ]

    for (const item of integrations) {
      const source = readWorkspaceFile(item.path)
      expect(source).toContain('WorkflowStatusStrip')
      expect(source).toContain(item.titleKey)
      expect(source).not.toMatch(/title="(?:画风库|提示词管理|资产库|配音生成)"/)
    }
  })
})
