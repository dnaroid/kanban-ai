import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Brain,
  Files,
  ListTodo,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { Run } from '@/shared/types/ipc.ts'
import { ArtifactsPanel } from './ArtifactsPanel'
import { ExecutionLog } from './ExecutionLog'
import { RunTodosPanel } from './RunTodosPanel'

export function RunDetailsView({
  runId,
  run,
  onBack,
  onDelete,
  onRestart,
  onCancel,
  showBack = true,
}: {
  runId: string
  run: Run | null
  onBack: () => void
  onDelete?: (e: React.MouseEvent) => void
  onRestart?: (e: React.MouseEvent) => void
  onCancel?: (e: React.MouseEvent) => void
  showBack?: boolean
}) {
  const [view, setView] = useState<'log' | 'artifacts' | 'todo'>('log')
  const [showReasoning, setShowReasoning] = useState(false)
  const [hasTodos, setHasTodos] = useState(false)

  const sessionId = run?.sessionId

  useEffect(() => {
    if (!sessionId) {
      setHasTodos(false)
      return
    }

    const checkTodos = async () => {
      try {
        const response = await window.api.opencode.getSessionTodos({ sessionId })
        setHasTodos(response.todos.length > 0)
      } catch (error) {
        console.error('Failed to check todos:', error)
      }
    }

    checkTodos()

    const cleanup = window.api.opencode.onEvent(sessionId, (event) => {
      if (event.sessionId !== sessionId) return
      if (event.type === 'todo.updated') {
        setHasTodos(event.todos.length > 0)
      }
    })

    return cleanup
  }, [sessionId])

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] overflow-hidden animate-in fade-in duration-300">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/50 bg-[#11151C]/25 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={onBack}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="text-xs font-mono text-blue-400/80">{runId.slice(0, 8)}</span>

          <div className="flex items-center gap-1.5 ml-2 border-l border-slate-800 pl-3">
            {onRestart && run && !['running', 'queued'].includes(run.status) && (
              <button
                onClick={onRestart}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                title="Restart run"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            {onCancel && run && ['running', 'queued'].includes(run.status) && (
              <button
                onClick={onCancel}
                className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                title="Cancel run"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            )}
            {onDelete && run && !['running', 'queued'].includes(run.status) && (
              <button
                onClick={onDelete}
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                title="Delete run"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {view === 'log' && (
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 border',
                showReasoning
                  ? 'bg-violet-500/10 text-violet-300 border-violet-500/20 hover:bg-violet-500/20'
                  : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700'
              )}
              title={showReasoning ? 'Hide reasoning' : 'Show reasoning'}
            >
              <Brain className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thinking</span>
            </button>
          )}

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
              onClick={() => setView('todo')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200',
                view === 'todo'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-500 hover:text-slate-300',
                hasTodos && view !== 'todo' && 'animate-todo-pulse text-amber-500/80'
              )}
            >
              <ListTodo className={cn('w-3 h-3', hasTodos && view !== 'todo' && 'text-amber-500')} />
              Todo
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
        </div>
      </div>

      <style>{`
        @keyframes todo-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-todo-pulse {
          animation: todo-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      <div className="flex-1 overflow-hidden">
        {view === 'log' ? (
          <ExecutionLog
            runId={runId}
            sessionId={run?.sessionId || ''}
            showReasoning={showReasoning}
          />
        ) : view === 'artifacts' ? (
          <ArtifactsPanel runId={runId} />
        ) : (
          <RunTodosPanel sessionId={run?.sessionId || ''} />
        )}
      </div>
    </div>
  )
}
