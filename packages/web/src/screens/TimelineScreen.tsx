import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, Filter } from 'lucide-react'
import { cn } from '@web/lib/utils'
import {TimelineTask} from "@shared/contracts/ipc"

type ViewScale = 'week' | 'month'

type TimelineScreenProps = {
  projectId: string
  projectName: string
}

export function TimelineScreen({ projectId, projectName }: TimelineScreenProps) {
  const [tasks, setTasks] = useState<TimelineTask[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [viewScale, setViewScale] = useState<ViewScale>('week')
  const [statusFilter, setStatusFilter] = useState<'all' | TimelineTask['status']>('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ taskId: string; deltaDays: number } | null>(null)
  const dragStateRef = useRef<{ task: TimelineTask; originX: number; deltaDays: number } | null>(
    null
  )

  const dayWidth = viewScale === 'week' ? 18 : 8

  const shiftDate = (date: string, deltaDays: number) => {
    const next = new Date(date)
    next.setDate(next.getDate() + deltaDays)
    return next.toISOString().slice(0, 10)
  }

  const fetchSchedule = useCallback(async () => {
    setIsLoading(true)
    setScheduleError(null)
    try {
      const response = await window.api.schedule.get({ projectId })
      setTasks(response.tasks)
    } catch (error) {
      console.error('Failed to fetch schedule:', error)
      setScheduleError('Failed to load schedule')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchSchedule()
  }, [fetchSchedule])

  const handleDragStart = useCallback(
    (task: TimelineTask, event: React.MouseEvent<HTMLDivElement>) => {
      if (!task.startDate && !task.dueDate) return
      setScheduleError(null)
      dragStateRef.current = { task, originX: event.clientX, deltaDays: 0 }
      setDragging({ taskId: task.id, deltaDays: 0 })

      const handleMove = (moveEvent: MouseEvent) => {
        if (!dragStateRef.current) return
        const deltaDays = Math.round((moveEvent.clientX - dragStateRef.current.originX) / dayWidth)
        dragStateRef.current.deltaDays = deltaDays
        setDragging({ taskId: task.id, deltaDays })
      }

      const handleUp = async () => {
        window.removeEventListener('mousemove', handleMove)
        const current = dragStateRef.current
        dragStateRef.current = null
        setDragging(null)

        if (!current || current.deltaDays === 0) return

        const nextStart = current.task.startDate
          ? shiftDate(current.task.startDate, current.deltaDays)
          : null
        const nextDue = current.task.dueDate
          ? shiftDate(current.task.dueDate, current.deltaDays)
          : null

        try {
          await window.api.schedule.update({
            taskId: current.task.id,
            startDate: nextStart,
            dueDate: nextDue,
            estimateHours: current.task.estimateHours,
            estimatePoints: current.task.estimatePoints,
            assignee: current.task.assignee,
          })
          await fetchSchedule()
        } catch (error) {
          console.error('Failed to update schedule:', error)
          setScheduleError('Schedule update failed: check dates and dependencies')
        }
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp, { once: true })
    },
    [dayWidth, fetchSchedule]
  )

  const assignees = useMemo(() => {
    const unique = new Set(tasks.map((task) => task.assignee).filter(Boolean))
    return Array.from(unique)
  }, [tasks])

  const tags = useMemo(() => {
    const unique = new Set(tasks.flatMap((task) => task.tags))
    return Array.from(unique)
  }, [tasks])

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false
      if (assigneeFilter !== 'all' && task.assignee !== assigneeFilter) return false
      if (tagFilter !== 'all' && !task.tags.includes(tagFilter)) return false
      return true
    })
  }, [tasks, statusFilter, assigneeFilter, tagFilter])

  const scheduledTasks = filteredTasks.filter((task) => task.startDate || task.dueDate)
  const unscheduledTasks = filteredTasks.filter((task) => !task.startDate && !task.dueDate)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">Timeline</h2>
          <p className="text-sm text-slate-500">{projectName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewScale('week')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
              viewScale === 'week'
                ? 'bg-blue-500/20 text-blue-200'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            )}
          >
            Week
          </button>
          <button
            onClick={() => setViewScale('month')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
              viewScale === 'month'
                ? 'bg-blue-500/20 text-blue-200'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            )}
          >
            Month
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <Filter className="w-3.5 h-3.5" />
          Filters
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
        >
          <option value="all">All statuses</option>
          <option value="todo">Todo</option>
          <option value="in-progress">In progress</option>
          <option value="done">Done</option>
        </select>
        <select
          value={assigneeFilter}
          onChange={(event) => setAssigneeFilter(event.target.value)}
          className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
        >
          <option value="all">All assignees</option>
          {assignees.map((assignee) => (
            <option key={assignee} value={assignee}>
              {assignee}
            </option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
        >
          <option value="all">All tags</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-auto space-y-6">
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <CalendarRange className="w-4 h-4" />
            Scheduled tasks
          </div>
          {scheduleError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {scheduleError}
            </div>
          )}
          {isLoading && <div className="text-xs text-slate-500">Loading schedule...</div>}
          {!isLoading && scheduledTasks.length === 0 && (
            <div className="text-xs text-slate-500">No scheduled tasks yet.</div>
          )}
          <div className="space-y-3">
            {scheduledTasks.map((task) => (
              <div
                key={task.id}
                className="grid grid-cols-[240px_1fr] gap-4 items-center bg-slate-950/60 border border-slate-800/60 rounded-xl px-4 py-3"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-100 truncate">{task.title}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {task.startDate ?? 'Unscheduled'} → {task.dueDate ?? 'No due date'}
                  </div>
                </div>
                <div className="h-6 bg-slate-800/60 rounded-full relative overflow-hidden">
                  <div
                    onMouseDown={(event) => handleDragStart(task, event)}
                    className={cn(
                      'absolute inset-y-0 left-0 bg-blue-500/40 cursor-grab active:cursor-grabbing',
                      dragging?.taskId === task.id && 'shadow-[0_0_12px_rgba(59,130,246,0.4)]'
                    )}
                    style={{
                      width: viewScale === 'week' ? '35%' : '60%',
                      transform:
                        dragging?.taskId === task.id
                          ? `translateX(${dragging.deltaDays * dayWidth}px)`
                          : undefined,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-4">
          <div className="text-sm text-slate-400">Unscheduled tasks</div>
          {unscheduledTasks.length === 0 ? (
            <div className="text-xs text-slate-500">All tasks are scheduled.</div>
          ) : (
            <div className="space-y-2">
              {unscheduledTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between bg-slate-950/60 border border-slate-800/60 rounded-xl px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-100 truncate">
                      {task.title}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">No dates assigned</div>
                  </div>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wide">
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
