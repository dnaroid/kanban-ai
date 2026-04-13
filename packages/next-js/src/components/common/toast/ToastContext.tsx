"use client";

import React, {
	createContext,
	useContext,
	useState,
	useCallback,
	ReactNode,
} from "react";

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

interface ToastContextType {
	addToast: (
		message: string,
		type: ToastType,
		durationOrOptions?: number | ToastOptions,
	) => void;
	removeToast: (id: string) => void;
	toasts: Toast[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	}, []);

	const addToast = useCallback(
		(
			message: string,
			type: ToastType = "info",
			durationOrOptions?: number | ToastOptions,
		) => {
			const id = Math.random().toString(36).substring(2, 9);
			const opts: ToastOptions =
				typeof durationOrOptions === "object"
					? durationOrOptions
					: { duration: durationOrOptions };
			const duration = opts.duration ?? 5000;
			setToasts((prev) => [
				...prev,
				{ id, message, type, duration, onClick: opts.onClick },
			]);

			if (duration > 0) {
				setTimeout(() => {
					removeToast(id);
				}, duration);
			}
		},
		[removeToast],
	);

	return (
		<ToastContext.Provider value={{ addToast, removeToast, toasts }}>
			{children}
		</ToastContext.Provider>
	);
}

export function useToast() {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within a ToastProvider");
	}
	return context;
}
