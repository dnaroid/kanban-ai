import { useState, useEffect } from 'react'
import { AlertTriangle, FileText, Loader2, Wand2, X } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { KanbanTask } from '@/shared/types/ipc.ts'

interface TaskDetailsDescriptionProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
}

export function TaskDetailsDescription({ task, onUpdate }: TaskDetailsDescriptionProps) {
  const [editedDescription, setEditedDescription] = useState(task.description || '')
  const [isGeneratingStory, setIsGeneratingStory] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  useEffect(() => {
    setEditedDescription(task.description || '')
  }, [task.description])

  const handleSaveDescription = () => {
    if (editedDescription !== task.description) {
      onUpdate?.(task.id, { description: editedDescription })
    }
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
      }
    } catch (error: any) {
      if (error.message === 'TIMEOUT') {
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

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3 px-6">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          Description
        </label>
        <div className="flex items-center gap-1">
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
        <textarea
          value={editedDescription}
          onChange={(e) => setEditedDescription(e.target.value)}
          onBlur={handleSaveDescription}
          disabled={isGeneratingStory}
          placeholder="Add a description..."
          className={cn(
            'w-full h-full bg-[#161B26] border border-slate-800 rounded-xl p-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none',
            isGeneratingStory && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>
    </div>
  )
}
