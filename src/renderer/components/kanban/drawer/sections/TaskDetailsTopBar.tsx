import { cn } from '../../../../lib/utils'
import type { KanbanTask } from '@/shared/types/ipc.ts'
import { statusConfig, typeConfig, difficultyConfig, priorityConfig } from '../TaskPropertyConfigs'
import { LucideIcon } from 'lucide-react'

interface TaskDetailsTopBarProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
}

interface PropertySelectProps {
  label: string
  value: string
  options: Record<string, { icon: LucideIcon; color: string; bg: string; border: string }>
  onChange: (value: string) => void
  displayValue?: string
}

function PropertySelect({ label, value, options, onChange, displayValue }: PropertySelectProps) {
  const style = options[value] || Object.values(options)[0]

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        {label}
      </span>
      <div className="relative group">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        >
          {Object.keys(options).map((opt) => (
            <option key={opt} value={opt}>
              {opt.charAt(0).toUpperCase() + opt.replace('_', ' ').slice(1)}
            </option>
          ))}
        </select>
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all hover:brightness-110 cursor-pointer',
            style.bg,
            style.border
          )}
        >
          <style.icon className={cn('w-3.5 h-3.5', style.color)} />
          <span className={cn('text-xs font-bold uppercase tracking-wider', style.color)}>
            {displayValue || value.replace('_', ' ')}
          </span>
        </div>
      </div>
    </div>
  )
}

export function TaskDetailsTopBar({ task, onUpdate }: TaskDetailsTopBarProps) {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <PropertySelect
        label="Status"
        value={task.status}
        options={statusConfig}
        onChange={(status) => onUpdate?.(task.id, { status: status as KanbanTask['status'] })}
      />

      <PropertySelect
        label="Type"
        value={task.type}
        options={typeConfig as any}
        onChange={(type) => onUpdate?.(task.id, { type: type as KanbanTask['type'] })}
      />

      <PropertySelect
        label="Difficulty"
        value={task.difficulty || 'medium'}
        options={difficultyConfig}
        displayValue={task.difficulty || 'Medium'}
        onChange={(difficulty) =>
          onUpdate?.(task.id, { difficulty: difficulty as KanbanTask['difficulty'] })
        }
      />

      <PropertySelect
        label="Priority"
        value={task.priority}
        options={priorityConfig}
        onChange={(priority) =>
          onUpdate?.(task.id, { priority: priority as KanbanTask['priority'] })
        }
      />
    </div>
  )
}
