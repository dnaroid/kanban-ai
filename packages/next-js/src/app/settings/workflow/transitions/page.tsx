"use client";

import { WorkflowTransitionsEditor } from "@/components/settings/WorkflowTransitionsEditor";
import { useWorkflowSettings } from "@/components/settings/WorkflowSettingsContext";

export default function WorkflowTransitionsPage() {
	const { draftConfig, updateDraft } = useWorkflowSettings();

	if (!draftConfig) return null;

	return (
		<WorkflowTransitionsEditor
			statusTransitions={draftConfig.statusTransitions}
			columnTransitions={draftConfig.columnTransitions}
			statuses={draftConfig.statuses}
			columns={draftConfig.columns}
			onStatusTransitionsChange={(st) =>
				updateDraft({ statusTransitions: st })
			}
			onColumnTransitionsChange={(ct) =>
				updateDraft({ columnTransitions: ct })
			}
		/>
	);
}
