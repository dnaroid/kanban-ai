import { useState } from 'react'
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileIcon,
  ImageIcon,
  Loader2,
  Terminal,
  XCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Part, ToolState } from '@/shared/types/ipc'

export function TextPart({ part }: { part: { text: string } }) {
  if (!part.text) return null
  return <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{part.text}</p>
}

export function FilePart({ part }: { part: { url: string; mime: string; filename?: string } }) {
  const isImage = part.mime.startsWith('image/')
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-800/50 rounded-xl group hover:border-cyan-500/30 transition-all cursor-pointer">
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center border',
          isImage
            ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
            : 'bg-slate-800 border-slate-700 text-slate-400'
        )}
      >
        {isImage ? <ImageIcon className="w-5 h-5" /> : <FileIcon className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">
          {part.filename || 'Attached file'}
        </p>
        <p className="text-[10px] text-slate-500 uppercase">
          {part.mime.split('/')[1] || part.mime}
        </p>
      </div>
    </div>
  )
}

export function ToolPart({
  part,
}: {
  part: { tool: string; state: ToolState; input?: any; output?: any; error?: string }
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const statusConfig = {
    pending: {
      icon: Circle,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      border: 'border-amber-400/20',
      label: 'Pending',
      animate: undefined,
    },
    running: {
      icon: Loader2,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      border: 'border-blue-400/20',
      label: 'Running',
      animate: 'animate-spin',
    },
    completed: {
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      border: 'border-emerald-400/20',
      label: 'Completed',
      animate: undefined,
    },
    error: {
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-400/10',
      border: 'border-red-400/20',
      label: 'Error',
      animate: undefined,
    },
  }

  const config = statusConfig[part.state] || statusConfig.pending

  return (
    <div
      className={cn('rounded-xl border transition-all overflow-hidden', config.bg, config.border)}
    >
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className={cn('p-1.5 rounded-lg bg-slate-900/50', config.color)}>
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-mono font-medium text-slate-200">{part.tool}</span>
          <div
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
              config.color,
              'bg-slate-950/50'
            )}
          >
            <config.icon className={cn('w-2.5 h-2.5', config.animate)} />
            {config.label}
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
        )}
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
          {part.input && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase px-1">Input</span>
              <pre className="p-2 bg-slate-950/50 rounded-lg text-[10px] text-slate-400 font-mono overflow-x-auto custom-scrollbar">
                {typeof part.input === 'string' ? part.input : JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {part.output && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase px-1">
                Output
              </span>
              <pre className="p-2 bg-slate-950/50 rounded-lg text-[10px] text-emerald-400/80 font-mono overflow-x-auto custom-scrollbar">
                {typeof part.output === 'string'
                  ? part.output
                  : JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
          {part.error && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase px-1">Error</span>
              <pre className="p-2 bg-red-500/5 rounded-lg text-[10px] text-red-400 font-mono overflow-x-auto custom-scrollbar">
                {part.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ReasoningPart({ part }: { part: { text: string } }) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="relative group">
      <div className="absolute inset-y-0 -left-3 w-[2px] bg-gradient-to-b from-violet-500/50 via-violet-500/20 to-transparent rounded-full" />
      <div className="space-y-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-[10px] font-bold text-violet-400/80 hover:text-violet-400 transition-colors uppercase tracking-widest px-1"
        >
          <BrainCircuit className="w-3 h-3" />
          Reasoning
          {isExpanded ? (
            <ChevronDown className="w-2.5 h-2.5" />
          ) : (
            <ChevronRight className="w-2.5 h-2.5" />
          )}
        </button>
        {isExpanded && (
          <div className="text-xs text-slate-400/60 leading-relaxed font-serif italic border-l border-violet-500/10 pl-3 py-1 bg-violet-500/[0.02] rounded-r-lg">
            {part.text}
          </div>
        )}
      </div>
    </div>
  )
}

export function AgentPart({ part }: { part: { name: string } }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg">
      <Bot className="w-3 h-3 text-violet-400" />
      <span className="text-[10px] font-bold text-violet-300 uppercase tracking-tight">
        {part.name}
      </span>
    </div>
  )
}

export function MessagePartRenderer({ part }: { part: Part }) {
  if ('ignored' in part && part.ignored) return null

  switch (part.type) {
    case 'text':
      return <TextPart part={part} />
    case 'file':
      return <FilePart part={part} />
    case 'tool':
      return <ToolPart part={part} />
    case 'reasoning':
      return <ReasoningPart part={part} />
    case 'agent':
      return <AgentPart part={part} />
    default:
      return null
  }
}
