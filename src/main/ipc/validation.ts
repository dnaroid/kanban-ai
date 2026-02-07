import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { toResultError } from './map-error'

type Handler<TInput, TOutput> = (event: IpcMainInvokeEvent, input: TInput) => Promise<TOutput>

function createValidatedHandler<TInput, TOutput>(
  schema: z.ZodSchema<TInput> | null,
  handler: Handler<TInput, TOutput>
): Handler<TInput, TOutput> {
  return async (event, input) => {
    try {
      const validated = schema ? schema.parse(input) : input
      return await handler(event, validated as TInput)
    } catch (error) {
      const normalized = toResultError(error)
      const message = normalized.ok
        ? '[IPC_ERROR:UNKNOWN] Unknown IPC error'
        : `[IPC_ERROR:${normalized.error.code}] ${normalized.error.message}`
      throw new Error(message)
    }
  }
}

export const ipcHandlers = {
  register<TInput, TOutput>(
    channel: string,
    schema: z.ZodSchema<TInput> | null,
    handler: Handler<TInput, TOutput>
  ) {
    ipcMain.handle(channel, createValidatedHandler(schema, handler))
  },
}

export type { Handler }
