import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  FileText,
  Loader2,
  Play,
  Wand2,
  X,
  Paperclip,
  File,
  Image,
  Trash2,
} from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { KanbanTask } from '@/shared/types/ipc.ts'
import { LightMarkdown } from '../../../LightMarkdown'
import { VoiceInputButton } from '../../../voice/VoiceInputButton'

const VOSK_MODEL_PATHS = {
  ru: 'https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip',
  en: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
} as const

interface TaskDetailsDescriptionProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
  onStartRun?: () => void
  onFilesSelected?: (files: File[]) => void
  isActive?: boolean
}

type AttachmentItem = {
  name: string
  url?: string
  type?: string
  size?: number
}

export function TaskDetailsDescription({
  task,
  onUpdate,
  onStartRun,
  onFilesSelected,
  isActive = false,
}: TaskDetailsDescriptionProps) {
  const [editedDescription, setEditedDescription] = useState(task.description || '')
  const [isGeneratingStory, setIsGeneratingStory] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEditedDescription(task.description || '')
    setAttachments(parseAttachmentsFromDescription(task.description || ''))
  }, [task.description])

  useEffect(() => {
    setIsGeneratingStory(task.status === 'generating')
  }, [task.status])

  useEffect(() => {
    if (isActive && !isGeneratingStory && !task.description?.trim() && !isEditing) {
      setIsEditing(true)
    }
  }, [isActive, task.description, isGeneratingStory, isEditing])

  const handleScroll = () => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const handleSaveDescription = () => {
    if (editedDescription !== task.description) {
      onUpdate?.(task.id, { description: editedDescription })
    }
    setIsEditing(false)
  }

  const handleImproveDescription = async () => {
    setIsGeneratingStory(true)
    setGenerationError(null)

    try {
      await window.api.opencode.generateUserStory({ taskId: task.id })
    } catch (error) {
      console.error('Failed to generate user story:', error)
      setGenerationError('Failed to generate user story. Please try again.')
      setIsGeneratingStory(false)
    }
  }

  const handleVoiceDelta = (delta: string) => {
    setLiveTranscript(delta)
  }

  const handleVoiceTranscript = (transcript: string) => {
    const trimmed = transcript.trim()
    if (!trimmed) {
      setLiveTranscript('')
      return
    }

    const currentText = editedDescription
    const hasExistingText = currentText.trim().length > 0
    const prefixNewline = hasExistingText && !currentText.endsWith('\n') ? '\n' : ''
    const suffixNewlines = hasExistingText ? '\n\n' : '\n'
    const newText = currentText + prefixNewline + trimmed + suffixNewlines

    setEditedDescription(newText)
    setLiveTranscript('')

    if (!isEditing) {
      setIsEditing(true)
    }

    if (textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(newText.length, newText.length)
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight
        }
      }, 0)
    }
  }

  const buildFileUrlFromPath = (filePath: string) => {
    const normalizedPath = filePath.replace(/\\/g, '/')
    const withPrefix = /^[A-Za-z]:\//.test(normalizedPath) ? `/${normalizedPath}` : normalizedPath
    return `file://${encodeURI(withPrefix)}`
  }

  const buildFileUrl = (file: File) => {
    const filePath = (file as File & { path?: string }).path
    if (!filePath) return null
    return buildFileUrlFromPath(filePath)
  }

  const guessMimeType = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    if (!ext) return undefined
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
      return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    }
    if (ext === 'pdf') return 'application/pdf'
    return 'application/octet-stream'
  }

  const parseAttachmentsFromDescription = (text: string): AttachmentItem[] => {
    if (!text.trim()) return []
    return text
      .split('\n')
      .map((line) => line.trim())
      .map((line) => {
        const match = line.match(/^[-*]\s*\[(.+?)\]\((file:\/\/[^)]+)\)\s*$/)
        if (!match) return null
        const name = match[1].trim()
        const url = match[2].trim()
        return {
          name,
          url,
          type: guessMimeType(name),
        }
      })
      .filter((item): item is AttachmentItem => Boolean(item))
  }

  const buildAttachmentLine = (attachment: AttachmentItem) => {
    if (!attachment.url) return `- ${attachment.name}`
    return `- [${attachment.name}](${attachment.url})`
  }

  const buildDescriptionWithAttachments = (baseText: string, items: AttachmentItem[]) => {
    const lines = items.map(buildAttachmentLine)
    const prefix = baseText.trim().length > 0 ? '\n' : ''
    return `${baseText}${prefix}${lines.join('\n')}\n`
  }

  const appendAttachmentItemsToDescription = (items: AttachmentItem[]) => {
    const nextDescription = buildDescriptionWithAttachments(editedDescription, items)
    setEditedDescription(nextDescription)
    onUpdate?.(task.id, { description: nextDescription })

    if (!isEditing) {
      setIsEditing(true)
    }
  }

  const removeAttachmentFromDescription = (text: string, attachment: AttachmentItem) => {
    const lineToRemove = buildAttachmentLine(attachment)
    return text
      .split('\n')
      .filter((line) => line.trim() !== lineToRemove.trim())
      .join('\n')
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      const items: AttachmentItem[] = files.map((file) => ({
        name: file.name,
        url: buildFileUrl(file) ?? undefined,
        type: file.type || guessMimeType(file.name),
        size: file.size,
      }))
      setAttachments((prev) => [...prev, ...items])
      onFilesSelected?.(files)
      appendAttachmentItemsToDescription(items)
    }
  }

  const handlePickFiles = async () => {
    const filePaths = await window.api.project.selectFiles()
    if (!filePaths || filePaths.length === 0) return

    const items: AttachmentItem[] = filePaths.map((filePath) => {
      const normalized = filePath.replace(/\\/g, '/')
      const name = normalized.split('/').pop() || filePath
      return {
        name,
        url: buildFileUrlFromPath(filePath),
        type: guessMimeType(name),
      }
    })

    setAttachments((prev) => [...prev, ...items])
    appendAttachmentItemsToDescription(items)
  }

  const removeAttachment = (index: number) => {
    let removed: AttachmentItem | undefined

    setAttachments((prev) => {
      const next = [...prev]
      ;[removed] = next.splice(index, 1)
      return next
    })

    if (removed) {
      const nextDescription = removeAttachmentFromDescription(editedDescription, removed)
      setEditedDescription(nextDescription)
      onUpdate?.(task.id, { description: nextDescription })
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-h-0 space-y-3 px-6 transition-all duration-200 relative',
        isDragging && 'bg-blue-500/5 ring-2 ring-inset ring-blue-500/20 rounded-2xl mx-2 px-4'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 animate-bounce">
            <Paperclip className="w-3.5 h-3.5" />
            Drop to attach files
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          Description
        </label>
        <div className="flex items-center gap-1">
          {task.description && task.description.trim().length > 0 && (
            <button
              onClick={onStartRun}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-blue-500/20 hover:border-blue-500 shadow-lg shadow-blue-500/5 animate-pulse-subtle mr-1"
              title="Run task"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Run Task</span>
            </button>
          )}

          <VoiceInputButton
            modelPaths={VOSK_MODEL_PATHS}
            onDelta={handleVoiceDelta}
            onTranscript={handleVoiceTranscript}
          />

          <button
            onClick={handlePickFiles}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-500/10 rounded-lg transition-colors flex items-center gap-1.5"
            title="Attach files"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">Attach</span>
          </button>

          <button
            onClick={handleImproveDescription}
            disabled={isGeneratingStory}
            className={cn(
              'p-1.5 text-violet-400 hover:text-white hover:bg-violet-500/10 rounded-lg transition-colors flex items-center gap-1.5',
              isGeneratingStory && 'opacity-50 cursor-not-allowed'
            )}
            title="Improve with AI"
          >
            {isGeneratingStory ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            <span className="text-[10px] font-bold">
              {isGeneratingStory ? 'Generating...' : 'AI Improve'}
            </span>
          </button>
        </div>
      </div>

      {generationError && (
        <div className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span className="flex-1">{generationError}</span>
          <button
            onClick={() => setGenerationError(null)}
            className="p-0.5 hover:bg-red-400/20 rounded-lg transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        {isEditing ? (
          <div className="relative w-full h-full overflow-hidden">
            <textarea
              ref={textareaRef}
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              onScroll={handleScroll}
              onBlur={handleSaveDescription}
              disabled={isGeneratingStory}
              autoFocus
              placeholder="Add a description..."
              className={cn(
                'w-full h-full bg-[#161B26] border border-slate-800/60 rounded-xl p-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none font-mono',
                isGeneratingStory && 'opacity-50 cursor-not-allowed'
              )}
            />
            {liveTranscript && (
              <div
                ref={overlayRef}
                className="absolute inset-0 pointer-events-none p-4 text-sm font-mono whitespace-pre-wrap break-words overflow-y-scroll scrollbar-none [&::-webkit-scrollbar]:hidden"
              >
                <span className="opacity-0">{editedDescription}</span>
                <span className="text-blue-400/50 italic animate-pulse">
                  {editedDescription.length > 0 &&
                  !editedDescription.endsWith(' ') &&
                  !editedDescription.endsWith('\n')
                    ? ' '
                    : ''}
                  {liveTranscript}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className="relative w-full h-full bg-[#161B26]/50 border border-transparent hover:border-slate-800/60 rounded-xl p-4 text-sm text-slate-300 overflow-y-auto cursor-pointer transition-colors"
          >
            {editedDescription ? (
              <>
                <LightMarkdown text={editedDescription} />
                {liveTranscript && (
                  <div className="text-blue-400/50 italic animate-pulse mt-2 border-t border-slate-800/60 pt-2">
                    {liveTranscript}
                  </div>
                )}
              </>
            ) : liveTranscript ? (
              <span className="text-blue-400/50 italic animate-pulse">{liveTranscript}</span>
            ) : (
              <span className="text-slate-600 italic">
                No description provided. Click to add...
              </span>
            )}
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="space-y-2 pb-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Paperclip className="w-3 h-3" />
            Attachments ({attachments.length})
          </div>
          <div className="grid grid-cols-2 gap-2">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-2 bg-[#161B26] border border-slate-800/60 rounded-lg group hover:border-slate-700 transition-colors"
              >
                <div className="w-8 h-8 rounded-md bg-slate-800 flex items-center justify-center shrink-0">
                  {file.type?.startsWith('image/') ? (
                    <Image className="w-4 h-4 text-blue-400" />
                  ) : (
                    <File className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-slate-300 truncate">{file.name}</div>
                  {typeof file.size === 'number' && (
                    <div className="text-[9px] text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeAttachment(index)}
                  className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove attachment"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
