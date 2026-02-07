import { describe, expect, it } from 'vitest'
import { createAppContext } from '../../main/ipc/composition/create-app-context'

describe('createAppContext', () => {
  it('creates container with core adapters and use-cases', () => {
    const context = createAppContext()

    expect(context.projectRepoAdapter).toBeDefined()
    expect(context.taskRepoAdapter).toBeDefined()
    expect(context.runRepoAdapter).toBeDefined()

    expect(context.createProjectUseCase).toBeDefined()
    expect(context.createTaskUseCase).toBeDefined()
    expect(context.startRunUseCase).toBeDefined()
    expect(context.createOpencodeClientInstance).toBeDefined()
  })
})
