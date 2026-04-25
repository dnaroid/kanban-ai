"use client";

import { createContext } from "react";

export { useContext } from "react";

export type ServerStatusContextValue = {
	isServerDown: boolean;
	reportNetworkError: () => void;
};

export const ServerStatusContext = createContext<
	ServerStatusContextValue | undefined
>(undefined);

export { useServerStatus } from "./useServerStatus";
