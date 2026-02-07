import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  ChevronsDown,
  Circle,
  HelpCircle,
  RefreshCw,
  Send,
  Terminal,
  User,
  XCircle,
} from 'lucide-react'
import { AgentPart, FilePart, ReasoningPart, TextPart, ToolPart } from '../../chat/MessageParts'
import { cn } from '../../../lib/utils'
import type { OpenCodeMessage, Part, RunEvent } from '@/shared/types/ipc.ts'
import { extractOpencodeStatus } from '@/shared/opencode-status'
import { LightMarkdown } from '../../LightMarkdown'

export function ExecutionLog({
  runId,
  sessionId,
  showReasoning,
}: {
  runId: string
  sessionId: string
  showReasoning?: boolean
}) {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [streamingMessageIds, setStreamingMessageIds] = useState<Set<string>>(new Set())
  const [effectiveSessionId, setEffectiveSessionId] = useState(sessionId)
  const [inputMessage, setInputMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastTsRef = useRef<string | null>(null)
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const refreshMessagesRef = useRef<(() => Promise<void>) | null>(null)
  const streamingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const hiddenUserMessageIdRef = useRef<string | null>(null)

  const coerceText = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (typeof value === 'number') return value.toString()
    if (value === null || value === undefined) return ''
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const formatStatusPayload = (payload: unknown): string => {
    if (!payload || typeof payload !== 'object') return coerceText(payload)
    const typed = payload as { message?: string; status?: string }
    if (typed.message) return typed.message
    if (typed.status) return typed.status
    return coerceText(payload)
  }

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100

      setAutoScroll(isAtBottom)
    }
  }

  const handleJumpToEnd = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }

  const handleSendMessage = async () => {
    const message = inputMessage.trim()
    if (!message || isSending || !effectiveSessionId) return

    setIsSending(true)
    setInputMessage('')

    try {
      await window.api.opencode.sendMessage({ sessionId: effectiveSessionId, message })
      // Message will be received via event subscription
    } catch (error) {
      console.error('Failed to send message:', error)
      setInputMessage(message) // Restore message on error
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  const getPartId = (part: Part): string | undefined => {
    const maybeId = (part as { id?: unknown }).id
    return typeof maybeId === 'string' ? maybeId : undefined
  }

  const buildMessageEvent: (
    messageId: string,
    message: { role?: string; content?: string; parts?: Part[]; modelID?: string },
    ts?: string
  ) => RunEvent = (messageId, message, ts = new Date().toISOString()) => ({
    id: `msg-${messageId}`,
    runId: sessionId,
    ts,
    eventType: 'message',
    payload: {
      role: message.role,
      content: message.content ?? '',
      parts: message.parts ?? [],
      modelID: message.modelID,
    },
  })

  useEffect(() => {
    setEffectiveSessionId(sessionId)
  }, [sessionId])

  useEffect(() => {
    if (effectiveSessionId) return
    let isActive = true
    const pollSessionId = async () => {
      try {
        const response = await window.api.run.get({ runId })
        if (!isActive) return
        if (response.run?.sessionId) {
          setEffectiveSessionId(response.run.sessionId)
          return
        }
      } catch (error) {
        console.error('Failed to resolve session ID:', error)
      }
      if (isActive) {
        setTimeout(pollSessionId, 1000)
      }
    }
    pollSessionId()
    return () => {
      isActive = false
    }
  }, [effectiveSessionId, runId])

  useEffect(() => {
    const upsertMessageEvent = (payload: {
      id?: string
      role?: string
      content?: string
      parts?: Part[]
      modelID?: string
    }) => {
      const payloadId = payload?.id
      if (!payloadId) return
      if (hiddenUserMessageIdRef.current) {
        if (hiddenUserMessageIdRef.current === payloadId) {
          setEvents((prev) => prev.filter((item) => item.id !== `msg-${payloadId}`))
          return
        }
      } else if (payload.role === 'user') {
        hiddenUserMessageIdRef.current = payloadId
        setEvents((prev) => prev.filter((item) => item.id !== `msg-${payloadId}`))
        return
      }
      const id = `msg-${payloadId}`
      setEvents((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === id)
        if (existingIndex === -1) {
          seenMessageIdsRef.current.add(id)
          const newEvent = buildMessageEvent(payloadId, payload)
          const next = [...prev, newEvent]
          return next.slice(-500)
        }
        const updated = [...prev]
        const existing = updated[existingIndex]
        const existingPayload = existing.payload as { parts?: Part[]; role?: string }

        // Preserve accumulated parts if new payload doesn't have parts
        const mergedPayload = {
          ...payload,
          parts:
            payload.parts && payload.parts.length > 0 ? payload.parts : existingPayload.parts || [],
          role: payload.role || existingPayload.role || 'assistant',
        }

        const updatedEvent = buildMessageEvent(payloadId, mergedPayload, existing.ts)
        updated[existingIndex] = updatedEvent
        return updated
      })
    }

    const updateMessagePart = (messageId: string, part: Part) => {
      const id = `msg-${messageId}`
      const partId = getPartId(part)
      console.log('[ExecutionLog] updateMessagePart called:', {
        messageId,
        partId,
        partType: part.type,
      })

      // Mark message as streaming
      setStreamingMessageIds((prev) => new Set(prev).add(messageId))

      // Clear existing timeout for this message
      const existingTimeout = streamingTimeoutsRef.current.get(messageId)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      // Set new timeout to mark message as not streaming after 2 seconds of inactivity
      const timeout = setTimeout(() => {
        setStreamingMessageIds((prev) => {
          const next = new Set(prev)
          next.delete(messageId)
          return next
        })
        streamingTimeoutsRef.current.delete(messageId)
      }, 2000)
      streamingTimeoutsRef.current.set(messageId, timeout)

      setEvents((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === id)
        if (existingIndex === -1) {
          // Message doesn't exist yet, create it with this part
          // Default to 'assistant' role since parts usually come from assistant messages
          console.log('[ExecutionLog] Creating new message with part:', messageId)
          seenMessageIdsRef.current.add(id)
          const newEvent = buildMessageEvent(messageId, { role: 'assistant', parts: [part] })
          return [...prev, newEvent].slice(-500)
        }

        // Update existing message with new/updated part
        const updated = [...prev]
        const existing = updated[existingIndex]
        const existingPayload = existing.payload as { parts?: Part[] }
        const existingParts = existingPayload.parts || []

        // Find if part already exists
        const partIndex = partId ? existingParts.findIndex((p) => getPartId(p) === partId) : -1
        let newParts: Part[]
        if (partIndex === -1) {
          // Add new part
          console.log('[ExecutionLog] Adding new part to message:', {
            messageId,
            partId,
            existingPartsCount: existingParts.length,
          })
          newParts = [...existingParts, part]
        } else {
          // Update existing part
          console.log('[ExecutionLog] Updating existing part in message:', {
            messageId,
            partId,
            partIndex,
          })
          newParts = [...existingParts]
          newParts[partIndex] = part
        }

        const updatedEvent = buildMessageEvent(
          messageId,
          { ...existingPayload, parts: newParts },
          existing.ts
        )
        updated[existingIndex] = updatedEvent
        console.log('[ExecutionLog] Message updated, total parts:', newParts.length)
        return updated
      })
    }

    const removeMessageEvent = (messageId: string) => {
      const id = `msg-${messageId}`
      seenMessageIdsRef.current.delete(id)
      setEvents((prev) => prev.filter((item) => item.id !== id))
    }

    if (!effectiveSessionId) return

    const cleanup = window.api.opencode.onEvent(effectiveSessionId, (event) => {
      console.log('[ExecutionLog] Received event:', event.type, event)
      if (event.sessionId !== effectiveSessionId) {
        console.log('[ExecutionLog] Event sessionId mismatch, ignoring')
        return
      }

      if (event.type === 'message.part.updated') {
        const part = event.part as Part
        console.log('[ExecutionLog] Processing message.part.updated:', event.messageId, part)
        updateMessagePart(event.messageId, part)
        setIsLoading(false)
        return
      }

      if (event.type === 'message.updated') {
        console.log('[ExecutionLog] Processing message.updated:', event.message)
        if (event.message && typeof event.message === 'object') {
          const message = event.message as {
            id?: string
            role?: string
            content?: string
            parts?: Part[]
          }
          upsertMessageEvent(message)
          setIsLoading(false)
        }
        return
      }

      if (event.type === 'message.removed') {
        console.log('[ExecutionLog] Processing message.removed:', event.messageId)
        removeMessageEvent(event.messageId)
        return
      }

      if (event.type === 'error') {
        console.log('[ExecutionLog] Processing error:', event.error)
        void refreshMessagesRef.current?.()
        if (typeof event.error === 'string' && event.error.includes('Session not found')) {
          cleanup()
        }
      }
    })

    return cleanup
  }, [effectiveSessionId])

  useEffect(() => {
    let isActive = true

    const fetchEvents = async () => {
      try {
        const response = await window.api.events.tail({
          runId: runId,
          afterTs: lastTsRef.current ? lastTsRef.current.toString() : undefined,
          limit: 200,
        })
        if (!isActive) return
        if (response.events.length > 0) {
          setEvents((prev) => {
            const next = [...prev, ...response.events]
            return next.slice(-500)
          })
          lastTsRef.current = response.events[response.events.length - 1].ts
        }
      } catch (error) {
        console.error('Failed to fetch events:', error)
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    const fetchSessionMessages = async () => {
      if (!effectiveSessionId || !isActive) return
      try {
        const response = await window.api.opencode.getSessionMessages({
          sessionId: effectiveSessionId,
          limit: 200,
        })
        if (!isActive) return
        if (response.messages.length > 0) {
          if (!hiddenUserMessageIdRef.current) {
            let firstUserMessage: OpenCodeMessage | null = null
            for (const message of response.messages) {
              if (message.role !== 'user') continue
              if (!firstUserMessage || message.timestamp < firstUserMessage.timestamp) {
                firstUserMessage = message
              }
            }
            if (firstUserMessage) {
              hiddenUserMessageIdRef.current = firstUserMessage.id
            }
          }
          setEvents((prev) => {
            const updated = [...prev]
            const indexById = new Map<string, number>()

            updated.forEach((event, index) => {
              indexById.set(event.id, index)
            })

            response.messages.forEach((msg: OpenCodeMessage) => {
              if (hiddenUserMessageIdRef.current === msg.id) {
                return
              }
              const id = `msg-${msg.id}`
              const event: RunEvent = {
                id,
                runId: effectiveSessionId,
                ts: new Date(msg.timestamp).toISOString(),
                eventType: 'message',
                payload: {
                  role: msg.role,
                  content: msg.content,
                  parts: msg.parts,
                },
              }

              seenMessageIdsRef.current.add(id)

              const existingIndex = indexById.get(id)
              if (existingIndex === undefined) {
                updated.push(event)
                indexById.set(id, updated.length - 1)
                return
              }

              updated[existingIndex] = {
                ...updated[existingIndex],
                ts: event.ts,
                payload: event.payload,
              }
            })

            const hiddenId = hiddenUserMessageIdRef.current
            const filtered = hiddenId
              ? updated.filter((event) => event.id !== `msg-${hiddenId}`)
              : updated
            return filtered.slice(-500)
          })
        }
      } catch (error) {
        console.error('Failed to fetch session messages:', error)
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    const loadInitial = async () => {
      if (effectiveSessionId) {
        await fetchSessionMessages()
      }
      await fetchEvents()
    }

    refreshMessagesRef.current = fetchSessionMessages
    loadInitial()
    const interval = setInterval(fetchEvents, 1500)
    return () => {
      isActive = false
      refreshMessagesRef.current = null
      clearInterval(interval)
    }
  }, [runId, effectiveSessionId])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events, autoScroll])

  const renderEvent = (event: RunEvent) => {
    const time = new Date(event.ts).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    if (event.eventType === 'stdout') {
      return (
        <div key={event.id} className="flex gap-3 py-0.5 px-4 group justify-between items-start">
          <span className="text-xs font-mono text-slate-300 break-all whitespace-pre-wrap flex-1">
            {coerceText(event.payload)}
          </span>
          <span className="text-[10px] font-mono text-slate-600 mt-1 shrink-0 select-none">
            {time}
          </span>
        </div>
      )
    }

    if (event.eventType === 'stderr') {
      return (
        <div
          key={event.id}
          className="flex gap-3 py-0.5 px-4 group bg-red-500/5 justify-between items-start"
        >
          <span className="text-xs font-mono text-red-400 break-all whitespace-pre-wrap flex-1">
            {coerceText(event.payload)}
          </span>
          <span className="text-[10px] font-mono text-red-900/50 mt-1 shrink-0 select-none">
            {time}
          </span>
        </div>
      )
    }

    if (event.eventType === 'message') {
      const messagePayload = event.payload as
        | { role?: string; content?: string; parts?: Part[]; modelID?: string }
        | string

      if (typeof messagePayload === 'string') {
        return (
          <div
            key={event.id}
            className="flex gap-3 py-2 px-3 my-1 bg-slate-800/40 border-l-2 border-slate-700/40 rounded-r-lg justify-between items-start"
          >
            <div className="flex-1 min-w-0">
              <LightMarkdown
                text={messagePayload}
                className="text-xs text-slate-300 leading-relaxed"
              />
            </div>
            <span className="text-[10px] font-mono text-slate-600 mt-1 shrink-0 select-none">
              {time}
            </span>
          </div>
        )
      }

      const { role = 'assistant', content, parts: messageParts, modelID } = messagePayload

      const parts =
        messageParts && messageParts.length > 0
          ? messageParts
          : content
            ? [{ type: 'text' as const, text: content }]
            : []

      const isUser = role === 'user'

      // Extract messageId from event.id (format: "msg-<messageId>")
      const messageId = event.id.replace(/^msg-/, '')
      const isStreaming = streamingMessageIds.has(messageId)

      return (
        <div
          key={event.id}
          className={cn(
            'flex gap-4 p-4 my-3 rounded-xl border transition-all duration-200 group',
            isUser
              ? 'bg-gradient-to-br from-blue-500/[0.01] to-transparent border-blue-500/5 hover:border-blue-500/15'
              : 'bg-gradient-to-br from-slate-500/[0.01] to-transparent border-slate-800/30 hover:border-slate-700/40'
          )}
        >
          <div className="shrink-0 pt-0.5">
            <div
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3',
                isUser
                  ? 'bg-gradient-to-br from-violet-500 to-indigo-600 shadow-indigo-500/20'
                  : cn(
                      'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20',
                      (isStreaming || parts.length === 0) && 'animate-pulse'
                    )
              )}
            >
              {isUser ? (
                <User className="w-4 h-4 text-white" />
              ) : (
                <Bot className="w-4 h-4 text-white" />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-widest select-none',
                  isUser ? 'text-indigo-400/80' : 'text-blue-500/80'
                )}
              >
                {isUser ? 'User' : modelID || 'Assistant'}
              </span>
              <span className="text-[10px] font-mono text-slate-600/60 select-none">{time}</span>
            </div>
            <div className="space-y-3 text-[13px] leading-relaxed text-slate-200">
              {parts.map((part, idx) => {
                if (part.type === 'text' && part.ignored) return null

                switch (part.type) {
                  case 'reasoning':
                    return <ReasoningPart key={idx} part={part} expanded={showReasoning} />
                  case 'tool':
                    return <ToolPart key={idx} part={part} />
                  case 'file':
                    return <FilePart key={idx} part={part} />
                  case 'agent':
                    return <AgentPart key={idx} part={part} />
                  case 'text':
                    return <TextPart key={idx} part={part} />
                  default:
                    return null
                }
              })}
            </div>
          </div>
        </div>
      )
    }

    if (event.eventType === 'status') {
      const payloadText = formatStatusPayload(event.payload)

      const extracted = extractOpencodeStatus(payloadText.trim())
      if (extracted) {
        const status = extracted.status
        const config = {
          done: {
            icon: CheckCircle2,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            label: 'DONE',
          },
          fail: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'FAIL' },
          question: {
            icon: HelpCircle,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            label: 'QUESTION',
          },
        }[status as 'done' | 'fail' | 'question'] || {
          icon: Circle,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          label: status.toUpperCase(),
        }

        return (
          <div
            key={event.id}
            className={cn(
              'flex gap-3 py-1 px-4 group justify-between items-center border-y border-white/5',
              config.bg
            )}
          >
            <div className="flex items-center gap-2 flex-1">
              <config.icon className={cn('w-3.5 h-3.5', config.color)} />
              <span
                className={cn('text-xs font-mono font-bold uppercase tracking-wider', config.color)}
              >
                Session {config.label}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-500 shrink-0 select-none">
              {time}
            </span>
          </div>
        )
      }

      return null
    }

    return (
      <div key={event.id} className="flex gap-3 py-0.5 px-4 justify-between items-start">
        <span className="text-xs font-mono text-slate-400 break-all whitespace-pre-wrap flex-1">
          {coerceText(event.payload)}
        </span>
        <span className="text-[10px] font-mono text-slate-600 mt-1 shrink-0 select-none">
          {time}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] overflow-hidden">
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto p-4 custom-scrollbar selection:bg-blue-500/30"
        >
          {isLoading && events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-50">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <p className="text-xs text-slate-400 font-medium font-mono uppercase tracking-widest text-center">
                Initializing Stream...
              </p>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full space-y-2 opacity-30">
              <Terminal className="w-8 h-8" />
              <p className="text-xs text-slate-400 font-mono">No events captured yet</p>
            </div>
          ) : (
            <div className="space-y-0.5">{events.map(renderEvent)}</div>
          )}
        </div>

        {!autoScroll && (
          <button
            onClick={handleJumpToEnd}
            className="absolute bottom-6 right-6 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-full text-[10px] font-bold uppercase tracking-wider shadow-xl shadow-blue-500/20 animate-in fade-in slide-in-from-bottom-2 duration-300 z-10"
          >
            <ChevronsDown className="w-3.5 h-3.5" />
            Jump to End
          </button>
        )}
      </div>

      <div className="border-t border-slate-800/40 bg-[#11151C]/40 backdrop-blur-xl px-4 py-3 shrink-0 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/10 to-transparent" />

        <div className="relative flex items-end w-full bg-[#161B26] border border-slate-700 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/50 shadow-xl shadow-black/20 overflow-hidden transition-all duration-200">
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type a message to send to the assistant..."
            disabled={isSending || !effectiveSessionId}
            className="w-full min-h-[52px] max-h-[200px] pl-4 pr-14 py-4 bg-transparent border-none focus:outline-none focus:ring-0 text-sm text-slate-200 placeholder:text-slate-600 font-medium resize-none custom-scrollbar disabled:opacity-50 disabled:cursor-not-allowed"
            rows={1}
            style={{ height: '52px' }}
          />

          <div className="absolute right-2 bottom-2">
            <button
              onClick={handleSendMessage}
              disabled={isSending || !inputMessage.trim() || !effectiveSessionId}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200',
                isSending || !inputMessage.trim() || !effectiveSessionId
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95'
              )}
              title={isSending ? 'Sending...' : 'Send message'}
            >
              {isSending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4 ml-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
