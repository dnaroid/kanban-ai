import {useEffect, useState} from "react"
import {useSortable} from "@dnd-kit/sortable"
import {CSS} from "@dnd-kit/utilities"
import {AlertCircle, Play, RefreshCw, Trash2} from "lucide-react"
import type {KanbanTask, Tag} from "@/shared/types/ipc"
import {cn} from "../../../lib/utils"
import {priorityConfig, statusConfig, typeConfig,} from "../drawer/TaskPropertyConfigs"

export interface SortableTaskProps {
  task: KanbanTask
  globalTags: Tag[]
  onDelete?: (id: string) => void
  onClick?: (task: KanbanTask) => void
}

export function SortableTask({task, globalTags, onDelete, onClick}: SortableTaskProps) {
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
    id: task.id,
    data: {
      type: "task",
      task,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [isBlocked, setIsBlocked] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  useEffect(() => {
    let isMounted = true
    const fetchBlockedState = async () => {
      try {
        const response = await window.api.deps.list({taskId: task.id})
        if (!isMounted) return
        const blocked = response.links.some(
          (link) => link.linkType === "blocks" && link.toTaskId === task.id
        )
        setIsBlocked(blocked)
      } catch (error) {
        console.error("Failed to fetch dependencies for task:", error)
      }
    }
    fetchBlockedState()
    return () => {
      isMounted = false
    }
  }, [task.id])

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isStarting) return
    setIsStarting(true)
    try {
      const rolesResponse = await window.api.roles.list()
      const roleId = rolesResponse.roles[0]?.id || "default"
      await window.api.run.start({taskId: task.id, roleId})
    } catch (error) {
      console.error("Failed to start run from card:", error)
    } finally {
      setIsStarting(false)
    }
  }

  const pConfig = priorityConfig[task.priority]
  const tConfig = typeConfig[task.type as keyof typeof typeConfig] || typeConfig.chore
  const sConfig = task.status ? statusConfig[task.status] : null

  const getTagColor = (tagName: string) => {
    const normalized = tagName.toLowerCase().trim()
    return globalTags.find((t) => t.name.toLowerCase().trim() === normalized)?.color || "#475569"
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(task)}
      className={cn(
        "bg-[#11151C] border rounded-xl mb-3 group hover:shadow-lg hover:shadow-black/20 transition-all cursor-grab active:cursor-grabbing overflow-hidden relative",
        sConfig?.border ?? "border-slate-700",
        !sConfig && "hover:border-slate-600",
        isDragging && "opacity-50 shadow-2xl scale-105",
        task.status === "running" && "animate-card-pulse-blue border-blue-500/50",
        task.status === "generating" && "animate-card-pulse-purple border-purple-500/50"
      )}
    >
      {sConfig && (
        <div className={cn("absolute inset-0 pointer-events-none transition-colors", sConfig.bg)}/>
      )}
      <div className="flex-1 min-w-0 p-4 relative">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-sm font-semibold text-slate-200 leading-snug flex-1">{task.title}</h4>
          <div className="flex flex-col gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(task.id)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-1 rounded-md hover:bg-red-500/10"
              title="Delete Task"
            >
              <Trash2 className="w-4 h-4"/>
            </button>
            {["queued", "paused", "failed"].includes(task.status) && (
              <button
                onClick={handleStart}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={isStarting}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-blue-400 transition-all p-1 rounded-md hover:bg-blue-500/10"
                title="Start Run"
              >
                {isStarting ? (
                  <RefreshCw className="w-4 h-4 animate-spin"/>
                ) : (
                  <Play className="w-4 h-4"/>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
              pConfig.bg,
              pConfig.color
            )}
          >
            {task.priority}
          </span>
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
              tConfig.bg,
              tConfig.color
            )}
          >
            {task.type}
          </span>
          {isBlocked && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 transition-all">
              <AlertCircle className="w-3 h-3"/>
              Blocked
            </span>
          )}
        </div>

        {task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {task.tags.slice(0, 3).map((tag, i) => {
              const color = getTagColor(tag)
              return (
                <span
                  key={i}
                  className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
                  style={{
                    backgroundColor: `${color}15`,
                    color: color,
                  }}
                >
                  {tag}
                </span>
              )
            })}
            {task.tags.length > 3 && (
              <span className="text-[10px] text-slate-500 font-medium">
                +{task.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
