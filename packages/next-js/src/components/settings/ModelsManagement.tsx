"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { OpencodeModel } from "@/types/kanban";
import { AllModelsTab } from "./AllModelsTab";
import { MyModelsTab } from "./MyModelsTab";
import { OhMyOpencodeSettings } from "./OhMyOpencodeSettings";

type Difficulty = "easy" | "medium" | "hard" | "epic";

type ModelsManagementProps = {
	activeSubTab: "all" | "my" | "oh-my-opencode";
	onStatusChangeAction: (status: {
		message: string;
		type: "info" | "error" | "success";
	}) => void;
};

export function ModelsManagement({
	activeSubTab,
	onStatusChangeAction,
}: ModelsManagementProps) {
	const [models, setModels] = useState<OpencodeModel[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [defaultModels, setDefaultModels] = useState<Record<string, string>>(
		{},
	);

	const loadModels = useCallback(async () => {
		try {
			setIsLoading(true);
			const response = await api.opencode.listModels();
			setModels(response.models);

			const difficultyLevels: Difficulty[] = ["easy", "medium", "hard", "epic"];
			const defaultsResponses = await Promise.all(
				difficultyLevels.map((difficulty) =>
					api.appSetting.getDefaultModel({ difficulty }),
				),
			);

			const defaults: Record<string, string> = {};
			defaultsResponses.forEach((res, index) => {
				if (res.modelName) {
					defaults[difficultyLevels[index]] = res.modelName;
				}
			});

			setDefaultModels(defaults);
		} catch (error) {
			console.error("Failed to load models:", error);
			onStatusChangeAction({ message: "Failed to load models", type: "error" });
		} finally {
			setIsLoading(false);
		}
	}, [onStatusChangeAction]);

	const handleSetDefaultModel = async (
		difficulty: Difficulty,
		modelName: string,
		variant?: string,
	) => {
		try {
			const fullId = variant ? `${modelName}#${variant}` : modelName;
			await api.appSetting.setDefaultModel({ difficulty, modelName: fullId });
			setDefaultModels((prev) => ({ ...prev, [difficulty]: fullId }));
			onStatusChangeAction({
				message: `Set default ${difficulty} model`,
				type: "success",
			});
		} catch (error) {
			console.error("Failed to set default model:", error);
			onStatusChangeAction({
				message: "Failed to set default model",
				type: "error",
			});
		}
	};

	useEffect(() => {
		void loadModels();
	}, [loadModels]);

	const handleToggleModel = async (name: string, enabled: boolean) => {
		try {
			await api.opencode.toggleModel({ name, enabled });
			setModels((prev) =>
				prev.map((m) => (m.name === name ? { ...m, enabled } : m)),
			);
		} catch (error) {
			console.error("Failed to toggle model:", error);
			onStatusChangeAction({
				message: "Failed to update model status",
				type: "error",
			});
		}
	};

	const handleUpdateDifficulty = async (
		name: string,
		difficulty: Difficulty,
	) => {
		try {
			await api.opencode.updateModelDifficulty({ name, difficulty });
			setModels((prev) =>
				prev.map((m) => (m.name === name ? { ...m, difficulty } : m)),
			);
		} catch (error) {
			console.error("Failed to update model difficulty:", error);
			onStatusChangeAction({
				message: "Failed to update model difficulty",
				type: "error",
			});
		}
	};

	const handleToggleAll = async (
		targetModels: OpencodeModel[],
		enabled: boolean,
	) => {
		try {
			await Promise.all(
				targetModels.map((m) =>
					api.opencode.toggleModel({ name: m.name, enabled }),
				),
			);
			const updatedNames = new Set(targetModels.map((m) => m.name));
			setModels((prev) =>
				prev.map((m) => (updatedNames.has(m.name) ? { ...m, enabled } : m)),
			);
			onStatusChangeAction({
				message: `${enabled ? "Enabled" : "Disabled"} ${targetModels.length} models`,
				type: "success",
			});
		} catch (error) {
			console.error("Failed to toggle models:", error);
			onStatusChangeAction({
				message: "Failed to update models",
				type: "error",
			});
		}
	};

	const handleRefreshModels = async () => {
		try {
			setIsLoading(true);
			await api.opencode.refreshModels();
			await loadModels();
			onStatusChangeAction({
				message: "Models refreshed from connected providers",
				type: "success",
			});
		} catch (error) {
			console.error("Failed to refresh models:", error);
			onStatusChangeAction({
				message: "Failed to refresh models",
				type: "error",
			});
		} finally {
			setIsLoading(false);
		}
	};

	if (isLoading && models.length === 0) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex-1 overflow-hidden">
				{activeSubTab === "all" && (
					<AllModelsTab
						models={models}
						onStatusChangeAction={onStatusChangeAction}
						handleToggleModelAction={handleToggleModel}
						handleToggleAllAction={handleToggleAll}
						handleRefreshModelsAction={handleRefreshModels}
					/>
				)}

				{activeSubTab === "my" && (
					<MyModelsTab
						models={models}
						defaultModels={defaultModels}
						onStatusChangeAction={onStatusChangeAction}
						handleToggleModelAction={handleToggleModel}
						handleUpdateDifficultyAction={handleUpdateDifficulty}
						handleSetDefaultModelAction={handleSetDefaultModel}
					/>
				)}

				{activeSubTab === "oh-my-opencode" && (
					<OhMyOpencodeSettings onStatusChangeAction={onStatusChangeAction} />
				)}
			</div>
		</div>
	);
}
