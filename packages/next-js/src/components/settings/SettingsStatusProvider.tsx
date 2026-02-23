"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
	SettingsStatusContext,
	type SettingsStatus,
} from "@/components/settings/SettingsStatusContext";
import { useToast } from "@/components/common/toast/ToastContext";

export function SettingsStatusProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<SettingsStatus>(null);
	const { addToast } = useToast();

	useEffect(() => {
		if (status) {
			addToast(status.message, status.type);
			setStatus(null);
		}
	}, [status, addToast]);

	return (
		<SettingsStatusContext.Provider value={{ status, setStatus }}>
			{children}
		</SettingsStatusContext.Provider>
	);
}
