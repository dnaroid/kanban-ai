import { useCallback, useEffect, useState } from 'react'
import { ListTodo, RefreshCw } from 'lucide-react'
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
      <div className="px-4 py-2 border-b border-slate-800/50 bg-slate-900/20 backdrop-blur-sm flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <ListTodo className="w-3 h-3" />
            Todos ({todos.length})
          </span>
        </div>
        <button
          onClick={() => fetchTodos()}
          className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-colors"
          title="Refresh todos"
        >
          <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {todos.map((todo) => (
          <div
            key={todo.id}
            className={cn(
              'group p-3 rounded-xl border transition-all duration-200 bg-[#11151C]/50',
              todo.status === 'completed'
                ? 'border-emerald-500/20 opacity-60'
                : todo.status === 'in_progress'
                  ? 'border-blue-500/30 bg-blue-500/5'
                  : 'border-slate-800/60'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-1 w-1.5 h-1.5 rounded-full shrink-0',
                  todo.priority === 'high'
                    ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                    : todo.priority === 'medium'
                      ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                      : 'bg-slate-500'
                )}
              />
              <div className="flex-1 space-y-1">
                <p
                  className={cn(
                    'text-sm leading-relaxed transition-all',
                    todo.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-200'
                  )}
                >
                  {todo.content}
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <span
                    className={cn(
                      'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors',
                      todo.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : todo.status === 'in_progress'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : todo.status === 'cancelled'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-slate-800/50 text-slate-500 border-slate-700/50'
                    )}
                  >
                    {todo.status.replace('_', ' ')}
                  </span>
                  <span className="text-[9px] text-slate-600 font-mono uppercase tracking-tighter">
                    {todo.priority} priority
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
