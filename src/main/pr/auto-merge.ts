import { autoMergeSettingsRepo } from '../db/auto-merge-settings-repository.js'
import { projectRepo } from '../db/project-repository.js'
import { pullRequestRepo } from '../db/pull-request-repository.js'
import { taskRepo } from '../db/task-repository.js'
import { evaluateMergeGatesWithSettings, type MergeGateSettings } from './merge-gates.js'
import { mergePullRequest, refreshOpenPullRequests } from './pr-service.js'

let autoMergeInterval: NodeJS.Timeout | null = null

const buildGateOverrides = (settings: {
  requireCiSuccess: boolean
  requiredApprovals: number
}): MergeGateSettings => ({
  requireCiSuccess: settings.requireCiSuccess,
  requiredApprovals: settings.requiredApprovals,
  allowMergeWhenDraft: false,
})

export const runAutoMergeOnce = async (projectId: string) => {
  const settings = autoMergeSettingsRepo.getByProjectId(projectId)
  if (!settings || !settings.enabled) {
    return { mergedCount: 0, conflictsCount: 0 }
  }

  await refreshOpenPullRequests()

  const gateOverrides = buildGateOverrides(settings)
  const prs = pullRequestRepo.listOpen()
  let mergedCount = 0
  let conflictsCount = 0

  for (const pr of prs) {
    const task = taskRepo.getById(pr.taskId)
    if (!task || task.projectId !== projectId) continue

    const gateResult = evaluateMergeGatesWithSettings(pr, gateOverrides)
    if (!gateResult.ok) continue

    try {
      const result = await mergePullRequest({
        taskId: pr.taskId,
        method: settings.method,
        gateOverrides,
      })

      if (result.ok) {
        mergedCount += 1
        continue
      }
      if (result.conflictId && settings.requireNoConflicts) {
        conflictsCount += 1
      }
    } catch (err) {
      console.error('[AutoMerge] Failed to merge PR', err)
    }
  }

  return { mergedCount, conflictsCount }
}

export const startAutoMergeScheduler = () => {
  if (autoMergeInterval) return

  autoMergeInterval = setInterval(() => {
    const projects = projectRepo.getAll()
    projects.forEach((project) => {
      runAutoMergeOnce(project.id).catch((err) => {
        console.error('[AutoMerge] Scheduler failed', err)
      })
    })
  }, 30000)
}

export const stopAutoMergeScheduler = () => {
  if (!autoMergeInterval) return
  clearInterval(autoMergeInterval)
  autoMergeInterval = null
}
