import type { PullRequestRecord } from '../db/pull-request-repository.js'

export interface MergeGateSettings {
  requireCiSuccess: boolean
  requiredApprovals: number
  allowMergeWhenDraft: boolean
}

export interface MergeGateResult {
  ok: boolean
  reasons: string[]
  settings: MergeGateSettings
}

export const DEFAULT_REQUIRED_APPROVALS = 1
export const DEFAULT_REQUIRE_CI_SUCCESS = true
export const DEFAULT_ALLOW_MERGE_WHEN_DRAFT = false

export const getMergeGateSettings = (record: PullRequestRecord): MergeGateSettings => ({
  requireCiSuccess: DEFAULT_REQUIRE_CI_SUCCESS,
  requiredApprovals: Math.max(record.requiredApprovals, DEFAULT_REQUIRED_APPROVALS),
  allowMergeWhenDraft: DEFAULT_ALLOW_MERGE_WHEN_DRAFT,
})

export const evaluateMergeGates = (record: PullRequestRecord): MergeGateResult => {
  const settings = getMergeGateSettings(record)
  return evaluateMergeGatesWithSettings(record, settings)
}

export const evaluateMergeGatesWithSettings = (
  record: PullRequestRecord,
  settings: MergeGateSettings
): MergeGateResult => {
  const reasons: string[] = []

  if (!settings.allowMergeWhenDraft && record.state === 'draft') {
    reasons.push('PR is draft')
  }

  if (record.state !== 'open' && record.state !== 'draft') {
    reasons.push('PR is not open')
  }

  if (settings.requireCiSuccess && record.ciStatus !== 'success') {
    reasons.push('CI is not successful')
  }

  if (record.approvalsCount < settings.requiredApprovals) {
    reasons.push('Not enough approvals')
  }

  return {
    ok: reasons.length === 0,
    reasons,
    settings,
  }
}
