import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

type Handler<TInput, TOutput> = (event: IpcMainInvokeEvent, input: TInput) => Promise<TOutput>

function createValidatedHandler<TInput, TOutput>(
  schema: z.ZodSchema<TInput> | null,
  handler: Handler<TInput, TOutput>
): Handler<TInput, TOutput> {
  return async (event, input) => {
    const validated = schema ? schema.parse(input) : input
    return handler(event, validated as TInput)
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
