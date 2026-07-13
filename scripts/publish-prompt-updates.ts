/**
 * Publish new prompt versions from lib/prompts/ files for the 17 targets
 * listed in the release notes.
 *
 * Usage: npx tsx scripts/publish-prompt-updates.ts
 *
 * For each (promptId, locale) pair this:
 *   1. reads current content from lib/prompts/<pathStem>.<locale>.txt
 *   2. finds the latest existing version for that definition+locale
 *   3. if the file content differs from the latest version's content,
 *      creates a new version at latest+1 with status=PUBLISHED and the
 *      change note "v2: updated prompts"
 *   4. skips (with a log line) when content is identical — matches the
 *      note that zh agent_storyboard_insert / agent_shot_variant_analysis
 *      are already correct.
 */
import fs from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { PROMPT_CATALOG } from '@/lib/prompt-i18n/catalog'
import { PROMPT_IDS, type PromptId } from '@/lib/prompt-i18n'
import { PROMPT_VERSION_STATUS } from '@/lib/config-center/prompts/types'
import { findMissingPromptVariables } from '@/lib/config-center/prompts/validation'
import { getCatalogVariables } from '@/lib/config-center/prompts/service'

const TARGETS: Array<{ promptId: PromptId; locales: Array<'zh' | 'en'> }> = [
  { promptId: PROMPT_IDS.NP_AGENT_STORYBOARD_PLAN, locales: ['zh', 'en'] },
  { promptId: PROMPT_IDS.NP_AGENT_CINEMATOGRAPHER, locales: ['zh', 'en'] },
  { promptId: PROMPT_IDS.NP_AGENT_ACTING_DIRECTION, locales: ['zh', 'en'] },
  { promptId: PROMPT_IDS.NP_AGENT_STORYBOARD_DETAIL, locales: ['zh', 'en'] },
  { promptId: PROMPT_IDS.NP_PANEL_GRID_IMAGE, locales: ['zh', 'en'] },
  { promptId: PROMPT_IDS.NP_PANEL_GRID_ENHANCE, locales: ['zh', 'en'] },
  { promptId: PROMPT_IDS.NP_SINGLE_PANEL_IMAGE, locales: ['zh', 'en'] },
  { promptId: PROMPT_IDS.NP_PANEL_GRID_VIDEO, locales: ['zh', 'en'] },
  { promptId: PROMPT_IDS.NP_AGENT_STORYBOARD_INSERT, locales: ['en'] },
  { promptId: PROMPT_IDS.NP_AGENT_SHOT_VARIANT_ANALYSIS, locales: ['en'] },
]

const CHANGE_NOTE = 'v2: updated prompts (grid/split/director-desk alignment)'

async function main() {
  const root = process.cwd()
  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const { promptId, locales } of TARGETS) {
    const entry = PROMPT_CATALOG[promptId]
    if (!entry) {
      errors.push(`[MISSING] ${promptId}: not in catalog`)
      continue
    }

    const definition = await prisma.promptDefinition.findUnique({ where: { promptId } })
    if (!definition) {
      errors.push(`[MISSING] ${promptId}: definition not in DB (run seed first)`)
      continue
    }

    for (const locale of locales) {
      const filePath = path.join(root, 'lib', 'prompts', `${entry.pathStem}.${locale}.txt`)
      let content: string
      try {
        content = await fs.readFile(filePath, 'utf8')
      } catch (err) {
        errors.push(`[READ-FAIL] ${promptId} ${locale}: ${(err as Error).message}`)
        continue
      }

      const missing = findMissingPromptVariables(content, getCatalogVariables(promptId))
      if (missing.length > 0) {
        // Catalog-declared vars absent from the new template are safe to leave
        // declared: callers still pass them and buildPrompt simply no-ops on
        // unused vars. Log a warning rather than blocking publish.
        console.log(`[VAR-WARN] ${promptId} ${locale}: template no longer uses ${missing.join(', ')} (callers still pass them; ok)`)
      }

      const latest = await prisma.promptVersion.findFirst({
        where: { promptDefinitionId: definition.id, locale },
        orderBy: { version: 'desc' },
      })

      if (latest && latest.content === content) {
        console.log(`[SKIP] ${promptId} ${locale}: v${latest.version} already up-to-date`)
        skipped++
        continue
      }

      const nextVersion = (latest?.version ?? 0) + 1
      await prisma.promptVersion.create({
        data: {
          promptDefinitionId: definition.id,
          locale,
          version: nextVersion,
          status: PROMPT_VERSION_STATUS.PUBLISHED,
          content,
          changeNote: CHANGE_NOTE,
          publishedAt: new Date(),
        },
      })
      console.log(`[PUBLISH] ${promptId} ${locale}: v${nextVersion} published`)
      created++
    }
  }

  console.log(`\nDone. published=${created} skipped=${skipped} errors=${errors.length}`)
  if (errors.length > 0) {
    console.error('\nErrors:')
    for (const err of errors) console.error('  ' + err)
    process.exitCode = 1
  }

  await prisma.$disconnect()
}

void main()
