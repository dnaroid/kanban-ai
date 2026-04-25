import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import type { KanbanTask, OpencodeModel } from "@/types/kanban";
import { ModelPicker } from "@/components/common/ModelPicker";
import { api } from "@/lib/api-client";

interface TaskDetailsModelProps {
	task: KanbanTask;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
}

export function TaskDetailsModel({ task, onUpdate }: TaskDetailsModelProps) {
	const [models, setModels] = useState<OpencodeModel[]>([]);

	useEffect(() => {
		const loadEnabledModels = async () => {
			try {
				const response = await api.opencode.listEnabledModels();
				const difficultyOrder = { easy: 0, medium: 1, hard: 2, epic: 3 };
				const sortedModels = [...response.models].sort((a, b) => {
					return (
						difficultyOrder[a.difficulty as keyof typeof difficultyOrder] -
						difficultyOrder[b.difficulty as keyof typeof difficultyOrder]
					);
				});
				setModels(sortedModels);
			} catch (error) {
				console.error("Failed to load models:", error);
			}
		};
		loadEnabledModels();
	}, []);

	const selectModel = (fullId: string | null) => {
		onUpdate?.(task.id, { modelName: fullId });
	};

	const isDisabled = task.status === "running" || task.status === "generating";

	return (
		<div className="flex items-center gap-2">
			{task.latestSessionId && task.opencodeWebUrl && (
				<a
					href={`${task.opencodeWebUrl}/session/${task.latestSessionId}`}
					target="_blank"
					rel="noopener noreferrer"
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
					className="inline-flex items-center justify-center rounded-md text-blue-500/85 transition-colors hover:bg-blue-500/10 hover:text-blue-400 active:bg-blue-500/20 -mr-1 p-0.5"
					title="Open session"
				>
					<ExternalLink className="h-3.5 w-3.5" />
				</a>
			)}
			<ModelPicker
				value={task.modelName || null}
				models={models}
				onChange={selectModel}
				allowAuto
				difficulty={task.difficulty}
				disabled={isDisabled}
				borderless
			/>
		</div>
	);
}
