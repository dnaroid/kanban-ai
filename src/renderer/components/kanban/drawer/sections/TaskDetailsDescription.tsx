import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Eye, FileText, Loader2, Pencil, Wand2, X } from 'lucide-react'
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
}

export function TaskDetailsDescription({ task, onUpdate }: TaskDetailsDescriptionProps) {
  const [editedDescription, setEditedDescription] = useState(task.description || '')
  const [isGeneratingStory, setIsGeneratingStory] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEditedDescription(task.description || '')
  }, [task.description])

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

    let timer: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('TIMEOUT'))
      }, 120000)
    })

    try {
      const response = await Promise.race([
        window.api.opencode.generateUserStory({ taskId: task.id }),
        timeoutPromise,
      ])
      const descriptionText = String((response as Record<string, unknown>)['description'] ?? '')
      if (descriptionText.trim().length > 0) {
        setEditedDescription(descriptionText)
        setGenerationError(null)
        if (!isEditing) {
          setIsEditing(true)
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'TIMEOUT') {
        setGenerationError('AI generation timed out (45s). The service might be busy.')
      } else {
        console.error('Failed to generate user story:', error)
        setGenerationError('Failed to generate user story. Please try again.')
      }
    } finally {
      clearTimeout(timer!)
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

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3 px-6">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          Description
        </label>
        <div className="flex items-center gap-1">
          <VoiceInputButton
            modelPaths={VOSK_MODEL_PATHS}
            onDelta={handleVoiceDelta}
            onTranscript={handleVoiceTranscript}
          />

          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
            title={isEditing ? 'Preview' : 'Edit'}
          >
            {isEditing ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleImproveDescription}
            disabled={isGeneratingStory}
            className={cn(
              'p-1.5 text-purple-400 hover:text-white hover:bg-purple-500/10 rounded transition-colors flex items-center gap-1.5',
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
            className="p-0.5 hover:bg-red-400/20 rounded transition-colors"
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
                'w-full h-full bg-[#161B26] border border-slate-800 rounded-xl p-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none font-mono',
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
            className="relative w-full h-full bg-[#161B26]/50 border border-transparent hover:border-slate-800 rounded-xl p-4 text-sm text-slate-300 overflow-y-auto cursor-pointer transition-colors"
          >
            {editedDescription ? (
              <>
                <LightMarkdown text={editedDescription} />
                {liveTranscript && (
                  <div className="text-blue-400/50 italic animate-pulse mt-2 border-t border-slate-800/50 pt-2">
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
    </div>
  )
}
