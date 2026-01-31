import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Bug,
  Check,
  ChevronDown,
  ChevronsDown,
  Clock,
  Edit2,
  Eye,
  FileCode,
  FileJson,
  Files,
  FileText,
  FolderKanban,
  Hash,
  History,
  Link2,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Square,
  Tag,
  Terminal,
  User,
  X,
  Zap,
} from 'lucide-react'
import {
  AgentPart,
  FilePart,
  MessagePartRenderer,
  ReasoningPart,
  TextPart,
  ToolPart,
} from '../chat/MessageParts'
import { cn } from '../../lib/utils'
import type {
  Artifact,
  KanbanTask,
  Part,
  Run,
  RunEvent,
  TaskLink,
  TaskLinkType,
} from '@/shared/types/ipc.ts'

interface TaskDrawerProps {
  task: KanbanTask | null
  isOpen: boolean
  onClose: () => void
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
  columnName?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  parts: Part[]
  timestamp: Date
}

function ArtifactViewer({ artifact }: { artifact: Artifact }) {
  if (artifact.kind === 'json') {
    try {
      const formatted = JSON.stringify(JSON.parse(artifact.content), null, 2)
      return (
        <pre className="text-xs font-mono text-blue-300 whitespace-pre-wrap p-4 bg-slate-900/50 rounded-lg border border-slate-800/50 overflow-auto max-h-full custom-scrollbar selection:bg-blue-500/30">
          {formatted}
        </pre>
      )
    } catch (e) {
      return (
        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap p-4 bg-slate-900/50 rounded-lg border border-slate-800/50 overflow-auto max-h-full custom-scrollbar">
          {artifact.content}
        </pre>
      )
    }
  }

  if (artifact.kind === 'patch') {
    const lines = artifact.content.split('\n')
    return (
      <div className="font-mono text-xs overflow-auto max-h-full custom-scrollbar bg-slate-900/50 rounded-lg border border-slate-800/50 py-2">
        {lines.map((line, i) => {
          let className = 'text-slate-400 px-4 py-0.5 block'
          if (line.startsWith('+'))
            className =
              'text-emerald-400 bg-emerald-500/10 px-4 py-0.5 block border-l-2 border-emerald-500/50'
          if (line.startsWith('-'))
            className = 'text-red-400 bg-red-500/10 px-4 py-0.5 block border-l-2 border-red-500/50'
          if (line.startsWith('@@'))
            className = 'text-blue-400/70 bg-blue-500/10 px-4 py-0.5 block italic'
          if (
            line.startsWith('diff') ||
            line.startsWith('index') ||
            line.startsWith('---') ||
            line.startsWith('+++')
          )
            className = 'text-slate-500 px-4 py-0.5 block font-bold'
          return (
            <span key={i} className={className}>
              {line}
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="text-sm text-slate-300 overflow-auto max-h-full custom-scrollbar p-4 bg-slate-900/50 rounded-lg border border-slate-800/50">
      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed selection:bg-blue-500/30">
        {artifact.content}
      </pre>
    </div>
  )
}

function ArtifactsPanel({ runId }: { runId: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchArtifacts = useCallback(
    async (isAuto = false) => {
      if (!isAuto) setIsLoading(true)
      try {
        const response = await window.api.artifact.list({ runId })
        setArtifacts(response.artifacts)
        if (response.artifacts.length > 0 && !selectedArtifactId) {
          setSelectedArtifactId(response.artifacts[0].id)
        }
      } catch (error) {
        console.error('Failed to fetch artifacts:', error)
      } finally {
        setIsLoading(false)
      }
    },
    [runId, selectedArtifactId]
  )

  useEffect(() => {
    fetchArtifacts()
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedArtifactId) return
    let isActive = true
    const fetchContent = async () => {
      try {
        const response = await window.api.artifact.get({ artifactId: selectedArtifactId })
        if (!isActive) return
        setSelectedArtifact(response.artifact)
      } catch (error) {
        console.error('Failed to fetch artifact content:', error)
      }
    }
    fetchContent()
    return () => {
      isActive = false
    }
  }, [selectedArtifactId])

  if (isLoading && artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-50">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <p className="text-xs text-slate-400 font-mono uppercase tracking-widest">
          Loading Artifacts...
        </p>
      </div>
    )
  }

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-2 opacity-30">
        <Files className="w-8 h-8" />
        <p className="text-xs text-slate-400 font-mono">No artifacts found for this run</p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden animate-in fade-in duration-300">
      <div className="w-44 border-r border-slate-800/50 flex flex-col bg-slate-900/10 shrink-0">
        <div className="p-3 border-b border-slate-800/50 bg-slate-800/20 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Files className="w-3 h-3" />
            Items ({artifacts.length})
          </span>
          <button
            onClick={() => fetchArtifacts()}
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-colors"
            title="Refresh artifacts"
          >
            <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {artifacts.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedArtifactId(a.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg transition-all group relative overflow-hidden text-[11px]',
                selectedArtifactId === a.id
                  ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              )}
            >
              <div className="flex items-center gap-2 relative z-10">
                {a.kind === 'json' && <FileJson className="w-3 h-3 shrink-0 opacity-70" />}
                {a.kind === 'patch' && <FileCode className="w-3 h-3 shrink-0 opacity-70" />}
                {a.kind === 'markdown' && <FileText className="w-3 h-3 shrink-0 opacity-70" />}
                <span className="font-medium truncate">{a.title}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col bg-[#0B0E14]/40">
        {selectedArtifact ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-slate-800/30 flex items-center justify-between bg-slate-900/20 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  {selectedArtifact.title}
                </span>
                <span className="text-[9px] font-mono text-slate-500 uppercase px-1.5 py-0.5 bg-slate-800/50 rounded border border-slate-700/50 tracking-tighter">
                  {selectedArtifact.kind}
                </span>
              </div>
              <span className="text-[9px] text-slate-600 font-mono">
                {new Date(selectedArtifact.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <ArtifactViewer artifact={selectedArtifact} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center space-y-2 opacity-30">
            <Eye className="w-8 h-8 text-slate-700" />
            <p className="text-xs text-slate-500 font-mono italic">Select an artifact to view</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ExecutionLog({ runId }: { runId: string }) {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastTsRef = useRef<string | null>(null)

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

  useEffect(() => {
    const cleanup = window.api.opencode.onEvent((event) => {
      if (event.sessionId !== runId) return

      if (event.type === 'message.part.updated') {
        const part = event.part as { id: string }
        const newEvent: RunEvent = {
          id: `msg-part-${event.messageId}-${part.id}`,
          runId,
          ts: new Date().toISOString(),
          eventType: 'stdout',
          payload: event.part,
        }
        setEvents((prev) => [...prev, newEvent].slice(-500))
        setIsLoading(false)
      }
    })

    return cleanup
  }, [runId])

  useEffect(() => {
    let isActive = true

    const fetchEvents = async () => {
      try {
        const response = await window.api.events.tail({
          runId,
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

    fetchEvents()
    const interval = setInterval(fetchEvents, 1500)
    return () => {
      isActive = false
      clearInterval(interval)
    }
  }, [runId])

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
            <span className="text-xs font-mono text-slate-300 break-all whitespace-pre-wrap">
              {messagePayload}
            </span>
          </div>
        )
      }

      const { role = 'assistant', content, parts: messageParts } = messagePayload

      const parts = messageParts || (content ? [{ type: 'text' as const, text: content }] : [])

      const isUser = role === 'user'

      return (
        <div
          key={event.id}
          className={cn(
            'flex gap-4 p-4 my-3 rounded-xl border transition-all duration-200 group',
            isUser
              ? 'bg-blue-500/[0.03] border-blue-500/20 hover:border-blue-500/30 shadow-sm shadow-blue-500/5'
              : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 shadow-sm shadow-black/20'
          )}
        >
          <div className="shrink-0 pt-0.5">
            <div
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3',
                isUser
                  ? 'bg-gradient-to-br from-violet-500 to-indigo-600 shadow-indigo-500/20'
                  : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20'
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

function RunDetailsView({
  runId,
  run,
  onBack,
}: {
  runId: string
  run: Run | null
  onBack: () => void
}) {
  const [view, setView] = useState<'log' | 'artifacts'>('log')

  const statusTone =
    run?.status === 'failed'
      ? 'text-red-400 border-red-500/20 bg-red-500/10'
      : run?.status === 'canceled'
        ? 'text-slate-400 border-slate-500/20 bg-slate-500/10'
        : run?.status === 'queued'
          ? 'text-amber-400 border-amber-500/20 bg-amber-500/10'
          : 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10'

  const statusDot =
    run?.status === 'failed'
      ? 'bg-red-500'
      : run?.status === 'canceled'
        ? 'bg-slate-400'
        : run?.status === 'queued'
          ? 'bg-amber-500'
          : 'bg-emerald-500'

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] overflow-hidden animate-in fade-in duration-300">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50 bg-[#11151C]/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Execution View
            </span>
            <span className="text-xs font-mono text-blue-400/80">{runId.slice(0, 8)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-900/80 rounded-lg p-0.5 border border-slate-800/50 shadow-inner">
            <button
              onClick={() => setView('log')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200',
                view === 'log'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <Terminal className="w-3 h-3" />
              Log
            </button>
            <button
              onClick={() => setView('artifacts')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200',
                view === 'artifacts'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <Files className="w-3 h-3" />
              Artifacts
            </button>
          </div>

          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border',
              statusTone
            )}
          >
            <div
              className={cn(
                'w-1 h-1 rounded-full',
                statusDot,
                run?.status === 'running' && 'animate-pulse'
              )}
            />
            {run?.status ?? 'running'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'log' ? <ExecutionLog runId={runId} /> : <ArtifactsPanel runId={runId} />}
      </div>
    </div>
  )
}

export function TaskDrawer({ task, isOpen, onClose, onUpdate, columnName }: TaskDrawerProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'vcs' | 'runs' | 'chat' | 'properties'>(
    'details'
  )
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [newTag, setNewTag] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)

  // Runs State
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [isLoadingRuns, setIsLoadingRuns] = useState(false)
  const [isStartingRun, setIsStartingRun] = useState(false)
  const [boardTasks, setBoardTasks] = useState<KanbanTask[]>([])
  const [dependencyLinks, setDependencyLinks] = useState<TaskLink[]>([])
  const [dependencyError, setDependencyError] = useState<string | null>(null)
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(false)
  const [isAddingDependency, setIsAddingDependency] = useState(false)
  const [dependencyQuery, setDependencyQuery] = useState('')
  const [dependencyTargetId, setDependencyTargetId] = useState<string | null>(null)
  const [dependencyRelationship, setDependencyRelationship] = useState<
    'blocks' | 'blocked-by' | 'relates' | 'duplicates'
  >('blocks')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [roles, setRoles] = useState<{ id: string; name: string; description?: string }[]>([])
  const [isLoadingRoles, setIsLoadingRoles] = useState(false)

  const initialMessages: ChatMessage[] = [
    {
      id: '1',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'Hi! I can help you work on this task. Ask me questions, request code changes, or discuss implementation details.',
        },
      ],
      // eslint-disable-next-line react-hooks/purity -- Mock data, timestamp is acceptable for initial messages
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
    },
  ]

  // Mock Chat State
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const fetchRuns = async () => {
    if (!task) return
    setIsLoadingRuns(true)
    try {
      const response = await window.api.run.listByTask({ taskId: task.id })
      setRuns(
        response.runs.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      )
    } catch (error) {
      console.error('Failed to fetch runs:', error)
    } finally {
      setIsLoadingRuns(false)
    }
  }

  const fetchRoles = useCallback(async () => {
    setIsLoadingRoles(true)
    try {
      const response = await window.api.roles.list()
      setRoles(response.roles)
      const hasSelected = response.roles.some((role) => role.id === selectedRoleId)
      if (!hasSelected && response.roles.length > 0) {
        setSelectedRoleId(response.roles[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    } finally {
      setIsLoadingRoles(false)
    }
  }, [selectedRoleId])

  const fetchBoardTasks = useCallback(async () => {
    if (!task) return
    try {
      const response = await window.api.task.listByBoard({ boardId: task.boardId })
      setBoardTasks(response.tasks.filter((candidate) => candidate.id !== task.id))
    } catch (error) {
      console.error('Failed to fetch board tasks:', error)
    }
  }, [task])

  const fetchDependencies = useCallback(async () => {
    if (!task) return
    setIsLoadingDependencies(true)
    setDependencyError(null)
    try {
      const response = await window.api.deps.list({ taskId: task.id })
      setDependencyLinks(response.links)
    } catch (error) {
      console.error('Failed to fetch dependencies:', error)
      setDependencyError('Failed to load dependencies')
    } finally {
      setIsLoadingDependencies(false)
    }
  }, [task])

  useEffect(() => {
    if (task) {
      setEditedTitle(task.title)
      setEditedDescription(task.descriptionMd || task.description || '')
      setSelectedRunId(null)
      setDependencyQuery('')
      setDependencyTargetId(null)
      setIsAddingDependency(false)
      fetchBoardTasks()
      fetchDependencies()
      fetchRoles()
    }
  }, [task, fetchBoardTasks, fetchDependencies, fetchRoles])

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    if (isAddingTag && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [isAddingTag])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTab])

  useEffect(() => {
    if (activeTab === 'runs' && task) {
      fetchRuns()
    }
  }, [activeTab, task])

  useEffect(() => {
    if (activeTab === 'runs' && runs.length > 0 && !selectedRunId) {
      setSelectedRunId(runs[0].id)
    }
  }, [activeTab, runs, selectedRunId])

  if (!isOpen || !task) return null

  const dependencyResults = dependencyQuery.trim()
    ? boardTasks
        .filter((candidate) => {
          const haystack = `${candidate.title} ${candidate.tags.join(' ')}`.toLowerCase()
          return haystack.includes(dependencyQuery.toLowerCase())
        })
        .slice(0, 6)
    : []

  const blockedByLinks = dependencyLinks.filter(
    (link) => link.linkType === 'blocks' && link.toTaskId === task.id
  )
  const blocksLinks = dependencyLinks.filter(
    (link) => link.linkType === 'blocks' && link.fromTaskId === task.id
  )
  const relatedLinks = dependencyLinks.filter(
    (link) =>
      link.linkType !== 'blocks' && (link.fromTaskId === task.id || link.toTaskId === task.id)
  )

  const getTaskLabel = (taskId: string) => {
    const match = boardTasks.find((candidate) => candidate.id === taskId)
    return match ? match.title : taskId.slice(0, 8)
  }

  const getOtherTaskId = (link: TaskLink) =>
    link.fromTaskId === task.id ? link.toTaskId : link.fromTaskId

  const handleSaveTitle = () => {
    if (editedTitle.trim() !== task.title && editedTitle.trim() && onUpdate) {
      onUpdate(task.id, { title: editedTitle.trim() })
    } else {
      setEditedTitle(task.title)
    }
    setIsEditingTitle(false)
  }

  const handleSaveDescription = () => {
    if (editedDescription !== (task.descriptionMd || task.description || '') && onUpdate) {
      onUpdate(task.id, {
        descriptionMd: editedDescription,
        description: editedDescription,
      })
    }
  }

  const handleCancelEditTitle = () => {
    setEditedTitle(task.title)
    setIsEditingTitle(false)
  }

  const handleAddTag = () => {
    if (newTag.trim() && !task.tags.includes(newTag.trim()) && onUpdate) {
      onUpdate(task.id, { tags: [...task.tags, newTag.trim()] })
      setNewTag('')
      setIsAddingTag(false)
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    if (onUpdate) {
      onUpdate(task.id, { tags: task.tags.filter((t) => t !== tagToRemove) })
    }
  }

  const handleAddDependency = async () => {
    if (!dependencyTargetId) return
    setDependencyError(null)

    const linkType: TaskLinkType =
      dependencyRelationship === 'blocked-by' ? 'blocks' : dependencyRelationship
    const fromTaskId = dependencyRelationship === 'blocked-by' ? dependencyTargetId : task.id
    const toTaskId = dependencyRelationship === 'blocked-by' ? task.id : dependencyTargetId

    try {
      const response = await window.api.deps.add({ fromTaskId, toTaskId, type: linkType })
      setDependencyLinks((prev) => {
        if (prev.some((link) => link.id === response.link.id)) return prev
        return [...prev, response.link]
      })
      setIsAddingDependency(false)
      setDependencyQuery('')
      setDependencyTargetId(null)
    } catch (error) {
      console.error('Failed to add dependency:', error)
      setDependencyError('Failed to add dependency')
    }
  }

  const handleRemoveDependency = async (linkId: string) => {
    try {
      await window.api.deps.remove({ linkId })
      setDependencyLinks((prev) => prev.filter((link) => link.id !== linkId))
    } catch (error) {
      console.error('Failed to remove dependency:', error)
      setDependencyError('Failed to remove dependency')
    }
  }

  const handleUpdatePriority = (priority: KanbanTask['priority']) => {
    if (onUpdate && priority !== task.priority) {
      onUpdate(task.id, { priority })
    }
  }

  const handleUpdateType = (type: string) => {
    if (onUpdate && type !== task.type) {
      onUpdate(task.id, { type })
    }
  }

  const handleSendMessage = () => {
    if (!chatInput.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      parts: [{ type: 'text', text: chatInput.trim() }],
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setChatInput('')

    // Mock AI Response
    setTimeout(() => {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: `I've received your message. This is a mock response as Phase 2 is under development.`,
          },
          {
            type: 'reasoning',
            text: 'The user is interacting with the mock chat. I should provide a helpful response that demonstrates the new parts system including reasoning and potentially tool calls.',
          },
          {
            type: 'tool',
            callID: 'tool_1',
            tool: 'analyze_task_context',
            state: 'completed',
            input: { taskId: task?.id },
            output: { status: 'success', findings: 'Task is currently in Todo column.' },
          },
        ],
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMessage])
    }, 1000)
  }

  const handleStartRun = async () => {
    if (!task || isStartingRun) return
    setIsStartingRun(true)
    try {
      const response = await window.api.run.start({
        taskId: task.id,
        roleId: selectedRoleId,
        mode: 'execute',
      })
      setSelectedRunId(response.runId)
      await fetchRuns()
    } catch (error) {
      console.error('Failed to start run:', error)
    } finally {
      setIsStartingRun(false)
    }
  }

  const handleCancelRun = async (runId: string) => {
    try {
      await window.api.run.cancel({ runId })
      await fetchRuns()
    } catch (error) {
      console.error('Failed to cancel run:', error)
    }
  }

  const handleRetryRun = async (run: Run) => {
    setIsStartingRun(true)
    try {
      await window.api.run.start({
        taskId: run.taskId,
        roleId: run.roleId,
        mode: run.mode,
      })
      await fetchRuns()
    } catch (error) {
      console.error('Failed to retry run:', error)
    } finally {
      setIsStartingRun(false)
    }
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '—'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const priorityConfig = {
    low: {
      label: 'Low',
      icon: ArrowUpRight,
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20',
    },
    medium: {
      label: 'Medium',
      icon: ArrowUpRight,
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20',
    },
    high: {
      label: 'High',
      icon: AlertTriangle,
      className: 'bg-orange-500/10 text-orange-400 border-orange-500/25 hover:bg-orange-500/20',
    },
    urgent: {
      label: 'Urgent',
      icon: Zap,
      className: 'bg-red-500/10 text-red-400 border-red-500/25 hover:bg-red-500/20 animate-pulse',
    },
  }

  const typeConfig: Record<string, { label: string; icon: any; className: string }> = {
    task: {
      label: 'Task',
      icon: Check,
      className: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
    },
    bug: {
      label: 'Bug',
      icon: Bug,
      className: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
    },
    feature: {
      label: 'Feature',
      icon: Sparkles,
      className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
    },
    default: {
      label: 'Task',
      icon: Check,
      className: 'bg-slate-500/10 text-slate-400 border-slate-500/25',
    },
  }

  const statusConfig = {
    backlog: { label: 'Backlog', className: 'bg-slate-500/10 text-slate-400 border-slate-500/25' },
    todo: { label: 'To Do', className: 'bg-slate-600/20 text-slate-300 border-slate-600/30' },
    'in-progress': {
      label: 'In Progress',
      className: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
    },
    review: { label: 'In Review', className: 'bg-amber-500/10 text-amber-400 border-amber-500/25' },
    done: { label: 'Done', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
    default: { label: 'Active', className: 'bg-slate-500/10 text-slate-400 border-slate-500/25' },
  }

  const runStatusConfig: Record<string, { label: string; className: string; icon: any }> = {
    queued: {
      label: 'Queued',
      className: 'bg-slate-500/10 text-slate-400 border-slate-500/25',
      icon: Clock,
    },
    running: {
      label: 'Running',
      className: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
      icon: RefreshCw,
    },
    succeeded: {
      label: 'Succeeded',
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
      icon: Check,
    },
    failed: {
      label: 'Failed',
      className: 'bg-red-500/10 text-red-400 border-red-500/25',
      icon: AlertTriangle,
    },
    canceled: {
      label: 'Canceled',
      className: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
      icon: X,
    },
  }

  const priority =
    priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium
  const type = typeConfig[task.type as keyof typeof typeConfig] || typeConfig.default
  const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.default

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity duration-300"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] h-[95%] bg-gradient-to-b from-[#0B0E14] to-[#0A0C11] border border-slate-800/50 z-[70] shadow-2xl rounded-3xl flex flex-col animate-in zoom-in-95 duration-300 ease-out overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-800/50 bg-[#11151C]/30 backdrop-blur-xl">
          <div className="flex-1 mr-4">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle()
                    if (e.key === 'Escape') handleCancelEditTitle()
                  }}
                  onBlur={handleSaveTitle}
                  className="flex-1 px-4 py-2.5 bg-[#0B0E14] border-2 border-blue-500/50 rounded-xl text-white text-lg font-semibold focus:outline-none focus:border-blue-500/80 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-600"
                  placeholder="Task title..."
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSaveTitle}
                    className="p-2 text-blue-400 hover:bg-blue-500/15 rounded-xl transition-all hover:scale-105"
                    title="Save"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelEditTitle}
                    className="p-2 text-slate-500 hover:bg-slate-700/50 rounded-xl transition-all hover:scale-105"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="group flex items-start gap-2">
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="flex-1 text-left rounded-lg transition-all hover:bg-slate-800/30 -ml-2 px-2 py-1"
                >
                  <h2 className="text-lg font-semibold text-white leading-tight">{task.title}</h2>
                </button>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-slate-700/50 rounded-xl transition-all opacity-0 group-hover:opacity-100 hover:scale-105"
                  title="Edit title"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-700/50 rounded-xl transition-all hover:scale-105"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800/50 bg-[#0B0E14]">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative',
              activeTab === 'details' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <FileText className="w-4 h-4" />
            Details
            {activeTab === 'details' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('runs')}
            className={cn(
              'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative',
              activeTab === 'runs' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <History className="w-4 h-4" />
            Runs
            {activeTab === 'runs' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative',
              activeTab === 'chat' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Chat
            {activeTab === 'chat' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('properties')}
            className={cn(
              'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative',
              activeTab === 'properties' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <Settings className="w-4 h-4" />
            Properties
            {activeTab === 'properties' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400" />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'details' && (
            <div className="p-6 space-y-8">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold tracking-wide transition-all',
                    status.className
                  )}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {columnName || status.label}
                </span>

                <div className="relative group/select">
                  <select
                    value={task.priority}
                    onChange={(e) => handleUpdatePriority(e.target.value as any)}
                    className={cn(
                      'appearance-none cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 pr-8 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                      priority.className
                    )}
                  >
                    <option value="low" className="bg-[#0B0E14]">
                      Low
                    </option>
                    <option value="medium" className="bg-[#0B0E14]">
                      Medium
                    </option>
                    <option value="high" className="bg-[#0B0E14]">
                      High
                    </option>
                    <option value="urgent" className="bg-[#0B0E14]">
                      Urgent
                    </option>
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-50 group-hover/select:opacity-100 transition-opacity" />
                </div>

                <div className="relative group/select">
                  <select
                    value={task.type}
                    onChange={(e) => handleUpdateType(e.target.value)}
                    className={cn(
                      'appearance-none cursor-pointer inline-flex items-center px-3 py-1.5 pr-8 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                      type.className
                    )}
                  >
                    <option value="task" className="bg-[#0B0E14]">
                      Task
                    </option>
                    <option value="feature" className="bg-[#0B0E14]">
                      Feature
                    </option>
                    <option value="bug" className="bg-[#0B0E14]">
                      Bug
                    </option>
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-50 group-hover/select:opacity-100 transition-opacity" />
                </div>

                <div className="h-4 w-px bg-slate-800/50 mx-1" />

                <div className="flex flex-wrap items-center gap-2">
                  {task.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="group flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800/50 px-2 py-1 rounded-md border border-slate-700/50 hover:bg-slate-800 transition-colors"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  {isAddingTag ? (
                    <div className="flex items-center gap-1 bg-[#0B0E14] border border-blue-500/50 rounded-lg px-2 py-1 animate-in fade-in zoom-in-95 duration-200">
                      <input
                        ref={tagInputRef}
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTag()
                          if (e.key === 'Escape') setIsAddingTag(false)
                        }}
                        onBlur={() => {
                          if (!newTag.trim()) setIsAddingTag(false)
                        }}
                        className="bg-transparent text-[10px] text-white focus:outline-none w-20"
                        placeholder="Tag name..."
                      />
                      <button onClick={handleAddTag} className="text-blue-400 hover:text-blue-300">
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsAddingTag(true)}
                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-all"
                      title="Add tag"
                    >
                      <Tag className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    Description
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsPreviewMode(!isPreviewMode)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded-md hover:bg-slate-800',
                        isPreviewMode
                          ? 'text-blue-400 bg-blue-500/10'
                          : 'text-slate-500 hover:text-slate-300'
                      )}
                      title={isPreviewMode ? 'Edit Mode' : 'Preview Mode'}
                    >
                      {isPreviewMode ? <Edit2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {isPreviewMode ? 'Edit' : 'Preview'}
                    </button>
                    {!isPreviewMode && (
                      <button
                        onClick={handleSaveDescription}
                        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors group px-2 py-1 rounded-md hover:bg-slate-800"
                      >
                        <Check className="w-3 h-3 group-hover:scale-110 transition-transform" />
                        Save
                      </button>
                    )}
                  </div>
                </div>

                {isPreviewMode ? (
                  <div
                    className={cn(
                      'rounded-xl border border-slate-800/50 bg-slate-900/30 p-4 transition-all hover:border-slate-700/50 relative overflow-hidden min-h-[200px]',
                      editedDescription ? '' : 'border-dashed'
                    )}
                  >
                    {editedDescription ? (
                      <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans custom-scrollbar max-h-[500px] overflow-y-auto">
                        {editedDescription}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic text-center py-8">
                        No description provided
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditedDescription(task.descriptionMd || task.description || '')
                        }
                      }}
                      className="w-full min-h-[300px] px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-slate-200 text-sm leading-relaxed focus:outline-none focus:border-blue-500/60 focus:ring-4 focus:ring-blue-500/5 resize-none transition-all placeholder:text-slate-600 custom-scrollbar shadow-inner"
                      placeholder="Add a detailed description..."
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Link2 className="w-3 h-3" />
                    Dependencies
                  </h3>
                  {!isAddingDependency && (
                    <button
                      onClick={() => setIsAddingDependency(true)}
                      className="p-1 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-md transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {dependencyError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {dependencyError}
                  </div>
                )}

                {isLoadingDependencies && (
                  <div className="text-xs text-slate-500">Loading dependencies...</div>
                )}

                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    Blocked by
                  </div>
                  {blockedByLinks.length === 0 ? (
                    <div className="text-xs text-slate-500">No blockers</div>
                  ) : (
                    <div className="space-y-1">
                      {blockedByLinks.map((link) => (
                        <div
                          key={link.id}
                          className="group flex items-center justify-between gap-2 text-xs text-slate-200 bg-slate-800/40 px-3 py-2 rounded-lg border border-slate-700/40"
                        >
                          <span className="truncate">{getTaskLabel(link.fromTaskId)}</span>
                          <button
                            onClick={() => handleRemoveDependency(link.id)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-400 transition-all"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    Blocks
                  </div>
                  {blocksLinks.length === 0 ? (
                    <div className="text-xs text-slate-500">Not blocking any tasks</div>
                  ) : (
                    <div className="space-y-1">
                      {blocksLinks.map((link) => (
                        <div
                          key={link.id}
                          className="group flex items-center justify-between gap-2 text-xs text-slate-200 bg-slate-800/40 px-3 py-2 rounded-lg border border-slate-700/40"
                        >
                          <span className="truncate">{getTaskLabel(link.toTaskId)}</span>
                          <button
                            onClick={() => handleRemoveDependency(link.id)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-400 transition-all"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    Related / Duplicates
                  </div>
                  {relatedLinks.length === 0 ? (
                    <div className="text-xs text-slate-500">No related tasks</div>
                  ) : (
                    <div className="space-y-1">
                      {relatedLinks.map((link) => {
                        const otherTaskId = getOtherTaskId(link)
                        return (
                          <div
                            key={link.id}
                            className="group flex items-center justify-between gap-2 text-xs text-slate-200 bg-slate-800/40 px-3 py-2 rounded-lg border border-slate-700/40"
                          >
                            <span className="truncate">{getTaskLabel(otherTaskId)}</span>
                            <span className="text-[10px] uppercase tracking-wide text-slate-500">
                              {link.linkType}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {isAddingDependency && (
                  <div className="space-y-2 bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={dependencyRelationship}
                        onChange={(e) =>
                          setDependencyRelationship(
                            e.target.value as 'blocks' | 'blocked-by' | 'relates' | 'duplicates'
                          )
                        }
                        className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="blocks">Blocks</option>
                        <option value="blocked-by">Blocked by</option>
                        <option value="relates">Relates</option>
                        <option value="duplicates">Duplicates</option>
                      </select>
                      <span className="text-xs text-slate-500">Select task</span>
                    </div>

                    <div className="relative">
                      <input
                        value={dependencyQuery}
                        onChange={(e) => {
                          setDependencyQuery(e.target.value)
                          setDependencyTargetId(null)
                        }}
                        className="w-full bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        placeholder="Search tasks..."
                      />
                      {dependencyResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-[#0B0E14] border border-slate-700/60 rounded-lg shadow-lg max-h-40 overflow-auto">
                          {dependencyResults.map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => {
                                setDependencyTargetId(candidate.id)
                                setDependencyQuery(candidate.title)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-800/60 transition-colors"
                            >
                              <div className="text-xs text-slate-200 truncate">
                                {candidate.title}
                              </div>
                              <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                                {candidate.status}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAddDependency}
                        disabled={!dependencyTargetId}
                        className={cn(
                          'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                          dependencyTargetId
                            ? 'bg-blue-500/20 text-blue-200 hover:bg-blue-500/30'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        )}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingDependency(false)
                          setDependencyQuery('')
                          setDependencyTargetId(null)
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'properties' && (
            <div className="p-8 space-y-8 animate-in fade-in duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Task Properties
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">
                    Metadata and system information
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Hash className="w-2.5 h-2.5" />
                    Task ID
                  </label>
                  <span className="block text-xs text-slate-400 font-mono bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
                    {task.id}
                  </span>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FolderKanban className="w-2.5 h-2.5" />
                    Column ID
                  </label>
                  <span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
                    {task.columnId}
                  </span>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-2.5 h-2.5" />
                    Created At
                  </label>
                  <span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
                    {formatDate(task.createdAt)}
                  </span>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-2.5 h-2.5" />
                    Last Updated
                  </label>
                  <span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
                    {formatDate(task.updatedAt)}
                  </span>
                </div>
                {task.orderInColumn !== undefined && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Position in Column
                    </label>
                    <span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
                      #{task.orderInColumn + 1}
                    </span>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Project ID
                  </label>
                  <span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner font-mono">
                    {task.projectId}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'runs' && (
            <div className="flex flex-col h-full bg-[#0B0E14]/30 animate-in fade-in duration-300">
              {selectedRunId ? (
                <RunDetailsView
                  runId={selectedRunId}
                  run={runs.find((run) => run.id === selectedRunId) ?? null}
                  onBack={() => setSelectedRunId(null)}
                />
              ) : (
                <>
                  {/* Controls Header */}
                  <div className="p-6 border-b border-slate-800/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <History className="w-3 h-3" />
                        Execution History
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={fetchRuns}
                          disabled={isLoadingRuns}
                          className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                          title="Refresh history"
                        >
                          <RefreshCw
                            className={cn('w-3.5 h-3.5', isLoadingRuns && 'animate-spin')}
                          />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 relative group/select">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-hover/select:text-blue-400 transition-colors pointer-events-none">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <select
                          value={selectedRoleId}
                          onChange={(e) => setSelectedRoleId(e.target.value)}
                          disabled={isLoadingRoles || roles.length === 0}
                          className="w-full appearance-none cursor-pointer pl-9 pr-8 py-2.5 bg-[#0B0E14] border border-slate-800/50 hover:border-slate-700/50 rounded-xl text-xs font-medium text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        >
                          {isLoadingRoles && (
                            <option value="" disabled>
                              Loading roles...
                            </option>
                          )}
                          {!isLoadingRoles && roles.length === 0 && (
                            <option value="" disabled>
                              No roles available
                            </option>
                          )}
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                        <Plus className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 group-hover/select:text-slate-400 transition-colors" />
                      </div>

                      <button
                        onClick={handleStartRun}
                        disabled={isStartingRun || !selectedRoleId}
                        className={cn(
                          'flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg',
                          isStartingRun || !selectedRoleId
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] border border-blue-500/30'
                        )}
                      >
                        {isStartingRun ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        {isStartingRun ? 'Starting...' : 'Start Run'}
                      </button>
                    </div>
                  </div>

                  {/* Runs List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {isLoadingRuns && runs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 space-y-3 opacity-50">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                        <p className="text-xs text-slate-400 font-medium">Loading history...</p>
                      </div>
                    ) : runs.length > 0 ? (
                      <div className="space-y-4">
                        {runs.map((run) => {
                          const runStatus = runStatusConfig[run.status] || runStatusConfig.queued
                          return (
                            <div
                              key={run.id}
                              className="group relative bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 hover:border-slate-700/50 hover:bg-slate-800/30 transition-all duration-300"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-slate-500">
                                      {run.id.slice(0, 8)}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-200">
                                      {roles.find((r) => r.id === run.roleId)?.name || run.roleId}
                                    </span>
                                    <span className="text-[10px] text-slate-600">{run.mode}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-all',
                                        runStatus.className
                                      )}
                                    >
                                      <runStatus.icon
                                        className={cn(
                                          'w-2.5 h-2.5',
                                          run.status === 'running' && 'animate-spin'
                                        )}
                                      />
                                      {runStatus.label}
                                    </span>
                                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5" />
                                      {new Date(run.createdAt).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {run.status === 'running' ? (
                                    <button
                                      onClick={() => handleCancelRun(run.id)}
                                      className="p-2 text-red-400 hover:bg-red-500/15 rounded-xl transition-all hover:scale-105"
                                      title="Cancel Run"
                                    >
                                      <Square className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleRetryRun(run)}
                                      disabled={isStartingRun}
                                      className="p-2 text-blue-400 hover:bg-blue-500/15 rounded-xl transition-all hover:scale-105 disabled:opacity-50"
                                      title="Retry Run"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setSelectedRunId(run.id)}
                                    className="p-2 text-slate-500 hover:text-white hover:bg-slate-700/50 rounded-xl transition-all"
                                    title="View details"
                                  >
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {run.errorText && (
                                <div className="mt-2 p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                                  <p className="text-[10px] text-red-400/80 font-mono line-clamp-2 leading-relaxed">
                                    {run.errorText}
                                  </p>
                                </div>
                              )}

                              <div className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none">
                                <Terminal className="w-16 h-16" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-4">
                        <div className="w-12 h-12 bg-slate-900/50 rounded-2xl flex items-center justify-center border border-slate-800/50 text-slate-600">
                          <History className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-300">No runs yet</p>
                          <p className="text-xs text-slate-500 max-w-[200px] mx-auto leading-relaxed">
                            Start a new run to see the agent in action.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border transition-all bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30 shadow-lg shadow-blue-500/5">
                      {msg.role === 'assistant' ? (
                        <Sparkles className="w-4 h-4 text-blue-400" />
                      ) : (
                        <User className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2 max-w-[85%] text-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-blue-400">
                          {msg.role === 'assistant' ? 'AI Assistant' : 'You'}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <div className="rounded-2xl px-4 py-3 border transition-all hover:shadow-md space-y-3 bg-slate-800/40 border-slate-700/40">
                        {msg.parts.map((part, idx) => (
                          <MessagePartRenderer key={idx} part={part} />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="p-6 border-t border-slate-800/50 bg-[#0B0E14]/50">
                <div className="relative group">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder="Ask AI anything about this task..."
                    className="w-full bg-slate-900/50 border border-slate-800/50 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all resize-none min-h-[44px] max-h-32 custom-scrollbar shadow-inner"
                    rows={1}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim()}
                    className={cn(
                      'absolute right-2 top-1.5 p-2 rounded-lg transition-all',
                      chatInput.trim()
                        ? 'text-blue-400 hover:bg-blue-500/10 scale-110'
                        : 'text-slate-600 opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-slate-600">
                    Press Enter to send, Shift + Enter for new line
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    AI Ready
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
