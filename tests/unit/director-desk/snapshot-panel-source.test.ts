import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

const readSource = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), 'utf8')

describe('director desk snapshot panel storyboard boards', () => {
  it('opens a board editor before saving selected storyboard assets', () => {
    const source = readSource('src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/SnapshotPanel.tsx')

    expect(source).toContain('boardEditor')
    expect(source).toContain('saveDirectorStoryboardBoard')
    expect(source).toContain('moveBoardAsset')
    expect(source).toContain('updateBoardItemLayout')
    expect(source).toContain('toggleBoardAsset')
    expect(source).toContain('note: boardEditor.note')
    expect(source).toContain('items: boardEditor.assetIds.map')
    expect(source).toContain('分镜板备注')
    expect(source).toContain('布局参数')
    expect(source).toContain('选择分镜资产')
    expect(source).toContain('上移')
    expect(source).toContain('下移')
  })

  it('lets existing director storyboard boards be edited and deleted', () => {
    const source = readSource('src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/SnapshotPanel.tsx')

    expect(source).toContain('editStoryboardBoard')
    expect(source).toContain('deleteStoryboardBoard')
    expect(source).toContain('removeDirectorStoryboardBoard')
    expect(source).toContain('编辑')
    expect(source).toContain('删除')
  })

  it('renders the latest saved snapshot state after save updates urls', () => {
    const source = readSource('src/app/[locale]/workspace/[projectId]/director-desk/editor/panels/SnapshotPanel.tsx')

    expect(source).toContain('const snapshotForRender = useDirectorStore.getState().project.directorSnapshots?.find')
    expect(source).toContain('snapshot: snapshotForRender')
  })
})
