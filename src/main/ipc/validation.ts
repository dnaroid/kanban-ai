import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

type Handler<TInput, TOutput> = (event: IpcMainInvokeEvent, input: TInput) => Promise<TOutput>

function createValidatedHandler<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  handler: Handler<TInput, TOutput>
): Handler<TInput, TOutput> {
  return async (event, input) => {
    const validated = schema.parse(input)
    return handler(event, validated)
  }
}

export const ipcHandlers = {
  register<TInput, TOutput>(
    channel: string,
    schema: z.ZodSchema<TInput>,
    handler: Handler<TInput, TOutput>
  ) {
    ipcMain.handle(channel, createValidatedHandler(schema, handler))
  },
}

export type { Handler }
