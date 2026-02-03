import { useEffect, useState, useMemo } from 'react'
import { Search, Cpu, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Maximize2, Minimize2, Gift } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { OpencodeModel } from '../../../shared/types/ipc'

type ModelsManagementProps = {
  onStatusChange: (status: { message: string; type: 'info' | 'error' | 'success' }) => void
}

export function ModelsManagement({ onStatusChange }: ModelsManagementProps) {
  const [models, setModels] = useState<OpencodeModel[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [showFreeOnly, setShowFreeOnly] = useState(false)

  const loadModels = async () => {
    try {
      setIsLoading(true)
      const response = await window.api.opencode.listModels()
      setModels(response.models)
    } catch (error) {
      console.error('Failed to load models:', error)
      onStatusChange({ message: 'Failed to load models', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadModels()
  }, [])

  const handleToggleModel = async (name: string, enabled: boolean) => {
    try {
      await window.api.opencode.toggleModel({ name, enabled })
      setModels((prev) =>
        prev.map((m) => (m.name === name ? { ...m, enabled } : m))
      )
    } catch (error) {
      console.error('Failed to toggle model:', error)
      onStatusChange({ message: 'Failed to update model status', type: 'error' })
    }
  }

  const handleToggleAll = async (targetModels: OpencodeModel[], enabled: boolean) => {
    try {
      await Promise.all(
        targetModels.map((m) => window.api.opencode.toggleModel({ name: m.name, enabled }))
      )
      const updatedNames = new Set(targetModels.map((m) => m.name))
      setModels((prev) =>
        prev.map((m) => (updatedNames.has(m.name) ? { ...m, enabled } : m))
      )
      onStatusChange({
        message: `${enabled ? 'Enabled' : 'Disabled'} ${targetModels.length} models`,
        type: 'success',
      })
    } catch (error) {
      console.error('Failed to toggle models:', error)
      onStatusChange({ message: 'Failed to update models', type: 'error' })
    }
  }

  const toggleGroup = (provider: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [provider]: !prev[provider]
    }))
  }

  const setAllExpanded = (expanded: boolean) => {
    const newExpanded: Record<string, boolean> = {}
    allProviders.forEach(provider => {
      newExpanded[provider] = expanded
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
    const enabled = filteredModels.filter(m => m.enabled).length
    return { total, enabled }
  }, [filteredModels])

  const groupedModels = useMemo(() => {
    const groups: Record<string, { models: OpencodeModel[], enabled: number }> = {}
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

  useEffect(() => {
    if (searchQuery.trim().length > 0 || showFreeOnly) {
      const newExpanded: Record<string, boolean> = {}
      allProviders.forEach(provider => {
        newExpanded[provider] = true
      })
      setExpandedGroups(newExpanded)
    }
  }, [searchQuery, allProviders, showFreeOnly])

  if (isLoading && models.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
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
          <div className="flex items-center bg-slate-900/40 border border-slate-800/60 rounded-xl p-1">
            <button
              onClick={() => setShowFreeOnly(!showFreeOnly)}
              title="Show Free Only"
              className={cn(
                "p-1.5 rounded-lg transition-all flex items-center gap-2 px-3",
                showFreeOnly 
                  ? "bg-emerald-500/20 text-emerald-400" 
                  : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
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
              className="pl-10 pr-4 py-2 bg-[#0B0E14] border border-slate-800/60 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all w-64"
            />
          </div>
          
          <button
            onClick={() => handleToggleAll(filteredModels, !isAllEnabled)}
            className={cn(
              "px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2",
              isAllEnabled 
                ? "bg-slate-800 text-slate-400 hover:text-slate-300" 
                : "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500"
            )}
          >
            {isAllEnabled ? (
              <><ToggleLeft className="w-4 h-4" /> Disable All</>
            ) : (
              <><ToggleRight className="w-4 h-4" /> Enable All</>
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

            return (
              <div 
                key={provider} 
                className={cn(
                  "bg-[#11151C] border rounded-2xl overflow-hidden shadow-xl transition-all duration-300",
                  hasEnabledModels 
                    ? "border-blue-500/30 shadow-blue-500/5" 
                    : "border-slate-800/50"
                )}
              >
                <div 
                  onClick={() => toggleGroup(provider)}
                  className={cn(
                    "flex items-center justify-between p-4 cursor-pointer transition-all",
                    hasEnabledModels 
                      ? "bg-blue-500/[0.03] hover:bg-blue-500/[0.06]" 
                      : "hover:bg-slate-800/20"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "transition-colors",
                      hasEnabledModels ? "text-blue-400" : "text-slate-500"
                    )}>
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <h4 className={cn(
                      "text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
                      hasEnabledModels ? "text-slate-200" : "text-slate-400"
                    )}>
                      {provider}
                    </h4>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all",
                      hasEnabledModels 
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                        : "bg-slate-800 text-slate-500 border-slate-700/50"
                    )}>
                      {group.enabled} / {group.models.length}
                    </span>
                  </div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleAll(group.models, !isProviderAllEnabled)
                    }}
                    className={cn(
                      "w-8 h-4.5 rounded-full transition-all relative flex items-center px-1 cursor-pointer",
                      isProviderAllEnabled ? "bg-blue-600" : "bg-slate-700"
                    )}
                  >
                    <div
                      className={cn(
                        "w-2.5 h-2.5 rounded-full bg-white transition-all shadow-sm",
                        isProviderAllEnabled ? "translate-x-3.5" : "translate-x-0"
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
                            "group relative p-4 rounded-xl border transition-all cursor-pointer",
                            model.enabled
                              ? "bg-blue-500/5 border-blue-500/40 shadow-lg shadow-blue-500/5"
                              : "bg-[#0B0E14] border-slate-800/60 hover:border-slate-800"
                          )}
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
                                "w-8 h-4.5 rounded-full transition-all relative flex items-center px-1",
                                model.enabled ? "bg-blue-600" : "bg-slate-700"
                              )}
                            >
                              <div
                                className={cn(
                                  "w-2.5 h-2.5 rounded-full bg-white transition-all shadow-sm",
                                  model.enabled ? "translate-x-3.5" : "translate-x-0"
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
    </div>
  )
}
