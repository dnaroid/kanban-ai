import { describe, expect, it } from 'vitest'
import { buildTaskBranchName, slugify } from './task-branching'

describe('task-branching', () => {
  it('slugify lowercases and replaces separators', () => {
    expect(slugify('Hello World!')).toBe('hello-world')
    expect(slugify('  Multi   Spaces  ')).toBe('multi-spaces')
    expect(slugify('Symbols*&^%$#@!')).toBe('symbols')
  })

  it('builds branch names with task id and slug', () => {
    expect(buildTaskBranchName('123', 'Fix Bug')).toBe('task/123-fix-bug')
    expect(buildTaskBranchName('abc', '')).toBe('task/abc')
  })
})
