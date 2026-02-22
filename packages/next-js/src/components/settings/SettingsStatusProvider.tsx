"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
	SettingsStatusContext,
	type SettingsStatus,
} from "@/components/settings/SettingsStatusContext";

export function SettingsStatusProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<SettingsStatus>(null);

	useEffect(() => {
		if (status) {
			const timer = setTimeout(() => setStatus(null), 5000);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [status]);

	return (
		<SettingsStatusContext.Provider value={{ status, setStatus }}>
			{children}
		</SettingsStatusContext.Provider>
	);
}
