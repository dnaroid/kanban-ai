"use client";

import { createContext } from "react";

export { useContext } from "react";

export type ToastType = "info" | "success" | "warning" | "error";

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration?: number;
	onClick?: () => void;
}

export interface ToastOptions {
	duration?: number;
	onClick?: () => void;
}

export interface ToastContextType {
	addToast: (
		message: string,
		type: ToastType,
		durationOrOptions?: number | ToastOptions,
	) => void;
	removeToast: (id: string) => void;
	toasts: Toast[];
}

export const ToastContext = createContext<ToastContextType | undefined>(
	undefined,
);

export { useToast } from "./useToast";
