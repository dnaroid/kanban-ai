import { useCallback, useEffect, useState } from 'react'
import { Play, Plus, RefreshCw, RotateCcw, Square, Terminal, Trash2, User } from 'lucide-react'
import { cn } from '@web/lib/utils'
import type { KanbanTask, Run } from '@shared/types/ipc.ts'
import { RunDetailsView } from './RunDetailsView'
import { statusConfig, runStatusConfig } from './TaskPropertyConfigs'

interface TaskDrawerRunsProps {
  task: KanbanTask
  isActive: boolean
}

export function TaskDrawerRuns({ task, isActive }: TaskDrawerRunsProps) {
  const [runs, setRuns] = useState<Run[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [isLoadingRuns, setIsLoadingRuns] = useState(false)
  const [isStartingRun, setIsStartingRun] = useState(false)
  const [roles, setRoles] = useState<string[]>([])
  const [isLoadingRoles, setIsLoadingRoles] = useState(false)
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')

  const fetchRuns = useCallback(async () => {
    setIsLoadingRuns(true)
    try {
      const response = await window.api.run.listByTask({ taskId: task.id })
      setRuns(response.runs)

      if (!selectedRunId && response.runs.length === 1) {
        setSelectedRunId(response.runs[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch runs:', error)
    } finally {
      setIsLoadingRuns(false)
    }
  }, [task.id, selectedRunId])

  useEffect(() => {
    if (isActive) {
      fetchRuns()
    }
  }, [isActive, fetchRuns])

  const handleStartRun = async () => {
    if (isStartingRun) return
    setIsStartingRun(true)
    try {
      const response = await window.api.run.start({ taskId: task.id, roleId: selectedRoleId })
      await fetchRuns()
      setSelectedRunId(response.runId)
    } catch (error) {
      console.error('Failed to start run:', error)
    } finally {
      setIsStartingRun(false)
    }
  }

  const handleCancelRun = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await window.api.run.cancel({ runId })
      await fetchRuns()
    } catch (error) {
      console.error('Failed to cancel run:', error)
    }
  }

  const handleDeleteRun = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this run?')) return
    try {
      await window.api.run.delete({ runId })
      await fetchRuns()
      if (selectedRunId === runId) {
        setSelectedRunId(null)
      }
    } catch (error) {
      console.error('Failed to delete run:', error)
    }
  }

  const handleRetryRun = async (run: Run, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await window.api.run.start({
        taskId: task.id,
        roleId: run.roleId || 'default',
        mode: run.mode,
      })
      await fetchRuns()
      setSelectedRunId(response.runId)
    } catch (error) {
      console.error('Failed to retry run:', error)
    }
  }

  useEffect(() => {
    const fetchRoles = async () => {
      setIsLoadingRoles(true)
      try {
        const response = await window.api.roles.list()
        setRoles(response.roles.map((r) => r.id))
        if (response.roles.length > 0) {
          setSelectedRoleId(response.roles[0].id)
        }
      } catch (error) {
        console.error('Failed to fetch roles:', error)
      } finally {
        setIsLoadingRoles(false)
      }
    }

    // Only fetch roles once when component mounts (or task changes)
    fetchRoles()
  }, []) // Dependencies empty to fetch once on mount

  const selectedRun = runs.find((r) => r.id === selectedRunId) || null
  const currentStatusConfig =
    statusConfig[task.status as keyof typeof statusConfig] || statusConfig.queued

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] animate-in fade-in duration-300">
      <div className="p-4 border-b border-slate-800/50 bg-[#11151C]/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'p-2 rounded-lg border',
              currentStatusConfig.bg,
              currentStatusConfig.border,
              currentStatusConfig.color
            )}
          >
            <currentStatusConfig.icon
              className={cn(
                'w-4 h-4',
                (task.status === 'running' || task.status === 'generating') && 'animate-spin'
              )}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {task.status}
              </h3>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">{runs.length} executions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className="h-7 text-[10px] bg-slate-900 border border-slate-700 rounded px-2 text-slate-300 focus:outline-none focus:border-blue-500/50"
            disabled={isLoadingRoles}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <button
            onClick={fetchRuns}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            title="Refresh runs"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoadingRuns && 'animate-spin')} />
          </button>
          <button
            onClick={handleStartRun}
            disabled={isStartingRun || isLoadingRoles}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          >
            {isStartingRun ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            New Run
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {selectedRunId ? (
          <RunDetailsView
            runId={selectedRunId}
            run={selectedRun}
            onBack={() => setSelectedRunId(null)}
            onDelete={(e) => handleDeleteRun(selectedRunId, e)}
            onRestart={(e) => selectedRun && handleRetryRun(selectedRun, e)}
            onCancel={(e) => handleCancelRun(selectedRunId, e)}
            showBack={runs.length > 1}
          />
        ) : (
          <div className="p-4 space-y-3">
            {runs.length === 0 && !isLoadingRuns ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-50 py-12">
                <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
                  <Terminal className="w-8 h-8 text-slate-600" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-slate-400">No runs yet</p>
                  <p className="text-xs text-slate-600 max-w-[200px]">
                    Start a new run to execute this task
                  </p>
                </div>
                <button
                  onClick={handleStartRun}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Start First Run
                </button>
              </div>
            ) : (
              runs.map((run) => {
                const statusStyle =
                  runStatusConfig[run.status as keyof typeof runStatusConfig] ||
                  runStatusConfig.queued

                return (
                  <div
                    key={run.id}
                    className="group relative bg-[#161B26] border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 overflow-hidden cursor-pointer"
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                      {!['running', 'queued'].includes(run.status) && (
                        <button
                          onClick={(e) => handleRetryRun(run, e)}
                          className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-700 hover:border-slate-600 transition-colors shadow-lg"
                          title="Retry run"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {['running', 'queued'].includes(run.status) && (
                        <button
                          onClick={(e) => handleCancelRun(run.id, e)}
                          className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg border border-red-500/20 transition-colors shadow-lg"
                          title="Cancel run"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}
                      {!['running', 'queued'].includes(run.status) && (
                        <button
                          onClick={(e) => handleDeleteRun(run.id, e)}
                          className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg border border-red-500/20 transition-colors shadow-lg"
                          title="Delete run"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center border',
                            statusStyle.bg,
                            statusStyle.border,
                            statusStyle.color
                          )}
                        >
                          <statusStyle.icon
                            className={cn('w-4 h-4', run.status === 'running' && 'animate-spin')}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-200 font-mono">
                              {run.id.slice(0, 8)}
                            </span>
                            <span
                              className={cn(
                                'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border tracking-wider',
                                statusStyle.bg,
                                statusStyle.border,
                                statusStyle.color
                              )}
                            >
                              {run.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {run.roleId || 'default'}
                            </span>
                            <span className="text-slate-700 text-[10px]">•</span>
                            <span className="text-[10px] text-slate-500 font-medium font-mono">
                              {new Date(run.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
