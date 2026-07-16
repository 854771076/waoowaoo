import { NextRequest, NextResponse } from 'next/server'
import { listPublicSkillSummaries, selectPublicSkillForIntent } from '@/lib/public-skills'

export async function GET(request: NextRequest) {
  const intent = request.nextUrl.searchParams.get('intent')?.trim() || ''
  const selectedSkill = intent ? selectPublicSkillForIntent(intent) : null

  return NextResponse.json({
    version: '1.0.0',
    skills: listPublicSkillSummaries(),
    ...(selectedSkill ? {
      selected: {
        id: selectedSkill.manifest.id,
        title: selectedSkill.manifest.title,
        detailUrl: `/api/skills/${selectedSkill.manifest.id}`,
        promptUrl: `/api/skills/${selectedSkill.manifest.id}/prompt`,
      },
    } : {}),
  })
}
