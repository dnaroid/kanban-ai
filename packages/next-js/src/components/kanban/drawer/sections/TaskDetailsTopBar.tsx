import { PillSelect } from "@/components/common/PillSelect";
import type { KanbanTask } from "@/types/kanban";
import {
	statusConfig,
	typeConfig,
	difficultyConfig,
	priorityConfig,
} from "../TaskPropertyConfigs";

interface TaskDetailsTopBarProps {
	task: KanbanTask;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
}

export function TaskDetailsTopBar({ task, onUpdate }: TaskDetailsTopBarProps) {
	return (
		<div className="flex flex-wrap items-start gap-6">
			<PillSelect
				label="Status"
				value={task.status}
				options={statusConfig}
				onChange={(status) =>
					onUpdate?.(task.id, { status: status as KanbanTask["status"] })
				}
			/>

			<PillSelect
				label="Type"
				value={task.type}
				options={typeConfig}
				onChange={(type) =>
					onUpdate?.(task.id, { type: type as KanbanTask["type"] })
				}
			/>

			<PillSelect
				label="Difficulty"
				value={task.difficulty || "medium"}
				options={difficultyConfig}
				displayValue={task.difficulty || "Medium"}
				onChange={(difficulty) =>
					onUpdate?.(task.id, {
						difficulty: difficulty as KanbanTask["difficulty"],
					})
				}
			/>

			<PillSelect
				label="Priority"
				value={task.priority}
				options={priorityConfig}
				onChange={(priority) =>
					onUpdate?.(task.id, { priority: priority as KanbanTask["priority"] })
				}
			/>
		</div>
	);
}
