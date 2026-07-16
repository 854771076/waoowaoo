import { describe, expect, it } from 'vitest'
import { buildUrl, parseArgv, runPlatformCli } from '../../../bin/platform.mjs'

function createIo() {
  let stdout = ''
  let stderr = ''
  return {
    io: {
      stdout: {
        write: (chunk: string) => {
          stdout += chunk
          return true
        },
      },
      stderr: {
        write: (chunk: string) => {
          stderr += chunk
          return true
        },
      },
    },
    get stdout() {
      return stdout
    },
    get stderr() {
      return stderr
    },
  }
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status || 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  })
}

function asFetchImpl(fn: (url: string) => Promise<Response>) {
  return fn as unknown as typeof fetch
}

function asCliIo(io: ReturnType<typeof createIo>['io']) {
  return io as unknown as NodeJS.Process
}

function asCliEnv(env: Record<string, string>) {
  return env as NodeJS.ProcessEnv
}

describe('platform CLI', () => {
  it('parses flags and positionals', () => {
    expect(parseArgv(['skills', 'get', '--id', 'platform-agent', '--json'])).toEqual({
      positionals: ['skills', 'get'],
      flags: {
        id: 'platform-agent',
        json: true,
      },
    })
  })

  it('builds stable API urls', () => {
    expect(buildUrl('https://example.com///', '/api/skills', { intent: '创建工作流' })).toBe(
      'https://example.com/api/skills?intent=%E5%88%9B%E5%BB%BA%E5%B7%A5%E4%BD%9C%E6%B5%81',
    )
  })

  it('lists skills as JSON through the public API', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: string) => {
      calls.push(url)
      return jsonResponse({
        version: '1.0.0',
        skills: [{ id: 'platform-agent', title: '平台 Skill 路由器' }],
      })
    }
    const output = createIo()

    const exitCode = await runPlatformCli({
      argv: ['skills', 'list', '--intent', '创建工作流', '--json'],
      env: asCliEnv({ PLATFORM_API_BASE: 'https://platform.test' }),
      fetchImpl: asFetchImpl(fetchImpl),
      io: asCliIo(output.io),
    })

    expect(exitCode).toBe(0)
    expect(calls).toEqual(['https://platform.test/api/skills?intent=%E5%88%9B%E5%BB%BA%E5%B7%A5%E4%BD%9C%E6%B5%81'])
    expect(JSON.parse(output.stdout)).toMatchObject({
      version: '1.0.0',
      skills: [{ id: 'platform-agent' }],
    })
  })

  it('gets skill details by id', async () => {
    const calls: string[] = []
    const output = createIo()

    await runPlatformCli({
      argv: ['skills', 'get', '--id=platform-workflow-creator', '--json', '--api-base', 'https://platform.test'],
      env: asCliEnv({}),
      fetchImpl: asFetchImpl(async (url: string) => {
        calls.push(url)
        return jsonResponse({
          ok: true,
          skill: { manifest: { id: 'platform-workflow-creator' } },
        })
      }),
      io: asCliIo(output.io),
    })

    expect(calls).toEqual(['https://platform.test/api/skills/platform-workflow-creator'])
    expect(JSON.parse(output.stdout).skill.manifest.id).toBe('platform-workflow-creator')
  })

  it('prints prompt raw text when requested', async () => {
    const output = createIo()

    await runPlatformCli({
      argv: ['skills', 'prompt', '--id', 'platform-agent', '--raw'],
      env: asCliEnv({ PLATFORM_API_BASE: 'https://platform.test' }),
      fetchImpl: asFetchImpl(async () => jsonResponse({
        ok: true,
        skillId: 'platform-agent',
        prompt: '你是平台 Skill 路由器',
      })),
      io: asCliIo(output.io),
    })

    expect(output.stdout).toBe('你是平台 Skill 路由器\n')
  })

  it('throws structured errors for missing required flags and API failures', async () => {
    await expect(runPlatformCli({
      argv: ['skills', 'get'],
      fetchImpl: asFetchImpl(async () => jsonResponse({})),
      io: asCliIo(createIo().io),
    })).rejects.toMatchObject({
      cliError: {
        ok: false,
        code: 'MISSING_REQUIRED_FLAG',
      },
    })

    await expect(runPlatformCli({
      argv: ['skills', 'prompt', '--id', 'missing'],
      fetchImpl: asFetchImpl(async () => jsonResponse({ ok: false, code: 'SKILL_NOT_FOUND', message: 'not found' }, { status: 404 })),
      io: asCliIo(createIo().io),
    })).rejects.toMatchObject({
      cliError: {
        ok: false,
        code: 'SKILL_NOT_FOUND',
        status: 404,
      },
    })
  })
})
