import { useRef, useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import type { KanbanTask } from '@/shared/types/ipc.ts'

interface TaskDetailsTagsProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
}

export function TaskDetailsTags({ task, onUpdate }: TaskDetailsTagsProps) {
  const [newTag, setNewTag] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAddingTag && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [isAddingTag])

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      const updatedTags = [...(task.tags || []), newTag.trim()]
      onUpdate?.(task.id, { tags: updatedTags })
      setNewTag('')
      setIsAddingTag(false)
    } else if (e.key === 'Escape') {
      setIsAddingTag(false)
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = (task.tags || []).filter((tag) => tag !== tagToRemove)
    onUpdate?.(task.id, { tags: updatedTags })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {task.tags?.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/50 group hover:border-slate-600 transition-colors"
        >
          {tag}
          <button
            onClick={() => handleRemoveTag(tag)}
            className="p-0.5 hover:bg-slate-700 rounded-sm text-slate-500 hover:text-red-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {isAddingTag ? (
        <div className="flex items-center gap-2">
          <input
            ref={tagInputRef}
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleAddTag}
            onBlur={() => !newTag && setIsAddingTag(false)}
            className="bg-slate-900 border border-blue-500/50 text-xs text-white px-2 py-1 rounded-md w-24 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            placeholder="New tag..."
          />
        </div>
      ) : (
        <button
          onClick={() => setIsAddingTag(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-800/50 text-slate-400 border border-dashed border-slate-700 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all"
        >
          <Plus className="w-3 h-3" />
          Add Tag
        </button>
      )}
    </div>
  )
}
