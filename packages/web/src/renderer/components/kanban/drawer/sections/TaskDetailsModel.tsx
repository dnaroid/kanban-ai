import { useState, useEffect } from 'react'
import type { KanbanTask, OpencodeModel } from '@shared/types/ipc'
import { ModelPicker } from '../../../common/ModelPicker'

interface TaskDetailsModelProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
}

export function TaskDetailsModel({ task, onUpdate }: TaskDetailsModelProps) {
  const [models, setModels] = useState<OpencodeModel[]>([])

  useEffect(() => {
    const loadEnabledModels = async () => {
      try {
        const response = await window.api.opencode.listEnabledModels()
        const difficultyOrder = { easy: 0, medium: 1, hard: 2, epic: 3 }
        const sortedModels = [...response.models].sort((a, b) => {
          return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]
        })
        setModels(sortedModels)
      } catch (error) {
        console.error('Failed to load models:', error)
      }
    }
    loadEnabledModels()
  }, [])

  const selectModel = (fullId: string | null) => {
    onUpdate?.(task.id, { modelName: fullId })
  }

  return (
    <div className="flex items-center gap-2">
      <ModelPicker
        value={task.modelName || null}
        models={models}
        onChange={selectModel}
        allowAuto
        difficulty={task.difficulty}
      />
    </div>
  )
}
