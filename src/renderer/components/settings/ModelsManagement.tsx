import { useEffect, useState, useMemo } from 'react'
import { cn } from '../../lib/utils'
import type { OpencodeModel } from '../../../shared/types/ipc'

import { OhMyOpencodeSettings } from './OhMyOpencodeSettings'
import { AllModelsTab } from './AllModelsTab'
import { MyModelsTab } from './MyModelsTab'

type ModelsManagementProps = {
  onStatusChange: (status: { message: string; type: 'info' | 'error' | 'success' }) => void
}

export function ModelsManagement({ onStatusChange }: ModelsManagementProps) {
  const [models, setModels] = useState<OpencodeModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'my' | 'oh-my-opencode'>('all')
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

  const enabledModelsCount = useMemo(() => models.filter((m) => m.enabled).length, [models])

  if (isLoading && models.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="bg-slate-950 flex items-center p-1 bg-slate-900/50 rounded-xl border border-slate-800/40 mb-4 w-fit shrink-0">
        <button
          onClick={() => setActiveSubTab('all')}
          className={cn(
            'px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg focus:outline-none',
            activeSubTab === 'all'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
          )}
        >
          All Models
        </button>
        <button
          onClick={() => setActiveSubTab('my')}
          className={cn(
            'px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg focus:outline-none',
            activeSubTab === 'my'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
          )}
        >
          My Models ({enabledModelsCount})
        </button>
        <button
          onClick={() => setActiveSubTab('oh-my-opencode')}
          className={cn(
            'px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg focus:outline-none',
            activeSubTab === 'oh-my-opencode'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
          )}
        >
          Oh-My-OpenCode
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'all' && (
          <AllModelsTab
            models={models}
            onStatusChange={onStatusChange}
            handleToggleModel={handleToggleModel}
            handleToggleAll={handleToggleAll}
            handleRefreshModels={handleRefreshModels}
          />
        )}

        {activeSubTab === 'my' && (
          <MyModelsTab
            models={models}
            defaultModels={defaultModels}
            onStatusChange={onStatusChange}
            handleToggleModel={handleToggleModel}
            handleUpdateDifficulty={handleUpdateDifficulty}
            handleSetDefaultModel={handleSetDefaultModel}
          />
        )}

        {activeSubTab === 'oh-my-opencode' && (
          <OhMyOpencodeSettings onStatusChange={onStatusChange} />
        )}
      </div>
    </div>
  )
}
