const SECRET_KEY_PATTERN = /password|passwd|pwd|secret|token|api[_-]?key|apikey|auth/i

export const DENYLIST_PATTERNS: RegExp[] = [
  /(^|\/|\\)\.env$/i,
  /\.key$/i,
  /id_rsa/i,
  /secrets\./i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.crt$/i,
  /\.cer$/i,
  /\.der$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /credentials\./i,
  /\.credentials$/i,
  /auth\./i,
  /\.auth$/i,
  /config\..*\.json$/i,
  /\.aws\/(credentials|config)/i,
  /\.azure\//i,
  /\.kube\/config/i,
]

const REDACT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  {
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: 'Bearer [REDACTED]',
  },
  {
    pattern: /Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/gi,
    replacement: 'Authorization: Basic [REDACTED]',
  },
  {
    pattern: /gh[pousr]_[A-Za-z0-9]{36}/g,
    replacement: '[REDACTED_GH_TOKEN]',
  },
  {
    pattern: /github_pat_[A-Za-z0-9_]{22,}/g,
    replacement: '[REDACTED_GH_TOKEN]',
  },
  {
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    replacement: '[REDACTED_SLACK]',
  },
  {
    pattern: /sk-[A-Za-z0-9]{20,}/g,
    replacement: '[REDACTED_KEY]',
  },
  {
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  {
    pattern: /AIza[0-9A-Za-z\-_]{35}/g,
    replacement: '[REDACTED_GOOGLE_KEY]',
  },
  {
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: '[REDACTED_JWT]',
  },
  {
    pattern: /\/\/[^/\s:@]+:[^@/\s]+@/g,
    replacement: '//[REDACTED]:[REDACTED]@',
  },
  {
    pattern: /((?:api[_-]?key|apikey|token|secret|password|passwd|pwd)\s*[:=]\s*)['"]?([^'"\s]+)/gi,
    replacement: '$1[REDACTED]',
  },
]

export const isDeniedPath = (filePath: string): boolean => {
  const normalized = filePath.replace(/\\/g, '/')
  return DENYLIST_PATTERNS.some((pattern) => pattern.test(normalized))
}

export const redactText = (value: string): string => {
  let redacted = value
  REDACT_PATTERNS.forEach(({ pattern, replacement }) => {
    redacted = redacted.replace(pattern, replacement)
  })
  return redacted
}

const redactKeyValue = (key: string, value: unknown) => {
  if (!SECRET_KEY_PATTERN.test(key)) return value
  return '[REDACTED]'
}

export const redactValue = (value: unknown, seen = new WeakSet<object>()): any => {
  if (typeof value === 'string') {
    return redactText(value)
  }
  if (value === null || value === undefined) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen))
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return value
    seen.add(value as object)
    const result: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      const sanitized = redactKeyValue(key, val)
      result[key] = redactValue(sanitized, seen)
    })
    return result
  }
  return value
}

export const buildSafeSpawnEnv = (): NodeJS.ProcessEnv => {
  if (process.env.OPENCODE_SAFE_MODE === '0') {
    return { ...process.env }
  }

  return {
    ...process.env,
    OPENCODE_SAFE_MODE: process.env.OPENCODE_SAFE_MODE ?? '1',
    OPENCODE_DENYLIST: DENYLIST_PATTERNS.map((pattern) => pattern.source).join(','),
  }
}
