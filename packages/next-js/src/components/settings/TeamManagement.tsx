"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useRef,
	type KeyboardEvent,
} from "react";
import {
	Brain,
	ChevronRight,
	Cpu,
	Loader2,
	Plus,
	RefreshCw,
	Search,
	Terminal,
	Trash2,
	Users,
	X,
	CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useSettingsStatus } from "@/components/settings/SettingsStatusContext";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import type { OpencodeAgent, OpencodeModel } from "@/types/ipc";

interface AgentRolePreset {
	version: string;
	provider: string;
	modelName: string;
	skills: string[];
	systemPrompt: string;
	mustDo: string[];
	outputContract: string[];
	behavior?: AgentRoleBehavior;
}

interface AgentRoleBehavior {
	preferredForStoryGeneration: boolean;
	preferredForQaTesting: boolean;
	recommended: boolean;
	optional: boolean;
	quickSelect: boolean;
}

interface FullRole {
	id: string;
	name: string;
	description: string;
	preset_json: string;
	preferred_model_name?: string | null;
	preferred_model_variant?: string | null;
	preferred_llm_agent?: string | null;
}

function parseModelVariants(raw: string): string[] {
	return raw
		.split(",")
		.map((variant) => variant.trim())
		.filter(Boolean);
}

const DEFAULT_BEHAVIOR: AgentRoleBehavior = {
	preferredForStoryGeneration: false,
	preferredForQaTesting: false,
	recommended: false,
	optional: false,
	quickSelect: false,
};

const DEFAULT_PRESET: AgentRolePreset = {
	version: "1.0",
	provider: "openai",
	modelName: "gpt-5.3-codex",
	skills: [],
	systemPrompt: "You are a specialized AI agent.",
	mustDo: [],
	outputContract: [],
	behavior: DEFAULT_BEHAVIOR,
};

function parseRolePreset(rawPreset: string): AgentRolePreset {
	try {
		const parsed = JSON.parse(rawPreset) as Partial<AgentRolePreset> & {
			behavior?: Partial<AgentRoleBehavior>;
		};
		const behaviorSource: Partial<AgentRoleBehavior> =
			parsed.behavior && typeof parsed.behavior === "object"
				? parsed.behavior
				: {};
		return {
			...DEFAULT_PRESET,
			...parsed,
			behavior: {
				...DEFAULT_BEHAVIOR,
				preferredForStoryGeneration:
					behaviorSource.preferredForStoryGeneration === true,
				preferredForQaTesting: behaviorSource.preferredForQaTesting === true,
				recommended: behaviorSource.recommended === true,
				optional: behaviorSource.optional === true,
				quickSelect: behaviorSource.quickSelect === true,
			},
		};
	} catch {
		return DEFAULT_PRESET;
	}
}

function normalizeSkills(skills: string[]): string[] {
	return [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))];
}

export function TeamManagement() {
	const [roles, setRoles] = useState<FullRole[]>([]);
	const [skillsCatalog, setSkillsCatalog] = useState<string[]>([]);
	const [enabledModels, setEnabledModels] = useState<OpencodeModel[]>([]);
	const [agentsCatalog, setAgentsCatalog] = useState<OpencodeAgent[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isRefreshingSkills, setIsRefreshingSkills] = useState(false);
	const [skillQuery, setSkillQuery] = useState("");
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const { setStatus } = useSettingsStatus();

	const [formId, setFormId] = useState("");
	const [formName, setFormName] = useState("");
	const [formDescription, setFormDescription] = useState("");
	const [preferredModelName, setPreferredModelName] = useState("");
	const [preferredModelVariant, setPreferredModelVariant] = useState("");
	const [preferredLlmAgent, setPreferredLlmAgent] = useState("");
	const [formPreset, setFormPreset] = useState<AgentRolePreset>(DEFAULT_PRESET);
	const [isNew, setIsNew] = useState(false);

	const lastSavedData = useRef<string>("");
	const latestDataRef = useRef<{
		formId: string;
		formName: string;
		formDescription: string;
		preferredModelName: string;
		preferredModelVariant: string;
		preferredLlmAgent: string;
		formPreset: AgentRolePreset;
	} | null>(null);

	const formData = useMemo(
		() => ({
			formId,
			formName,
			formDescription,
			preferredModelName,
			preferredModelVariant,
			preferredLlmAgent,
			formPreset,
		}),
		[
			formId,
			formName,
			formDescription,
			preferredModelName,
			preferredModelVariant,
			preferredLlmAgent,
			formPreset,
		],
	);

	useEffect(() => {
		latestDataRef.current = formData;
	}, [formData]);

	const saveChanges = useCallback(
		async (dataToSave: typeof formData) => {
			if (!dataToSave.formId.trim() || !dataToSave.formName.trim()) {
				return;
			}

			setIsSaving(true);
			try {
				const behavior = {
					...DEFAULT_BEHAVIOR,
					...(dataToSave.formPreset.behavior ?? {}),
				};
				const preset_json = JSON.stringify({
					...dataToSave.formPreset,
					skills: normalizeSkills(dataToSave.formPreset.skills),
					systemPrompt: dataToSave.formPreset.systemPrompt.trim(),
					behavior,
				});

				await api.roles.save({
					id: dataToSave.formId.trim(),
					name: dataToSave.formName.trim(),
					description: dataToSave.formDescription.trim(),
					preset_json,
					preferred_model_name: dataToSave.preferredModelName.trim() || null,
					preferred_model_variant:
						dataToSave.preferredModelVariant.trim() || null,
					preferred_llm_agent: dataToSave.preferredLlmAgent.trim() || null,
				});

				lastSavedData.current = JSON.stringify(dataToSave);

				setStatus({
					message: `Role ${dataToSave.formName.trim()} saved successfully`,
					type: "success",
				});

				const response = await api.roles.listFull();
				setRoles(response.roles);

				setSelectedRoleId((prevId) => {
					if (prevId !== dataToSave.formId.trim()) {
						return dataToSave.formId.trim();
					}
					return prevId;
				});
				setIsNew(false);
			} catch (error) {
				console.error("Failed to save role:", error);
				setStatus({ message: "Failed to save role", type: "error" });
			} finally {
				setIsSaving(false);
			}
		},
		[setStatus],
	);

	const loadRoles = useCallback(
		async (autoSelect = false) => {
			setIsLoading(true);
			try {
				const response = await api.roles.listFull();
				setRoles(response.roles);

				if (autoSelect && response.roles.length > 0) {
					const role = response.roles[0];
					setSelectedRoleId(role.id);
					setFormId(role.id);
					setFormName(role.name);
					setFormDescription(role.description);
					setPreferredModelName(role.preferred_model_name ?? "");
					setPreferredModelVariant(role.preferred_model_variant ?? "");
					setPreferredLlmAgent(role.preferred_llm_agent ?? "");
					const preset = parseRolePreset(role.preset_json);
					setFormPreset(preset);

					const newFormData = {
						formId: role.id,
						formName: role.name,
						formDescription: role.description,
						preferredModelName: role.preferred_model_name ?? "",
						preferredModelVariant: role.preferred_model_variant ?? "",
						preferredLlmAgent: role.preferred_llm_agent ?? "",
						formPreset: preset,
					};
					lastSavedData.current = JSON.stringify(newFormData);
					latestDataRef.current = newFormData;
				}
			} catch (error) {
				console.error("Failed to load roles:", error);
				setStatus({ message: "Failed to load roles", type: "error" });
			} finally {
				setIsLoading(false);
			}
		},
		[setStatus],
	);

	useEffect(() => {
		const currentDataStr = JSON.stringify(formData);
		if (currentDataStr === lastSavedData.current) {
			return;
		}

		if (!formData.formId.trim() || !formData.formName.trim()) {
			return;
		}

		const timer = setTimeout(() => {
			void saveChanges(formData);
		}, 1000);

		return () => clearTimeout(timer);
	}, [formData, saveChanges]);

	useEffect(() => {
		return () => {
			if (latestDataRef.current) {
				const currentDataStr = JSON.stringify(latestDataRef.current);
				if (
					currentDataStr !== lastSavedData.current &&
					latestDataRef.current.formId.trim() &&
					latestDataRef.current.formName.trim()
				) {
					const dataToSave = latestDataRef.current;
					const behavior = {
						...DEFAULT_BEHAVIOR,
						...(dataToSave.formPreset.behavior ?? {}),
					};
					const preset_json = JSON.stringify({
						...dataToSave.formPreset,
						skills: normalizeSkills(dataToSave.formPreset.skills),
						systemPrompt: dataToSave.formPreset.systemPrompt.trim(),
						behavior,
					});

					void api.roles.save({
						id: dataToSave.formId.trim(),
						name: dataToSave.formName.trim(),
						description: dataToSave.formDescription.trim(),
						preset_json,
						preferred_model_name: dataToSave.preferredModelName.trim() || null,
						preferred_model_variant:
							dataToSave.preferredModelVariant.trim() || null,
						preferred_llm_agent: dataToSave.preferredLlmAgent.trim() || null,
					});
				}
			}
		};
	}, []);

	const selectRole = useCallback(
		(role: FullRole) => {
			if (latestDataRef.current) {
				const currentDataStr = JSON.stringify(latestDataRef.current);
				if (
					currentDataStr !== lastSavedData.current &&
					latestDataRef.current.formId.trim() &&
					latestDataRef.current.formName.trim()
				) {
					void saveChanges(latestDataRef.current);
				}
			}

			setSelectedRoleId(role.id);
			setFormId(role.id);
			setFormName(role.name);
			setFormDescription(role.description);
			setPreferredModelName(role.preferred_model_name ?? "");
			setPreferredModelVariant(role.preferred_model_variant ?? "");
			setPreferredLlmAgent(role.preferred_llm_agent ?? "");
			const preset = parseRolePreset(role.preset_json);
			setFormPreset(preset);
			setSkillQuery("");
			setIsNew(false);

			const newData = {
				formId: role.id,
				formName: role.name,
				formDescription: role.description,
				preferredModelName: role.preferred_model_name ?? "",
				preferredModelVariant: role.preferred_model_variant ?? "",
				preferredLlmAgent: role.preferred_llm_agent ?? "",
				formPreset: preset,
			};
			lastSavedData.current = JSON.stringify(newData);
			latestDataRef.current = newData;
		},
		[saveChanges],
	);

	const loadSkillsCatalog = useCallback(async () => {
		try {
			const response = await api.opencode.listSkills();
			setSkillsCatalog(response.skills);
		} catch (error) {
			console.error("Failed to load OpenCode skills:", error);
			setSkillsCatalog([]);
		}
	}, []);

	const loadEnabledModels = useCallback(async () => {
		try {
			const response = await api.opencode.listEnabledModels();
			setEnabledModels(response.models ?? []);
		} catch (error) {
			console.error("Failed to load enabled OpenCode models:", error);
			setEnabledModels([]);
		}
	}, []);

	const loadAgentsCatalog = useCallback(async () => {
		try {
			const response = await api.opencode.listAgents();
			setAgentsCatalog(response.agents ?? []);
		} catch (error) {
			console.error("Failed to load OpenCode agents:", error);
			setAgentsCatalog([]);
		}
	}, []);

	const handleRefreshSkills = useCallback(async () => {
		setIsRefreshingSkills(true);
		try {
			const result = await api.opencode.refreshSkillAssignments();
			await loadRoles();
			setStatus({
				message: `Skills refreshed for ${result.updatedRoles}/${result.consideredRoles} agents`,
				type: "success",
			});
		} catch (error) {
			console.error("Failed to refresh skill assignments:", error);
			setStatus({
				message: "Failed to refresh skill assignments",
				type: "error",
			});
		} finally {
			setIsRefreshingSkills(false);
		}
	}, [loadRoles, setStatus]);

	useEffect(() => {
		void loadRoles(true);
		void loadSkillsCatalog();
		void loadEnabledModels();
		void loadAgentsCatalog();
	}, [loadRoles, loadSkillsCatalog, loadEnabledModels, loadAgentsCatalog]);

	const handleAddNew = () => {
		if (latestDataRef.current) {
			const currentDataStr = JSON.stringify(latestDataRef.current);
			if (
				currentDataStr !== lastSavedData.current &&
				latestDataRef.current.formId.trim() &&
				latestDataRef.current.formName.trim()
			) {
				void saveChanges(latestDataRef.current);
			}
		}

		setSelectedRoleId(null);
		setFormId("");
		setFormName("");
		setFormDescription("");
		setPreferredModelName("");
		setPreferredModelVariant("");
		setPreferredLlmAgent("");
		setFormPreset(DEFAULT_PRESET);
		setSkillQuery("");
		setIsNew(true);

		const emptyData = {
			formId: "",
			formName: "",
			formDescription: "",
			preferredModelName: "",
			preferredModelVariant: "",
			preferredLlmAgent: "",
			formPreset: DEFAULT_PRESET,
		};
		lastSavedData.current = JSON.stringify(emptyData);
		latestDataRef.current = emptyData;
	};

	const handleDelete = (id: string) => {
		setDeletingId(id);
		setShowDeleteConfirm(true);
	};

	const confirmDelete = async () => {
		if (!deletingId) return;

		try {
			await api.roles.delete({ id: deletingId });
			setStatus({ message: "Role deleted", type: "success" });
			await loadRoles();
			if (selectedRoleId === deletingId) {
				handleAddNew();
			}
		} catch (error) {
			console.error("Failed to delete role:", error);
			setStatus({ message: "Failed to delete role", type: "error" });
		} finally {
			setShowDeleteConfirm(false);
			setDeletingId(null);
		}
	};

	const filteredRoles = useMemo(() => {
		return roles.filter(
			(role) =>
				role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				role.id.toLowerCase().includes(searchQuery.toLowerCase()),
		);
	}, [roles, searchQuery]);

	const roleBehaviorById = useMemo(() => {
		const behaviorMap = new Map<string, AgentRoleBehavior>();
		for (const role of roles) {
			behaviorMap.set(
				role.id,
				parseRolePreset(role.preset_json).behavior ?? DEFAULT_BEHAVIOR,
			);
		}
		return behaviorMap;
	}, [roles]);

	const sortedFilteredRoles = useMemo(() => {
		const rank = (role: FullRole) => {
			const behavior = roleBehaviorById.get(role.id) ?? DEFAULT_BEHAVIOR;
			if (behavior.recommended) return 0;
			if (behavior.optional) return 1;
			return 2;
		};

		return [...filteredRoles].sort((a, b) => {
			const rankDiff = rank(a) - rank(b);
			if (rankDiff !== 0) return rankDiff;
			return a.name.localeCompare(b.name);
		});
	}, [filteredRoles, roleBehaviorById]);

	const filteredSkills = useMemo(() => {
		const q = skillQuery.trim().toLowerCase();
		const availableSkills = skillsCatalog.filter(
			(s) => !formPreset.skills.includes(s),
		);

		if (!q) {
			return [];
		}

		return availableSkills
			.filter((skill) => skill.toLowerCase().includes(q))
			.slice(0, 15);
	}, [skillQuery, skillsCatalog, formPreset.skills]);

	const selectedModel = useMemo(
		() =>
			enabledModels.find((model) => model.name === preferredModelName) ?? null,
		[enabledModels, preferredModelName],
	);

	const modelVariants = useMemo(
		() => (selectedModel ? parseModelVariants(selectedModel.variants) : []),
		[selectedModel],
	);

	useEffect(() => {
		if (!preferredModelVariant) {
			return;
		}
		if (!modelVariants.includes(preferredModelVariant)) {
			setPreferredModelVariant("");
		}
	}, [modelVariants, preferredModelVariant]);

	const addSkill = useCallback((rawSkill: string) => {
		const skill = rawSkill.trim();
		if (!skill) {
			return;
		}
		setFormPreset((prev) => ({
			...prev,
			skills: normalizeSkills([...prev.skills, skill]),
		}));
		setSkillQuery("");
	}, []);

	const removeSkill = useCallback((skillToRemove: string) => {
		setFormPreset((prev) => ({
			...prev,
			skills: prev.skills.filter((skill) => skill !== skillToRemove),
		}));
	}, []);

	const handleSkillInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter" && event.key !== ",") {
			return;
		}
		event.preventDefault();
		addSkill(skillQuery);
	};

	const isDataSaved =
		!isSaving &&
		JSON.stringify(formData) === lastSavedData.current &&
		formId.trim() &&
		formName.trim();

	return (
		<div className="flex flex-col w-full min-h-screen">
			<div className="flex-none bg-[#0B0E14] border-b border-slate-800/60 pb-6 mb-6 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center shadow-lg shadow-blue-500/10">
						<Users className="w-5 h-5 text-blue-400" />
					</div>
					<div>
						<p className="text-xl font-black text-white tracking-tight leading-none">
							{roles.length}{" "}
							<span className="text-slate-600 font-medium">Active Agents</span>
						</p>
						<p className="text-[10px] text-slate-500 font-medium mt-1">
							BA assigns agent via user story META field agentRoleId.
						</p>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<div className="relative group min-w-[250px]">
						<div className="absolute left-3.5 top-1/2 -translate-y-1/2">
							<Search className="w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
						</div>
						<input
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							placeholder="Search roles..."
							className="w-full bg-slate-900/40 border border-slate-800/60 text-sm text-slate-200 rounded-xl pl-10 pr-10 py-2.5 hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all placeholder:text-slate-600 font-medium shadow-sm"
						/>
					</div>
					<button
						type="button"
						onClick={handleRefreshSkills}
						disabled={isRefreshingSkills || isLoading}
						className="flex items-center gap-2 h-10 px-4 bg-slate-900/50 hover:bg-slate-800/70 disabled:bg-slate-900/30 disabled:text-slate-500 text-slate-200 border border-slate-700/70 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95"
					>
						{isRefreshingSkills ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<RefreshCw className="w-4 h-4" />
						)}
						Refresh Skill
					</button>
					<button
						type="button"
						onClick={handleAddNew}
						className="flex items-center gap-2 h-10 px-5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-95"
					>
						<Plus className="w-4 h-4" />
						New Agent
					</button>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
				<div className="lg:col-span-4 space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
					{isLoading ? (
						<div className="py-20 flex flex-col items-center justify-center gap-4">
							<Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
						</div>
					) : (
						sortedFilteredRoles.map((role) => {
							const preset = parseRolePreset(role.preset_json);
							const behavior = preset.behavior ?? DEFAULT_BEHAVIOR;
							const hasModel =
								role.preferred_model_name || role.preferred_llm_agent;
							const skillsCount = preset.skills.length;

							return (
								<button
									type="button"
									key={role.id}
									onClick={() => selectRole(role)}
									className={cn(
										"w-full text-left p-4 rounded-2xl border transition-all duration-300 group flex items-center justify-between",
										selectedRoleId === role.id
											? "bg-blue-500/10 border-blue-500/40 shadow-lg shadow-blue-500/5"
											: "bg-slate-900/20 border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/40",
									)}
								>
									<div className="flex items-center gap-4 min-w-0">
										<div
											className={cn(
												"w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
												selectedRoleId === role.id
													? "bg-blue-500/20 text-blue-400"
													: "bg-slate-800 text-slate-400",
											)}
										>
											<Terminal className="w-5 h-5" />
										</div>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<h3 className="font-black text-sm tracking-tight text-slate-200 truncate">
													{role.name}
												</h3>
												<span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
													{role.id}
												</span>
												{behavior.recommended ? (
													<span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-[8px] font-black uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30 shrink-0">
														Recommended
													</span>
												) : null}
											</div>

											{hasModel || skillsCount > 0 ? (
												<div className="flex items-center gap-2 mt-1">
													{hasModel && (
														<div className="flex items-center gap-1 text-[9px] font-bold text-blue-400/80 uppercase tracking-tight">
															<Cpu className="w-2.5 h-2.5" />
															<div className="truncate max-w-[180px] flex items-center gap-1">
																{role.preferred_llm_agent && (
																	<span className="text-blue-400">
																		{role.preferred_llm_agent}
																	</span>
																)}
																{role.preferred_llm_agent &&
																	role.preferred_model_name && (
																		<span className="text-slate-600 font-black">
																			@
																		</span>
																	)}
																{role.preferred_model_name && (
																	<span className="text-slate-400">
																		{role.preferred_model_name}
																		{role.preferred_model_variant
																			? ` (${role.preferred_model_variant})`
																			: ""}
																	</span>
																)}
																{!role.preferred_llm_agent &&
																	!role.preferred_model_name && (
																		<span className="text-slate-500 italic">
																			Default
																		</span>
																	)}
															</div>
														</div>
													)}
													{skillsCount > 0 && (
														<div
															className={cn(
																"flex items-center gap-1 text-[9px] font-bold text-purple-400/80 uppercase tracking-tight",
																hasModel && "border-l border-slate-800 pl-2",
															)}
														>
															<Brain className="w-2.5 h-2.5" />
															<span>{skillsCount} Skills</span>
														</div>
													)}
												</div>
											) : (
												<p className="text-[9px] font-medium text-slate-600 italic mt-0.5">
													No specific model or skills assigned
												</p>
											)}
										</div>
									</div>
									<ChevronRight
										className={cn(
											"w-4 h-4 transition-colors shrink-0 ml-2",
											selectedRoleId === role.id
												? "text-blue-400"
												: "text-slate-600",
										)}
									/>
								</button>
							);
						})
					)}
				</div>

				<div className="lg:col-span-8">
					<div className="rounded-[2.5rem] bg-[#0B0E14] border border-slate-800/60 shadow-2xl overflow-hidden flex flex-col min-h-[600px]">
						<div className="px-10 py-8 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/20">
							<div className="flex items-center gap-6">
								<div className="w-16 h-16 rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center">
									<Brain className="w-8 h-8 text-blue-400" />
								</div>
								<div>
									<h2 className="text-2xl font-black text-white tracking-tight">
										{isNew ? "Create Agent" : `Agent: ${formId}`}
									</h2>
								</div>
							</div>
							<div className="flex items-center gap-3">
								{!isNew ? (
									<button
										type="button"
										onClick={() => handleDelete(formId)}
										className="p-3 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
									>
										<Trash2 className="w-5 h-5" />
									</button>
								) : null}
								{isSaving ? (
									<div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 text-slate-400 rounded-xl font-bold text-xs uppercase tracking-widest">
										<Loader2 className="w-4 h-4 animate-spin" />
										<span>Saving...</span>
									</div>
								) : isDataSaved ? (
									<div className="flex items-center gap-2 px-4 py-2 text-emerald-500/80 font-bold text-xs uppercase tracking-widest bg-emerald-500/5 rounded-xl border border-emerald-500/10">
										<CheckCircle2 className="w-4 h-4" />
										<span>Saved</span>
									</div>
								) : null}
							</div>
						</div>

						<div className="p-10 space-y-8 overflow-y-auto custom-scrollbar">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div className="space-y-2">
									<label
										htmlFor="team-role-id"
										className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
									>
										Role ID
									</label>
									<input
										id="team-role-id"
										value={formId}
										onChange={(event) => setFormId(event.target.value)}
										disabled={!isNew}
										placeholder="e.g. executor"
										className="w-full bg-slate-900/60 border border-slate-800/80 text-base text-slate-100 rounded-2xl px-5 py-4 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
									/>
								</div>
								<div className="space-y-2">
									<label
										htmlFor="team-role-name"
										className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
									>
										Display Name
									</label>
									<input
										id="team-role-name"
										value={formName}
										onChange={(event) => setFormName(event.target.value)}
										placeholder="e.g. Executor"
										className="w-full bg-slate-900/60 border border-slate-800/80 text-base text-slate-100 rounded-2xl px-5 py-4 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
									/>
								</div>
							</div>

							<div className="space-y-2">
								<label
									htmlFor="team-role-description"
									className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
								>
									Mission Description
								</label>
								<input
									id="team-role-description"
									value={formDescription}
									onChange={(event) => setFormDescription(event.target.value)}
									placeholder="What this agent does"
									className="w-full bg-slate-900/60 border border-slate-800/80 text-base text-slate-100 rounded-2xl px-5 py-4 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
								/>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								<div className="space-y-2">
									<label
										htmlFor="team-role-preferred-model"
										className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
									>
										Preferred Model (Enabled)
									</label>
									<select
										id="team-role-preferred-model"
										value={preferredModelName}
										onChange={(event) => {
											setPreferredModelName(event.target.value);
											setPreferredModelVariant("");
										}}
										className="w-full bg-slate-900/60 border border-slate-800/80 text-sm text-slate-100 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer hover:border-slate-700 transition-colors"
									>
										<option value="">(default)</option>
										{enabledModels.map((model) => (
											<option key={model.name} value={model.name}>
												{model.name}
											</option>
										))}
									</select>
								</div>

								<div className="space-y-2">
									<label
										htmlFor="team-role-preferred-variant"
										className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
									>
										Preferred Variant
									</label>
									<select
										id="team-role-preferred-variant"
										value={preferredModelVariant}
										onChange={(event) =>
											setPreferredModelVariant(event.target.value)
										}
										disabled={!preferredModelName || modelVariants.length === 0}
										className="w-full bg-slate-900/60 border border-slate-800/80 text-sm text-slate-100 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:border-slate-700 transition-colors"
									>
										<option value="">(default)</option>
										{modelVariants.map((variant) => (
											<option key={variant} value={variant}>
												{variant}
											</option>
										))}
									</select>
								</div>

								<div className="space-y-2">
									<label
										htmlFor="team-role-preferred-agent"
										className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
									>
										Preferred LLM Agent
									</label>
									<select
										id="team-role-preferred-agent"
										value={preferredLlmAgent}
										onChange={(event) =>
											setPreferredLlmAgent(event.target.value)
										}
										className="w-full bg-slate-900/60 border border-slate-800/80 text-sm text-slate-100 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer hover:border-slate-700 transition-colors"
									>
										<option value="">(default)</option>
										{agentsCatalog.map((agent) => (
											<option key={agent.id} value={agent.id}>
												{agent.name}
											</option>
										))}
									</select>
								</div>
							</div>

							<div className="space-y-2">
								<label
									htmlFor="team-role-system-prompt"
									className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
								>
									Agent Prompt (used in task execution)
								</label>
								<textarea
									id="team-role-system-prompt"
									value={formPreset.systemPrompt}
									onChange={(event) =>
										setFormPreset((prev) => ({
											...prev,
											systemPrompt: event.target.value,
										}))
									}
									rows={6}
									placeholder="How this agent should execute assigned tasks"
									className="w-full bg-slate-900/60 border border-slate-800/80 text-sm text-slate-200 rounded-3xl px-6 py-5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
								/>
							</div>

							<div className="space-y-6">
								<div className="space-y-2">
									<p className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
										Active Agent Skills
									</p>
									<div className="flex flex-wrap gap-2 min-h-10 p-3 bg-slate-900/20 border border-dashed border-slate-800/60 rounded-2xl">
										{formPreset.skills.length > 0 ? (
											formPreset.skills.map((skill) => (
												<span
													key={`selected-${skill}`}
													className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 ring-1 ring-purple-500/30 text-[11px] font-bold text-purple-200 group transition-all hover:bg-purple-500/20"
												>
													{skill}
													<button
														type="button"
														onClick={() => removeSkill(skill)}
														className="text-purple-400/60 hover:text-red-400 transition-colors"
													>
														<X className="w-3.5 h-3.5" />
													</button>
												</span>
											))
										) : (
											<div className="flex items-center gap-2 text-slate-600 italic py-1">
												<Brain className="w-3.5 h-3.5" />
												<p className="text-xs">
													No skills assigned to this agent.
												</p>
											</div>
										)}
									</div>
								</div>

								<div className="space-y-2 pt-4 border-t border-slate-800/40">
									<label
										htmlFor="team-role-skill-input"
										className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
									>
										Add New Skills (OpenCode SDK)
									</label>
									<div className="flex gap-2">
										<div className="relative flex-1">
											<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
											<input
												id="team-role-skill-input"
												value={skillQuery}
												onChange={(event) => setSkillQuery(event.target.value)}
												onKeyDown={handleSkillInputKeyDown}
												placeholder="Search or type new skill..."
												className="w-full bg-slate-900/60 border border-slate-800/80 text-sm text-slate-200 rounded-2xl pl-11 pr-4 py-3 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
											/>
										</div>
										<button
											type="button"
											onClick={() => addSkill(skillQuery)}
											disabled={!skillQuery.trim()}
											className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-purple-600/10"
										>
											Add
										</button>
									</div>

									{filteredSkills.length > 0 && (
										<div className="mt-3 p-4 bg-slate-900/40 border border-slate-800/60 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
											<p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
												Suggestions
											</p>
											<div className="flex flex-wrap gap-2">
												{filteredSkills.map((skill) => (
													<button
														type="button"
														key={`catalog-${skill}`}
														onClick={() => addSkill(skill)}
														className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-purple-500/20 hover:ring-purple-500/40 ring-1 ring-slate-700 text-[11px] font-bold text-slate-300 transition-all flex items-center gap-1.5"
													>
														<Plus className="w-3 h-3 text-purple-400" />
														{skill}
													</button>
												))}
											</div>
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<ConfirmationModal
				isOpen={showDeleteConfirm}
				onClose={() => {
					setShowDeleteConfirm(false);
					setDeletingId(null);
				}}
				onConfirm={confirmDelete}
				title="Delete Agent Role"
				description={`Are you sure you want to delete the role "${deletingId}"? This action cannot be undone.`}
				confirmLabel="Delete Role"
			/>
		</div>
	);
}
