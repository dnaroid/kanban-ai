"use client";

import { WorkflowSettingsEditor } from "@/components/settings/WorkflowSettingsEditor";

export default function WorkflowSettingsPage() {
	return (
		<div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
			<WorkflowSettingsEditor />
		</div>
	);
}
