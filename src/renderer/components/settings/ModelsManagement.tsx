import { useEffect, useState, useMemo } from 'react'
import { Search, Cpu, Check, X, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { OpencodeModel } from '../../../shared/types/ipc'

type ModelsManagementProps = {
  onStatusChange: (status: { message: string; type: 'info' | 'error' | 'success' }) => void
}

export function ModelsManagement({ onStatusChange }: ModelsManagementProps) {
  const [models, setModels] = useState<OpencodeModel[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)

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

  const filteredModels = useMemo(() => {
    return models.filter((m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [models, searchQuery])

  const groupedModels = useMemo(() => {
    const groups: Record<string, OpencodeModel[]> = {}
    filteredModels.forEach((model) => {
      const [provider] = model.name.split('/')
      const providerName = provider || 'Other'
      if (!groups[providerName]) {
        groups[providerName] = []
      }
      groups[providerName].push(model)
    })
    return groups
  }, [filteredModels])

  const allProviders = Object.keys(groupedModels).sort()
  const isAllEnabled = filteredModels.length > 0 && filteredModels.every((m) => m.enabled)

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
            <p className="text-xs text-slate-500 font-medium">Manage available LLM models</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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

      <div className="space-y-8">
        {allProviders.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800/60">
            <p className="text-slate-500 text-sm">No models found matching your search</p>
          </div>
        ) : (
          allProviders.map((provider) => {
            const providerModels = groupedModels[provider]
            const isProviderAllEnabled = providerModels.every((m) => m.enabled)

            return (
              <div key={provider} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/40 pb-2">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    {provider}
                  </h4>
                  <button
                    onClick={() => handleToggleAll(providerModels, !isProviderAllEnabled)}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest"
                  >
                    {isProviderAllEnabled ? 'Disable Group' : 'Enable Group'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {providerModels.map((model) => {
                    const [, modelName] = model.name.split('/')
                    return (
                      <div
                        key={model.name}
                        onClick={() => handleToggleModel(model.name, !model.enabled)}
                        className={cn(
                          "group relative p-4 rounded-xl border transition-all cursor-pointer",
                          model.enabled
                            ? "bg-blue-500/5 border-blue-500/40 shadow-lg shadow-blue-500/5"
                            : "bg-slate-900/40 border-slate-800/60 hover:border-slate-800"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors">
                              {modelName || model.name}
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
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
