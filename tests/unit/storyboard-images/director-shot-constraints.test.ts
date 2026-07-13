import { describe, expect, it } from 'vitest'
import {
  buildDirectorShotConstraintPrompt,
  extractDirectorShotConstraints,
} from '@/lib/storyboard-images/director-shot-constraints'

describe('director shot constraints', () => {
  const panelContext = {
    panel: {
      director_shot: {
        active_camera: {
          camera_fov: 35,
          camera_position: { x: 1.2, y: 1.6, z: 4.8 },
          camera_target: { x: 0, y: 1.2, z: 0 },
        },
        bound_shots: [
          {
            name: '主机位',
            is_active: true,
            camera_fov: 35,
            camera_position: { x: 1.2, y: 1.6, z: 4.8 },
            camera_target: { x: 0, y: 1.2, z: 0 },
            note: '保持两人对峙构图',
          },
        ],
        characters: [
          {
            name: '顾盼之',
            position: { x: -0.8, y: 0, z: 0.2 },
            facing_deg: 35,
            posture: 'stand',
            render_mode: 'solid',
          },
          {
            name: '陆沉',
            position: { x: 0.9, y: 0, z: -0.1 },
            facing_deg: -25,
            posture: 'lean',
            render_mode: 'solid',
          },
        ],
      },
    },
  }

  it('extracts active camera and character placement constraints from director_shot', () => {
    const constraints = extractDirectorShotConstraints(panelContext)

    expect(constraints).toMatchObject({
      activeCamera: {
        fov: 35,
        position: { x: 1.2, y: 1.6, z: 4.8 },
        target: { x: 0, y: 1.2, z: 0 },
      },
      characters: [
        {
          name: '顾盼之',
          position: { x: -0.8, y: 0, z: 0.2 },
          facingDeg: 35,
          posture: 'stand',
        },
        {
          name: '陆沉',
          position: { x: 0.9, y: 0, z: -0.1 },
          facingDeg: -25,
          posture: 'lean',
        },
      ],
    })
  })

  it('builds a stable prompt that tells generation to keep camera and character positions', () => {
    const prompt = buildDirectorShotConstraintPrompt(panelContext)

    expect(prompt).toContain('导演台站位约束')
    expect(prompt).toContain('FOV 35')
    expect(prompt).toContain('顾盼之：位置 x=-0.8, y=0, z=0.2')
    expect(prompt).toContain('朝向 35°')
    expect(prompt).toContain('陆沉：位置 x=0.9, y=0, z=-0.1')
    expect(prompt).toContain('不得交换人物左右/前后站位')
  })

  it('returns an empty prompt when director_shot is missing or invalid', () => {
    expect(extractDirectorShotConstraints({ panel: {} })).toBeNull()
    expect(buildDirectorShotConstraintPrompt({ panel: {} })).toBe('')
  })
})
