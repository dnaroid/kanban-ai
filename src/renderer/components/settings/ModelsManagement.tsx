import { useEffect, useState, useMemo } from 'react'
import {
  Search,
  Cpu,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Gift,
  Trash2,
  Star,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { OpencodeModel } from '../../../shared/types/ipc'

import { ModelPicker } from '../common/ModelPicker'

type ModelsManagementProps = {
  onStatusChange: (status: { message: string; type: 'info' | 'error' | 'success' }) => void
}

export function ModelsManagement({ onStatusChange }: ModelsManagementProps) {
  const [models, setModels] = useState<OpencodeModel[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [showFreeOnly, setShowFreeOnly] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'my'>('all')
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({})

  const loadModels = async () => {
    try {
      setIsLoading(true)
      const response = await window.api.opencode.listModels()
      setModels(response.models)

      // Load default models for each difficulty
      const defaults: Record<string, string> = {}
      for (const diff of ['easy', 'medium', 'hard', 'epic'] as const) {
        const res = await window.api.appSetting.getDefaultModel({ difficulty: diff })
        if (res.modelName) {
          defaults[diff] = res.modelName
        }
      }
      setDefaultModels(defaults)
    } catch (error) {
      console.error('Failed to load models:', error)
      onStatusChange({ message: 'Failed to load models', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetDefaultModel = async (
    difficulty: 'easy' | 'medium' | 'hard' | 'epic',
    modelName: string,
    variant?: string
  ) => {
    try {
      const fullId = variant ? `${modelName}#${variant}` : modelName
      await window.api.appSetting.setDefaultModel({ difficulty, modelName: fullId })
      setDefaultModels((prev) => ({ ...prev, [difficulty]: fullId }))
      onStatusChange({ message: `Set default ${difficulty} model`, type: 'success' })
    } catch (error) {
      console.error('Failed to set default model:', error)
      onStatusChange({ message: 'Failed to set default model', type: 'error' })
    }
  }

  useEffect(() => {
    loadModels()
  }, [])

  const handleToggleModel = async (name: string, enabled: boolean) => {
    try {
      await window.api.opencode.toggleModel({ name, enabled })
      setModels((prev) => prev.map((m) => (m.name === name ? { ...m, enabled } : m)))
    } catch (error) {
      console.error('Failed to toggle model:', error)
      onStatusChange({ message: 'Failed to update model status', type: 'error' })
    }
  }

  const handleUpdateDifficulty = async (
    name: string,
    difficulty: 'easy' | 'medium' | 'hard' | 'epic'
  ) => {
    try {
      await window.api.opencode.updateModelDifficulty({ name, difficulty })
      setModels((prev) => prev.map((m) => (m.name === name ? { ...m, difficulty } : m)))
    } catch (error) {
      console.error('Failed to update model difficulty:', error)
      onStatusChange({ message: 'Failed to update model difficulty', type: 'error' })
    }
  }

  const handleToggleAll = async (targetModels: OpencodeModel[], enabled: boolean) => {
    try {
      await Promise.all(
        targetModels.map((m) => window.api.opencode.toggleModel({ name: m.name, enabled }))
      )
      const updatedNames = new Set(targetModels.map((m) => m.name))
      setModels((prev) => prev.map((m) => (updatedNames.has(m.name) ? { ...m, enabled } : m)))
      onStatusChange({
        message: `${enabled ? 'Enabled' : 'Disabled'} ${targetModels.length} models`,
        type: 'success',
      })
    } catch (error) {
      console.error('Failed to toggle models:', error)
      onStatusChange({ message: 'Failed to update models', type: 'error' })
    }
  }

  const handleRefreshModels = async () => {
    try {
      setIsLoading(true)
      await window.api.opencode.refreshModels()
      await loadModels()
      onStatusChange({ message: 'Models refreshed from connected providers', type: 'success' })
    } catch (error) {
      console.error('Failed to refresh models:', error)
      onStatusChange({ message: 'Failed to refresh models', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const toggleGroup = (provider: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }))
  }

  const setAllExpanded = (expanded: boolean) => {
    const newExpanded: Record<string, boolean> = {}
    allProviders.forEach((provider) => {
      newExpanded[provider] = expanded
    })
    difficulties.forEach((d) => {
      newExpanded[`diff:${d.value}`] = expanded
    })
    setExpandedGroups(newExpanded)
  }

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFree = !showFreeOnly || m.name.toLowerCase().includes('free')
      return matchesSearch && matchesFree
    })
  }, [models, searchQuery, showFreeOnly])

  const stats = useMemo(() => {
    const total = filteredModels.length
    const enabled = filteredModels.filter((m) => m.enabled).length
    return { total, enabled }
  }, [filteredModels])

  const groupedModels = useMemo(() => {
    const groups: Record<string, { models: OpencodeModel[]; enabled: number }> = {}
    filteredModels.forEach((model) => {
      const chunks = model.name.split('/')
      const providerName = chunks.length > 1 ? chunks[0] : 'Other'
      if (!groups[providerName]) {
        groups[providerName] = { models: [], enabled: 0 }
      }
      groups[providerName].models.push(model)
      if (model.enabled) groups[providerName].enabled++
    })
    return groups
  }, [filteredModels])

  const allProviders = Object.keys(groupedModels).sort()
  const isAllEnabled = stats.total > 0 && stats.enabled === stats.total

  const enabledModels = useMemo(() => models.filter((m) => m.enabled), [models])

  const difficulties = [
    { value: 'easy', label: 'Easy', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { value: 'medium', label: 'Medium', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { value: 'hard', label: 'Hard', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { value: 'epic', label: 'Epic', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ] as const

  useEffect(() => {
    if (searchQuery.trim().length > 0 || showFreeOnly) {
      const newExpanded: Record<string, boolean> = {}
      allProviders.forEach((provider) => {
        newExpanded[provider] = true
      })
      setExpandedGroups(newExpanded)
    }
  }, [searchQuery, allProviders, showFreeOnly])

  const enabledModelsByDifficulty = useMemo(() => {
    const groups: Record<string, OpencodeModel[]> = {
      easy: [],
      medium: [],
      hard: [],
      epic: [],
    }
    enabledModels.forEach((m) => {
      groups[m.difficulty].push(m)
    })
    return groups
  }, [enabledModels])

  const getProviderColor = (name: string) => {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const h = Math.abs(hash) % 360
    return {
      border: `hsla(${h}, 70%, 50%, 0.4)`,
      bg: `hsla(${h}, 70%, 50%, 0.05)`,
      text: `hsl(${h}, 70%, 60%)`,
    }
  }

  const getDifficultyStyles = (diff: string) => {
    switch (diff) {
      case 'easy':
        return {
          border: 'rgba(16, 185, 129, 0.4)',
          bg: 'rgba(16, 185, 129, 0.05)',
          text: 'rgb(52, 211, 153)',
        }
      case 'medium':
        return {
          border: 'rgba(59, 130, 246, 0.4)',
          bg: 'rgba(59, 130, 246, 0.05)',
          text: 'rgb(96, 165, 250)',
        }
      case 'hard':
        return {
          border: 'rgba(249, 115, 22, 0.4)',
          bg: 'rgba(249, 115, 22, 0.05)',
          text: 'rgb(251, 146, 60)',
        }
      case 'epic':
        return {
          border: 'rgba(168, 85, 247, 0.4)',
          bg: 'rgba(168, 85, 247, 0.05)',
          text: 'rgb(192, 132, 252)',
        }
      default:
        return {
          border: 'rgba(100, 116, 139, 0.4)',
          bg: 'rgba(100, 116, 139, 0.05)',
          text: 'rgb(148, 163, 184)',
        }
    }
  }

  if (isLoading && models.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-slate-800/40 mb-6">
        <button
          onClick={() => setActiveSubTab('all')}
          className={cn(
            'px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all border-b-2',
            activeSubTab === 'all'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          )}
        >
          All Models
        </button>
        <button
          onClick={() => setActiveSubTab('my')}
          className={cn(
            'px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all border-b-2',
            activeSubTab === 'my'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          )}
        >
          My Models ({enabledModels.length})
        </button>
      </div>

      {activeSubTab === 'all' ? (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">AI Models</h3>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-500 font-medium">Manage available LLM models</p>
                  <div className="h-1 w-1 rounded-full bg-slate-700" />
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">
                    {stats.enabled} / {stats.total} Active
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshModels}
                title="Refresh models from connected providers"
                className="px-3 py-2 bg-slate-800/40 border border-slate-800/60 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh</span>
              </button>
              <div className="flex items-center bg-slate-900/40 border border-slate-800/60 rounded-xl p-1">
                <button
                  onClick={() => setShowFreeOnly(!showFreeOnly)}
                  title="Show Free Only"
                  className={cn(
                    'p-1.5 rounded-lg transition-all flex items-center gap-2 px-3',
                    showFreeOnly
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  )}
                >
                  <Gift className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Free</span>
                </button>
                <div className="w-px h-4 bg-slate-800 mx-1" />
                <button
                  onClick={() => setAllExpanded(true)}
                  title="Expand All"
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-800 mx-1" />
                <button
                  onClick={() => setAllExpanded(false)}
                  title="Collapse All"
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-[#0B0E14] border border-slate-800/60 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all w-64 placeholder:text-slate-400"
                />
              </div>

              <button
                onClick={() => handleToggleAll(filteredModels, !isAllEnabled)}
                className={cn(
                  'px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2',
                  isAllEnabled
                    ? 'bg-slate-800 text-slate-400 hover:text-slate-300'
                    : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500'
                )}
              >
                {isAllEnabled ? (
                  <>
                    <ToggleLeft className="w-4 h-4" /> Disable All
                  </>
                ) : (
                  <>
                    <ToggleRight className="w-4 h-4" /> Enable All
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {allProviders.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800/60">
                <p className="text-slate-500 text-sm">No models found matching your search</p>
              </div>
            ) : (
              allProviders.map((provider) => {
                const group = groupedModels[provider]
                const isExpanded = expandedGroups[provider] || false
                const isProviderAllEnabled = group.enabled === group.models.length
                const hasEnabledModels = group.enabled > 0
                const colors = getProviderColor(provider)

                return (
                  <div
                    key={provider}
                    className={cn(
                      'border rounded-2xl overflow-hidden shadow-xl transition-all duration-300',
                      hasEnabledModels ? 'shadow-blue-500/5' : ''
                    )}
                    style={{
                      backgroundColor: colors.bg,
                      borderColor: hasEnabledModels ? colors.border : 'rgba(30, 41, 59, 0.5)',
                    }}
                  >
                    <div
                      onClick={() => toggleGroup(provider)}
                      className={cn(
                        'flex items-center justify-between p-4 cursor-pointer transition-all hover:bg-white/5'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="transition-colors"
                          style={{ color: hasEnabledModels ? colors.text : 'rgb(100, 116, 139)' }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </div>
                        <h4
                          className="text-[10px] font-black uppercase tracking-[0.2em] transition-colors"
                          style={{ color: hasEnabledModels ? 'white' : 'rgb(148, 163, 184)' }}
                        >
                          {provider}
                        </h4>
                        <span
                          className="px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all"
                          style={{
                            backgroundColor: hasEnabledModels ? colors.bg : 'rgba(30, 41, 59, 1)',
                            color: hasEnabledModels ? colors.text : 'rgb(100, 116, 139)',
                            borderColor: hasEnabledModels ? colors.border : 'rgba(51, 65, 85, 0.5)',
                          }}
                        >
                          {group.enabled} / {group.models.length}
                        </span>
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleAll(group.models, !isProviderAllEnabled)
                        }}
                        className={cn(
                          'w-8 h-4.5 rounded-full transition-all relative flex items-center px-1 cursor-pointer'
                        )}
                        style={{
                          backgroundColor: isProviderAllEnabled ? colors.text : 'rgb(51, 65, 85)',
                        }}
                      >
                        <div
                          className={cn(
                            'w-2.5 h-2.5 rounded-full bg-white transition-all shadow-sm',
                            isProviderAllEnabled ? 'translate-x-3.5' : 'translate-x-0'
                          )}
                        />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {group.models.map((model) => {
                          const chunks = model.name.split('/')
                          const modelDisplayName = chunks[chunks.length - 1]
                          return (
                            <div
                              key={model.name}
                              onClick={() => handleToggleModel(model.name, !model.enabled)}
                              className={cn(
                                'group relative p-4 rounded-xl border transition-all cursor-pointer'
                              )}
                              style={{
                                backgroundColor: model.enabled
                                  ? 'rgba(255, 255, 255, 0.03)'
                                  : 'transparent',
                                borderColor: model.enabled
                                  ? colors.border
                                  : 'rgba(30, 41, 59, 0.6)',
                              }}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors">
                                    {modelDisplayName}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-medium truncate">
                                    {model.name}
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    'w-8 h-4.5 rounded-full transition-all relative flex items-center px-1'
                                  )}
                                  style={{
                                    backgroundColor: model.enabled
                                      ? colors.text
                                      : 'rgb(51, 65, 85)',
                                  }}
                                >
                                  <div
                                    className={cn(
                                      'w-2.5 h-2.5 rounded-full bg-white transition-all shadow-sm',
                                      model.enabled ? 'translate-x-3.5' : 'translate-x-0'
                                    )}
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">My Models</h3>
                <p className="text-xs text-slate-500 font-medium">List of your selected models</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAllExpanded(true)}
                title="Expand All"
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all bg-slate-900/40 border border-slate-800/60"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setAllExpanded(false)}
                title="Collapse All"
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all bg-slate-900/40 border border-slate-800/60"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {difficulties.some((d) => !defaultModels[d.value]) && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400 mb-6">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div className="text-xs font-semibold">
                Missing default models for:{' '}
                {difficulties
                  .filter((d) => !defaultModels[d.value])
                  .map((d) => d.label)
                  .join(', ')}
              </div>
            </div>
          )}

          {enabledModels.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800/60">
              <p className="text-slate-500 text-sm">
                You haven't selected any models yet. Go to "All Models" to enable some.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {difficulties.map((diff) => {
                const groupModels = enabledModelsByDifficulty[diff.value]
                if (groupModels.length === 0) return null

                const isExpanded = expandedGroups[`diff:${diff.value}`] ?? false
                const styles = getDifficultyStyles(diff.value)
                const isDefaultSet = !!defaultModels[diff.value]

                return (
                  <div
                    key={diff.value}
                    className={cn(
                      'border rounded-2xl overflow-hidden shadow-xl transition-all duration-300'
                    )}
                    style={{
                      backgroundColor: styles.bg,
                      borderColor: isDefaultSet ? styles.border : 'rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <div
                      onClick={() => toggleGroup(`diff:${diff.value}`)}
                      className={cn(
                        'flex items-center justify-between p-4 cursor-pointer transition-all hover:bg-white/5'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="transition-colors flex-shrink-0"
                          style={{ color: styles.text }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </div>
                        <h4
                          className="text-[10px] font-black uppercase tracking-[0.2em] transition-colors flex-shrink-0"
                          style={{ color: 'white' }}
                        >
                          {diff.label}
                        </h4>
                        <div className="flex items-center gap-2 min-w-0">
                          <ModelPicker
                            value={defaultModels[diff.value] || null}
                            models={groupModels}
                            onChange={(val) => {
                              if (val) {
                                const [name, variant] = val.split('#')
                                handleSetDefaultModel(diff.value, name, variant)
                              }
                            }}
                            difficulty={diff.value}
                            placeholder="Select Default"
                          />
                          <span
                            className="px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all flex-shrink-0"
                            style={{
                              backgroundColor: styles.bg,
                              color: styles.text,
                              borderColor: styles.border,
                            }}
                          >
                            {groupModels.length} models
                          </span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupModels.map((model) => {
                          const chunks = model.name.split('/')
                          const modelDisplayName = chunks[chunks.length - 1]
                          const fullDefaultName = defaultModels[diff.value] || ''
                          const [defaultBaseName, defaultVariant] = fullDefaultName.split('#')
                          const isDefault = defaultBaseName === model.name

                          const variantsList = model.variants
                            ? model.variants.split(',').map((v) => v.trim())
                            : []

                          return (
                            <div
                              key={model.name}
                              className={cn(
                                'group relative p-5 rounded-2xl border transition-all duration-300',
                                isDefault
                                  ? 'bg-blue-500/[0.03] border-blue-500/50 shadow-xl shadow-blue-500/10'
                                  : 'bg-[#11151C] border-slate-800/60 hover:border-slate-800'
                              )}
                            >
                              <div className="flex items-start justify-between gap-4 mb-6">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={cn(
                                        'text-base font-bold truncate transition-colors',
                                        isDefault
                                          ? 'text-blue-400'
                                          : 'text-white group-hover:text-blue-400'
                                      )}
                                    >
                                      {modelDisplayName}
                                    </div>
                                    {isDefault && (
                                      <div className="px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[9px] font-black uppercase tracking-tighter text-blue-400">
                                        Default
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-medium truncate mt-1">
                                    {model.name}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      handleSetDefaultModel(
                                        diff.value,
                                        model.name,
                                        variantsList.length > 0
                                          ? defaultVariant || variantsList[0]
                                          : undefined
                                      )
                                    }
                                    className={cn(
                                      'p-2 rounded-lg transition-all',
                                      isDefault
                                        ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                                        : 'bg-slate-800/40 text-slate-500 hover:bg-blue-500/10 hover:text-blue-400'
                                    )}
                                    title={isDefault ? 'Default model' : 'Set as default model'}
                                  >
                                    <Star className={cn('w-4 h-4', isDefault && 'fill-current')} />
                                  </button>
                                  <button
                                    onClick={() => handleToggleModel(model.name, false)}
                                    className="p-2 rounded-lg bg-slate-800/40 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all"
                                    title="Remove model from my list"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-4">
                                {variantsList.length > 0 && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                      Variant
                                    </span>
                                    <div className="flex p-1 bg-[#0B0E14] border border-slate-800/60 rounded-xl gap-1 overflow-x-auto no-scrollbar">
                                      {variantsList.map((v) => {
                                        const isVariantActive = isDefault && defaultVariant === v
                                        return (
                                          <button
                                            key={v}
                                            onClick={() =>
                                              handleSetDefaultModel(diff.value, model.name, v)
                                            }
                                            className={cn(
                                              'px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap',
                                              isVariantActive
                                                ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40'
                                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                            )}
                                          >
                                            {v}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                    Complexity
                                  </span>
                                  <div className="flex p-1 bg-[#0B0E14] border border-slate-800/60 rounded-xl gap-1">
                                    {difficulties.map((d) => (
                                      <button
                                        key={d.value}
                                        onClick={() => handleUpdateDifficulty(model.name, d.value)}
                                        className={cn(
                                          'px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all',
                                          model.difficulty === d.value
                                            ? cn(
                                                d.bg,
                                                d.color,
                                                'ring-1 ring-inset',
                                                d.color
                                                  .replace('text-', 'ring-')
                                                  .replace('-400', '/40')
                                              )
                                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                        )}
                                      >
                                        {d.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
