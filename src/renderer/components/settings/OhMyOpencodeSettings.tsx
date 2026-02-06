import { useEffect, useMemo, useState } from 'react'
import {
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Cpu,
  FileText,
  FolderOpen,
  Globe,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { ModelPicker } from '../common/ModelPicker'
import type { OpencodeModel } from '../../../shared/types/ipc'
import type {
  AgentConfig,
  AgentPermission,
  CategoryConfig,
  OhMyOpencodeConfig,
  PermissionValue,
  ThinkingConfig,
} from './OhMyOpencodeTypes'

type OhMyOpencodeSettingsProps = {
  onStatusChange: (status: { message: string; type: 'info' | 'error' | 'success' }) => void
}

const TEXT_VERBOSITIES = ['low', 'medium', 'high']

const getColorFromName = (name: string) => {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-purple-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-indigo-500',
    'bg-cyan-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// --- Helper Components ---

function SectionHeader({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: any
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-slate-300">
        <Icon className="w-4 h-4 text-blue-400" />
        <h4 className="text-sm font-bold uppercase tracking-wider">{title}</h4>
      </div>
      {children}
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: {
  label: string
  value: string | number | undefined
  onChange: (val: string) => void
  placeholder?: string
  type?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
        {label}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2.5 hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all placeholder:text-slate-600"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: string | undefined
  options: string[]
  onChange: (val: string) => void
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
        {label}
      </label>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2.5 hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
        >
          <option value="">Default / None</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-4 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
      </div>
    </div>
  )
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | undefined
  onChange: (val: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-[#161B26] border border-slate-700 rounded-xl">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'w-10 h-5 rounded-full transition-colors relative',
          value ? 'bg-blue-600' : 'bg-slate-700'
        )}
      >
        <div
          className={cn(
            'absolute top-1 w-3 h-3 rounded-full bg-white transition-transform',
            value ? 'left-6' : 'left-1'
          )}
        />
      </button>
    </div>
  )
}

function ThinkingEditor({
  value,
  onChange,
}: {
  value: ThinkingConfig | undefined
  onChange: (val: ThinkingConfig | undefined) => void
}) {
  const isEnabled = value?.type === 'enabled'

  return (
    <div className="space-y-3 p-5 bg-slate-900/40 border border-slate-800/50 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-bold text-slate-300">Extended Thinking</span>
        </div>
        <ToggleField
          label=""
          value={isEnabled}
          onChange={(v) =>
            onChange(
              v ? { type: 'enabled', budgetTokens: value?.budgetTokens ?? 16000 } : undefined
            )
          }
        />
      </div>

      {isEnabled && (
        <div className="pt-3 border-t border-slate-800/40">
          <InputField
            label="Budget Tokens"
            type="number"
            value={value?.budgetTokens}
            onChange={(v) => onChange({ ...value!, budgetTokens: parseInt(v) || undefined })}
          />
        </div>
      )}
    </div>
  )
}

function PermissionEditor({
  value,
  onChange,
}: {
  value: AgentPermission | undefined
  onChange: (val: AgentPermission | undefined) => void
}) {
  const isEnabled = value !== undefined

  const updatePermission = (key: keyof AgentPermission, val: PermissionValue) => {
    const newVal = { ...(value || {}), [key]: val }
    onChange(newVal)
  }

  const renderSelect = (key: keyof AgentPermission, label: string, icon: any) => (
    <div
      className={cn(
        'flex items-center justify-between p-2 transition-all duration-200',
        !isEnabled && 'opacity-40 grayscale-[0.5] pointer-events-none'
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <div className="relative w-32">
        <select
          disabled={!isEnabled}
          value={(value?.[key] as string) || 'ask'}
          onChange={(e) => updatePermission(key, e.target.value as PermissionValue)}
          className={cn(
            'w-full text-xs font-bold uppercase rounded-lg px-2 py-1.5 border appearance-none cursor-pointer focus:outline-none focus:ring-2 transition-colors',
            value?.[key] === 'allow'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : value?.[key] === 'deny'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          )}
        >
          <option value="ask">Ask</option>
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
        </select>
        <ChevronDown className="absolute right-2 top-2 w-3 h-3 opacity-50 pointer-events-none" />
      </div>
    </div>
  )

  return (
    <div className="space-y-3 p-5 bg-slate-900/40 border border-slate-800/50 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-bold text-slate-300">Custom Permissions</span>
        </div>
        <ToggleField label="" value={isEnabled} onChange={(v) => onChange(v ? {} : undefined)} />
      </div>

      <div className="space-y-1 pt-3 border-t border-slate-800/40">
        {renderSelect('edit', 'File Editing', <FileText className="w-4 h-4 text-slate-500" />)}
        {renderSelect('webfetch', 'Web Access', <Globe className="w-4 h-4 text-slate-500" />)}
        {renderSelect('bash', 'Shell Execution', <Terminal className="w-4 h-4 text-slate-500" />)}
        {renderSelect(
          'external_directory',
          'External Access',
          <FolderOpen className="w-4 h-4 text-slate-500" />
        )}
      </div>
    </div>
  )
}

function ToolsEditor({
  value,
  onChange,
}: {
  value: Record<string, boolean> | undefined
  onChange: (val: Record<string, boolean> | undefined) => void
}) {
  const [newTool, setNewTool] = useState('')

  const setToolValue = (tool: string, enabled: boolean) => {
    const newValue = { ...(value || {}), [tool]: enabled }
    onChange(newValue)
  }

  const removeTool = (tool: string) => {
    const newValue = { ...(value || {}) }
    delete newValue[tool]
    onChange(Object.keys(newValue).length > 0 ? newValue : undefined)
  }

  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
        Tools Configuration
      </label>

      <div className="flex gap-2 mb-3">
        <input
          value={newTool}
          onChange={(e) => setNewTool(e.target.value)}
          placeholder="Add tool (e.g. read_file)..."
          className="flex-1 bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTool.trim()) {
              setToolValue(newTool.trim(), true)
              setNewTool('')
            }
          }}
        />
        <button
          onClick={() => {
            if (newTool.trim()) {
              setToolValue(newTool.trim(), true)
              setNewTool('')
            }
          }}
          className="px-4 bg-blue-600 rounded-xl text-white font-bold hover:bg-blue-500"
        >
          Add
        </button>
      </div>

      <div className="space-y-2">
        {Object.entries(value || {}).map(([tool, enabled]) => (
          <div
            key={tool}
            className="flex items-center justify-between p-3 bg-[#161B26] border border-slate-700 rounded-xl"
          >
            <span className="text-sm font-medium text-slate-300 font-mono">{tool}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setToolValue(tool, !enabled)}
                title={enabled ? 'Enabled' : 'Disabled'}
                className={cn(
                  'w-10 h-5 rounded-full transition-colors relative',
                  enabled ? 'bg-emerald-600' : 'bg-slate-700'
                )}
              >
                <div
                  className={cn(
                    'absolute top-1 w-3 h-3 rounded-full bg-white transition-transform',
                    enabled ? 'left-6' : 'left-1'
                  )}
                />
              </button>
              <button
                onClick={() => removeTool(tool)}
                className="text-slate-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {(!value || Object.keys(value).length === 0) && (
          <div className="text-xs text-slate-500 italic p-2 text-center">
            No explicit tool configurations
          </div>
        )}
      </div>
    </div>
  )
}

function ArrayEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: string[] | undefined
  onChange: (val: string[]) => void
}) {
  const [input, setInput] = useState('')

  const handleAdd = () => {
    if (!input.trim()) return
    onChange([...(value || []), input.trim()])
    setInput('')
  }

  const handleRemove = (idx: number) => {
    const newValue = [...(value || [])]
    newValue.splice(idx, 1)
    onChange(newValue)
  }

  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
        {label}
      </label>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add item..."
          className="flex-1 bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          onClick={handleAdd}
          className="p-2 bg-blue-600 rounded-xl text-white hover:bg-blue-500"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value?.map((item, idx) => (
          <span
            key={idx}
            className="flex items-center gap-1 px-3 py-1 bg-slate-800 rounded-lg text-xs text-slate-300 border border-slate-700"
          >
            {item}
            <button onClick={() => handleRemove(idx)} className="hover:text-red-400 ml-1">
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

// --- Main Components ---

export function OhMyOpencodeSettings({ onStatusChange }: OhMyOpencodeSettingsProps) {
  const [configPath, setConfigPath] = useState<string | null>(null)
  const [config, setConfig] = useState<OhMyOpencodeConfig | null>(null)
  const [models, setModels] = useState<OpencodeModel[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasBackup, setHasBackup] = useState(false)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [activeTab, setActiveTab] = useState<'agents' | 'categories'>('agents')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Load initial data
  useEffect(() => {
    loadConfigPath()
    loadModels()
  }, [])

  const loadConfigPath = async () => {
    try {
      const response = await window.api.appSetting.getOhMyOpencodePath()
      setConfigPath(response.path)
      if (response.path) loadConfig(response.path)
    } catch (error) {
      console.error('Failed to load config path:', error)
      onStatusChange({ message: 'Failed to load config path', type: 'error' })
    }
  }

  const loadConfig = async (path: string) => {
    try {
      setIsLoading(true)
      // We use the same API but we'll cast the config part
      const response = await window.api.ohMyOpencode.readConfig({ path })
      setConfig(response.config as OhMyOpencodeConfig)
      setUnsavedChanges(false)
      checkBackupExists(path)
    } catch (error) {
      console.error('Failed to load config:', error)
      onStatusChange({ message: 'Failed to load config', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const checkBackupExists = async (path: string) => {
    try {
      await window.api.fileSystem.exists({ path: `${path}.backup` })
      setHasBackup(true)
    } catch {
      setHasBackup(false)
    }
  }

  const loadModels = async () => {
    try {
      const response = await window.api.opencode.listModels()
      const difficultyOrder: Record<string, number> = { easy: 0, medium: 1, hard: 2, epic: 3 }
      const enabledModels = response.models.filter((model) => model.enabled)
      const sortedModels = [...enabledModels].sort((a, b) => {
        const aOrder = difficultyOrder[a.difficulty] ?? Number.MAX_SAFE_INTEGER
        const bOrder = difficultyOrder[b.difficulty] ?? Number.MAX_SAFE_INTEGER
        return aOrder - bOrder
      })
      setModels(sortedModels)
    } catch (error) {
      console.error('Failed to load models:', error)
    }
  }

  const handleSelectFile = async () => {
    const response = await window.api.dialog.showOpenDialog({
      title: 'Select oh-my-opencode.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (!response.canceled && response.filePaths.length > 0) {
      const path = response.filePaths[0]
      await window.api.appSetting.setOhMyOpencodePath({ path })
      setConfigPath(path)
      loadConfig(path)
    }
  }

  const handleSave = async () => {
    if (!config || !configPath) return
    try {
      await window.api.ohMyOpencode.saveConfig({ path: configPath, config })
      setUnsavedChanges(false)
      onStatusChange({ message: 'Config saved successfully', type: 'success' })
    } catch (error) {
      onStatusChange({ message: 'Failed to save config', type: 'error' })
    }
  }

  const handleBackup = async () => {
    if (!configPath) return
    try {
      const response = await window.api.ohMyOpencode.backupConfig({ path: configPath })
      checkBackupExists(configPath)
      onStatusChange({ message: `Backup created at ${response.backupPath}`, type: 'success' })
    } catch (error) {
      onStatusChange({ message: 'Failed to create backup', type: 'error' })
    }
  }

  const handleRestore = async () => {
    if (!configPath || !hasBackup) return
    try {
      await window.api.ohMyOpencode.restoreConfig({ path: configPath })
      loadConfig(configPath)
      onStatusChange({ message: 'Config restored from backup', type: 'success' })
    } catch (error) {
      onStatusChange({ message: 'Failed to restore backup', type: 'error' })
    }
  }

  const updateConfigItem = (
    type: 'agents' | 'categories',
    name: string,
    value: AgentConfig | CategoryConfig | undefined
  ) => {
    setConfig((prev) => {
      if (!prev) return null
      const section = prev[type] || {}

      if (value === undefined) {
        const newSection = { ...section }
        delete newSection[name]
        return { ...prev, [type]: newSection }
      }

      return {
        ...prev,
        [type]: {
          ...section,
          [name]: value,
        },
      }
    })
    setUnsavedChanges(true)
  }

  // Filter items
  const items = useMemo(() => {
    if (!config) return []
    const collection = config[activeTab] || {}
    return Object.entries(collection)
      .filter(([name]) => name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [config, activeTab, searchQuery])

  // Get active item data
  const activeItemData = useMemo(() => {
    if (!config || !selectedItem) return null
    const collection = config[activeTab] as Record<string, any>
    return collection?.[selectedItem] || null
  }, [config, activeTab, selectedItem])

  const renderEditor = () => {
    if (!selectedItem || !activeItemData) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500">
          <SettingsIcon className="w-12 h-12 mb-4 opacity-20" />
          <p>Select an item to edit</p>
        </div>
      )
    }

    const isAgent = activeTab === 'agents'
    const data = activeItemData as AgentConfig & CategoryConfig // Union for easier handling

    const handleChange = (field: string, value: any) => {
      const newData = { ...data, [field]: value }
      if (value === undefined || value === '') delete (newData as any)[field]
      updateConfigItem(activeTab, selectedItem, newData)
    }

    const baseModelName = data.model ? data.model.split('#')[0] : undefined
    const selectedModel = models.find((m) => m.name === baseModelName)

    // Reasoning Effort is OpenAI-only (GPT models)
    const isOpenAI = (name?: string) => {
      if (!name) return false
      return name.toLowerCase().includes('gpt')
    }
    // Variant/Reasoning Effort options come from the selected model variants
    const modelVariants = selectedModel?.variants
      ? selectedModel.variants
          .split(',')
          .map((variant) => variant.trim())
          .filter(Boolean)
      : []
    const hasVariants = modelVariants.length > 0
    const isOpenAIModel = baseModelName ? isOpenAI(baseModelName) : false
    const showReasoning = isOpenAIModel && hasVariants
    const showVariant = !isOpenAIModel && hasVariants

    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0B0E14] p-6 space-y-8 animate-in fade-in duration-200">
        <section>
          <SectionHeader title="Core Configuration" icon={Cpu}>
            <button
              onClick={() => {
                if (confirm(`Delete ${selectedItem}?`)) {
                  updateConfigItem(activeTab, selectedItem, undefined)
                  setSelectedItem(null)
                }
              }}
              className="p-1.5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg transition-colors"
              title={`Delete ${selectedItem}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </SectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-900/40 p-5 rounded-2xl border border-slate-800/50">
            {isAgent && (
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
                  Category
                </label>
                <div className="relative">
                  <select
                    value={data.category || ''}
                    onChange={(e) => handleChange('category', e.target.value || undefined)}
                    className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2.5 hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">None</option>
                    {Object.keys(config?.categories || {}).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
            )}

            <div className={cn('col-span-2', isAgent ? 'md:col-span-1' : '')}>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
                Model
              </label>
              <ModelPicker
                value={data.model || null}
                models={models}
                onChange={(val) => handleChange('model', val)}
                placeholder="Inherit / Default"
                allowAuto={false}
                showVariantSelector={false}
              />
            </div>

            {showVariant && (
              <SelectField
                label="Variant"
                value={data.variant}
                options={modelVariants}
                onChange={(v) => handleChange('variant', v)}
              />
            )}

            {showReasoning && (
              <SelectField
                label="Reasoning Effort (OpenAI)"
                value={data.reasoningEffort}
                options={modelVariants}
                onChange={(v) => handleChange('reasoningEffort', v)}
              />
            )}

            <InputField
              label="Temperature"
              type="number"
              value={data.temperature}
              onChange={(v) => handleChange('temperature', parseFloat(v))}
              placeholder="0.0 - 2.0"
            />

            <InputField
              label="Top P"
              type="number"
              value={data.top_p}
              onChange={(v) => handleChange('top_p', parseFloat(v))}
              placeholder="0.0 - 1.0"
            />

            <InputField
              label="Max Tokens"
              type="number"
              value={data.maxTokens}
              onChange={(v) => handleChange('maxTokens', parseInt(v))}
              placeholder="e.g. 8000"
            />

            <SelectField
              label="Text Verbosity"
              value={data.textVerbosity}
              options={TEXT_VERBOSITIES}
              onChange={(v) => handleChange('textVerbosity', v)}
            />
          </div>
        </section>

        {/* Capabilities */}
        <section>
          <SectionHeader title="Capabilities & Skills" icon={Layers} />
          <div className="grid grid-cols-1 gap-5">
            <ThinkingEditor value={data.thinking} onChange={(v) => handleChange('thinking', v)} />

            {isAgent && (
              <PermissionEditor
                value={(data as AgentConfig).permission}
                onChange={(v) => handleChange('permission', v)}
              />
            )}

            {isAgent && (
              <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/50">
                <ArrayEditor
                  label="Skills"
                  value={(data as AgentConfig).skills}
                  onChange={(v) => handleChange('skills', v)}
                />
              </div>
            )}

            <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/50">
              <ToolsEditor value={data.tools} onChange={(v) => handleChange('tools', v)} />
            </div>
          </div>
        </section>

        {/* Prompt Engineering */}
        <section>
          <SectionHeader title="Prompt Engineering" icon={Wrench} />
          <div className="space-y-4 bg-slate-900/40 p-5 rounded-2xl border border-slate-800/50">
            {isAgent && (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
                  System Prompt Override
                </label>
                <textarea
                  value={(data as AgentConfig).prompt || ''}
                  onChange={(e) => handleChange('prompt', e.target.value)}
                  className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-3 min-h-[100px] hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all custom-scrollbar"
                  placeholder="Override default system prompt..."
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
                Append to Prompt
              </label>
              <textarea
                value={data.prompt_append || ''}
                onChange={(e) => handleChange('prompt_append', e.target.value)}
                className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-3 min-h-[80px] hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all custom-scrollbar"
                placeholder="Additional instructions..."
              />
            </div>
          </div>
        </section>
      </div>
    )
  }

  // --- Render Main ---

  if (isLoading && !config) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  if (!configPath) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
          <FileText className="w-8 h-8" />
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-bold text-white tracking-tight leading-none">
            Configuration
          </h3>
          <p className="text-[9px] text-slate-500 font-medium truncate max-w-[250px] leading-none">
            {configPath}
          </p>
        </div>
        <button
          onClick={handleSelectFile}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
        >
          <FolderOpen className="w-5 h-5" />
          Select File
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex-none bg-slate-950/80 backdrop-blur-md pb-3 px-0 flex items-center justify-between border-b border-slate-800/60 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400">
            <SettingsIcon className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline gap-2 overflow-hidden">
            <h3 className="text-sm font-bold text-white tracking-tight leading-none">
              Configuration
            </h3>
            <p className="text-[9px] text-slate-500 font-medium truncate max-w-[400px]">
              {configPath}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSave}
            disabled={!unsavedChanges}
            className={cn(
              'px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 focus:outline-none',
              unsavedChanges
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500'
                : 'bg-slate-800/40 text-slate-500 cursor-not-allowed'
            )}
          >
            <Save className="w-3 h-3" />
            Save
          </button>
          <div className="w-px h-4 bg-slate-800 mx-0.5" />
          <button
            onClick={handleBackup}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors focus:outline-none"
            title="Backup"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={handleRestore}
            disabled={!hasBackup}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-30 focus:outline-none"
            title="Restore"
          >
            <ShieldAlert className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar List */}
        <div className="w-64 border-r border-slate-800/60 flex flex-col bg-[#11151C]/50">
          {/* Tabs */}
          <div className="flex-none flex p-1 bg-slate-900/50 rounded-xl border border-slate-800/40 m-2">
            {(['agents', 'categories'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab)
                  setSelectedItem(null)
                }}
                className={cn(
                  'flex-1 py-1 text-[9px] font-bold uppercase tracking-wider transition-all rounded-lg focus:outline-none',
                  activeTab === tab
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search & Add */}
          <div className="flex-none p-2 border-b border-slate-800/60 space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full bg-[#161B26] border border-slate-700 rounded-lg pl-8 pr-2 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <button
              onClick={() => {
                const name = prompt(
                  `Enter new ${activeTab === 'agents' ? 'agent' : 'category'} name:`
                )
                if (name) {
                  updateConfigItem(activeTab, name, {})
                  setSelectedItem(name)
                }
              }}
              className="w-full py-1.5 bg-slate-800/40 border border-slate-800/60 rounded-lg text-[9px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 focus:outline-none"
            >
              <Plus className="w-3 h-3" />
              Add New
            </button>
          </div>

          {/* List Items */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
            {items.map(([name, data]) => (
              <button
                key={name}
                onClick={() => setSelectedItem(name)}
                className={cn(
                  'w-full text-left px-2.5 py-2 rounded-xl transition-all flex items-center justify-between group focus:outline-none',
                  selectedItem === name
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                )}
              >
                <div className="flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div
                      className={cn('w-1.5 h-1.5 rounded-full shrink-0', getColorFromName(name))}
                    />
                    <span className="font-bold text-[13px] truncate leading-tight capitalize">
                      {name}
                    </span>
                  </div>
                  {(data as any).model && (
                    <span
                      className={cn(
                        'text-[9px] truncate opacity-80 font-medium pl-3.5',
                        selectedItem === name ? 'text-blue-100' : 'text-slate-500'
                      )}
                    >
                      {(data as any).model.split('/').pop()}
                      {(data as any).variant ? ` (${(data as any).variant})` : ''}
                    </span>
                  )}
                </div>
                <ChevronRight
                  className={cn(
                    'w-3.5 h-3.5 transition-transform',
                    selectedItem === name
                      ? 'text-white translate-x-1'
                      : 'text-slate-600 opacity-0 group-hover:opacity-100'
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Main Editor */}
        <div className="flex-1 overflow-hidden">{renderEditor()}</div>
      </div>
    </div>
  )
}
