import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { appMetricsRepo } from '../db/app-metrics-repository'
import { toResultError } from './map-error'

type Handler<TInput, TOutput> = (event: IpcMainInvokeEvent, input: TInput) => Promise<TOutput>

function createValidatedHandler<TInput, TOutput>(
  channel: string,
  schema: z.ZodSchema<TInput> | null,
  handler: Handler<TInput, TOutput>
): Handler<TInput, TOutput> {
  return async (event, input) => {
    const startedAt = Date.now()
    let status: 'ok' | 'error' = 'ok'
    try {
      const validated = schema ? schema.parse(input) : input
      return await handler(event, validated as TInput)
    } catch (error) {
      status = 'error'
      const normalized = toResultError(error)
      const message = normalized.ok
        ? '[IPC_ERROR:UNKNOWN] Unknown IPC error'
        : `[IPC_ERROR:${normalized.error.code}] ${normalized.error.message}`
      throw new Error(message)
    } finally {
      const latencyMs = Date.now() - startedAt
      try {
        appMetricsRepo.record('ipc.handler.latency_ms', latencyMs, { channel, status })
      } catch {
        // ignore metrics write errors in IPC path
      }
    }
  }
}

export const ipcHandlers = {
  register<TInput, TOutput>(
    channel: string,
    schema: z.ZodSchema<TInput> | null,
    handler: Handler<TInput, TOutput>
  ) {
    ipcMain.handle(channel, createValidatedHandler(channel, schema, handler))
  },
}

export type { Handler }
