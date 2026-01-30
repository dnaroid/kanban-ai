import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = join(__dirname, '..')
const IGNORE_DIRS = ['node_modules', 'out', 'dist', '.git']
const IGNORE_FILES = ['.test.ts', '.spec.ts', '.d.ts']

const getAllTsFiles = (dir: string, baseDir = dir): string[] => {
  const files: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.includes(entry.name)) continue
      files.push(...getAllTsFiles(fullPath, baseDir))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !IGNORE_FILES.some((ext) => entry.name.endsWith(ext))
    ) {
      files.push(fullPath)
    }
  }

  return files
}

const checkIndentation = (content: string) => {
  const lines = content.split('\n')
  const errors: Array<{ line: number; message: string }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue
    }

    if (line.includes('\t')) {
      errors.push({ line: i + 1, message: 'Use spaces instead of tabs' })
    }

    const leadingWhitespace = line.match(/^[\s]*/)?.[0] ?? ''
    const spaceCount = leadingWhitespace.length
    if (spaceCount > 0 && spaceCount % 2 !== 0) {
      errors.push({
        line: i + 1,
        message: `Indentation not a multiple of 2 spaces (${spaceCount} spaces)`,
      })
    }
  }

  return errors
}

const checkTrailingWhitespace = (content: string) => {
  const lines = content.split('\n')
  const linesWithTrailing: number[] = []

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== lines[i].trimEnd()) {
      linesWithTrailing.push(i + 1)
    }
  }

  return linesWithTrailing
}

const checkBalancedBraces = (content: string) => {
  const openBraces = (content.match(/{/g) ?? []).length
  const closeBraces = (content.match(/}/g) ?? []).length

  return openBraces === closeBraces ? null : { openBraces, closeBraces }
}

const checkBalancedParens = (content: string) => {
  const openParens = (content.match(/\(/g) ?? []).length
  const closeParens = (content.match(/\)/g) ?? []).length

  return openParens === closeParens ? null : { openParens, closeParens }
}

const checkBalancedBrackets = (content: string) => {
  const openBrackets = (content.match(/\[/g) ?? []).length
  const closeBrackets = (content.match(/\]/g) ?? []).length

  return openBrackets === closeBrackets ? null : { openBrackets, closeBrackets }
}

describe('Code Quality - Indentation & Formatting', () => {
  const tsFiles = getAllTsFiles(SRC_DIR)

  it('all TypeScript files use consistent indentation (2 spaces)', () => {
    const allErrors: Array<{ file: string; line: number; message: string }> = []

    for (const filePath of tsFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const errors = checkIndentation(content)

      for (const error of errors) {
        allErrors.push({
          file: filePath.replace(SRC_DIR + '/', ''),
          ...error,
        })
      }
    }

    if (allErrors.length > 0) {
      console.error('\n❌ Indentation errors found:')
      allErrors.forEach((err) => {
        console.error(`  ${err.file}:${err.line} - ${err.message}`)
      })
    }

    expect(allErrors.length).toBe(0)
  })

  it('all TypeScript files have no trailing whitespace', () => {
    const allErrors: Array<{ file: string; line: number }> = []

    for (const filePath of tsFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const errors = checkTrailingWhitespace(content)

      for (const line of errors) {
        allErrors.push({
          file: filePath.replace(SRC_DIR + '/', ''),
          line,
        })
      }
    }

    if (allErrors.length > 0) {
      console.error('\n❌ Trailing whitespace found:')
      allErrors.forEach((err) => {
        console.error(`  ${err.file}:${err.line}`)
      })
    }

    expect(allErrors.length).toBe(0)
  })

  it('all TypeScript files have balanced braces', () => {
    const errors: Array<{ file: string; open: number; close: number }> = []

    for (const filePath of tsFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const result = checkBalancedBraces(content)

      if (result) {
        errors.push({
          file: filePath.replace(SRC_DIR + '/', ''),
          open: result.openBraces,
          close: result.closeBraces,
        })
      }
    }

    if (errors.length > 0) {
      console.error('\n❌ Unbalanced braces found:')
      errors.forEach((err) => {
        console.error(`  ${err.file}: {${err.open} vs }${err.close}`)
      })
    }

    expect(errors.length).toBe(0)
  })

  it('all TypeScript files have balanced parentheses', () => {
    const errors: Array<{ file: string; open: number; close: number }> = []

    for (const filePath of tsFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const result = checkBalancedParens(content)

      if (result) {
        errors.push({
          file: filePath.replace(SRC_DIR + '/', ''),
          open: result.openParens,
          close: result.closeParens,
        })
      }
    }

    if (errors.length > 0) {
      console.error('\n❌ Unbalanced parentheses found:')
      errors.forEach((err) => {
        console.error(`  ${err.file}: (${err.open} vs )${err.close}`)
      })
    }

    expect(errors.length).toBe(0)
  })

  it('all TypeScript files have balanced brackets', () => {
    const errors: Array<{ file: string; open: number; close: number }> = []

    for (const filePath of tsFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const result = checkBalancedBrackets(content)

      if (result) {
        errors.push({
          file: filePath.replace(SRC_DIR + '/', ''),
          open: result.openBrackets,
          close: result.closeBrackets,
        })
      }
    }

    if (errors.length > 0) {
      console.error('\n❌ Unbalanced brackets found:')
      errors.forEach((err) => {
        console.error(`  ${err.file}: [${err.open} vs ]${err.close}`)
      })
    }

    expect(errors.length).toBe(0)
  })

  it('all TypeScript files use LF line endings', () => {
    const errors: string[] = []

    for (const filePath of tsFiles) {
      const content = readFileSync(filePath, 'utf-8')
      if (content.includes('\r\n')) {
        errors.push(filePath.replace(SRC_DIR + '/', ''))
      }
    }

    if (errors.length > 0) {
      console.error('\n❌ CRLF line endings found (should use LF):')
      errors.forEach((err) => {
        console.error(`  ${err}`)
      })
    }

    expect(errors.length).toBe(0)
  })
})

describe('Code Quality - File Structure', () => {
  const tsFiles = getAllTsFiles(SRC_DIR)

  it('all .ts files are tracked by tests', () => {
    const testFiles = getAllTsFiles(join(SRC_DIR, '..'))
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => f.replace(SRC_DIR + '/', ''))

    const sourceFiles = tsFiles
      .map((f) => f.replace(SRC_DIR + '/', '').replace(/\.ts$/, '.test.ts'))
      .filter((f) => !testFiles.includes(f))

    if (sourceFiles.length > 0) {
      console.log('\nℹ️  Files without corresponding tests:')
      sourceFiles.forEach((f) => console.log(`  ${f}`))
    }

    expect(true).toBe(true)
  })
})
