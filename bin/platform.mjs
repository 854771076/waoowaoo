#!/usr/bin/env node

const DEFAULT_API_BASE = 'http://localhost:3000'

function parseArgv(argv) {
  const flags = {}
  const positionals = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }

    const eqIndex = arg.indexOf('=')
    if (eqIndex !== -1) {
      flags[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1)
      continue
    }

    const key = arg.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      flags[key] = true
      continue
    }

    flags[key] = next
    index += 1
  }

  return { flags, positionals }
}

function normalizeApiBase(value) {
  const raw = String(value || DEFAULT_API_BASE).trim()
  return raw.replace(/\/+$/, '') || DEFAULT_API_BASE
}

function buildUrl(apiBase, pathname, searchParams = {}) {
  const url = new URL(pathname, `${normalizeApiBase(apiBase)}/`)
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function createCliError(code, message, extra = {}) {
  const error = new Error(message)
  error.cliError = {
    ok: false,
    code,
    message,
    ...extra,
  }
  return error
}

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    throw createCliError('INVALID_JSON_RESPONSE', 'platform API returned non-JSON response', {
      status: response.status,
      body: text.slice(0, 500),
    })
  }
}

async function fetchJson(url, fetchImpl) {
  let response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    })
  } catch (error) {
    throw createCliError('NETWORK_ERROR', error instanceof Error ? error.message : 'network request failed', {
      url,
    })
  }

  const body = await readJsonResponse(response)
  if (!response.ok) {
    const apiError = body && typeof body === 'object' ? body : {}
    throw createCliError(
      typeof apiError.code === 'string' ? apiError.code : 'PLATFORM_API_ERROR',
      typeof apiError.message === 'string' ? apiError.message : `platform API request failed with ${response.status}`,
      {
        status: response.status,
        url,
      },
    )
  }

  return body
}

function printJson(io, payload) {
  io.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

function printHumanList(io, body) {
  const skills = Array.isArray(body?.skills) ? body.skills : []
  for (const skill of skills) {
    io.stdout.write(`${skill.id}\t${skill.title}\t${skill.promptUrl}\n`)
  }
  if (body?.selected) {
    io.stdout.write(`\nselected\t${body.selected.id}\t${body.selected.detailUrl}\n`)
  }
}

function printHumanSkill(io, body) {
  const skill = body?.skill
  if (!skill?.manifest) {
    printJson(io, body)
    return
  }

  io.stdout.write(`${skill.manifest.id}\n`)
  io.stdout.write(`${skill.manifest.title}\n`)
  io.stdout.write(`${skill.manifest.description}\n`)
  io.stdout.write(`risk\t${skill.manifest.riskLevel}\n`)
  io.stdout.write(`prompt\t/api/skills/${skill.manifest.id}/prompt\n`)
}

function printHumanPrompt(io, body, raw) {
  if (raw) {
    io.stdout.write(`${body?.prompt || ''}\n`)
    return
  }
  printJson(io, body)
}

function usage() {
  return [
    'Usage:',
    '  platform skills list [--intent <text>] [--api-base <url>] [--json]',
    '  platform skills get --id <skill-id> [--api-base <url>] [--json]',
    '  platform skills prompt --id <skill-id> [--api-base <url>] [--json|--raw]',
    '',
    'Environment:',
    '  PLATFORM_API_BASE  Default API base, fallback http://localhost:3000',
  ].join('\n')
}

async function runPlatformCli({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  io = process,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw createCliError('FETCH_UNAVAILABLE', 'global fetch is unavailable; Node.js >= 18 is required')
  }

  const { flags, positionals } = parseArgv(argv)
  const [resource, action] = positionals
  const apiBase = flags['api-base'] || env.PLATFORM_API_BASE || DEFAULT_API_BASE
  const json = Boolean(flags.json)

  if (flags.help || resource === 'help' || !resource) {
    io.stdout.write(`${usage()}\n`)
    return 0
  }

  if (resource !== 'skills') {
    throw createCliError('UNKNOWN_COMMAND', `unknown command: ${positionals.join(' ') || resource}`, {
      usage: usage(),
    })
  }

  if (action === 'list') {
    const body = await fetchJson(buildUrl(apiBase, '/api/skills', { intent: flags.intent }), fetchImpl)
    if (json) printJson(io, body)
    else printHumanList(io, body)
    return 0
  }

  if (action === 'get') {
    const id = typeof flags.id === 'string' ? flags.id.trim() : ''
    if (!id) throw createCliError('MISSING_REQUIRED_FLAG', '--id is required for skills get')
    const body = await fetchJson(buildUrl(apiBase, `/api/skills/${encodeURIComponent(id)}`), fetchImpl)
    if (json) printJson(io, body)
    else printHumanSkill(io, body)
    return 0
  }

  if (action === 'prompt') {
    const id = typeof flags.id === 'string' ? flags.id.trim() : ''
    if (!id) throw createCliError('MISSING_REQUIRED_FLAG', '--id is required for skills prompt')
    const body = await fetchJson(buildUrl(apiBase, `/api/skills/${encodeURIComponent(id)}/prompt`), fetchImpl)
    if (json) printJson(io, body)
    else printHumanPrompt(io, body, Boolean(flags.raw))
    return 0
  }

  throw createCliError('UNKNOWN_COMMAND', `unknown skills action: ${action || ''}`, {
    usage: usage(),
  })
}

async function main() {
  try {
    const exitCode = await runPlatformCli()
    process.exitCode = exitCode
  } catch (error) {
    const payload = error?.cliError || {
      ok: false,
      code: 'CLI_ERROR',
      message: error instanceof Error ? error.message : 'platform CLI failed',
    }
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main()
}

export {
  buildUrl,
  parseArgv,
  runPlatformCli,
}
