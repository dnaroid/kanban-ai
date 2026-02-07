import { ipcHandlers } from '../validation'
import {
  ScheduleGetInputSchema,
  ScheduleGetResponseSchema,
  ScheduleUpdateInputSchema,
  ScheduleUpdateResponseSchema,
} from '../../../shared/types/ipc.js'
import type { AppContext } from '../composition/create-app-context'

export function registerScheduleHandlers(context: AppContext): void {
  const { listScheduleByProject, updateSchedule } = context

  ipcHandlers.register('schedule:get', ScheduleGetInputSchema, async (_, { projectId }) => {
    const tasks = listScheduleByProject(projectId)
    return ScheduleGetResponseSchema.parse({ tasks })
  })

  ipcHandlers.register('schedule:update', ScheduleUpdateInputSchema, async (_, input) => {
    const schedule = updateSchedule(input)
    return ScheduleUpdateResponseSchema.parse({ schedule })
  })
}
