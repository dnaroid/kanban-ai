"use client";

import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import {
	BrainCircuit,
	ChevronDown,
	ChevronRight,
	Cpu,
	FileJson,
	FileText,
	FolderOpen,
	Globe,
	Layers,
	Plus,
	RotateCcw,
	Save,
	Search,
	Settings as SettingsIcon,
	ShieldAlert,
	Terminal,
	Trash2,
	Wrench,
	type LucideIcon,
} from "lucide-react";
import { FileSystemPicker } from "@/components/common/FileSystemPicker";
import { ModelPicker } from "@/components/common/ModelPicker";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { OpencodeModel } from "@/types/kanban";
import type {
	AgentConfig,
	AgentPermission,
	CategoryConfig,
	OhMyOpencodeConfig,
	PermissionValue,
	ThinkingConfig,
} from "./OhMyOpencodeTypes";
import {
	DynamicFormFields,
	validateSchema,
	type ValidationError,
} from "./DynamicFormFields";
import type { JSONSchema } from "@/lib/json-schema-types";

type OhMyOpencodeSettingsProps = {
	onStatusChangeAction: (status: {
		message: string;
		type: "info" | "error" | "success";
	}) => void;
};

type ConfigTab = "agents" | "categories";
type EditableConfig = AgentConfig | CategoryConfig;

const TEXT_VERBOSITIES = ["low", "medium", "high"];

const getColorFromName = (name: string) => {
	const colors = [
		"bg-blue-500",
		"bg-emerald-500",
		"bg-purple-500",
		"bg-amber-500",
		"bg-rose-500",
		"bg-indigo-500",
		"bg-cyan-500",
	];
	let hash = 0;
	for (let i = 0; i < name.length; i += 1) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return colors[Math.abs(hash) % colors.length];
};

function SectionHeader({
	title,
	subtitle,
	icon: Icon,
	children,
}: {
	title: string;
	subtitle?: string;
	icon: LucideIcon;
	children?: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between mb-6">
			<div className="flex items-center gap-3">
				<div className="w-10 h-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400">
					<Icon className="w-5 h-5" />
				</div>
				<div>
					<h3 className="text-lg font-bold text-white tracking-tight">
						{title}
					</h3>
					{subtitle && (
						<p className="text-xs text-slate-500 font-medium">{subtitle}</p>
					)}
				</div>
			</div>
			{children}
		</div>
	);
}

function InputField({
	label,
	value,
	onChange,
	placeholder,
	type = "text",
	className,
}: {
	label: string;
	value: string | number | undefined;
	onChange: (val: string) => void;
	placeholder?: string;
	type?: string;
	className?: string;
}) {
	const id = useId();
	return (
		<div className={cn("space-y-1.5", className)}>
			<label
				htmlFor={id}
				className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1"
			>
				{label}
			</label>
			<div className="relative">
				<input
					id={id}
					type={type}
					value={value ?? ""}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2.5 hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all placeholder:text-slate-500"
				/>
			</div>
		</div>
	);
}

function SelectField({
	label,
	value,
	options,
	onChange,
	className,
}: {
	label: string;
	value: string | undefined;
	options: string[];
	onChange: (val: string) => void;
	className?: string;
}) {
	const id = useId();
	return (
		<div className={cn("space-y-1.5", className)}>
			<label
				htmlFor={id}
				className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1"
			>
				{label}
			</label>
			<div className="relative">
				<select
					id={id}
					value={value ?? ""}
					onChange={(e) => onChange(e.target.value)}
					className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2.5 hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all appearance-none cursor-pointer placeholder:text-slate-500"
				>
					<option value="">Default / None</option>
					{options.map((opt) => (
						<option key={opt} value={opt}>
							{opt}
						</option>
					))}
				</select>
				<ChevronDown className="absolute right-4 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
			</div>
		</div>
	);
}

function ToggleField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: boolean | undefined;
	onChange: (val: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between p-4 bg-[#161B26] border border-slate-700 rounded-xl hover:border-slate-600 transition-all group">
			<span className="text-sm font-medium text-slate-300 group-hover:text-slate-200 transition-colors">
				{label}
			</span>
			<button
				type="button"
				onClick={() => onChange(!value)}
				className={cn(
					"w-11 h-6 rounded-full transition-all relative focus:outline-none focus:ring-2 focus:ring-blue-500/20",
					value
						? "bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.3)]"
						: "bg-slate-700",
				)}
			>
				<div
					className={cn(
						"absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
						value ? "left-6" : "left-1",
					)}
				/>
			</button>
		</div>
	);
}

function ThinkingEditor({
	value,
	onChange,
}: {
	value: ThinkingConfig | undefined;
	onChange: (val: ThinkingConfig | undefined) => void;
}) {
	const isEnabled = value?.type === "enabled";

	return (
		<div className="space-y-4 p-6 bg-[#11151C] border border-slate-800/50 rounded-2xl shadow-xl">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
						<BrainCircuit className="w-4 h-4" />
					</div>
					<div>
						<h4 className="text-sm font-bold text-white">Extended Thinking</h4>
						<p className="text-xs text-slate-500">
							Enable advanced reasoning capabilities
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={() =>
						onChange(
							isEnabled
								? undefined
								: {
										type: "enabled",
										budgetTokens: value?.budgetTokens ?? 16000,
									},
						)
					}
					className={cn(
						"w-11 h-6 rounded-full transition-all relative focus:outline-none focus:ring-2 focus:ring-purple-500/20",
						isEnabled
							? "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.3)]"
							: "bg-slate-700",
					)}
				>
					<div
						className={cn(
							"absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
							isEnabled ? "left-6" : "left-1",
						)}
					/>
				</button>
			</div>

			{isEnabled && (
				<div className="pt-4 border-t border-slate-800/40 animate-in slide-in-from-top-2 fade-in duration-200">
					<InputField
						label="Budget Tokens"
						type="number"
						value={value?.budgetTokens}
						onChange={(v) => {
							const nextBudget = Number.parseInt(v, 10);
							onChange({
								type: "enabled",
								budgetTokens: Number.isNaN(nextBudget) ? undefined : nextBudget,
							});
						}}
						placeholder="16000"
					/>
				</div>
			)}
		</div>
	);
}

function PermissionEditor({
	value,
	onChange,
}: {
	value: AgentPermission | undefined;
	onChange: (val: AgentPermission | undefined) => void;
}) {
	const isEnabled = value !== undefined;

	const updatePermission = (
		key: keyof AgentPermission,
		val: PermissionValue,
	) => {
		const newVal: AgentPermission = { ...(value || {}), [key]: val };
		onChange(newVal);
	};

	const renderSelect = (
		key: keyof AgentPermission,
		label: string,
		icon: ReactNode,
	) => (
		<div
			className={cn(
				"flex items-center justify-between py-2 transition-all duration-200",
				!isEnabled && "opacity-40 grayscale-[0.5] pointer-events-none",
			)}
		>
			<div className="flex items-center gap-2">
				{icon}
				<span className="text-sm text-slate-400 font-medium">{label}</span>
			</div>
			<div className="relative w-32">
				<select
					disabled={!isEnabled}
					value={typeof value?.[key] === "string" ? value[key] : "ask"}
					onChange={(e) =>
						updatePermission(key, e.target.value as PermissionValue)
					}
					className={cn(
						"w-full text-xs font-bold uppercase rounded-lg px-3 py-1.5 border appearance-none cursor-pointer focus:outline-none focus:ring-2 transition-all",
						value?.[key] === "allow"
							? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 focus:ring-emerald-500/20"
							: value?.[key] === "deny"
								? "bg-red-500/10 border-red-500/30 text-red-400 focus:ring-red-500/20"
								: "bg-amber-500/10 border-amber-500/30 text-amber-400 focus:ring-amber-500/20",
					)}
				>
					<option value="ask">Ask</option>
					<option value="allow">Allow</option>
					<option value="deny">Deny</option>
				</select>
				<ChevronDown className="absolute right-2 top-2.5 w-3 h-3 opacity-50 pointer-events-none" />
			</div>
		</div>
	);

	return (
		<div className="space-y-4 p-6 bg-[#11151C] border border-slate-800/50 rounded-2xl shadow-xl">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
						<ShieldAlert className="w-4 h-4" />
					</div>
					<div>
						<h4 className="text-sm font-bold text-white">Permissions</h4>
						<p className="text-xs text-slate-500">Granular access control</p>
					</div>
				</div>
				<button
					type="button"
					onClick={() => onChange(isEnabled ? undefined : {})}
					className={cn(
						"w-11 h-6 rounded-full transition-all relative focus:outline-none focus:ring-2 focus:ring-amber-500/20",
						isEnabled
							? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
							: "bg-slate-700",
					)}
				>
					<div
						className={cn(
							"absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
							isEnabled ? "left-6" : "left-1",
						)}
					/>
				</button>
			</div>

			{isEnabled && (
				<div className="space-y-1 pt-4 border-t border-slate-800/40 animate-in slide-in-from-top-2 fade-in duration-200">
					{renderSelect(
						"edit",
						"File Editing",
						<FileText className="w-4 h-4 text-slate-500" />,
					)}
					{renderSelect(
						"webfetch",
						"Web Access",
						<Globe className="w-4 h-4 text-slate-500" />,
					)}
					{renderSelect(
						"bash",
						"Shell Execution",
						<Terminal className="w-4 h-4 text-slate-500" />,
					)}
					{renderSelect(
						"external_directory",
						"External Access",
						<FolderOpen className="w-4 h-4 text-slate-500" />,
					)}
				</div>
			)}
		</div>
	);
}

function ToolsEditor({
	value,
	onChange,
}: {
	value: Record<string, boolean> | undefined;
	onChange: (val: Record<string, boolean> | undefined) => void;
}) {
	const [newTool, setNewTool] = useState("");

	const setToolValue = (tool: string, enabled: boolean) => {
		const newValue = { ...(value || {}), [tool]: enabled };
		onChange(newValue);
	};

	const removeTool = (tool: string) => {
		const newValue = { ...(value || {}) };
		delete newValue[tool];
		onChange(Object.keys(newValue).length > 0 ? newValue : undefined);
	};

	return (
		<div>
			<div className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">
				Tools Configuration
			</div>

			<div className="flex gap-2 mb-3">
				<div className="relative flex-1">
					<input
						value={newTool}
						onChange={(e) => setNewTool(e.target.value)}
						placeholder="Add tool (e.g. read_file)..."
						className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2.5 hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all placeholder:text-slate-500"
						onKeyDown={(e) => {
							if (e.key === "Enter" && newTool.trim()) {
								setToolValue(newTool.trim(), true);
								setNewTool("");
							}
						}}
					/>
				</div>
				<button
					type="button"
					onClick={() => {
						if (newTool.trim()) {
							setToolValue(newTool.trim(), true);
							setNewTool("");
						}
					}}
					className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center disabled:opacity-50 disabled:shadow-none"
					disabled={!newTool.trim()}
				>
					<Plus className="w-5 h-5" />
				</button>
			</div>

			<div className="space-y-2">
				{Object.entries(value || {}).map(([tool, enabled]) => (
					<div
						key={tool}
						className="flex items-center justify-between p-4 bg-[#161B26] border border-slate-700 rounded-xl hover:border-slate-600 transition-all group"
					>
						<span className="text-sm font-medium text-slate-300 font-mono group-hover:text-slate-200 transition-colors">
							{tool}
						</span>
						<div className="flex items-center gap-4">
							<button
								type="button"
								onClick={() => setToolValue(tool, !enabled)}
								title={enabled ? "Enabled" : "Disabled"}
								className={cn(
									"w-11 h-6 rounded-full transition-all relative focus:outline-none focus:ring-2 focus:ring-blue-500/20",
									enabled
										? "bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.3)]"
										: "bg-slate-700",
								)}
							>
								<div
									className={cn(
										"absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
										enabled ? "left-6" : "left-1",
									)}
								/>
							</button>
							<button
								type="button"
								onClick={() => removeTool(tool)}
								className="text-slate-500 hover:text-red-400 transition-colors p-1 hover:bg-red-500/10 rounded-lg"
							>
								<Trash2 className="w-4 h-4" />
							</button>
						</div>
					</div>
				))}
				{(!value || Object.keys(value).length === 0) && (
					<div className="text-xs text-slate-500 italic p-4 text-center border border-dashed border-slate-800 rounded-xl">
						No explicit tool configurations
					</div>
				)}
			</div>
		</div>
	);
}

function ArrayEditor({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string[] | undefined;
	onChange: (val: string[]) => void;
}) {
	const [input, setInput] = useState("");

	const handleAdd = () => {
		if (!input.trim()) return;
		onChange([...(value || []), input.trim()]);
		setInput("");
	};

	const handleRemove = (idx: number) => {
		const newValue = [...(value || [])];
		newValue.splice(idx, 1);
		onChange(newValue);
	};

	return (
		<div>
			<div className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">
				{label}
			</div>
			<div className="flex gap-2 mb-3">
				<div className="relative flex-1">
					<input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleAdd()}
						placeholder="Add item..."
						className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2.5 hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all placeholder:text-slate-500"
					/>
				</div>
				<button
					type="button"
					onClick={handleAdd}
					className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center disabled:opacity-50 disabled:shadow-none"
					disabled={!input.trim()}
				>
					<Plus className="w-5 h-5" />
				</button>
			</div>
			<div className="flex flex-wrap gap-2">
				{value?.map((item, idx) => (
					<span
						key={item}
						className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg text-xs font-medium text-slate-300 border border-slate-700 hover:border-slate-600 hover:bg-slate-800 transition-all group"
					>
						{item}
						<button
							type="button"
							onClick={() => handleRemove(idx)}
							className="text-slate-500 hover:text-red-400 transition-colors ml-1"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</span>
				))}
			</div>
		</div>
	);
}

export function OhMyOpencodeSettings({
	onStatusChangeAction,
}: OhMyOpencodeSettingsProps) {
	const [configPath, setConfigPath] = useState<string | null>(null);
	const [config, setConfig] = useState<OhMyOpencodeConfig | null>(null);
	const [models, setModels] = useState<OpencodeModel[]>([]);
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
				const config = response.config as OhMyOpencodeConfig;
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
		}
	}, []);

	useEffect(() => {
		void loadConfigPath();
		void loadModels();
		void loadPickerInitialPath();
	}, [loadConfigPath, loadModels, loadPickerInitialPath]);

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
			.replace(/\.oh-my-opencode\.json$/i, "");
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
			setConfig(response.config as OhMyOpencodeConfig);
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
					title="Select oh-my-opencode.json"
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

	const itemModelLabel = (itemData: EditableConfig) => {
		if (typeof itemData.model !== "string") return null;
		const modelName = itemData.model.split("/").pop() || itemData.model;
		const variant =
			typeof itemData.variant === "string" ? itemData.variant : null;
		return variant ? `${modelName} (${variant})` : modelName;
	};

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex-none bg-[#0B0E14] border-b border-slate-800/60 pb-6 px-8 pt-8 shrink-0">
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10 transition-transform hover:scale-110">
							<SettingsIcon className="w-6 h-6 animate-spin-slow" />
						</div>
						<div>
							<h1 className="text-2xl font-black text-white tracking-tight leading-tight uppercase">
								Oh My Opencode
							</h1>
							<div className="flex items-center gap-2 mt-1">
								<div className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
									Config
								</div>
								<p className="text-[10px] text-slate-500 font-mono truncate max-w-[400px]">
									{configPath}
								</p>
							</div>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={handleSelectFile}
							className="px-4 py-2 bg-[#161B26] border border-slate-700 hover:border-slate-600 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
						>
							<FolderOpen className="w-4 h-4 text-slate-400" />
							Open
						</button>
						<div className="w-px h-8 bg-slate-800/60 mx-1" />
						<button
							type="button"
							onClick={() => {
								void handleSave();
							}}
							disabled={!unsavedChanges}
							className={cn(
								"px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg",
								unsavedChanges
									? "bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-500 hover:scale-105 active:scale-95"
									: "bg-slate-800/40 text-slate-500 cursor-not-allowed shadow-none",
							)}
						>
							<Save className="w-4 h-4" />
							Save Changes
						</button>
						<button
							type="button"
							onClick={() => {
								void handleBackup();
							}}
							className="p-2.5 bg-[#161B26] border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white rounded-xl transition-all shadow-sm"
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
							className="p-2.5 bg-[#161B26] border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
							title="Restore from Backup"
						>
							<ShieldAlert className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="flex items-center gap-4 py-3 px-4 bg-[#161B26]/50 border border-slate-800/50 rounded-xl backdrop-blur-sm">
					<div className="flex items-center gap-3 flex-1">
						<div className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center text-slate-500">
							<Layers className="w-4 h-4" />
						</div>
						<div className="flex-1">
							<div className="relative">
								<select
									value={selectedPreset}
									onChange={(e) => setSelectedPreset(e.target.value)}
									className="w-full bg-[#0B0E14] border border-slate-700 text-xs font-medium text-slate-200 rounded-lg pl-3 pr-8 py-2 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer transition-colors"
								>
									<option value="">Select a preset configuration...</option>
									{presets.map((preset) => (
										<option key={preset} value={preset}>
											{preset}
										</option>
									))}
								</select>
								<ChevronDown className="absolute right-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
							</div>
						</div>
						<button
							type="button"
							onClick={() => {
								void handleLoadPreset();
							}}
							disabled={!selectedPreset}
							className={cn(
								"px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
								selectedPreset
									? "bg-slate-700 text-white hover:bg-slate-600 shadow-lg shadow-black/20"
									: "bg-slate-800/40 text-slate-500 cursor-not-allowed",
							)}
						>
							Load
						</button>
					</div>

					<div className="w-px h-8 bg-slate-800/50" />

					<div className="flex items-center gap-3 flex-1">
						<div className="relative flex-1">
							<input
								value={newPresetName}
								onChange={(e) => setNewPresetName(e.target.value)}
								placeholder="Save current config as preset..."
								className="w-full bg-[#0B0E14] border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-2 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-600"
							/>
						</div>
						<button
							type="button"
							onClick={() => {
								void handleSavePreset();
							}}
							disabled={!newPresetName.trim() || !config}
							className={cn(
								"px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
								newPresetName.trim() && config
									? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
									: "bg-slate-800/40 text-slate-500 cursor-not-allowed",
							)}
						>
							Save New
						</button>
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-hidden bg-[#0B0E14] relative">
				<div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/10 to-transparent" />
				<div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2" />

				{config ? (
					<div className="h-full overflow-y-auto custom-scrollbar p-8">
						<div className="max-w-5xl mx-auto space-y-8 pb-20">
							<DynamicFormFields
								schema={schema}
								data={config as unknown as Record<string, unknown>}
								onChange={handleChange}
								excludeFields={new Set(["$schema"])}
								models={models}
								validationErrors={validationErrors}
							/>
						</div>
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
				title="Select oh-my-opencode.json"
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
