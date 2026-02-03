import { useState, useEffect } from 'react'
import { Plus, Trash2, Tag as TagIcon, Palette } from 'lucide-react'
import type { Tag } from '@/shared/types/ipc'
import { cn } from '../../lib/utils'

interface TagManagementProps {
  projectId: string
}

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e',
]

export function TagManagement({ projectId }: TagManagementProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[5])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadTags()
  }, [projectId])

  const loadTags = async () => {
    setIsLoading(true)
    try {
      const response = await window.api.tag.list({ projectId })
      if (response.tags.length === 0) {
        const defaults = [
          { name: 'UI Design', color: PRESET_COLORS[5] },
          { name: 'Bug', color: PRESET_COLORS[0] },
          { name: 'Feature', color: PRESET_COLORS[3] },
          { name: 'Frontend', color: PRESET_COLORS[6] },
          { name: 'Backend', color: PRESET_COLORS[7] },
        ]
        const createdTags = await Promise.all(
          defaults.map((d) => window.api.tag.create({ projectId, ...d }))
        )
        setTags(createdTags.sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        setTags(response.tags)
      }
    } catch (error) {
      console.error('Failed to load tags:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    try {
      const tag = await window.api.tag.create({
        projectId,
        name: newTagName.trim(),
        color: selectedColor,
      })
      setTags([...tags, tag].sort((a, b) => a.name.localeCompare(b.name)))
      setNewTagName('')
    } catch (error) {
      console.error('Failed to create tag:', error)
    }
  }

  const handleDeleteTag = async (id: string) => {
    try {
      const result = await window.api.tag.delete({ id })
      if (result.ok) {
        setTags(tags.filter((t) => t.id !== id))
      }
    } catch (error) {
      console.error('Failed to delete tag:', error)
    }
  }

  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TagIcon className="w-4 h-4 text-blue-400" />
          <div className="text-xs text-slate-500 uppercase tracking-wider">Tag Management</div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-xs text-slate-400">New Tag Name</label>
            <input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="e.design, bug, critical..."
              className="w-full bg-[#0B0E14] border border-slate-800/60 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-400 flex items-center gap-1">
              <Palette className="w-3 h-3" /> Color
            </label>
            <div className="flex gap-1.5 p-1 bg-[#0B0E14] border border-slate-800/60 rounded-lg">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    'w-6 h-6 rounded-md transition-all transform hover:scale-110 active:scale-95',
                    selectedColor === color
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0B0E14] scale-110'
                      : 'opacity-70 hover:opacity-100'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={handleCreateTag}
            disabled={!newTagName.trim()}
            className="h-10 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg flex items-center gap-2 text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Tag
          </button>
        </div>

        <div className="border border-slate-800/60 rounded-xl overflow-hidden bg-[#0B0E14]/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/30 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Color Chip</th>
                <th className="px-4 py-3 font-semibold w-20 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tags.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-xs text-slate-600 italic">
                    {isLoading
                      ? 'Loading tags...'
                      : 'No tags created yet. Add your first tag above.'}
                  </td>
                </tr>
              ) : (
                tags.map((tag) => (
                  <tr key={tag.id} className="group hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-slate-200">{tag.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shadow-sm"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-[10px] font-mono text-slate-500 uppercase">
                          {tag.color}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
                        title="Delete Tag"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
