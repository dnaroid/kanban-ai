import { useState, useEffect } from 'react'
import { Cpu } from 'lucide-react'
import type { KanbanTask, OpencodeModel } from '@/shared/types/ipc'
import { cn } from '../../../../lib/utils'

interface TaskDetailsModelProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
}

export function TaskDetailsModel({ task, onUpdate }: TaskDetailsModelProps) {
  const [models, setModels] = useState<OpencodeModel[]>([])
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  useEffect(() => {
    loadEnabledModels()
  }, [])

  const loadEnabledModels = async () => {
    try {
      const response = await window.api.opencode.listEnabledModels({})
      setModels(response.models)
    } catch (error) {
      console.error('Failed to load models:', error)
    }
  }

  const selectModel = (modelName: string | null) => {
    onUpdate?.(task.id, { modelName })
    setIsPickerOpen(false)
  }

  const getModelInfo = (modelName: string | null) => {
    if (!modelName) return null
    return models.find((m) => m.name === modelName)
  }

  const currentModel = getModelInfo(task.modelName || null)

  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
        <Cpu className="w-3 h-3" />
        Model
      </label>

      <div className="relative">
        <button
          onClick={() => setIsPickerOpen(!isPickerOpen)}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all',
            isPickerOpen
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
              : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/5'
          )}
        >
          {currentModel ? (
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400">
                {currentModel.difficulty}
              </span>
              <span>{currentModel.name}</span>
            </div>
          ) : (
            <span>Select a model...</span>
          )}
        </button>

        {isPickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsPickerOpen(false)} />
            <div className="absolute left-0 top-full mt-2 w-full bg-[#161B26] border border-slate-800 rounded-xl shadow-2xl z-20 py-2 animate-in fade-in zoom-in-95 duration-200">
              {models.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-500 italic">
                  No enabled models found. Enable them in Settings.
                </div>
              ) : (
                <>
                  <button
                    onClick={() => selectModel(null)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all',
                      !task.modelName
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    )}
                  >
                    <span>Auto (based on difficulty)</span>
                  </button>
                  {models.map((model) => {
                    const isSelected = task.modelName === model.name
                    return (
                      <button
                        key={model.name}
                        onClick={() => selectModel(model.name)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all',
                          isSelected
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-700/50 text-slate-400">
                            {model.difficulty}
                          </span>
                          <span>{model.name}</span>
                        </div>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
