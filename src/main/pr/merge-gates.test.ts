import { describe, expect, it } from 'vitest'
import { evaluateMergeGates } from './merge-gates'
import type { PullRequestRecord } from '../db/pull-request-repository'

const buildRecord = (overrides: Partial<PullRequestRecord> = {}): PullRequestRecord => ({
  id: 'pr-1',
  taskId: 'task-1',
  providerPrId: '123',
  title: 'Test PR',
  state: 'open',
  url: 'https://example.com/pr/1',
  baseBranch: 'main',
  headBranch: 'task/1-test',
  ciStatus: 'success',
  approvalsCount: 2,
  requiredApprovals: 1,
  lastSyncedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('merge-gates', () => {
  it('blocks merge when CI is not successful', () => {
    const result = evaluateMergeGates(buildRecord({ ciStatus: 'failed' }))
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('CI is not successful')
  })

  it('blocks merge when approvals are insufficient', () => {
    const result = evaluateMergeGates(buildRecord({ approvalsCount: 0, requiredApprovals: 2 }))
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('Not enough approvals')
  })

  it('blocks merge when PR is draft', () => {
    const result = evaluateMergeGates(buildRecord({ state: 'draft' }))
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('PR is draft')
  })

  it('allows merge when all gates pass', () => {
    const result = evaluateMergeGates(buildRecord())
    expect(result.ok).toBe(true)
  })
})
