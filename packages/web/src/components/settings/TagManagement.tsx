import { useState, useEffect } from 'react'
import { Plus, Trash2, Tag as TagIcon, Palette, Check, Hash } from 'lucide-react'
import type { Tag } from '@shared/types/ipc'
import { cn } from '@web/lib/utils'

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

export function TagManagement() {
  const [tags, setTags] = useState<Tag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[5])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadTags()
  }, [])

  const loadTags = async () => {
    setIsLoading(true)
    try {
      const response = await window.api.tag.list({})
      if (response.tags.length === 0) {
        const defaults = [
          { name: 'UI Design', color: PRESET_COLORS[5] },
          { name: 'Bug', color: PRESET_COLORS[0] },
          { name: 'Feature', color: PRESET_COLORS[3] },
          { name: 'Frontend', color: PRESET_COLORS[6] },
          { name: 'Backend', color: PRESET_COLORS[7] },
        ]
        const createdTags = await Promise.all(defaults.map((d) => window.api.tag.create(d)))
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
    <section className="bg-[#11151C] border border-slate-800/50 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20 flex items-center justify-center">
          <TagIcon className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Taxonomy</h3>
          <p className="text-xs text-slate-500 font-medium">
            Organize tasks with global categories
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                New Tag Identity
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Hash className="w-3.5 h-3.5 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="marketing, api, refactor..."
                  className="w-full bg-[#0B0E14] border border-slate-800/60 text-sm text-slate-200 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all placeholder:text-slate-400"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 pl-1">
                <Palette className="w-3 h-3" /> Signature Color
              </label>
              <div className="flex flex-wrap gap-2 p-2.5 bg-[#0B0E14] border border-slate-800/60 rounded-xl">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={cn(
                      'w-7 h-7 rounded-lg transition-all duration-300 relative group flex items-center justify-center',
                      selectedColor === color
                        ? 'scale-110 shadow-lg'
                        : 'opacity-40 hover:opacity-100 hover:scale-105'
                    )}
                    style={{
                      backgroundColor: color,
                      boxShadow: selectedColor === color ? `0 0 15px ${color}40` : 'none',
                    }}
                  >
                    {selectedColor === color && (
                      <Check className="w-3.5 h-3.5 text-white animate-in zoom-in-50 duration-300" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              className="w-full py-3 text-xs font-black uppercase tracking-widest rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none transition-all duration-300 shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Register Tag
            </button>
          </div>

          <div className="bg-[#0B0E14] border border-slate-800/60 rounded-xl overflow-hidden shadow-inner shadow-black/40">
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-900/50 backdrop-blur-md">
                  <tr className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-black">
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Hex</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {tags.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center">
                        <p className="text-xs text-slate-600 font-medium italic">
                          {isLoading ? 'Synchronizing tags...' : 'No active tags found'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    tags.map((tag) => (
                      <tr key={tag.id} className="group hover:bg-slate-800/20 transition-all">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: tag.color,
                                boxShadow: `0 0 8px ${tag.color}60`,
                              }}
                            />
                            <span className="text-xs font-bold text-slate-200">{tag.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400 transition-colors uppercase tracking-wider">
                            {tag.color}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => handleDeleteTag(tag.id)}
                            className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
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
      </div>
    </section>
  )
}
