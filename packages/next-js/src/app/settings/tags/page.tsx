"use client";

import { TagManagement } from "@/components/settings/TagManagement";

export default function TagsPage() {
	return (
		<div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
			<TagManagement />
		</div>
	);
}
