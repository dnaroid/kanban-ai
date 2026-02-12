import { appSettingsRepo } from '../db/app-settings-repository'
import { artifactRepo } from '../db/artifact-repository'
import { boardRepo } from '../db/board-repository'
import { opencodeModelRepo } from '../db/opencode-model-repository'
import { runEventRepo } from '../db/run-event-repository'
import { tagRepo } from '../db/tag-repository'
import { taskRepo } from '../db/task-repository'
import { taskScheduleRepo } from '../db/task-schedule-repository'
import { createRepositoriesModule } from './modules/repositories.module'
import { createServicesModule } from './modules/services.module'
import { createUseCasesModule } from './modules/usecases.module'

export function createAppContainer() {
  const repositories = createRepositoriesModule()
  const services = createServicesModule({
    agentRoleRepo: repositories.agentRoleRepo,
    appSettingsRepo,
    artifactRepo,
    boardRepo,
    opencodeModelRepo,
    runEventRepo,
    tagRepo,
    taskRepo,
    taskScheduleRepo,
  })
  const useCases = createUseCasesModule(repositories, services)

  return {
    ...repositories,
    ...services,
    ...useCases,
  }
}

export type AppContainer = ReturnType<typeof createAppContainer>
