import { useCallback, useEffect, useState } from 'react'
import { Check, ListTodo, RefreshCw, Square } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface Todo {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
}

export function RunTodosPanel({ sessionId }: { sessionId: string }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const completedCount = todos.filter((t) => t.status === 'completed').length
  const totalCount = todos.length

  const fetchTodos = useCallback(async () => {
    if (!sessionId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const response = await window.api.opencode.getSessionTodos({ sessionId })
      setTodos(response.todos)
    } catch (error) {
      console.error('Failed to fetch todos:', error)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchTodos()
  }, [fetchTodos])

  useEffect(() => {
    if (!sessionId) return

    const cleanup = window.api.opencode.onEvent(sessionId, (event) => {
      if (event.sessionId !== sessionId) return
      if (event.type === 'todo.updated') {
        setTodos(event.todos)
      }
    })

    return cleanup
  }, [sessionId])

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-2 opacity-30 animate-in fade-in duration-500">
        <ListTodo className="w-8 h-8" />
        <p className="text-xs text-slate-400 font-mono">No active session found</p>
      </div>
    )
  }

  if (isLoading && todos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-50 animate-in fade-in duration-300">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <p className="text-xs text-slate-400 font-mono uppercase tracking-widest">
          Loading Todos...
        </p>
      </div>
    )
  }

  if (todos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-2 opacity-30 animate-in fade-in duration-500">
        <ListTodo className="w-8 h-8" />
        <p className="text-xs text-slate-400 font-mono">No todos for this session</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-300">
      <div className="px-4 py-2 border-b border-slate-800/40 bg-slate-900/40 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <ListTodo className="w-3.5 h-3.5 text-amber-500" />
            Todos (<span className="text-amber-500/90">{completedCount}/{totalCount}</span>)
          </span>
        </div>
        <button
          onClick={() => fetchTodos()}
          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded-lg transition-all"
          title="Refresh"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="divide-y divide-slate-800/40">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="group px-4 py-2.5 flex items-center gap-3 transition-all hover:bg-slate-800/20"
            >
              <div className="shrink-0">
                <div
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center transition-all duration-200',
                    todo.status === 'completed'
                      ? 'bg-amber-900/20 border-amber-700/40 text-amber-500/80'
                      : todo.status === 'in_progress'
                        ? 'border-amber-400 bg-amber-400/10 text-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                        : 'border-slate-700 bg-slate-900/50 text-slate-600'
                  )}
                >
                  {todo.status === 'completed' ? (
                    <Check className="w-3 h-3 stroke-[3]" />
                  ) : todo.status === 'in_progress' ? (
                    <div className="w-1.5 h-1.5 rounded-sm bg-amber-400 animate-pulse" />
                  ) : null}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-[13px] leading-snug transition-all font-semibold',
                    todo.status === 'completed'
                      ? 'text-amber-700/80'
                      : 'text-amber-300 tracking-tight'
                  )}
                >
                  {todo.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
