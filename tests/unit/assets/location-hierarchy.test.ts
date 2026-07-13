import { describe, expect, it } from 'vitest'
import {
  buildLocationLibList,
  buildLocationPathName,
  formatLocationExistingInfo,
  findLocationAsset,
  assembleLocationDescription,
} from '@/lib/assets/location-hierarchy'
import type { PromptLocationAssetWithParent } from '@/lib/assets/location-hierarchy'

function makeLoc(
  id: string,
  name: string,
  sceneType: 'macro' | 'micro' = 'macro',
  opts: {
    summary?: string | null
    desc?: string
    slots?: string[]
    parentId?: string | null
    parentName?: string | null
  } = {},
): PromptLocationAssetWithParent {
  return {
    id,
    name,
    sceneType,
    summary: opts.summary ?? null,
    parentId: opts.parentId ?? null,
    parentName: opts.parentName ?? null,
    images: [
      {
        isSelected: true,
        description: opts.desc ?? `${name} desc`,
        availableSlots: opts.slots ? JSON.stringify(opts.slots) : null,
      },
    ],
  }
}

describe('buildLocationPathName', () => {
  it('macro returns own name', () => {
    expect(buildLocationPathName('林家老宅', null)).toBe('林家老宅')
  })
  it('micro returns parent/child', () => {
    expect(buildLocationPathName('正堂', '林家老宅')).toBe('林家老宅/正堂')
  })
})

describe('buildLocationLibList', () => {
  it('labels macro and micro correctly', () => {
    const list = buildLocationLibList([
      { name: '林家老宅', sceneType: 'macro' },
      { name: '正堂', sceneType: 'micro', parentName: '林家老宅' },
    ])
    expect(list).toContain('林家老宅（大场景）')
    expect(list).toContain('林家老宅/正堂（局部）')
  })
})

describe('findLocationAsset', () => {
  const macro = makeLoc('1', '林家老宅', 'macro')
  const micro1 = makeLoc('2', '正堂', 'micro', { parentId: '1', desc: '正堂内景' })
  const micro2 = makeLoc('3', '花园', 'micro', { parentId: '1', desc: '花园景色' })
  const locations = [macro, micro1, micro2]

  it('exact match on macro name', () => {
    const result = findLocationAsset(locations, '林家老宅')
    expect(result.found?.name).toBe('林家老宅')
    expect(result.parent).toBeNull()
  })

  it('full path match on micro', () => {
    const result = findLocationAsset(locations, '林家老宅/正堂')
    expect(result.found?.name).toBe('正堂')
    expect(result.parent?.name).toBe('林家老宅')
  })

  it('unique tail name match', () => {
    const result = findLocationAsset(locations, '花园')
    expect(result.found?.name).toBe('花园')
  })

  it('duplicate tail names returns first + logs (no throw)', () => {
    const m1 = makeLoc('10', '书房', 'macro')
    const m2 = makeLoc('11', '书房', 'micro', { parentId: '1' })
    const result = findLocationAsset([m1, m2], '书房')
    expect(result.found).not.toBeNull()
  })

  it('null ref returns not found', () => {
    const result = findLocationAsset(locations, null)
    expect(result.found).toBeNull()
  })
})

describe('assembleLocationDescription', () => {
  it('macro uses own description', () => {
    const loc = makeLoc('1', '林家老宅', 'macro', { desc: '青砖黛瓦大宅院' })
    const text = assembleLocationDescription(loc, null, 'zh')
    expect(text).toContain('青砖黛瓦大宅院')
    expect(text).not.toContain('林家老宅:')
  })

  it('micro concatenates parent description first', () => {
    const parent = makeLoc('1', '林家老宅', 'macro', { desc: '民国江南大宅院' })
    const child = makeLoc('2', '正堂', 'micro', { parentId: '1', desc: '红木桌椅，字画中堂' })
    const text = assembleLocationDescription(child, parent, 'zh')
    const parentIdx = text.indexOf('林家老宅')
    const childIdx = text.indexOf('正堂')
    expect(parentIdx).toBeGreaterThan(-1)
    expect(childIdx).toBeGreaterThan(parentIdx)
    expect(text).toContain('民国江南大宅院')
    expect(text).toContain('红木桌椅，字画中堂')
  })

  it('orphaned micro (parent null) falls back to own description', () => {
    const child = makeLoc('2', '密室', 'micro', { parentId: null, desc: '昏暗密室' })
    const text = assembleLocationDescription(child, null, 'zh')
    expect(text).toContain('昏暗密室')
  })
})

describe('formatLocationExistingInfo', () => {
  it('macro with summary uses name(summary)', () => {
    expect(
      formatLocationExistingInfo({ name: '林家老宅', summary: '江南宅院', sceneType: 'macro' }),
    ).toBe('林家老宅(江南宅院)')
  })
  it('micro with parent uses path', () => {
    expect(
      formatLocationExistingInfo({
        name: '正堂',
        summary: '会客正厅',
        sceneType: 'micro',
        parentName: '林家老宅',
      }),
    ).toBe('林家老宅/正堂(会客正厅)')
  })
  it('no summary returns just name/path', () => {
    expect(formatLocationExistingInfo({ name: '花园', summary: null, sceneType: 'macro' })).toBe(
      '花园',
    )
  })
})
