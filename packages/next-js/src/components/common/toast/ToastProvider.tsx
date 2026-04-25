"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
	ToastContext,
	type Toast,
	type ToastOptions,
	type ToastType,
} from "./ToastContext";

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
