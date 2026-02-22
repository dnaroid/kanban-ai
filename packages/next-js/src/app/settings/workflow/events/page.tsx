"use client";

import { WorkflowEngineSignalsEditor } from "@/components/settings/WorkflowEngineSignalsEditor";
import { useWorkflowSettings } from "@/components/settings/WorkflowSettingsContext";

export default function WorkflowEventsPage() {
	const { draftConfig, updateDraft, setJsonError } = useWorkflowSettings();

	if (!draftConfig) return null;

	return (
		<WorkflowEngineSignalsEditor
			signals={draftConfig.signals}
			signalRules={draftConfig.signalRules}
			statuses={draftConfig.statuses}
			onSignalsChange={(signals) => updateDraft({ signals })}
			onSignalRulesChange={(signalRules) => updateDraft({ signalRules })}
			onErrorChange={setJsonError}
		/>
	);
}
