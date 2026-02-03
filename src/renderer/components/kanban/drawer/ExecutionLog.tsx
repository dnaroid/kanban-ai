import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronsDown, RefreshCw, Terminal, User } from 'lucide-react'
import { AgentPart, FilePart, ReasoningPart, TextPart, ToolPart } from '../../chat/MessageParts'
import { cn } from '../../../lib/utils'
import type { Part, RunEvent } from '@/shared/types/ipc.ts'
import { LightMarkdown } from '../../LightMarkdown'

export function ExecutionLog({ runId, sessionId }: { runId: string; sessionId: string }) {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastTsRef = useRef<string | null>(null)
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const refreshMessagesRef = useRef<(() => Promise<void>) | null>(null)

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

  const buildMessageEvent: (
    messageId: string,
    message: { role?: string; content?: string; parts?: Part[] },
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
    },
  })

  useEffect(() => {
    const upsertMessageEvent = (payload: {
      id?: string
      role?: string
      content?: string
      parts?: Part[]
    }) => {
      if (!payload?.id) return
      const id = `msg-${payload.id}`
      setEvents((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === id)
        if (existingIndex === -1) {
          seenMessageIdsRef.current.add(id)
          const newEvent = buildMessageEvent(payload.id, payload)
          return [...prev, newEvent].slice(-500)
        }
        const updated = [...prev]
        const existing = updated[existingIndex]
        const updatedEvent = buildMessageEvent(payload.id, payload, existing.ts)
        updated[existingIndex] = updatedEvent
        return updated
      })
    }

    const updateMessagePart = (messageId: string, part: Part) => {
      const id = `msg-${messageId}`
      console.log('[ExecutionLog] updateMessagePart called:', { messageId, partId: part.id, partType: part.type })
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
        const partIndex = existingParts.findIndex((p) => p.id === part.id)
        let newParts: Part[]
        if (partIndex === -1) {
          // Add new part
          console.log('[ExecutionLog] Adding new part to message:', { messageId, partId: part.id, existingPartsCount: existingParts.length })
          newParts = [...existingParts, part]
        } else {
          // Update existing part
          console.log('[ExecutionLog] Updating existing part in message:', { messageId, partId: part.id, partIndex })
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

    const cleanup = window.api.opencode.onEvent(sessionId, (event) => {
      console.log('[ExecutionLog] Received event:', event.type, event)
      if (event.sessionId !== sessionId) {
        console.log('[ExecutionLog] Event sessionId mismatch, ignoring')
        return
      }

      if (event.type === 'message.part.updated') {
        console.log('[ExecutionLog] Processing message.part.updated:', event.messageId, event.part)
        updateMessagePart(event.messageId, event.part)
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
  }, [sessionId])

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
          setEvents((prev) => [...prev, ...response.events].slice(-500))
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
      if (!sessionId || !isActive) return
      try {
        const response = await window.api.opencode.getSessionMessages({
          sessionId,
          limit: 200,
        })
        if (!isActive) return
        if (response.messages.length > 0) {
          setEvents((prev) => {
            const updated = [...prev]
            const indexById = new Map<string, number>()

            updated.forEach((event, index) => {
              indexById.set(event.id, index)
            })

            response.messages.forEach((msg: any) => {
              const id = `msg-${msg.id}`
              const event: RunEvent = {
                id,
                runId: sessionId,
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

            return updated.slice(-500)
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
      if (sessionId) {
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
  }, [runId, sessionId])

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
        <div key={event.id} className="flex gap-3 py-0.5 group">
          <span className="text-[10px] font-mono text-slate-600 mt-1 shrink-0 select-none w-16">
            {time}
          </span>
          <span className="text-xs font-mono text-slate-300 break-all whitespace-pre-wrap">
            {coerceText(event.payload)}
          </span>
        </div>
      )
    }

    if (event.eventType === 'stderr') {
      return (
        <div key={event.id} className="flex gap-3 py-0.5 group bg-red-500/5">
          <span className="text-[10px] font-mono text-red-900/50 mt-1 shrink-0 select-none w-16">
            {time}
          </span>
          <span className="text-xs font-mono text-red-400 break-all whitespace-pre-wrap">
            {coerceText(event.payload)}
          </span>
        </div>
      )
    }

    if (event.eventType === 'message') {
      const messagePayload = event.payload as
        | { role?: string; content?: string; parts?: Part[] }
        | string

      if (typeof messagePayload === 'string') {
        return (
          <div
            key={event.id}
            className="flex gap-3 py-2 px-3 my-1 bg-slate-800/40 border-l-2 border-slate-700/40 rounded-r-lg"
          >
            <span className="text-[10px] font-mono text-slate-600 mt-1 shrink-0 select-none w-16">
              {time}
            </span>
            <div className="flex-1 min-w-0">
              <LightMarkdown
                text={messagePayload}
                className="text-xs text-slate-300 leading-relaxed"
              />
            </div>
          </div>
        )
      }

      const { role = 'assistant', content, parts: messageParts } = messagePayload

      const parts = messageParts && messageParts.length > 0
        ? messageParts
        : content
          ? [{ type: 'text' as const, text: content }]
          : []

      const isUser = role === 'user'

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
                  : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20 animate-pulse'
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
                {isUser ? 'User' : 'Assistant'}
              </span>
              <span className="text-[10px] font-mono text-slate-600/60 select-none">{time}</span>
            </div>
            <div className="space-y-3 text-[13px] leading-relaxed text-slate-200">
              {parts.map((part, idx) => {
                if (part.type === 'text' && part.ignored) return null

                switch (part.type) {
                  case 'reasoning':
                    return <ReasoningPart key={idx} part={part} />
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
      return (
        <div
          key={event.id}
          className="flex gap-3 py-2 px-3 my-1 bg-emerald-500/5 border-l-2 border-emerald-500/30 rounded-r-lg"
        >
          <span className="text-[10px] font-mono text-emerald-500/50 shrink-0 select-none w-16">
            {time}
          </span>
          <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">
            Status Changed: {formatStatusPayload(event.payload)}
          </p>
        </div>
      )
    }

    return (
      <div key={event.id} className="flex gap-3 py-0.5">
        <span className="text-[10px] font-mono text-slate-600 mt-1 shrink-0 select-none w-16">
          {time}
        </span>
        <span className="text-xs font-mono text-slate-400 break-all whitespace-pre-wrap">
          {coerceText(event.payload)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] overflow-hidden relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 custom-scrollbar selection:bg-blue-500/30"
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
          className="absolute bottom-6 right-6 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-full text-[10px] font-bold uppercase tracking-wider shadow-xl shadow-blue-500/20 animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <ChevronsDown className="w-3.5 h-3.5" />
          Jump to End
        </button>
      )}
    </div>
  )
}
