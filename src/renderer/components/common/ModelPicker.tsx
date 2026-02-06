import { useState } from 'react'
import { Cpu, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { OpencodeModel } from '@/shared/types/ipc'

export const DIFFICULTY_STYLES = {
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

interface ModelPickerProps {
  value: string | null
  models: OpencodeModel[]
  onChange: (value: string | null) => void
  placeholder?: string
  className?: string
  allowAuto?: boolean
  difficulty?: string
  showVariantSelector?: boolean
}

const getModelDisplayName = (name: string) => name.split('/').pop() || name

export function ModelPicker({
  value,
  models,
  onChange,
  placeholder = 'Select Model',
  className,
  allowAuto = false,
  difficulty,
  showVariantSelector = true,
}: ModelPickerProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [hoveredModel, setHoveredModel] = useState<string | null>(null)

  const [baseName, variant] = value ? value.split('#') : [null, null]
  const currentModel = models.find((m) => m.name === baseName)

  const displayDifficulty = (currentModel?.difficulty ||
    difficulty ||
    'easy') as keyof typeof DIFFICULTY_STYLES
  const modelStyles = DIFFICULTY_STYLES[displayDifficulty] || DIFFICULTY_STYLES.easy

  const handleSelectModel = (modelName: string | null, variant?: string) => {
    if (modelName === null) {
      onChange(null)
    } else {
      const fullId = variant ? `${modelName}#${variant}` : modelName
      onChange(fullId)
    }
    setIsPickerOpen(false)
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
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
              <span className="text-slate-500 italic">{allowAuto ? 'Auto' : placeholder}</span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'w-3 h-3 ml-2 opacity-50 transition-transform',
              isPickerOpen && 'rotate-180'
            )}
          />
        </button>

        {isPickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsPickerOpen(false)} />
            <div className="absolute left-0 top-full mt-2 min-w-full w-max max-h-64 overflow-y-auto no-scrollbar bg-[#161B26] border border-slate-800 rounded-xl shadow-2xl z-20 py-2 animate-in fade-in zoom-in-95 duration-200">
              {models.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-500 italic">
                  No models available.
                </div>
              ) : (
                <>
                  {allowAuto && (
                    <button
                      onClick={() => handleSelectModel(null)}
                      onMouseEnter={() => setHoveredModel('auto')}
                      onMouseLeave={() => setHoveredModel(null)}
                      className={cn(
                        'w-full flex items-center px-3 py-2 rounded-lg text-xs transition-all text-left',
                        !value || hoveredModel === 'auto'
                          ? cn(modelStyles.bg, modelStyles.text)
                          : 'text-slate-400 opacity-70'
                      )}
                    >
                      <span className="italic">Auto (based on difficulty)</span>
                    </button>
                  )}
                  {models.map((model) => {
                    const isSelected = baseName === model.name
                    const isHovered = hoveredModel === model.name
                    const styles =
                      DIFFICULTY_STYLES[model.difficulty as keyof typeof DIFFICULTY_STYLES] ||
                      DIFFICULTY_STYLES.easy
                    return (
                      <button
                        key={model.name}
                        onClick={() => {
                          const variants = model.variants
                            ? model.variants.split(',').map((v) => v.trim())
                            : []
                          handleSelectModel(
                            model.name,
                            variants.length > 0 ? variants[0] : undefined
                          )
                        }}
                        onMouseEnter={() => setHoveredModel(model.name)}
                        onMouseLeave={() => setHoveredModel(null)}
                        className={cn(
                          'w-full flex items-center px-3 py-2 rounded-lg text-xs transition-all text-left',
                          isSelected || isHovered
                            ? cn(styles.bg, styles.text)
                            : cn(styles.text, 'opacity-70')
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

      {showVariantSelector && currentModel && currentModel.variants && (
        <div className="relative group/variant">
          <select
            value={variant || currentModel.variants.split(',')[0].trim()}
            onChange={(e) => handleSelectModel(currentModel.name, e.target.value)}
            className={cn(
              'appearance-none bg-slate-800/40 border border-slate-700/50 rounded-lg pl-2 pr-6 h-8 text-[10px] font-bold uppercase tracking-wider text-blue-400 cursor-pointer outline-none hover:bg-slate-800/60 hover:border-blue-500/30 transition-all',
              'group-hover/variant:border-blue-500/30'
            )}
          >
            {currentModel.variants.split(',').map((v) => {
              const vName = v.trim()
              return (
                <option key={vName} value={vName} className="bg-[#161B26] text-slate-300">
                  {vName}
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
