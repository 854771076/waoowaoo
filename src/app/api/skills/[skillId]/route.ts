import { NextResponse } from 'next/server'
import { getPublicSkill } from '@/lib/public-skills'

export async function GET(
  _request: Request,
  context: { params: Promise<{ skillId: string }> },
) {
  const { skillId } = await context.params
  const skill = getPublicSkill(skillId)
  if (!skill) {
    return NextResponse.json({
      ok: false,
      code: 'SKILL_NOT_FOUND',
      message: `skill not found: ${skillId}`,
    }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    skill,
  })
}
