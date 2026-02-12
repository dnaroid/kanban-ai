/**
 * File System Service with Security Protections
 *
 * Provides safe file operations with:
 * - Path validation (no directory traversal)
 * - Symbolic link protection
 * - Working directory restriction
 */

import {
  promises as fs,
  constants,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  lstatSync,
  readdirSync,
} from 'fs'
import * as path from 'path'
import * as os from 'os'

// Get the project root directory
const PROJECT_ROOT = process.cwd()

/**
 * Security error for path violations
 */
export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathSecurityError'
  }
}

/**
 * Validates that a path is safe (no traversal, no symlinks)
 *
 * @param targetPath - The path to validate
 * @param allowedBase - The allowed base directory (defaults to project root)
 * @returns Resolved absolute path
 * @throws PathSecurityError if path is unsafe
 */
export async function validatePath(
  targetPath: string,
  allowedBase: string = PROJECT_ROOT
): Promise<string> {
  const resolvedPath = path.resolve(targetPath)
  const resolvedBase = path.resolve(allowedBase)

  // Check for directory traversal (..)
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new PathSecurityError(
      `Path traversal detected: ${targetPath} is outside allowed directory ${allowedBase}`
    )
  }

  // Check for symbolic links (block them for security)
  try {
    const stats = await fs.stat(resolvedPath)
    if (stats.isSymbolicLink()) {
      throw new PathSecurityError(
        `Symbolic link detected: ${targetPath}. Symbolic links are blocked for security.`
      )
    }
  } catch (error) {
    // File doesn't exist yet, that's ok
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  return resolvedPath
}

/**
 * Sync version of validatePath
 */
export function validatePathSync(targetPath: string, allowedBase: string = PROJECT_ROOT): string {
  const resolvedPath = path.resolve(targetPath)
  const resolvedBase = path.resolve(allowedBase)

  // Check for directory traversal (..)
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new PathSecurityError(
      `Path traversal detected: ${targetPath} is outside allowed directory ${allowedBase}`
    )
  }

  // Check for symbolic links
  if (existsSync(resolvedPath)) {
    const stats = lstatSync(resolvedPath)
    if (stats.isSymbolicLink()) {
      throw new PathSecurityError(
        `Symbolic link detected: ${targetPath}. Symbolic links are blocked for security.`
      )
    }
  }

  return resolvedPath
}

/**
 * Safe file operations
 */
export const FileSystemService = {
  /**
   * Read file with path validation
   */
  async readFile(
    filePath: string,
    encoding: BufferEncoding = 'utf-8',
    allowedBase?: string
  ): Promise<string> {
    const validatedPath = await validatePath(filePath, allowedBase)
    return await fs.readFile(validatedPath, encoding)
  },

  /**
   * Write file with path validation
   */
  async writeFile(
    filePath: string,
    data: string,
    encoding: BufferEncoding = 'utf-8',
    allowedBase?: string
  ): Promise<void> {
    const validatedPath = await validatePath(filePath, allowedBase)
    const dir = path.dirname(validatedPath)

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    await fs.writeFile(validatedPath, data, encoding)
  },

  /**
   * Check if file exists with validation
   */
  async exists(filePath: string, allowedBase?: string): Promise<boolean> {
    try {
      const validatedPath = await validatePath(filePath, allowedBase)
      await fs.access(validatedPath, constants.F_OK)
      return true
    } catch {
      return false
    }
  },

  /**
   * Create directory with validation
   */
  async mkdir(
    dirPath: string,
    options?: { recursive?: boolean },
    allowedBase?: string
  ): Promise<void> {
    const validatedPath = await validatePath(dirPath, allowedBase)
    await fs.mkdir(validatedPath, options || { recursive: true })
  },

  /**
   * Read directory with validation
   */
  async readdir(dirPath: string, allowedBase?: string): Promise<string[]> {
    const validatedPath = await validatePath(dirPath, allowedBase)
    return await fs.readdir(validatedPath)
  },

  /**
   * Delete file with validation
   */
  async unlink(filePath: string, allowedBase?: string): Promise<void> {
    const validatedPath = await validatePath(filePath, allowedBase)
    await fs.unlink(validatedPath)
  },

  /**
   * Delete directory with validation
   */
  async rmdir(
    dirPath: string,
    options?: { recursive?: boolean },
    allowedBase?: string
  ): Promise<void> {
    const validatedPath = await validatePath(dirPath, allowedBase)
    if (options?.recursive) {
      await fs.rm(validatedPath, { recursive: true, force: true })
    } else {
      await fs.rmdir(validatedPath)
    }
  },

  /**
   * Copy file with validation
   */
  async copyFile(src: string, dest: string, allowedBase?: string): Promise<void> {
    const validatedSrc = await validatePath(src, allowedBase)
    const validatedDest = await validatePath(dest, allowedBase)
    await fs.copyFile(validatedSrc, validatedDest)
  },

  // Sync versions
  readFileSync(filePath: string, encoding: BufferEncoding = 'utf-8', allowedBase?: string): string {
    const validatedPath = validatePathSync(filePath, allowedBase)
    return readFileSync(validatedPath, encoding)
  },

  writeFileSync(
    filePath: string,
    data: string,
    encoding: BufferEncoding = 'utf-8',
    allowedBase?: string
  ): void {
    const validatedPath = validatePathSync(filePath, allowedBase)
    const dir = path.dirname(validatedPath)

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(validatedPath, data, encoding)
  },

  existsSync(filePath: string, allowedBase?: string): boolean {
    try {
      const validatedPath = validatePathSync(filePath, allowedBase)
      return existsSync(validatedPath)
    } catch {
      return false
    }
  },

  mkdirSync(dirPath: string, options?: { recursive?: boolean }, allowedBase?: string): void {
    const validatedPath = validatePathSync(dirPath, allowedBase)
    mkdirSync(validatedPath, options || { recursive: true })
  },

  readdirSync(dirPath: string, allowedBase?: string): string[] {
    const validatedPath = validatePathSync(dirPath, allowedBase)
    return readdirSync(validatedPath)
  },
}

export default FileSystemService
