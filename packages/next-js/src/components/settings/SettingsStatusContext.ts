"use client";

import { createContext, useContext } from "react";

export type SettingsStatus = {
	message: string;
	type: "info" | "error" | "success";
} | null;

export type SettingsContextType = {
	status: SettingsStatus;
	setStatus: (status: SettingsStatus) => void;
};

export const SettingsStatusContext = createContext<SettingsContextType | null>(
	null,
);

export function useSettingsStatus() {
	const context = useContext(SettingsStatusContext);
	if (!context) {
		throw new Error("useSettingsStatus must be used within SettingsLayout");
	}
	return context;
}
