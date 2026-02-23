"use client";

import {
	createContext,
	useContext,
	useCallback,
	useEffect,
	useState,
	useMemo,
	ReactNode,
} from "react";
import { api } from "@/lib/api-client";
import type {
	WorkflowConfig,
	WorkflowColumnConfig,
	WorkflowStatusConfig,
	WorkflowTaskStatus,
	WorkflowSignal,
	WorkflowSignalRule,
} from "@/lib/api-client";
import { useSettingsStatus } from "@/components/settings/SettingsStatusContext";
import {
	validateWorkflowConfig,
	isWorkflowConfigDirty,
} from "./workflow-validation";

interface WorkflowSettingsContextType {
	isLoading: boolean;
	isSaving: boolean;
	isDirty: boolean;
	isValid: boolean;
	originalConfig: WorkflowConfig | null;
	draftConfig: WorkflowConfig | null;
	validationErrors: Array<{ path: string; message: string }>;
	jsonError: string | null;
	setJsonError: (error: string | null) => void;
	loadConfig: (confirm?: boolean, hasUnsavedChanges?: boolean) => Promise<void>;
	saveConfig: () => Promise<void>;
	resetDraft: () => void;
	updateDraft: (updates: Partial<WorkflowConfig>) => void;
	handleColumnsChange: (nextColumns: WorkflowColumnConfig[]) => void;
}

const WorkflowSettingsContext = createContext<
	WorkflowSettingsContextType | undefined
>(undefined);

export function useWorkflowSettings() {
	const context = useContext(WorkflowSettingsContext);
	if (!context) {
		throw new Error(
			"useWorkflowSettings must be used within a WorkflowSettingsProvider",
		);
	}
	return context;
}

function normalizeColumns(
	columns: WorkflowColumnConfig[],
): WorkflowColumnConfig[] {
	return [...columns]
		.sort((a, b) => a.orderIndex - b.orderIndex)
		.map((column, index) => ({ ...column, orderIndex: index }));
}

function reconcileConfigAfterColumnsChange(
	config: WorkflowConfig,
	nextColumnsInput: WorkflowColumnConfig[],
): Pick<WorkflowConfig, "columns" | "statuses" | "columnTransitions"> {
	const nextColumns = normalizeColumns(nextColumnsInput);
	const nextColumnKeys = nextColumns.map((column) => column.systemKey);
	const nextColumnKeySet = new Set(nextColumnKeys);

	if (nextColumns.length === 0) {
		return {
			columns: nextColumns,
			statuses: config.statuses,
			columnTransitions: config.columnTransitions,
		};
	}

	const preferredFallbackColumn = nextColumnKeySet.has("backlog")
		? "backlog"
		: nextColumns[0].systemKey;

	const statuses = config.statuses.map((status) =>
		nextColumnKeySet.has(status.preferredColumnSystemKey)
			? status
			: { ...status, preferredColumnSystemKey: preferredFallbackColumn },
	);

	const columnTransitions: Record<string, string[]> = {};

	for (const [fromKey, targetKeys] of Object.entries(
		config.columnTransitions,
	)) {
		if (!nextColumnKeySet.has(fromKey)) {
			continue;
		}
		columnTransitions[fromKey] = targetKeys.filter((targetKey) =>
			nextColumnKeySet.has(targetKey),
		);
	}

	for (const column of nextColumns) {
		const existingTargets = columnTransitions[column.systemKey] ?? [];
		columnTransitions[column.systemKey] =
			existingTargets.length === 0 ? [column.systemKey] : existingTargets;
	}

	return {
		columns: nextColumns,
		statuses,
		columnTransitions,
	};
}

export function WorkflowSettingsProvider({ children }: { children: ReactNode }) {
	const { setStatus } = useSettingsStatus();
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	const [originalConfig, setOriginalConfig] = useState<WorkflowConfig | null>(
		null,
	);
	const [draftConfig, setDraftConfig] = useState<WorkflowConfig | null>(null);
	const [jsonError, setJsonError] = useState<string | null>(null);

	const isDirty = useMemo(() => {
		if (!originalConfig || !draftConfig) return false;
		return isWorkflowConfigDirty(originalConfig, draftConfig);
	}, [originalConfig, draftConfig]);

	const validationErrors = useMemo(() => {
		if (!draftConfig) return [];
		return validateWorkflowConfig(draftConfig);
	}, [draftConfig]);

	const isValid = validationErrors.length === 0 && !jsonError;

	const loadConfig = useCallback(
		async (skipConfirm = false) => {
			setIsLoading(true);
			try {
				const config = await api.workflow.getConfig();
				setOriginalConfig(config);
				setDraftConfig(JSON.parse(JSON.stringify(config)));
				setJsonError(null);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to load workflow configuration";
				setStatus({ type: "error", message });
			} finally {
				setIsLoading(false);
			}
		},
		[setStatus],
	);

	useEffect(() => {
		void loadConfig(true);
	}, [loadConfig]);

	const saveConfig = async () => {
		if (!draftConfig || !isValid) return;

		setIsSaving(true);
		try {
			const saved = await api.workflow.updateConfig(draftConfig);
			setOriginalConfig(saved);
			setDraftConfig(JSON.parse(JSON.stringify(saved)));
			setStatus({
				type: "success",
				message: "Workflow configuration saved successfully",
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to save workflow configuration";
			setStatus({ type: "error", message });
		} finally {
			setIsSaving(false);
		}
	};

	const resetDraft = () => {
		if (!originalConfig) return;
		setDraftConfig(JSON.parse(JSON.stringify(originalConfig)));
		setJsonError(null);
	};

	const updateDraft = (updates: Partial<WorkflowConfig>) => {
		setJsonError(null);
		setDraftConfig((prev) => (prev ? { ...prev, ...updates } : null));
	};

	const handleColumnsChange = useCallback(
		(nextColumns: WorkflowColumnConfig[]) => {
			setJsonError(null);
			setDraftConfig((prev) => {
				if (!prev) {
					return null;
				}

				return {
					...prev,
					...reconcileConfigAfterColumnsChange(prev, nextColumns),
				};
			});
		},
		[],
	);

	const value = {
		isLoading,
		isSaving,
		isDirty,
		isValid,
		originalConfig,
		draftConfig,
		validationErrors,
		jsonError,
		setJsonError,
		loadConfig,
		saveConfig,
		resetDraft,
		updateDraft,
		handleColumnsChange,
	};

	return (
		<WorkflowSettingsContext.Provider value={value}>
			{children}
		</WorkflowSettingsContext.Provider>
	);
}
