import { agentRoleRepo } from '../../db/agent-role-repository'
import { opencodeModelRepo } from '../../db/opencode-model-repository'
import { BoardRepoAdapter } from '../../infra/board/board-repo.adapter'
import { ContextSnapshotRepoAdapter } from '../../infra/context-snapshot/context-snapshot-repo.adapter'
import { ProjectRepoAdapter } from '../../infra/project/project-repo.adapter'
import { RunRepoAdapter } from '../../infra/run/run-repo.adapter'
import { TaskRepoAdapter } from '../../infra/task/task-repo.adapter'

type Difficulty = 'easy' | 'medium' | 'hard' | 'epic'

export function createRepositoriesModule() {
  const projectRepoAdapter = new ProjectRepoAdapter()
  const taskRepoAdapter = new TaskRepoAdapter()
  const runRepoAdapter = new RunRepoAdapter()
  const boardRepoAdapter = new BoardRepoAdapter()
  const contextSnapshotRepoAdapter = new ContextSnapshotRepoAdapter()

  return {
    projectRepoAdapter,
    taskRepoAdapter,
    runRepoAdapter,
    boardRepoAdapter,
    contextSnapshotRepoAdapter,
    agentRoleRepo,
    getModelForDifficulty: (difficulty: Difficulty) =>
      opencodeModelRepo.getModelForDifficulty(difficulty),
  }
}

export type RepositoriesModule = ReturnType<typeof createRepositoriesModule>
