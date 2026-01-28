import { useState, useEffect, useRef } from 'react'
import {
  X,
  MessageSquare,
  FileText,
  Edit2,
  Check,
  Clock,
  Hash,
  FolderKanban,
  ArrowUpRight,
  Sparkles,
  Plus,
  Eye,
  Send,
  AlertTriangle,
  Bug,
  Zap,
} from 'lucide-react'
import type { KanbanTask } from '../../../shared/types/ipc'
import { cn } from '../../lib/utils'

interface TaskDrawerProps {
  task: KanbanTask | null
  isOpen: boolean
  onClose: () => void
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export function TaskDrawer({ task, isOpen, onClose, onUpdate }: TaskDrawerProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [newTag, setNewTag] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)

  const initialMessages: ChatMessage[] = [
    {
      id: '1',
      role: 'assistant',
      content:
        'Hi! I can help you work on this task. Ask me questions, request code changes, or discuss implementation details.',
      // eslint-disable-next-line react-hooks/purity -- Mock data, timestamp is acceptable for initial messages
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
    },
  ]

  // Mock Chat State
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (task) {
      setEditedTitle(task.title)
      setEditedDescription(task.descriptionMd || task.description || '')
    }
  }, [task])

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    if (isAddingTag && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [isAddingTag])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTab])

  if (!isOpen || !task) return null

  const handleSaveTitle = () => {
    if (editedTitle.trim() !== task.title && editedTitle.trim() && onUpdate) {
      onUpdate(task.id, { title: editedTitle.trim() })
    } else {
      setEditedTitle(task.title)
    }
    setIsEditingTitle(false)
  }

  const handleSaveDescription = () => {
    if (editedDescription !== (task.descriptionMd || task.description || '') && onUpdate) {
      onUpdate(task.id, {
        descriptionMd: editedDescription,
        description: editedDescription,
      })
    }
    setIsEditingDescription(false)
  }

  const handleCancelEditTitle = () => {
    setEditedTitle(task.title)
    setIsEditingTitle(false)
  }

  const handleAddTag = () => {
    if (newTag.trim() && !task.tags.includes(newTag.trim()) && onUpdate) {
      onUpdate(task.id, { tags: [...task.tags, newTag.trim()] })
      setNewTag('')
      setIsAddingTag(false)
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    if (onUpdate) {
      onUpdate(task.id, { tags: task.tags.filter((t) => t !== tagToRemove) })
    }
  }

  const handleUpdatePriority = (priority: KanbanTask['priority']) => {
    if (onUpdate && priority !== task.priority) {
      onUpdate(task.id, { priority })
    }
  }

  const handleUpdateType = (type: string) => {
    if (onUpdate && type !== task.type) {
      onUpdate(task.id, { type })
    }
  }

  const handleSendMessage = () => {
    if (!chatInput.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setChatInput('')

    // Mock AI Response
    setTimeout(() => {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I've received your message: "${userMessage.content}". This is a mock response as Phase 2 is under development.`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMessage])
    }, 1000)
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '—'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const priorityConfig = {
    low: {
      label: 'Low',
      icon: ArrowUpRight,
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20',
    },
    medium: {
      label: 'Medium',
      icon: ArrowUpRight,
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20',
    },
    high: {
      label: 'High',
      icon: AlertTriangle,
      className: 'bg-orange-500/10 text-orange-400 border-orange-500/25 hover:bg-orange-500/20',
    },
    urgent: {
      label: 'Urgent',
      icon: Zap,
      className: 'bg-red-500/10 text-red-400 border-red-500/25 hover:bg-red-500/20 animate-pulse',
    },
  }

  const typeConfig: Record<string, { label: string; icon: any; className: string }> = {
    task: {
      label: 'Task',
      icon: Check,
      className: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
    },
    bug: {
      label: 'Bug',
      icon: Bug,
      className: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
    },
    feature: {
      label: 'Feature',
      icon: Sparkles,
      className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
    },
    default: {
      label: 'Task',
      icon: Check,
      className: 'bg-slate-500/10 text-slate-400 border-slate-500/25',
    },
  }

  const statusConfig = {
    backlog: { label: 'Backlog', className: 'bg-slate-500/10 text-slate-400 border-slate-500/25' },
    todo: { label: 'To Do', className: 'bg-slate-600/20 text-slate-300 border-slate-600/30' },
    'in-progress': {
      label: 'In Progress',
      className: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
    },
    review: { label: 'In Review', className: 'bg-amber-500/10 text-amber-400 border-amber-500/25' },
    done: { label: 'Done', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
    default: { label: 'Active', className: 'bg-slate-500/10 text-slate-400 border-slate-500/25' },
  }

  const priority =
    priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium
  const type = typeConfig[task.type as keyof typeof typeConfig] || typeConfig.default
  const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.default

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity duration-300"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-[520px] max-w-full bg-gradient-to-b from-[#0B0E14] to-[#0A0C11] border-l border-slate-800/50 z-[70] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-800/50 bg-[#11151C]/30 backdrop-blur-xl">
          <div className="flex-1 mr-4">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle()
                    if (e.key === 'Escape') handleCancelEditTitle()
                  }}
                  onBlur={handleSaveTitle}
                  className="flex-1 px-4 py-2.5 bg-[#0B0E14] border-2 border-blue-500/50 rounded-xl text-white text-lg font-semibold focus:outline-none focus:border-blue-500/80 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-600"
                  placeholder="Task title..."
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSaveTitle}
                    className="p-2 text-blue-400 hover:bg-blue-500/15 rounded-xl transition-all hover:scale-105"
                    title="Save"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelEditTitle}
                    className="p-2 text-slate-500 hover:bg-slate-700/50 rounded-xl transition-all hover:scale-105"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="group flex items-start gap-2">
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="flex-1 text-left rounded-lg transition-all hover:bg-slate-800/30 -ml-2 px-2 py-1"
                >
                  <h2 className="text-lg font-semibold text-white leading-tight">{task.title}</h2>
                </button>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-slate-700/50 rounded-xl transition-all opacity-0 group-hover:opacity-100 hover:scale-105"
                  title="Edit title"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-700/50 rounded-xl transition-all hover:scale-105"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800/50 bg-[#0B0E14]">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative',
              activeTab === 'details' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <FileText className="w-4 h-4" />
            Details
            {activeTab === 'details' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative',
              activeTab === 'chat' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Chat
            {activeTab === 'chat' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400" />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'details' ? (
            <div className="p-6 space-y-8">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold tracking-wide transition-all',
                    status.className
                  )}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {status.label}
                </span>

                <div className="relative group/select">
                  <select
                    value={task.priority}
                    onChange={(e) => handleUpdatePriority(e.target.value as any)}
                    className={cn(
                      'appearance-none cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 pr-8 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                      priority.className
                    )}
                  >
                    <option value="low" className="bg-[#0B0E14]">
                      Low
                    </option>
                    <option value="medium" className="bg-[#0B0E14]">
                      Medium
                    </option>
                    <option value="high" className="bg-[#0B0E14]">
                      High
                    </option>
                    <option value="urgent" className="bg-[#0B0E14]">
                      Urgent
                    </option>
                  </select>
                  <ArrowUpRight className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-50 group-hover/select:opacity-100 transition-opacity" />
                </div>

                <div className="relative group/select">
                  <select
                    value={task.type}
                    onChange={(e) => handleUpdateType(e.target.value)}
                    className={cn(
                      'appearance-none cursor-pointer inline-flex items-center px-3 py-1.5 pr-8 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                      type.className
                    )}
                  >
                    <option value="task" className="bg-[#0B0E14]">
                      Task
                    </option>
                    <option value="feature" className="bg-[#0B0E14]">
                      Feature
                    </option>
                    <option value="bug" className="bg-[#0B0E14]">
                      Bug
                    </option>
                  </select>
                  <Plus className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-50 group-hover/select:opacity-100 transition-opacity" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Hash className="w-3 h-3" />
                    Tags
                  </h3>
                  {!isAddingTag && (
                    <button
                      onClick={() => setIsAddingTag(true)}
                      className="p-1 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-md transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {task.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="group flex items-center gap-1.5 text-xs font-medium text-slate-300 bg-slate-800/40 px-3 py-1.5 rounded-lg border border-slate-700/40 hover:bg-slate-700/50 transition-colors"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  {isAddingTag && (
                    <div className="flex items-center gap-1 bg-[#0B0E14] border border-blue-500/50 rounded-lg px-2 py-1 animate-in fade-in zoom-in-95 duration-200">
                      <input
                        ref={tagInputRef}
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTag()
                          if (e.key === 'Escape') setIsAddingTag(false)
                        }}
                        onBlur={() => {
                          if (!newTag.trim()) setIsAddingTag(false)
                        }}
                        className="bg-transparent text-xs text-white focus:outline-none w-20"
                        placeholder="Tag name..."
                      />
                      <button onClick={handleAddTag} className="text-blue-400 hover:text-blue-300">
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    Description
                  </h3>
                  <div className="flex items-center gap-3">
                    {!isEditingDescription && (
                      <button
                        onClick={() => setIsPreviewMode(!isPreviewMode)}
                        className={cn(
                          'flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded-md hover:bg-slate-800',
                          isPreviewMode
                            ? 'text-blue-400 bg-blue-500/10'
                            : 'text-slate-500 hover:text-slate-300'
                        )}
                        title={isPreviewMode ? 'Edit Mode' : 'Preview Mode'}
                      >
                        {isPreviewMode ? (
                          <Edit2 className="w-3 h-3" />
                        ) : (
                          <Eye className="w-3 h-3" />
                        )}
                        {isPreviewMode ? 'Edit' : 'Preview'}
                      </button>
                    )}
                    {!isEditingDescription && (
                      <button
                        onClick={() => {
                          setIsEditingDescription(true)
                          setIsPreviewMode(false)
                        }}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 transition-colors group px-2 py-1 rounded-md hover:bg-slate-800"
                      >
                        <Edit2 className="w-3 h-3 group-hover:scale-110 transition-transform" />
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {isEditingDescription ? (
                  <div className="space-y-3">
                    <textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditedDescription(task.descriptionMd || task.description || '')
                          setIsEditingDescription(false)
                        }
                      }}
                      className="w-full min-h-[180px] px-4 py-3 bg-[#0B0E14] border-2 border-blue-500/50 rounded-xl text-slate-200 text-sm leading-relaxed focus:outline-none focus:border-blue-500/80 focus:ring-4 focus:ring-blue-500/10 resize-none transition-all placeholder:text-slate-600 custom-scrollbar shadow-inner"
                      placeholder="Add a detailed description..."
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveDescription}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/20"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => {
                          setEditedDescription(task.descriptionMd || task.description || '')
                          setIsEditingDescription(false)
                        }}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-lg transition-all hover:scale-105 active:scale-95"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'rounded-xl border border-slate-800/50 bg-slate-900/30 p-4 transition-all hover:border-slate-700/50 relative overflow-hidden',
                      editedDescription ? '' : 'border-dashed'
                    )}
                  >
                    {editedDescription ? (
                      <div
                        className={cn(
                          'text-sm text-slate-300 leading-relaxed whitespace-pre-wrap custom-scrollbar max-h-64 overflow-y-auto',
                          isPreviewMode && 'font-sans text-slate-200'
                        )}
                      >
                        {editedDescription}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic text-center py-4">
                        No description provided
                      </p>
                    )}
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                      <FileText className="w-12 h-12" />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-slate-800/50">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-4">
                  <Clock className="w-3 h-3" />
                  Properties
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Hash className="w-2.5 h-2.5" />
                      Task ID
                    </label>
                    <span className="block text-xs text-slate-400 font-mono bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800/50">
                      {task.id.slice(0, 12)}...
                    </span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <FolderKanban className="w-2.5 h-2.5" />
                      Column
                    </label>
                    <span className="block text-xs text-slate-400 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800/50">
                      {task.columnId}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      Created
                    </label>
                    <span className="block text-xs text-slate-400 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800/50">
                      {formatDate(task.createdAt)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      Updated
                    </label>
                    <span className="block text-xs text-slate-400 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800/50">
                      {formatDate(task.updatedAt)}
                    </span>
                  </div>
                  {task.orderInColumn !== undefined && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Position
                      </label>
                      <span className="block text-xs text-slate-400 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800/50">
                        #{task.orderInColumn + 1}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300',
                      msg.role === 'user' ? 'flex-row-reverse' : ''
                    )}
                  >
                    <div
                      className={cn(
                        'flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border transition-all',
                        msg.role === 'assistant'
                          ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30 shadow-lg shadow-blue-500/5'
                          : 'bg-slate-700/50 border-slate-600/30'
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <Sparkles className="w-4 h-4 text-blue-400" />
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">Y</span>
                      )}
                    </div>
                    <div
                      className={cn(
                        'flex-1 space-y-2 max-w-[85%]',
                        msg.role === 'user' ? 'text-right' : ''
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-center gap-2',
                          msg.role === 'user' ? 'justify-end' : ''
                        )}
                      >
                        <span
                          className={cn(
                            'text-xs font-semibold',
                            msg.role === 'assistant' ? 'text-blue-400' : 'text-slate-300'
                          )}
                        >
                          {msg.role === 'assistant' ? 'AI Assistant' : 'You'}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-3 border transition-all hover:shadow-md',
                          msg.role === 'assistant'
                            ? 'bg-slate-800/40 border-slate-700/40 rounded-tl-sm'
                            : 'bg-blue-600/20 border-blue-500/30 rounded-tr-sm text-left ml-auto shadow-inner'
                        )}
                      >
                        <p className="text-sm text-slate-300 leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="p-6 border-t border-slate-800/50 bg-[#0B0E14]/50">
                <div className="relative group">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder="Ask AI anything about this task..."
                    className="w-full bg-slate-900/50 border border-slate-800/50 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all resize-none min-h-[44px] max-h-32 custom-scrollbar shadow-inner"
                    rows={1}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim()}
                    className={cn(
                      'absolute right-2 top-1.5 p-2 rounded-lg transition-all',
                      chatInput.trim()
                        ? 'text-blue-400 hover:bg-blue-500/10 scale-110'
                        : 'text-slate-600 opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-slate-600">
                    Press Enter to send, Shift + Enter for new line
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    AI Ready
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
