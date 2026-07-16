'use client'

import {
  parseDirectorProject,
  serializeDirectorProject,
  validateDirectorProjectSize,
  type DirectorProject,
} from '@/lib/director-desk/schema'

export function serializeProjectJson(project: DirectorProject): string {
  return JSON.stringify(JSON.parse(serializeDirectorProject(project)), null, 2)
}

export function parseProjectJson(json: string): DirectorProject {
  if (!validateDirectorProjectSize(json)) {
    throw new Error('导演台 JSON 超过 1MB，无法导入')
  }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('导演台 JSON 格式无效')
  }
  const project = parseDirectorProject(raw)
  if (!project) {
    throw new Error('导演台 JSON 不符合当前项目格式')
  }
  return project
}

export function downloadProjectJson(project: DirectorProject, fileName: string) {
  const blob = new Blob([serializeProjectJson(project)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
