"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Plus,
	Trash2,
	Users,
	Save,
	X,
	Search,
	Loader2,
	ChevronRight,
	Terminal,
	Brain,
	Shield,
	Code2,
	Wrench,
	AlertCircle,
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
}

interface FullRole {
	id: string;
	name: string;
	description: string;
	preset_json: string;
}

const DEFAULT_PRESET: AgentRolePreset = {
	version: "1.0",
	provider: "openai",
	modelName: "gpt-5.3-codex",
	skills: [],
	systemPrompt: "You are a specialized AI agent.",
	mustDo: [],
	outputContract: [],
};

export function TeamManagement() {
	const [roles, setRoles] = useState<FullRole[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const { setStatus } = useSettingsStatus();

	// Form State
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
		try {
			const parsed = JSON.parse(role.preset_json);
			setFormPreset({ ...DEFAULT_PRESET, ...parsed });
		} catch {
			console.error("Failed to parse preset for role:", role.id);
			setFormPreset(DEFAULT_PRESET);
		}
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

	useEffect(() => {
		void loadRoles();
	}, [loadRoles]);

	const handleAddNew = () => {
		setSelectedRoleId(null);
		setFormId("");
		setFormName("");
		setFormDescription("");
		setFormPreset(DEFAULT_PRESET);
		setIsNew(true);
	};

	const handleSave = async () => {
		if (!formId || !formName) {
			setStatus({ message: "ID and Name are required", type: "error" });
			return;
		}

		setIsSaving(true);
		try {
			const preset_json = JSON.stringify(formPreset);
			await api.roles.save({
				id: formId,
				name: formName,
				description: formDescription,
				preset_json,
			});

			setStatus({
				message: `Role ${formName} saved successfully`,
				type: "success",
			});
			await loadRoles();
			setSelectedRoleId(formId);
			setIsNew(false);
		} catch (error) {
			console.error("Failed to save role:", error);
			setStatus({ message: "Failed to save role", type: "error" });
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm(`Are you sure you want to delete the role "${id}"?`)) return;

		try {
			await api.roles.delete({ id });
			setStatus({ message: "Role deleted", type: "success" });
			await loadRoles();
			if (selectedRoleId === id) {
				setSelectedRoleId(null);
				handleAddNew();
			}
		} catch (error) {
			console.error("Failed to delete role:", error);
			setStatus({ message: "Failed to delete role", type: "error" });
		}
	};

	const filteredRoles = useMemo(() => {
		return roles.filter(
			(r) =>
				r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				r.id.toLowerCase().includes(searchQuery.toLowerCase()),
		);
	}, [roles, searchQuery]);

	const updatePreset = (updates: Partial<AgentRolePreset>) => {
		setFormPreset((prev) => ({ ...prev, ...updates }));
	};

	const handleListUpdate = (
		field: "skills" | "mustDo" | "outputContract",
		index: number,
		value: string,
	) => {
		const newList = [...formPreset[field]];
		newList[index] = value;
		updatePreset({ [field]: newList });
	};

	const handleAddItem = (field: "skills" | "mustDo" | "outputContract") => {
		updatePreset({ [field]: [...formPreset[field], ""] });
	};

	const handleRemoveItem = (
		field: "skills" | "mustDo" | "outputContract",
		index: number,
	) => {
		const newList = [...formPreset[field]];
		newList.splice(index, 1);
		updatePreset({ [field]: newList });
	};

	return (
		<div className="flex flex-col w-full min-h-screen">
			<div className="flex-none bg-[#0B0E14] border-b border-slate-800/60 pb-8 mb-8 shrink-0 flex flex-col md:flex-row md:items-end justify-between gap-6">
				<div className="flex items-center gap-5">
					<div className="w-14 h-14 rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center shadow-2xl shadow-blue-500/10">
						<Users className="w-7 h-7 text-blue-400" />
					</div>
					<div>
						<div className="flex items-center gap-2 mb-1">
							<span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] leading-none">
								Agent Command
							</span>
							<div className="px-2 py-0.5 rounded-full bg-blue-500/20 text-[9px] font-bold text-blue-300 ring-1 ring-blue-500/30">
								Role Registry
							</div>
						</div>
						<p className="text-3xl font-black text-white tracking-tight leading-none">
							{roles.length}{" "}
							<span className="text-slate-600 font-medium">Active Agents</span>
						</p>
					</div>
				</div>

				<div className="flex items-center gap-4">
					<div className="relative group min-w-[250px]">
						<div className="absolute left-4 top-1/2 -translate-y-1/2">
							<Search className="w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
						</div>
						<input
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search roles..."
							className="w-full bg-slate-900/40 border border-slate-800/60 text-sm text-slate-200 rounded-2xl pl-11 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all placeholder:text-slate-600 font-medium shadow-inner shadow-black/20"
						/>
					</div>
					<button
						type="button"
						onClick={handleAddNew}
						className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-95"
					>
						<Plus className="w-4 h-4" />
						Hire Agent
					</button>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
				{/* Sidebar List */}
				<div className="lg:col-span-4 space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
					{isLoading ? (
						<div className="py-20 flex flex-col items-center justify-center gap-4">
							<Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
							<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
								Loading Roster...
							</span>
						</div>
					) : (
						filteredRoles.map((role) => (
							<button
								type="button"
								key={role.id}
								onClick={() => selectRole(role)}
								className={cn(
									"w-full text-left p-4 rounded-2xl border transition-all duration-300 group flex items-center justify-between",
									selectedRoleId === role.id
										? "bg-blue-500/10 border-blue-500/40 shadow-[0_10px_30px_rgba(59,130,246,0.1)]"
										: "bg-slate-900/20 border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/40",
								)}
							>
								<div className="flex items-center gap-4">
									<div
										className={cn(
											"w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
											selectedRoleId === role.id
												? "bg-blue-500 text-white"
												: "bg-slate-800 text-slate-400 group-hover:bg-slate-700",
										)}
									>
										<Terminal className="w-5 h-5" />
									</div>
									<div>
										<h3
											className={cn(
												"font-black text-sm tracking-tight",
												selectedRoleId === role.id
													? "text-white"
													: "text-slate-300",
											)}
										>
											{role.name}
										</h3>
										<p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
											{role.id}
										</p>
									</div>
								</div>
								<ChevronRight
									className={cn(
										"w-4 h-4 transition-all",
										selectedRoleId === role.id
											? "text-blue-400 translate-x-1"
											: "text-slate-600 opacity-0 group-hover:opacity-100",
									)}
								/>
							</button>
						))
					)}
				</div>

				{/* Editor Area */}
				<div className="lg:col-span-8">
					<div className="rounded-[2.5rem] bg-[#0B0E14] border border-slate-800/60 shadow-2xl overflow-hidden flex flex-col min-h-[600px]">
						{/* Editor Header */}
						<div className="px-10 py-8 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/20 backdrop-blur-sm">
							<div className="flex items-center gap-6">
								<div className="w-16 h-16 rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center">
									<Brain className="w-8 h-8 text-blue-400" />
								</div>
								<div>
									<h2 className="text-2xl font-black text-white tracking-tight">
										{isNew ? "Create New Agent" : `Agent Profile: ${formId}`}
									</h2>
									<p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
										Configure Capabilities & Directives
									</p>
								</div>
							</div>
							<div className="flex items-center gap-3">
								{!isNew && (
									<button
										type="button"
										onClick={() => handleDelete(formId)}
										className="p-3 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
										title="Terminate Contract"
									>
										<Trash2 className="w-5 h-5" />
									</button>
								)}
								<button
									type="button"
									onClick={handleSave}
									disabled={isSaving}
									className="flex items-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-blue-600/20 active:scale-95 overflow-hidden group/save relative"
								>
									{isSaving ? (
										<Loader2 className="w-5 h-5 animate-spin" />
									) : (
										<Save className="w-5 h-5 group-hover/save:scale-110 transition-transform" />
									)}
									<span>Commit Changes</span>
								</button>
							</div>
						</div>

						{/* Editor Body */}
						<div className="p-10 space-y-10 overflow-y-auto custom-scrollbar">
							{/* Core Identity */}
							<section className="space-y-6">
								<div className="flex items-center gap-3 mb-2">
									<Terminal className="w-4 h-4 text-blue-400" />
									<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
										Core Identity
									</h3>
								</div>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="space-y-2">
										<label
											htmlFor="team-role-id"
											className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
										>
											Role ID (Immutable Handle)
										</label>
										<input
											id="team-role-id"
											value={formId}
											onChange={(e) => setFormId(e.target.value)}
											disabled={!isNew}
											placeholder="e.g. dev-ops"
											className="w-full bg-slate-900/60 border border-slate-800/80 text-base text-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-bold tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
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
											onChange={(e) => setFormName(e.target.value)}
											placeholder="e.g. Site Reliability Engineer"
											className="w-full bg-slate-900/60 border border-slate-800/80 text-base text-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-bold tracking-tight"
										/>
									</div>
								</div>
								<div className="space-y-2">
									<label
										htmlFor="team-role-description"
										className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
									>
										Short Mission Description
									</label>
									<input
										id="team-role-description"
										value={formDescription}
										onChange={(e) => setFormDescription(e.target.value)}
										placeholder="High-level description of what this agent does..."
										className="w-full bg-slate-900/60 border border-slate-800/80 text-base text-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-medium tracking-tight"
									/>
								</div>
							</section>

							{/* System Configuration */}
							<section className="space-y-6">
								<div className="flex items-center gap-3 mb-2">
									<Shield className="w-4 h-4 text-emerald-400" />
									<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
										System Directives
									</h3>
								</div>
								<div className="space-y-2">
									<label
										htmlFor="team-role-system-prompt"
										className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
									>
										System Prompt (Personality & Logic)
									</label>
									<textarea
										id="team-role-system-prompt"
										value={formPreset.systemPrompt}
										onChange={(e) =>
											updatePreset({ systemPrompt: e.target.value })
										}
										rows={6}
										placeholder="Define the core logic, personality, and constraints..."
										className="w-full bg-slate-900/60 border border-slate-800/80 text-sm text-slate-200 rounded-3xl px-6 py-5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all font-medium leading-relaxed resize-none custom-scrollbar shadow-inner"
									/>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="space-y-2">
										<label
											htmlFor="team-role-provider"
											className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
										>
											LLM Provider
										</label>
										<select
											id="team-role-provider"
											value={formPreset.provider}
											onChange={(e) =>
												updatePreset({ provider: e.target.value })
											}
											className="w-full bg-slate-900/60 border border-slate-800/80 text-sm text-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-bold appearance-none cursor-pointer"
										>
											<option value="openai">OpenAI</option>
											<option value="anthropic">Anthropic</option>
											<option value="google">Google</option>
											<option value="ollama">Ollama (Local)</option>
										</select>
									</div>
									<div className="space-y-2">
										<label
											htmlFor="team-role-model"
											className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1"
										>
											Preferred Model Handle
										</label>
										<input
											id="team-role-model"
											value={formPreset.modelName}
											onChange={(e) =>
												updatePreset({ modelName: e.target.value })
											}
											placeholder="e.g. gpt-4o"
											className="w-full bg-slate-900/60 border border-slate-800/80 text-sm text-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-mono"
										/>
									</div>
								</div>
							</section>

							{/* Dynamic Arrays */}
							<div className="grid grid-cols-1 md:grid-cols-2 gap-10">
								{/* Skills */}
								<section className="space-y-4">
									<div className="flex items-center justify-between mb-2">
										<div className="flex items-center gap-3">
											<Wrench className="w-4 h-4 text-purple-400" />
											<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
												Skill Matrix
											</h3>
										</div>
										<button
											type="button"
											onClick={() => handleAddItem("skills")}
											className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-purple-400 transition-all"
										>
											<Plus className="w-4 h-4" />
										</button>
									</div>
									<div className="space-y-3">
										{(formPreset.skills || []).map((skill, i) => (
											<div
												key={`skill-${skill}`}
												className="group flex items-center gap-2"
											>
												<div className="flex-1 relative">
													<input
														value={skill}
														onChange={(e) =>
															handleListUpdate("skills", i, e.target.value)
														}
														placeholder="e.g. react-expert"
														className="w-full bg-slate-900/40 border border-slate-800/60 text-xs text-slate-300 rounded-xl pl-4 pr-4 py-2.5 focus:outline-none focus:border-purple-500/40 transition-all font-medium"
													/>
												</div>
												<button
													type="button"
													onClick={() => handleRemoveItem("skills", i)}
													className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 transition-all"
												>
													<X className="w-3.5 h-3.5" />
												</button>
											</div>
										))}
										{(formPreset.skills || []).length === 0 && (
											<div className="py-4 text-center border border-dashed border-slate-800/60 rounded-xl">
												<p className="text-[10px] font-bold text-slate-600 uppercase">
													No Skills Assigned
												</p>
											</div>
										)}
									</div>
								</section>

								{/* Output Contract */}
								<section className="space-y-4">
									<div className="flex items-center justify-between mb-2">
										<div className="flex items-center gap-3">
											<Code2 className="w-4 h-4 text-orange-400" />
											<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
												Output Contract
											</h3>
										</div>
										<button
											type="button"
											onClick={() => handleAddItem("outputContract")}
											className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-orange-400 transition-all"
										>
											<Plus className="w-4 h-4" />
										</button>
									</div>
									<div className="space-y-3">
										{(formPreset.outputContract || []).map((item, i) => (
											<div
												key={`contract-${item}`}
												className="group flex items-center gap-2"
											>
												<div className="flex-1">
													<input
														value={item}
														onChange={(e) =>
															handleListUpdate(
																"outputContract",
																i,
																e.target.value,
															)
														}
														placeholder="e.g. User Story"
														className="w-full bg-slate-900/40 border border-slate-800/60 text-xs text-slate-300 rounded-xl pl-4 pr-4 py-2.5 focus:outline-none focus:border-orange-500/40 transition-all font-medium"
													/>
												</div>
												<button
													type="button"
													onClick={() => handleRemoveItem("outputContract", i)}
													className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 transition-all"
												>
													<X className="w-3.5 h-3.5" />
												</button>
											</div>
										))}
										{(formPreset.outputContract || []).length === 0 && (
											<div className="py-4 text-center border border-dashed border-slate-800/60 rounded-xl">
												<p className="text-[10px] font-bold text-slate-600 uppercase">
													No Output Defined
												</p>
											</div>
										)}
									</div>
								</section>
							</div>

							{/* Must Do */}
							<section className="space-y-4">
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center gap-3">
										<AlertCircle className="w-4 h-4 text-amber-400" />
										<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
											Mandatory Workflow Steps (Must-Do)
										</h3>
									</div>
									<button
										type="button"
										onClick={() => handleAddItem("mustDo")}
										className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-amber-400 transition-all"
									>
										<Plus className="w-4 h-4" />
									</button>
								</div>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									{(formPreset.mustDo || []).map((item, i) => (
										<div
											key={`mustdo-${item}`}
											className="group flex items-center gap-2"
										>
											<div className="flex-1">
												<input
													value={item}
													onChange={(e) =>
														handleListUpdate("mustDo", i, e.target.value)
													}
													placeholder="e.g. Break work into atomic implementation steps"
													className="w-full bg-slate-900/40 border border-slate-800/60 text-xs text-slate-300 rounded-xl pl-4 pr-4 py-2.5 focus:outline-none focus:border-amber-500/40 transition-all font-medium"
												/>
											</div>
											<button
												type="button"
												onClick={() => handleRemoveItem("mustDo", i)}
												className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 transition-all"
											>
												<X className="w-3.5 h-3.5" />
											</button>
										</div>
									))}
								</div>
								{(formPreset.mustDo || []).length === 0 && (
									<div className="py-10 text-center border border-dashed border-slate-800/60 rounded-3xl">
										<p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
											No Mandatory Directives Defined
										</p>
									</div>
								)}
							</section>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
