"use client";

import { useEffect } from "react";
import { api } from "@/lib/api-client";
import { useToast } from "./ToastContext";

export function ApiErrorProvider({ children }: { children: React.ReactNode }) {
	const { addToast } = useToast();

	useEffect(() => {
		api.onError = (message: string) => {
			addToast(message, "error");
		};

		return () => {
			api.onError = undefined;
		};
	}, [addToast]);

	return <>{children}</>;
}
