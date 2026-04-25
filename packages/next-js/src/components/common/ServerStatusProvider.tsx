"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ServerStatusContext } from "./ServerStatusContext";

export function ServerStatusProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [isServerDown, setIsServerDown] = useState(false);

	const reportNetworkError = useCallback(() => {
		setIsServerDown(true);
	}, []);

	useEffect(() => {
		if (!isServerDown) {
			return;
		}

		let isDisposed = false;

		const checkRecovery = async () => {
			try {
				await fetch("/api/projects", { cache: "no-store" });
				if (!isDisposed) {
					window.location.reload();
				}
			} catch {
				return;
			}
		};

		void checkRecovery();
		const intervalId = window.setInterval(() => {
			void checkRecovery();
		}, 3000);

		return () => {
			isDisposed = true;
			window.clearInterval(intervalId);
		};
	}, [isServerDown]);

	const value = useMemo(
		() => ({ isServerDown, reportNetworkError }),
		[isServerDown, reportNetworkError],
	);

	return (
		<ServerStatusContext.Provider value={value}>
			{children}
		</ServerStatusContext.Provider>
	);
}
