import { useState, useEffect } from 'react'
import { Cpu } from 'lucide-react'
import type { KanbanTask, OpencodeModel } from '@/shared/types/ipc'
import { cn } from '../../../../lib/utils'

interface TaskDetailsModelProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
}

const getModelDisplayName = (name: string) => name.split('/').pop() || name

const DIFFICULTY_STYLES = {
  easy: {
    text: 'text-emerald-400',
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500/10',
    badge: 'bg-emerald-500/20 text-emerald-400',
    glow: 'shadow-[0_0_10px_rgba(16,185,129,0.2)]',
    hover: 'hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/5',
  },
  medium: {
    text: 'text-blue-400',
    border: 'border-blue-500/50',
    bg: 'bg-blue-500/10',
    badge: 'bg-blue-500/20 text-blue-400',
    glow: 'shadow-[0_0_10px_rgba(59,130,246,0.2)]',
    hover: 'hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/5',
  },
  hard: {
    text: 'text-amber-400',
    border: 'border-amber-500/50',
    bg: 'bg-amber-500/10',
    badge: 'bg-amber-500/20 text-amber-400',
    glow: 'shadow-[0_0_10px_rgba(245,158,11,0.2)]',
    hover: 'hover:text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/5',
  },
  epic: {
    text: 'text-purple-400',
    border: 'border-purple-500/50',
    bg: 'bg-purple-500/10',
    badge: 'bg-purple-500/20 text-purple-400',
    glow: 'shadow-[0_0_10px_rgba(168,85,247,0.2)]',
    hover: 'hover:text-purple-400 hover:border-purple-500/50 hover:bg-purple-500/5',
  },
} as const

export function TaskDetailsModel({ task, onUpdate }: TaskDetailsModelProps) {
  const [models, setModels] = useState<OpencodeModel[]>([])
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  useEffect(() => {
    loadEnabledModels()
  }, [])

  const loadEnabledModels = async () => {
    try {
      const response = await window.api.opencode.listEnabledModels()
      setModels(response.models)
    } catch (error) {
      console.error('Failed to load models:', error)
    }
  }

  const selectModel = (modelName: string | null, variant?: string) => {
    if (modelName === null) {
      onUpdate?.(task.id, { modelName: null })
    } else {
      const fullId = variant ? `${modelName}#${variant}` : modelName
      onUpdate?.(task.id, { modelName: fullId })
    }
    setIsPickerOpen(false)
  }

  const getModelInfo = (fullId: string | null) => {
    if (!fullId) return null
    const [baseName] = fullId.split('#')
    return models.find((m) => m.name === baseName)
  }

  const taskModelId = task.modelName || null
  const [taskBaseName, taskVariant] = taskModelId ? taskModelId.split('#') : [null, null]
  const currentModel = getModelInfo(taskModelId)
  const displayDifficulty = currentModel?.difficulty || task.difficulty
  const modelStyles = DIFFICULTY_STYLES[displayDifficulty]

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setIsPickerOpen(!isPickerOpen)}
          className={cn(
            'w-max flex items-center justify-between px-3 h-8 rounded-lg text-[11px] transition-all border whitespace-nowrap',
            isPickerOpen
              ? cn(modelStyles.bg, modelStyles.text, modelStyles.border, modelStyles.glow)
              : cn(
                  'bg-slate-800/50 border-slate-700',
                  modelStyles.text,
                  modelStyles.border,
                  modelStyles.hover
                )
          )}
        >
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3" />
            {currentModel ? (
              <span className="font-semibold tracking-tight">
                {getModelDisplayName(currentModel.name)}
              </span>
            ) : (
              <span className="text-slate-500 italic">Auto</span>
            )}
          </div>
        </button>

        {isPickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsPickerOpen(false)} />
            <div className="absolute left-0 top-full mt-2 min-w-full w-max max-h-64 overflow-y-auto no-scrollbar bg-[#161B26] border border-slate-800 rounded-xl shadow-2xl z-20 py-2 animate-in fade-in zoom-in-95 duration-200">
              {models.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-500 italic">
                  No enabled models found. Enable them in Settings.
                </div>
              ) : (
                <>
                  <button
                    onClick={() => selectModel(null)}
                    className={cn(
                      'w-full flex items-center px-3 py-2 rounded-lg text-xs transition-all',
                      !task.modelName
                        ? cn(modelStyles.bg, modelStyles.text)
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    )}
                  >
                    <span className="italic">Auto (based on difficulty)</span>
                  </button>
                  {models.map((model) => {
                    const isSelected = taskBaseName === model.name
                    const modelStyles = DIFFICULTY_STYLES[model.difficulty]
                    return (
                      <button
                        key={model.name}
                        onClick={() => {
                          const variants = model.variants
                            ? model.variants.split(',').map((v) => v.trim())
                            : []
                          selectModel(model.name, variants.length > 0 ? variants[0] : undefined)
                        }}
                        className={cn(
                          'w-full flex items-center px-3 py-2 rounded-lg text-xs transition-all',
                          isSelected
                            ? cn(modelStyles.bg, modelStyles.text)
                            : cn(
                                modelStyles.text,
                                'opacity-70 hover:opacity-100',
                                modelStyles.hover
                              )
                        )}
                      >
                        <span className="font-medium">{getModelDisplayName(model.name)}</span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {currentModel && currentModel.variants && (
        <div className="relative group/variant">
          <select
            value={taskVariant || currentModel.variants.split(',')[0].trim()}
            onChange={(e) => selectModel(currentModel.name, e.target.value)}
            className={cn(
              'appearance-none bg-slate-800/40 border border-slate-700/50 rounded-lg pl-2 pr-6 h-8 text-[10px] font-bold uppercase tracking-wider text-blue-400 cursor-pointer outline-none hover:bg-slate-800/60 hover:border-blue-500/30 transition-all',
              'group-hover/variant:border-blue-500/30'
            )}
          >
            {currentModel.variants.split(',').map((v) => {
              const variant = v.trim()
              return (
                <option key={variant} value={variant} className="bg-[#161B26] text-slate-300">
                  {variant}
                </option>
              )
            })}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover/variant:text-blue-400 transition-colors">
            <svg
              width="8"
              height="6"
              viewBox="0 0 8 6"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 1.5L4 4.5L7 1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}
