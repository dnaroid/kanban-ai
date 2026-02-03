import { useState, useEffect } from 'react'
import { Plus, X, Search, Check } from 'lucide-react'
import type { KanbanTask, Tag } from '@/shared/types/ipc'
import { cn } from '../../../../lib/utils'

interface TaskDetailsTagsProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
}

export function TaskDetailsTags({ task, onUpdate }: TaskDetailsTagsProps) {
  const [globalTags, setGlobalTags] = useState<Tag[]>([])
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadGlobalTags()
  }, [task.projectId])

  const loadGlobalTags = async () => {
    try {
      const response = await window.api.tag.list({ projectId: task.projectId })
      setGlobalTags(response.tags)
    } catch (error) {
      console.error('Failed to load global tags:', error)
    }
  }

  const toggleTag = (tagName: string) => {
    const currentTags = task.tags || []
    const updatedTags = currentTags.includes(tagName)
      ? currentTags.filter((t) => t !== tagName)
      : [...currentTags, tagName]
    onUpdate?.(task.id, { tags: updatedTags })
  }

  const filteredTags = globalTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getTagColor = (tagName: string) => {
    return globalTags.find((t) => t.name === tagName)?.color || '#475569'
  }

  return (
    <div className="flex flex-wrap gap-2 relative">
      {task.tags?.map((tagName) => (
        <span
          key={tagName}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-800/80 text-white border border-slate-700/50 group transition-all"
          style={{ borderLeftColor: getTagColor(tagName), borderLeftWidth: '3px' }}
        >
          {tagName}
          <button
            onClick={() => toggleTag(tagName)}
            className="p-0.5 hover:bg-white/10 rounded-sm text-slate-500 hover:text-red-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <div className="relative">
        <button
          onClick={() => setIsPickerOpen(!isPickerOpen)}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
            isPickerOpen
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
              : 'bg-slate-800/50 text-slate-400 border border-dashed border-slate-700 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/5'
          )}
        >
          <Plus className="w-3 h-3" />
          Add Tag
        </button>

        {isPickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsPickerOpen(false)} />
            <div className="absolute left-0 top-full mt-2 w-64 bg-[#161B26] border border-slate-800 rounded-xl shadow-2xl z-20 py-2 animate-in fade-in zoom-in-95 duration-200">
              <div className="px-3 pb-2 border-b border-slate-800 mb-1">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search or find tags..."
                    className="w-full bg-[#0B0E14] border border-slate-800 text-[10px] text-white pl-7 pr-2 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                  />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto px-1 py-1 custom-scrollbar">
                {filteredTags.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[10px] text-slate-500 italic">
                    No tags found. Create them in Settings.
                  </div>
                ) : (
                  filteredTags.map((tag) => {
                    const isSelected = task.tags?.includes(tag.name)
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.name)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all group',
                          isSelected
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </div>
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
