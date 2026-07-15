const MAX_DEPTH = 6
const DATA_URL_BASE64_PATTERN = /^data:([^;,]+);base64,/i
const LONG_BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/
const LONG_BASE64_MIN_LENGTH = 512

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value == null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function shouldRedact(key: string, redactKeys: string[]): boolean {
  const lower = key.toLowerCase()
  return redactKeys.some((needle) => lower.includes(needle))
}

function summarizeLargeEncodedString(value: string): unknown {
  const dataUrlMatch = DATA_URL_BASE64_PATTERN.exec(value)
  if (dataUrlMatch) {
    return {
      kind: 'data-url',
      mimeType: dataUrlMatch[1],
      length: value.length,
      preview: value.slice(0, 64),
    }
  }

  if (value.length >= LONG_BASE64_MIN_LENGTH && LONG_BASE64_PATTERN.test(value)) {
    return {
      kind: 'base64',
      length: value.length,
      preview: value.slice(0, 32),
    }
  }

  return value
}

export function redactValue(value: unknown, redactKeys: string[], depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[MaxDepth]'
  if (value == null) return value

  if (typeof value === 'string') {
    return summarizeLargeEncodedString(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, redactKeys, depth + 1))
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      if (shouldRedact(key, redactKeys)) {
        output[key] = '[REDACTED]'
      } else {
        output[key] = redactValue(nested, redactKeys, depth + 1)
      }
    }
    return output
  }

  return value
}
