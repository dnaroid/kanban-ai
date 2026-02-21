"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type KeyboardEvent,
} from "react";
import {
	Brain,
	ChevronRight,
	Loader2,
	Plus,
	Save,
	Search,
	Terminal,
	Trash2,
	Users,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useSettingsStatus } from "@/components/settings/SettingsStatusContext";

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
		const behaviorSource =
			parsed.behavior && typeof parsed.behavior === "object"
				? (parsed.behavior as Record<string, unknown>)
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
	const [isLoading, setIsLoading] = useState(true);
	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [skillQuery, setSkillQuery] = useState("");
	const { setStatus } = useSettingsStatus();

	const [formId, setFormId] = useState("");
	const [formName, setFormName] = useState("");
	const [formDescription, setFormDescription] = useState("");
	const [formPreset, setFormPreset] = useState<AgentRolePreset>(DEFAULT_PRESET);
	const [isNew, setIsNew] = useState(false);

	const selectRole = useCallback((role: FullRole) => {
		setSelectedRoleId(role.id);
		setFormId(role.id);
		setFormName(role.name);
		setFormDescription(role.description);
		setFormPreset(parseRolePreset(role.preset_json));
		setSkillQuery("");
		setIsNew(false);
	}, []);

	const loadRoles = useCallback(async () => {
		setIsLoading(true);
		try {
			const response = await api.roles.listFull();
			setRoles(response.roles);
			if (response.roles.length > 0 && !selectedRoleId) {
				selectRole(response.roles[0]);
			}
		} catch (error) {
			console.error("Failed to load roles:", error);
			setStatus({ message: "Failed to load roles", type: "error" });
		} finally {
			setIsLoading(false);
		}
	}, [selectedRoleId, selectRole, setStatus]);

	const loadSkillsCatalog = useCallback(async () => {
		try {
			const response = await api.opencode.listSkills();
			setSkillsCatalog(response.skills);
		} catch (error) {
			console.error("Failed to load OpenCode skills:", error);
			setSkillsCatalog([]);
		}
	}, []);

	useEffect(() => {
		void loadRoles();
		void loadSkillsCatalog();
	}, [loadRoles, loadSkillsCatalog]);

	const handleAddNew = () => {
		setSelectedRoleId(null);
		setFormId("");
		setFormName("");
		setFormDescription("");
		setFormPreset(DEFAULT_PRESET);
		setSkillQuery("");
		setIsNew(true);
	};

	const handleSave = async () => {
		if (!formId.trim() || !formName.trim()) {
			setStatus({ message: "ID and Name are required", type: "error" });
			return;
		}

		setIsSaving(true);
		try {
			const behavior = {
				...DEFAULT_BEHAVIOR,
				...(formPreset.behavior ?? {}),
			};
			const preset_json = JSON.stringify({
				...formPreset,
				skills: normalizeSkills(formPreset.skills),
				systemPrompt: formPreset.systemPrompt.trim(),
				behavior,
			});
			await api.roles.save({
				id: formId.trim(),
				name: formName.trim(),
				description: formDescription.trim(),
				preset_json,
			});

			setStatus({
				message: `Role ${formName.trim()} saved successfully`,
				type: "success",
			});
			await loadRoles();
			setSelectedRoleId(formId.trim());
			setIsNew(false);
		} catch (error) {
			console.error("Failed to save role:", error);
			setStatus({ message: "Failed to save role", type: "error" });
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm(`Are you sure you want to delete the role "${id}"?`)) {
			return;
		}

		try {
			await api.roles.delete({ id });
			setStatus({ message: "Role deleted", type: "success" });
			await loadRoles();
			if (selectedRoleId === id) {
				handleAddNew();
			}
		} catch (error) {
			console.error("Failed to delete role:", error);
			setStatus({ message: "Failed to delete role", type: "error" });
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
		if (!q) {
			return skillsCatalog.slice(0, 12);
		}
		return skillsCatalog
			.filter((skill) => skill.toLowerCase().includes(q))
			.slice(0, 12);
	}, [skillQuery, skillsCatalog]);

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
							className="w-full bg-slate-900/40 border border-slate-800/60 text-sm text-slate-200 rounded-xl pl-10 pr-10 py-2.5 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all placeholder:text-slate-600 font-medium shadow-sm"
						/>
					</div>
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
						sortedFilteredRoles.map((role) => (
							<button
								type="button"
								key={role.id}
								onClick={() => selectRole(role)}
								className={cn(
									"w-full text-left p-4 rounded-2xl border transition-all duration-300 group flex items-center justify-between",
									selectedRoleId === role.id
										? "bg-blue-500/10 border-blue-500/40"
										: "bg-slate-900/20 border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/40",
								)}
							>
								<div className="flex items-center gap-4">
									<div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-800 text-slate-400">
										<Terminal className="w-5 h-5" />
									</div>
									<div>
										<div className="flex items-center gap-2">
											<h3 className="font-black text-sm tracking-tight text-slate-200">
												{role.name}
											</h3>
											{(roleBehaviorById.get(role.id) ?? DEFAULT_BEHAVIOR)
												.recommended ? (
												<span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-[8px] font-black uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
													Recommended
												</span>
											) : null}
										</div>
										<p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
											{role.id}
										</p>
									</div>
								</div>
								<ChevronRight className="w-4 h-4 text-slate-600" />
							</button>
						))
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
								<button
									type="button"
									onClick={handleSave}
									disabled={isSaving}
									className="flex items-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
								>
									{isSaving ? (
										<Loader2 className="w-5 h-5 animate-spin" />
									) : (
										<Save className="w-5 h-5" />
									)}
									<span>Save</span>
								</button>
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
										className="w-full bg-slate-900/60 border border-slate-800/80 text-base text-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
										className="w-full bg-slate-900/60 border border-slate-800/80 text-base text-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
									className="w-full bg-slate-900/60 border border-slate-800/80 text-base text-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
								/>
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

							<div className="space-y-3">
								<label
									htmlFor="team-role-skill-input"
									className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
								>
									Skills (OpenCode SDK)
								</label>
								<div className="flex gap-2">
									<input
										id="team-role-skill-input"
										value={skillQuery}
										onChange={(event) => setSkillQuery(event.target.value)}
										onKeyDown={handleSkillInputKeyDown}
										placeholder="Type skill and press Enter"
										className="w-full bg-slate-900/60 border border-slate-800/80 text-sm text-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
									/>
									<button
										type="button"
										onClick={() => addSkill(skillQuery)}
										className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold uppercase tracking-wider"
									>
										Add
									</button>
								</div>

								{filteredSkills.length > 0 ? (
									<div className="flex flex-wrap gap-2">
										{filteredSkills.map((skill) => (
											<button
												type="button"
												key={`catalog-${skill}`}
												onClick={() => addSkill(skill)}
												className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-purple-500/20 ring-1 ring-slate-700 text-[10px] font-semibold text-slate-300"
											>
												{skill}
											</button>
										))}
									</div>
								) : null}

								<div className="flex flex-wrap gap-2 min-h-8">
									{formPreset.skills.length > 0 ? (
										formPreset.skills.map((skill) => (
											<span
												key={`selected-${skill}`}
												className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/15 ring-1 ring-purple-500/30 text-xs text-purple-200"
											>
												{skill}
												<button
													type="button"
													onClick={() => removeSkill(skill)}
													className="text-purple-300 hover:text-red-300"
												>
													<X className="w-3 h-3" />
												</button>
											</span>
										))
									) : (
										<p className="text-xs text-slate-500">
											No skills selected.
										</p>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
