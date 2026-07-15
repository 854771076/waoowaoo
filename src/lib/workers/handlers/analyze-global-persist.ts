import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import {
  asLocationRecordArray,
  extractSubLocationArray,
  isInvalidLocation,
  readText,
  toStringArray,
  type AnalyzeGlobalCharactersData,
  type AnalyzeGlobalLocationsData,
  type AnalyzeGlobalPropsData,
  type CharacterBrief,
} from './analyze-global-parse'
import { seedProjectLocationBackedImageSlots } from '@/lib/assets/services/location-backed-assets'
import { normalizeLocationAvailableSlots } from '@/lib/location-available-slots'
import { resolvePropVisualDescription } from '@/lib/assets/prop-description'

export type AnalyzeGlobalStats = {
  totalChunks: number
  processedChunks: number
  newCharacters: number
  updatedCharacters: number
  newLocations: number
  newProps: number
  skippedCharacters: number
  skippedLocations: number
  skippedSubLocations: number
  skippedProps: number
}

export type ExistingMacroLocationBrief = {
  id: string
  name: string
}

export function createAnalyzeGlobalStats(totalChunks: number): AnalyzeGlobalStats {
  return {
    totalChunks,
    processedChunks: 0,
    newCharacters: 0,
    updatedCharacters: 0,
    newLocations: 0,
    newProps: 0,
    skippedCharacters: 0,
    skippedLocations: 0,
    skippedSubLocations: 0,
    skippedProps: 0,
  }
}

export async function persistAnalyzeGlobalChunk(params: {
  projectInternalId: string
  charactersData: AnalyzeGlobalCharactersData
  locationsData: AnalyzeGlobalLocationsData
  propsData: AnalyzeGlobalPropsData
  existingCharacters: CharacterBrief[]
  existingCharacterNames: string[]
  existingLocationNames: string[]
  existingMacroLocations?: ExistingMacroLocationBrief[]
  existingLocationInfo: string[]
  existingChildPaths?: Set<string>
  existingPropNames: string[]
  stats: AnalyzeGlobalStats
}) {
  for (const char of params.charactersData.new_characters || []) {
    const name = readText(char.name).trim()
    const aliases = toStringArray(char.aliases)
    if (!name) continue

    const nameExists = params.existingCharacterNames.some((item) => item.toLowerCase() === name.toLowerCase())
    const aliasExists = aliases.some((alias) =>
      params.existingCharacterNames.some((item) => item.toLowerCase() === alias.toLowerCase()),
    )
    if (nameExists || aliasExists) {
      params.stats.skippedCharacters += 1
      continue
    }

    try {
      const profileData = {
        role_level: char.role_level,
        archetype: char.archetype,
        personality_tags: toStringArray(char.personality_tags),
        era_period: char.era_period,
        social_class: char.social_class,
        occupation: char.occupation,
        costume_tier: char.costume_tier,
        suggested_colors: toStringArray(char.suggested_colors),
        primary_identifier: char.primary_identifier,
        visual_keywords: toStringArray(char.visual_keywords),
        gender: char.gender,
        age_range: char.age_range,
      }

      const created = await prisma.novelPromotionCharacter.create({
        data: {
          novelPromotionProjectId: params.projectInternalId,
          name,
          aliases: JSON.stringify(aliases),
          introduction: readText(char.introduction),
          profileData: JSON.stringify(profileData),
          profileConfirmed: false,
        },
        select: {
          id: true,
        },
      })

      params.existingCharacters.push({
        id: created.id,
        name,
        aliases,
        introduction: readText(char.introduction),
      })
      params.existingCharacterNames.push(name, ...aliases)
      params.stats.newCharacters += 1
    } catch {
      params.stats.skippedCharacters += 1
    }
  }

  for (const update of params.charactersData.updated_characters || []) {
    const targetName = readText(update.name).trim()
    if (!targetName) continue
    const existing = params.existingCharacters.find((item) => item.name.toLowerCase() === targetName.toLowerCase())
    if (!existing) continue

    try {
      const updateData: Record<string, unknown> = {}
      const updatedIntroduction = readText(update.updated_introduction).trim()
      if (updatedIntroduction) {
        updateData.introduction = updatedIntroduction
        existing.introduction = updatedIntroduction
      }

      const updatedAliases = toStringArray(update.updated_aliases)
      if (updatedAliases.length > 0) {
        const newAliases = updatedAliases.filter(
          (item) => !existing.aliases.some((alias) => alias.toLowerCase() === item.toLowerCase()),
        )
        if (newAliases.length > 0) {
          const merged = [...existing.aliases, ...newAliases]
          updateData.aliases = JSON.stringify(merged)
          existing.aliases = merged
          params.existingCharacterNames.push(...newAliases)
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.novelPromotionCharacter.update({
          where: { id: existing.id },
          data: updateData,
        })
        params.stats.updatedCharacters += 1
      }
    } catch {
      // skip failed update
    }
  }

  const existingChildPaths = params.existingChildPaths ?? new Set<string>()

  for (const loc of asLocationRecordArray(params.locationsData.locations)) {
    const name = readText(loc.name).trim()
    const summary = readText(loc.summary)
    if (!name) continue
    if (isInvalidLocation(name, summary)) {
      params.stats.skippedLocations += 1
      continue
    }

    let macroId: string | null = null
    const existingMacro = params.existingMacroLocations?.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    )
    const macroExists = !!existingMacro
      || params.existingLocationNames.some((item) => item.toLowerCase() === name.toLowerCase())

    if (existingMacro) {
      macroId = existingMacro.id
    } else if (macroExists) {
      const persistedMacro = await prisma.novelPromotionLocation.findFirst({
        where: {
          novelPromotionProjectId: params.projectInternalId,
          name,
          assetKind: 'location',
          sceneType: 'macro',
        },
        select: { id: true, name: true },
      })
      macroId = persistedMacro?.id || null
    } else {
      const macroDescriptionsRaw = Array.isArray(loc.descriptions)
        ? (loc.descriptions as unknown[])
        : (readText(loc.description) ? [readText(loc.description)] : [])
      const macroDescriptions = macroDescriptionsRaw.map((item) => readText(item)).filter(Boolean)
      const cleanMacroDescriptions = macroDescriptions.map((item) => removeLocationPromptSuffix(item))
      const macroSlots = normalizeLocationAvailableSlots(loc.available_slots)

      try {
        const created = await prisma.novelPromotionLocation.create({
          data: {
            novelPromotionProjectId: params.projectInternalId,
            name,
            summary: summary || null,
            sceneType: 'macro',
            parentId: null,
          },
          select: { id: true },
        })
        macroId = created.id

        await seedProjectLocationBackedImageSlots({
          locationId: created.id,
          descriptions: cleanMacroDescriptions.length > 0 ? cleanMacroDescriptions : undefined,
          fallbackDescription: summary || name,
          availableSlots: macroSlots,
        })

        params.existingLocationNames.push(name)
        params.existingMacroLocations?.push({ id: created.id, name })
        params.existingLocationInfo.push(summary ? `${name}(${summary})` : name)
        params.stats.newLocations += 1
      } catch {
        params.stats.skippedLocations += 1
        continue
      }
    }

    if (!macroId) {
      params.stats.skippedLocations += 1
      continue
    }
    const subLocationNamesInThisMacro = new Set<string>()
    for (const sub of extractSubLocationArray(loc)) {
      const subName = readText(sub.name).trim()
      const subSummary = readText(sub.summary)
      if (!subName) continue
      if (isInvalidLocation(subName, subSummary)) {
        params.stats.skippedSubLocations += 1
        continue
      }
      const subKey = subName.toLowerCase()
      if (subLocationNamesInThisMacro.has(subKey)) {
        params.stats.skippedSubLocations += 1
        continue
      }
      const crossChunkKey = `${name.toLowerCase()}/${subKey}`
      if (existingChildPaths.has(crossChunkKey)) {
        params.stats.skippedSubLocations += 1
        continue
      }
      subLocationNamesInThisMacro.add(subKey)

      const subDescriptionsRaw = Array.isArray(sub.descriptions)
        ? (sub.descriptions as unknown[])
        : (readText(sub.description) ? [readText(sub.description)] : [])
      const subDescriptions = subDescriptionsRaw.map((item) => readText(item)).filter(Boolean)
      const cleanSubDescriptions = subDescriptions.map((item) => removeLocationPromptSuffix(item))
      const subSlots = normalizeLocationAvailableSlots(sub.available_slots)

      try {
        const created = await prisma.novelPromotionLocation.create({
          data: {
            novelPromotionProjectId: params.projectInternalId,
            name: subName,
            summary: subSummary || null,
            sceneType: 'micro',
            parentId: macroId,
          },
          select: { id: true },
        })
        await seedProjectLocationBackedImageSlots({
          locationId: created.id,
          descriptions: cleanSubDescriptions.length > 0 ? cleanSubDescriptions : undefined,
          fallbackDescription: subSummary || subName,
          availableSlots: subSlots,
        })
        existingChildPaths.add(crossChunkKey)
        params.existingLocationInfo.push(
          subSummary ? `${name}/${subName}(${subSummary})` : `${name}/${subName}`,
        )
        params.stats.newLocations += 1
      } catch {
        params.stats.skippedSubLocations += 1
      }
    }
  }

  for (const prop of params.propsData.props || []) {
    const name = readText(prop.name).trim()
    const summary = readText(prop.summary).trim()
    const description = resolvePropVisualDescription({
      name,
      summary,
      description: readText(prop.description).trim(),
    })
    if (!name || !summary || !description) {
      params.stats.skippedProps += 1
      continue
    }

    const exists = params.existingPropNames.some((item) => item.toLowerCase() === name.toLowerCase())
    if (exists) {
      params.stats.skippedProps += 1
      continue
    }

    try {
      const created = await prisma.novelPromotionLocation.create({
        data: {
          novelPromotionProjectId: params.projectInternalId,
          name,
          summary,
          assetKind: 'prop',
          sceneType: 'macro',
          parentId: null,
        },
      })
      await seedProjectLocationBackedImageSlots({
        locationId: created.id,
        descriptions: [description],
        fallbackDescription: description,
        availableSlots: [],
      })
      params.existingPropNames.push(name)
      params.stats.newProps += 1
    } catch {
      params.stats.skippedProps += 1
    }
  }
}
