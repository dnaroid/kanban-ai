"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ChevronDown,
	ExternalLink,
	FileJson,
	FileText,
	FolderOpen,
	Github,
	Layers,
	RotateCcw,
	Save,
	Settings as SettingsIcon,
	ShieldAlert,
} from "lucide-react";
import { FileSystemPicker } from "@/components/common/FileSystemPicker";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { OpencodeModel } from "@/types/kanban";
import type { OhMyOpenagentConfig } from "./OhMyOpenagentTypes";
import { DynamicFormFields, validateSchema } from "./DynamicFormFields";
import { EngagedModelsSummary } from "./EngagedModelsSummary";
import type { JSONSchema } from "@/lib/json-schema-types";

type OhMyOpenagentSettingsProps = {
	onStatusChangeAction: (status: {
		message: string;
		type: "info" | "error" | "success";
	}) => void;
};

export function OhMyOpenagentSettings({
	onStatusChangeAction,
}: OhMyOpenagentSettingsProps) {
	const [configPath, setConfigPath] = useState<string | null>(null);
	const [config, setConfig] = useState<OhMyOpenagentConfig | null>(null);
	const [models, setModels] = useState<OpencodeModel[]>([]);
	const [modelsLoading, setModelsLoading] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [hasBackup, setHasBackup] = useState(false);
	const [unsavedChanges, setUnsavedChanges] = useState(false);
	const [presets, setPresets] = useState<string[]>([]);
	const [selectedPreset, setSelectedPreset] = useState("");
	const [newPresetName, setNewPresetName] = useState("");
	const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
	const [pickerInitialPath, setPickerInitialPath] = useState<
		string | undefined
	>(undefined);
	const [schema, setSchema] = useState<JSONSchema | null>(null);

	const loadPresets = useCallback(async (path: string) => {
		try {
			const response = await api.omc.listPresets({ path });
			setPresets(response.presets);
			setSelectedPreset((prev) =>
				prev && !response.presets.includes(prev) ? "" : prev,
			);
		} catch (error) {
			console.error("Failed to load presets:", error);
		}
	}, []);

	const checkBackupExists = useCallback(async (path: string) => {
		try {
			const response = await api.filesystem.exists({ path: `${path}.backup` });
			setHasBackup(response.exists);
		} catch {
			setHasBackup(false);
		}
	}, []);

	const loadSchema = useCallback(async (schemaUrl: string) => {
		try {
			const response = await api.schema.fetch(schemaUrl);
			setSchema(response.schema);
		} catch (error) {
			console.error("Failed to load schema:", error);
			setSchema(null);
		}
	}, []);

	const loadConfig = useCallback(
		async (path: string) => {
			try {
				setIsLoading(true);
				const response = await api.omc.readConfig({ path });
				const config = response.config as OhMyOpenagentConfig;
				setConfig(config);
				setUnsavedChanges(false);
				if (config.$schema) {
					await loadSchema(config.$schema);
				}
				await checkBackupExists(path);
				await loadPresets(path);
			} catch (error) {
				console.error("Failed to load config:", error);
				onStatusChangeAction({
					message: "Failed to load config",
					type: "error",
				});
			} finally {
				setIsLoading(false);
			}
		},
		[checkBackupExists, loadPresets, onStatusChangeAction, loadSchema],
	);

	const loadConfigPath = useCallback(async () => {
		try {
			const response = await api.appSetting.getOhMyOpencodePath();
			setConfigPath(response.path);
			if (response.path) {
				await loadConfig(response.path);
			}
		} catch (error) {
			console.error("Failed to load config path:", error);
			onStatusChangeAction({
				message: "Failed to load config path",
				type: "error",
			});
		}
	}, [loadConfig, onStatusChangeAction]);

	const loadPickerInitialPath = useCallback(async () => {
		try {
			const response = await api.browseDirectory();
			if (response.homePath) {
				setPickerInitialPath(`${response.homePath}/.config/opencode`);
			}
		} catch {
			setPickerInitialPath(undefined);
		}
	}, []);

	const loadModels = useCallback(async () => {
		try {
			setModelsLoading(true);
			const response = await api.opencode.listModels();
			const difficultyOrder: Record<string, number> = {
				easy: 0,
				medium: 1,
				hard: 2,
				epic: 3,
			};
			const enabledModels = response.models.filter((model) => model.enabled);
			const sortedModels = [...enabledModels].sort((a, b) => {
				const aOrder = difficultyOrder[a.difficulty] ?? Number.MAX_SAFE_INTEGER;
				const bOrder = difficultyOrder[b.difficulty] ?? Number.MAX_SAFE_INTEGER;
				return aOrder - bOrder;
			});
			setModels(sortedModels);
		} catch (error) {
			console.error("Failed to load models:", error);
		} finally {
			setModelsLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadConfigPath();
		void loadModels();
		void loadPickerInitialPath();
	}, [loadConfigPath, loadModels, loadPickerInitialPath]);

	// Warn on route change when there are unsaved changes
	useEffect(() => {
		if (!unsavedChanges) return;

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
			return "";
		};

		const handlePopState = (e: PopStateEvent) => {
			e.preventDefault();
			const confirmed = window.confirm(
				"You have unsaved changes. Are you sure you want to leave?",
			);
			if (!confirmed) {
				window.history.pushState(null, "", window.location.href);
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		window.addEventListener("popstate", handlePopState);
		window.history.pushState(null, "", window.location.href);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			window.removeEventListener("popstate", handlePopState);
		};
	}, [unsavedChanges]);

	const handleSelectFile = () => {
		setIsFilePickerOpen(true);
	};

	const handleFileSelect = async (paths: string[]) => {
		if (!paths[0]) return;
		const path = paths[0];
		await api.appSetting.setOhMyOpencodePath({ path });
		setConfigPath(path);
		await loadConfig(path);
		setIsFilePickerOpen(false);
	};

	const handleSave = async () => {
		if (!config || !configPath) return;
		try {
			await api.omc.saveConfig({ path: configPath, config });
			setUnsavedChanges(false);
			onStatusChangeAction({
				message: "CONFIGURATION SYNCHRONIZED",
				type: "success",
			});
		} catch (error) {
			console.error("Failed to save config:", error);
			onStatusChangeAction({
				message: "SYNCHRONIZATION FAILED",
				type: "error",
			});
		}
	};

	const handleSavePreset = async () => {
		if (!config || !configPath || !newPresetName.trim()) return;
		const presetName = newPresetName
			.trim()
			.replace(/\.oh-my-openagent\.json$/i, "");
		try {
			await api.omc.savePreset({ path: configPath, presetName, config });
			setNewPresetName("");
			setSelectedPreset(presetName);
			await loadPresets(configPath);
			onStatusChangeAction({
				message: `Preset saved as ${presetName}`,
				type: "success",
			});
		} catch (error) {
			console.error("Failed to save preset:", error);
			onStatusChangeAction({ message: "Failed to save preset", type: "error" });
		}
	};

	const handleLoadPreset = async () => {
		if (!configPath || !selectedPreset) return;
		try {
			setIsLoading(true);
			const response = await api.omc.loadPreset({
				path: configPath,
				presetName: selectedPreset,
			});
			setConfig(response.config as OhMyOpenagentConfig);
			setUnsavedChanges(true);
			onStatusChangeAction({
				message: `Preset loaded: ${selectedPreset}`,
				type: "success",
			});
		} catch (error) {
			console.error("Failed to load preset:", error);
			onStatusChangeAction({ message: "Failed to load preset", type: "error" });
		} finally {
			setIsLoading(false);
		}
	};

	const handleBackup = async () => {
		if (!configPath) return;
		try {
			const response = await api.omc.backup({ path: configPath });
			await checkBackupExists(configPath);
			onStatusChangeAction({
				message: `Backup created at ${response.backupPath}`,
				type: "success",
			});
		} catch (error) {
			console.error("Failed to create backup:", error);
			onStatusChangeAction({
				message: "Failed to create backup",
				type: "error",
			});
		}
	};

	const handleRestore = async () => {
		if (!configPath || !hasBackup) return;
		try {
			await api.omc.restore({ path: configPath });
			await loadConfig(configPath);
			onStatusChangeAction({
				message: "Config restored from backup",
				type: "success",
			});
		} catch (error) {
			console.error("Failed to restore backup:", error);
			onStatusChangeAction({
				message: "Failed to restore backup",
				type: "error",
			});
		}
	};

	const handleChange = useCallback((key: string, value: unknown) => {
		setConfig((prev) => {
			if (!prev) return null;
			return { ...prev, [key]: value };
		});
		setUnsavedChanges(true);
	}, []);

	const validationErrors = useMemo(() => {
		if (!schema || !config) return [];
		return validateSchema(schema, config);
	}, [schema, config]);

	if (isLoading && !config) {
		return (
			<div className="flex items-center justify-center h-96">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
			</div>
		);
	}

	if (!configPath) {
		return (
			<>
				<div className="flex flex-col items-center justify-center h-96 space-y-6 text-center">
					<div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
						<FileText className="w-8 h-8" />
					</div>
					<div className="flex items-baseline gap-2">
						<h3 className="text-sm font-bold text-white tracking-tight leading-none">
							Configuration
						</h3>
						<p className="text-[9px] text-slate-500 font-medium truncate max-w-[250px] leading-none">
							{configPath}
						</p>
					</div>
					<button
						type="button"
						onClick={handleSelectFile}
						className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
					>
						<FolderOpen className="w-5 h-5" />
						Select File
					</button>
				</div>
				<FileSystemPicker
					isOpen={isFilePickerOpen}
					mode="file"
					initialPath={pickerInitialPath}
					title="Select oh-my-openagent.json"
					selectLabel="Select Config File"
					allowedExtensions={["json"]}
					onSelect={(paths) => {
						void handleFileSelect(paths);
					}}
					onClose={() => setIsFilePickerOpen(false)}
				/>
			</>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="flex-none bg-[#0B0E14] border-b border-slate-800/60 pb-6 mb-6 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10">
						<SettingsIcon className="w-5 h-5 animate-spin-slow" />
					</div>
					<div>
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] leading-none">
								Runtime Environment
							</span>
							<a
								href="https://github.com/code-yeongyu/oh-my-openagent"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 ml-3 text-[10px] font-bold text-[#60a5fa] hover:text-[#93bbfd] uppercase tracking-wider transition-colors"
							>
								<Github className="w-3 h-3" />
								OH-MY-OPENAGENT
								<ExternalLink className="w-2.5 h-2.5" />
							</a>
						</div>
						<p className="text-xl font-black text-white tracking-tight leading-none mt-1">
							Configuration <span className="text-slate-600">File</span>
						</p>
					</div>
				</div>

				<div className="flex items-center gap-3 flex-wrap">
					{/* Preset Section */}
					<div className="flex items-center bg-[#161B26] border border-slate-700 rounded-xl p-1 shadow-sm">
						<div className="flex items-center gap-2 px-2">
							<Layers className="w-4 h-4 text-slate-500" />
							<div className="relative">
								<select
									value={selectedPreset}
									onChange={(e) => setSelectedPreset(e.target.value)}
									className="bg-transparent text-[11px] font-bold text-slate-200 pr-6 py-1 focus:outline-none appearance-none cursor-pointer min-w-[120px] max-w-[180px] truncate hover:bg-slate-800/50 hover:text-slate-100 transition-colors"
								>
									<option value="" className="bg-[#161B26]">
										Select Preset...
									</option>
									{presets.map((preset) => (
										<option
											key={preset}
											value={preset}
											className="bg-[#161B26]"
										>
											{preset}
										</option>
									))}
								</select>
								<ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
							</div>
						</div>

						<button
							type="button"
							onClick={() => void handleLoadPreset()}
							disabled={!selectedPreset}
							className={cn(
								"h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
								selectedPreset
									? "bg-slate-700 text-white hover:bg-slate-600"
									: "text-slate-600 cursor-not-allowed",
							)}
						>
							Load
						</button>

						<div className="w-px h-4 bg-slate-700 mx-1" />

						<div className="flex items-center gap-1 pl-1">
							<input
								value={newPresetName}
								onChange={(e) => setNewPresetName(e.target.value)}
								placeholder="New name..."
								className="bg-transparent text-[11px] text-slate-300 px-2 py-1 focus:outline-none w-24 placeholder:text-slate-600"
							/>
							<button
								type="button"
								onClick={() => void handleSavePreset()}
								disabled={!newPresetName.trim() || !config}
								className={cn(
									"h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
									newPresetName.trim() && config
										? "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 ring-1 ring-emerald-500/30"
										: "text-slate-600 cursor-not-allowed",
								)}
							>
								Save
							</button>
						</div>
					</div>

					<div className="w-px h-8 bg-slate-800/60 mx-1" />

					{/* Config Section */}
					<div className="flex items-center bg-[#161B26] border border-slate-700 rounded-xl p-1 shadow-sm">
						<button
							type="button"
							onClick={handleSelectFile}
							className="h-8 px-3 hover:bg-slate-800 hover:text-white text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2"
						>
							<FolderOpen className="w-3.5 h-3.5 text-slate-400" />
							Config
						</button>
						<div className="w-px h-4 bg-slate-700 mx-1" />
						<div
							className="px-3 text-[10px] text-slate-500 font-mono truncate max-w-[100px]"
							title={configPath || ""}
						>
							{configPath?.split("/").pop()}
						</div>
					</div>

					{/* Action Buttons */}
					<button
						type="button"
						onClick={() => {
							void handleSave();
						}}
						disabled={!unsavedChanges}
						className={cn(
							"h-10 px-5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg",
							unsavedChanges
								? "bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-500"
								: "bg-slate-800/40 text-slate-500 cursor-not-allowed shadow-none",
						)}
					>
						<Save className="w-4 h-4" />
						{unsavedChanges ? "Apply" : "Synced"}
					</button>

					<div className="flex items-center bg-[#161B26] border border-slate-700 rounded-xl p-1 shadow-sm">
						<button
							type="button"
							onClick={() => {
								void handleBackup();
							}}
							className="w-8 h-8 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
							title="Create Backup"
						>
							<RotateCcw className="w-4 h-4" />
						</button>
						<button
							type="button"
							onClick={() => {
								void handleRestore();
							}}
							disabled={!hasBackup}
							className="w-8 h-8 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all disabled:opacity-20 disabled:cursor-not-allowed"
							title="Restore from Backup"
						>
							<ShieldAlert className="w-4 h-4" />
						</button>
					</div>
				</div>
			</div>

			<div className="flex-1 relative">
				<div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/10 to-transparent" />
				<div className="absolute top-0 right-0 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[80px] pointer-events-none" />

				<EngagedModelsSummary
					config={config}
					models={models}
					isLoading={modelsLoading}
				/>

				{config ? (
					<div className="space-y-8 pb-20">
						<DynamicFormFields
							schema={schema}
							data={config as unknown as Record<string, unknown>}
							onChange={handleChange}
							excludeFields={new Set(["$schema"])}
							models={models}
							validationErrors={validationErrors}
						/>
					</div>
				) : (
					<div className="flex flex-col items-center justify-center h-full text-center p-8">
						<div className="w-24 h-24 rounded-3xl bg-slate-800/30 flex items-center justify-center mb-6 ring-1 ring-slate-700/50">
							<FileJson className="w-10 h-10 text-slate-600" />
						</div>
						<h3 className="text-xl font-bold text-white mb-2">
							No Configuration Loaded
						</h3>
						<p className="text-slate-400 max-w-md mb-8 leading-relaxed">
							Select a configuration file to start editing your environment
							settings, agents, and tools.
						</p>
						<button
							type="button"
							onClick={handleSelectFile}
							className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xl shadow-blue-600/20 hover:shadow-blue-600/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group"
						>
							<FolderOpen className="w-5 h-5 group-hover:text-blue-100" />
							Select Config File
						</button>
					</div>
				)}
			</div>

			<FileSystemPicker
				isOpen={isFilePickerOpen}
				mode="file"
				title="Select oh-my-openagent.json"
				selectLabel="Select Config File"
				allowedExtensions={["json"]}
				initialPath={pickerInitialPath}
				onSelect={(paths) => {
					void handleFileSelect(paths);
				}}
				onClose={() => setIsFilePickerOpen(false)}
			/>
		</div>
	);
}
