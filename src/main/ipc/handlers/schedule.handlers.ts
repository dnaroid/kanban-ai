import { ipcHandlers } from '../validation'
import {
  ScheduleGetInputSchema,
  ScheduleGetResponseSchema,
  ScheduleUpdateInputSchema,
  ScheduleUpdateResponseSchema,
} from '../../../shared/types/ipc.js'
import { taskScheduleRepo } from '../../db/task-schedule-repository'

export function registerScheduleHandlers(): void {
  ipcHandlers.register('schedule:get', ScheduleGetInputSchema, async (_, { projectId }) => {
    const tasks = taskScheduleRepo.listByProject(projectId)
    return ScheduleGetResponseSchema.parse({ tasks })
  })

  ipcHandlers.register('schedule:update', ScheduleUpdateInputSchema, async (_, input) => {
    const schedule = taskScheduleRepo.update(input)
    return ScheduleUpdateResponseSchema.parse({ schedule })
  })
}
