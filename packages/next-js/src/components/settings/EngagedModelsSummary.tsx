"use client";

import { useMemo } from "react";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIFFICULTY_STYLES } from "@/components/common/ModelPicker";
import type { OpencodeModel } from "@/types/kanban";
import type { OhMyOpenagentConfig } from "./OhMyOpenagentTypes";

type EngagedModelsSummaryProps = {
	config: OhMyOpenagentConfig | null;
	models: OpencodeModel[];
	isLoading: boolean;
};

function extractUniqueModels(config: OhMyOpenagentConfig): string[] {
	const names = new Set<string>();

	if (config.systemDefaultModel) {
		names.add(config.systemDefaultModel.split("#")[0]);
	}

	if (config.agents) {
		for (const agent of Object.values(config.agents)) {
			if (agent.model) names.add(agent.model.split("#")[0]);
		}
	}

	if (config.categories) {
		for (const category of Object.values(config.categories)) {
			if (category.model) names.add(category.model.split("#")[0]);
		}
	}

	return [...names].sort();
}

export function EngagedModelsSummary({
	config,
	models,
	isLoading,
}: EngagedModelsSummaryProps) {
	const modelNames = useMemo(
		() => (config ? extractUniqueModels(config) : []),
		[config],
	);

	const difficultyLookup = useMemo(() => {
		const map = new Map<string, string>();
		for (const m of models) {
			if (!map.has(m.name)) {
				map.set(m.name, m.difficulty);
			}
		}
		return map;
	}, [models]);

	if (isLoading) {
		return (
			<div className="flex items-center gap-3 pb-4 mb-6 border-b border-slate-800/60">
				<div className="flex gap-2">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-6 w-24 rounded-md bg-slate-800/40 animate-pulse"
						/>
					))}
				</div>
			</div>
		);
	}

	if (modelNames.length === 0) {
		return null;
	}

	return (
		<div className="flex items-center gap-3 pb-4 mb-6 border-b border-slate-800/60 flex-wrap">
			<div className="flex items-center gap-1.5 flex-wrap">
				{modelNames.map((name) => {
					const difficulty = difficultyLookup.get(
						name,
					) as keyof typeof DIFFICULTY_STYLES;
					const styles = difficulty ? DIFFICULTY_STYLES[difficulty] : null;

					return (
						<span
							key={name}
							className={cn(
								"inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ring-1 max-w-[200px] truncate",
								styles ? styles.bg : "bg-slate-800/40",
								styles ? "ring-current/20" : "ring-slate-700/50",
							)}
						>
							<Cpu
								className={cn(
									"w-3 h-3 shrink-0",
									styles?.text ?? "text-slate-400",
								)}
							/>
							<span
								className={cn(
									"text-[10px] font-bold uppercase tracking-tight truncate",
									styles?.text ?? "text-slate-300",
								)}
							>
								{name.split("/").pop()}
							</span>
						</span>
					);
				})}
			</div>
		</div>
	);
}
