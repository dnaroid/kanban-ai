"use client";

import { OpencodeConfigSettings } from "@/components/settings/OpencodeConfigSettings";
import { useSettingsStatus } from "@/components/settings/SettingsStatusContext";

export default function OpencodeConfigPage() {
	const { setStatus } = useSettingsStatus();

	return (
		<div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
			<OpencodeConfigSettings onStatusChangeAction={setStatus} />
		</div>
	);
}
