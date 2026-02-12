import { ipcHandlers } from '../validation'
import { z } from 'zod'
import { ErrorCode, ok, unwrap } from "../../shared/src/ipc'
import type { SessionEvent } from '../../run/opencode-session-manager'
import { sessionManager } from '../../run/opencode-session-manager'
import { opencodeSessionWorker } from '../../run/opencode-session-worker.js'
import type { AppContext } from '../composition/create-app-context'
import {
  OpenCodeActiveSessionsResponseSchema,
  OpenCodeGenerateUserStoryInputSchema,
  OpenCodeGenerateUserStoryResponseSchema,
  OpenCodeSessionMessagesInputSchema,
  OpenCodeSessionMessagesResponseSchema,
  OpenCodeSessionStatusInputSchema,
  OpenCodeSessionStatusResponseSchema,
  OpenCodeSessionTodosInputSchema,
  OpenCodeSessionTodosResponseSchema,
  OpencodeModelsListResponseSchema,
  OpencodeModelToggleInputSchema,
  OpencodeModelToggleResponseSchema,
  OpencodeModelUpdateDifficultyInputSchema,
  OpencodeModelUpdateDifficultyResponseSchema,
  OpencodeSendMessageInputSchema,
  OpencodeSendMessageResponseSchema,
} from "../../shared/src/types/ipc.js'
import { opencodeExecutor } from '../../run/run-service.js'
import { ipcError } from '../ipc-domain-error'

const rendererSubscriptions = new Map<number, Set<string>>()
const rendererCleanupInstalled = new Set<number>()

const OpenCodeSubscriptionPayloadSchema = z
  .union([z.object({ sessionId: z.string() }), z.object({ sessionID: z.string() })])
  .transform((value) => ({
    sessionId: ('sessionId' in value ? value.sessionId : value.sessionID) as string,
  }))

const rememberRendererSubscription = (rendererId: number, sessionId: string): void => {
  const sessionIds = rendererSubscriptions.get(rendererId) ?? new Set<string>()
  sessionIds.add(sessionId)
  rendererSubscriptions.set(rendererId, sessionIds)
}

const forgetRendererSubscription = (rendererId: number, sessionId: string): void => {
  const sessionIds = rendererSubscriptions.get(rendererId)
  if (!sessionIds) {
    return
  }

  sessionIds.delete(sessionId)
  if (sessionIds.size === 0) {
    rendererSubscriptions.delete(rendererId)
  }
}

const unsubscribeRendererFromSession = async (
  rendererId: number,
  sessionId: string
): Promise<void> => {
  const subscriberId = `renderer:${rendererId}`
  await sessionManager.unsubscribeFromSessionEvents(sessionId, subscriberId)
  forgetRendererSubscription(rendererId, sessionId)
}

export function registerOpenCodeHandlers(context: AppContext): void {
  const {
    createOpencodeClientInstance,
    updateTaskAndEmit,
    getTaskByIdRaw,
    listAllModels,
    listEnabledModels,
    syncSdkModels,
    updateModelEnabled,
    updateModelDifficulty,
  } = context

  ipcHandlers.register(
    'opencode:getSessionStatus',
    OpenCodeSessionStatusInputSchema,
    async (_, input) => {
      const sessionInfo = await sessionManager.getSessionInfo(input.sessionId)
      if (!sessionInfo) {
        throw ipcError(
          ErrorCode.OPENCODE_SESSION_NOT_FOUND,
          `Session not found: ${input.sessionId}`,
          {
            sessionId: input.sessionId,
          }
        )
      }

      return OpenCodeSessionStatusResponseSchema.parse({
        sessionId: input.sessionId,
        runId: input.sessionId,
        status: 'running',
        messageCount: 0,
      })
    }
  )

  ipcHandlers.register('opencode:getActiveSessions', z.object({}), async () => {
    const sessions = sessionManager.getActiveSessions()
    return OpenCodeActiveSessionsResponseSchema.parse({ count: sessions.length })
  })

  ipcHandlers.register(
    'opencode:generateUserStory',
    OpenCodeGenerateUserStoryInputSchema,
    async (_, input) => {
      const previousStatus = getTaskByIdRaw(input.taskId)?.status ?? null
      unwrap(updateTaskAndEmit(input.taskId, { status: 'generating' }))

      try {
        const runId = await opencodeExecutor.generateUserStory(input.taskId)
        return OpenCodeGenerateUserStoryResponseSchema.parse({ runId })
      } catch (error) {
        if (previousStatus) {
          unwrap(updateTaskAndEmit(input.taskId, { status: previousStatus }))
        }
        throw error
      }
    }
  )

  ipcHandlers.register(
    'opencode:getSessionMessages',
    OpenCodeSessionMessagesInputSchema,
    async (_, input) => {
      const messages = await opencodeSessionWorker.getSessionMessages(input.sessionId, input.limit)
      return OpenCodeSessionMessagesResponseSchema.parse({
        sessionId: input.sessionId,
        messages,
      })
    }
  )

  ipcHandlers.register(
    'opencode:getSessionTodos',
    OpenCodeSessionTodosInputSchema,
    async (_, input) => {
      const todos = await sessionManager.getTodos(input.sessionId)
      return OpenCodeSessionTodosResponseSchema.parse({
        sessionId: input.sessionId,
        todos,
      })
    }
  )

  ipcHandlers.register(
    'opencode:subscribeToEvents',
    OpenCodeSubscriptionPayloadSchema,
    async (event, input) => {
      const sessionId = input.sessionId
      const rendererId = event.sender.id
      const subscriberId = `renderer:${rendererId}`
      const existingSessionIds = rendererSubscriptions.get(rendererId)

      if (existingSessionIds?.has(sessionId)) {
        return { ok: true, subscribed: true }
      }

      await sessionManager.subscribeToSessionEvents(
        sessionId,
        subscriberId,
        (sessionEvent: SessionEvent) => {
          event.sender.send('opencode:event', sessionEvent)
        }
      )

      rememberRendererSubscription(rendererId, sessionId)

      if (!rendererCleanupInstalled.has(rendererId)) {
        const cleanup = async () => {
          const sessionIds = rendererSubscriptions.get(rendererId)
          if (!sessionIds) {
            rendererCleanupInstalled.delete(rendererId)
            return
          }

          const unsubscribeTasks = Array.from(sessionIds).map((id) =>
            sessionManager.unsubscribeFromSessionEvents(id, `renderer:${rendererId}`)
          )
          await Promise.allSettled(unsubscribeTasks)
          rendererSubscriptions.delete(rendererId)
          rendererCleanupInstalled.delete(rendererId)
        }

        event.sender.once('destroyed', () => {
          void cleanup()
        })
        event.sender.once('render-process-gone', () => {
          void cleanup()
        })
        rendererCleanupInstalled.add(rendererId)
      }

      return { ok: true, subscribed: true }
    }
  )

  ipcHandlers.register(
    'opencode:unsubscribeFromEvents',
    OpenCodeSubscriptionPayloadSchema,
    async (event, input) => {
      const rendererId = event.sender.id
      const sessionId = input.sessionId
      const sessionIds = rendererSubscriptions.get(rendererId)

      if (!sessionIds?.has(sessionId)) {
        return { ok: true, subscribed: false }
      }

      await unsubscribeRendererFromSession(rendererId, sessionId)
      return { ok: true, subscribed: false }
    }
  )

  ipcHandlers.register(
    'opencode:isSubscribed',
    OpenCodeSubscriptionPayloadSchema,
    async (_, input) => {
      const subscribed = sessionManager.isSubscribedToSessionEvents(input.sessionId)
      return { ok: true, subscribed }
    }
  )

  ipcHandlers.register('opencode:listModels', z.unknown(), async () => {
    return OpencodeModelsListResponseSchema.parse({ models: listAllModels() })
  })

  ipcHandlers.register('opencode:logProviders', z.object({}), async () => {
    await sessionManager.logProviders()
    return ok({ success: true })
  })

  ipcHandlers.register('opencode:listEnabledModels', z.unknown(), async () => {
    return OpencodeModelsListResponseSchema.parse({ models: listEnabledModels() })
  })

  ipcHandlers.register('opencode:refreshModels', z.unknown(), async () => {
    const client = createOpencodeClientInstance()
    const providers = await client.provider.list()
    const allProviders = providers.data?.all || []
    const connected = new Set(providers.data?.connected || [])
    const variantsByModel = new Map<string, Set<string>>()

    for (const provider of allProviders) {
      if (!provider || typeof provider !== 'object') continue
      const providerInfo = provider as {
        id?: string
        models?: Record<string, unknown>
      }

      if (!providerInfo.id || !connected.has(providerInfo.id)) continue

      const models = Object.values(providerInfo.models || {})
      for (const model of models) {
        if (!model || typeof model !== 'object') continue
        const modelInfo = model as {
          id?: string
          variants?: Record<string, unknown>
        }
        if (!modelInfo.id) continue

        const baseName = `${providerInfo.id}/${modelInfo.id}`
        const set = variantsByModel.get(baseName) ?? new Set<string>()
        if (modelInfo.variants) {
          for (const variant of Object.keys(modelInfo.variants)) {
            set.add(variant)
          }
        }
        variantsByModel.set(baseName, set)
      }
    }

    const models = Array.from(variantsByModel.entries()).map(([name, variants]) => ({
      name,
      variants: Array.from(variants).sort(),
    }))

    syncSdkModels(models)
    return OpencodeModelsListResponseSchema.parse({ models: listAllModels() })
  })

  ipcHandlers.register('opencode:toggleModel', OpencodeModelToggleInputSchema, async (_, input) => {
    const updatedModel = updateModelEnabled(input.name, input.enabled)
    if (!updatedModel) {
      throw ipcError(ErrorCode.OPENCODE_MODEL_NOT_FOUND, `Model "${input.name}" not found`, {
        modelName: input.name,
      })
    }

    return OpencodeModelToggleResponseSchema.parse({ model: updatedModel })
  })

  ipcHandlers.register(
    'opencode:updateModelDifficulty',
    OpencodeModelUpdateDifficultyInputSchema,
    async (_, input) => {
      const updatedModel = updateModelDifficulty(input.name, input.difficulty)
      if (!updatedModel) {
        throw ipcError(ErrorCode.OPENCODE_MODEL_NOT_FOUND, `Model "${input.name}" not found`, {
          modelName: input.name,
        })
      }

      return OpencodeModelUpdateDifficultyResponseSchema.parse({ model: updatedModel })
    }
  )

  ipcHandlers.register('opencode:sendMessage', OpencodeSendMessageInputSchema, async (_, input) => {
    await sessionManager.sendPrompt(input.sessionId, input.message)
    return OpencodeSendMessageResponseSchema.parse({ ok: true })
  })
}
