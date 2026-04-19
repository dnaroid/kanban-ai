"use client";

import { useMemo } from "react";
import { Cpu, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
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

function resolveModelColors(config: OhMyOpenagentConfig): Map<string, string> {
	const colorMap = new Map<string, string>();

	if (config.agents) {
		for (const agent of Object.values(config.agents)) {
			if (agent.model && agent.color) {
				const base = agent.model.split("#")[0];
				if (!colorMap.has(base)) {
					colorMap.set(base, agent.color);
				}
			}
		}
	}

	return colorMap;
}

export function EngagedModelsSummary({
	config,
	models: _models,
	isLoading,
}: EngagedModelsSummaryProps) {
	const modelNames = useMemo(
		() => (config ? extractUniqueModels(config) : []),
		[config],
	);

	const modelColors = useMemo(
		() => (config ? resolveModelColors(config) : new Map<string, string>()),
		[config],
	);

	if (isLoading) {
		return (
			<div className="flex items-center gap-3 pb-4 mb-6 border-b border-slate-800/60">
				<div className="w-7 h-7 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400">
					<Cpu className="w-3.5 h-3.5 animate-pulse" />
				</div>
				<span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">
					Models
				</span>
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
			<div className="w-7 h-7 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
				<Zap className="w-3.5 h-3.5" />
			</div>
			<span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] shrink-0">
				Models
			</span>
			<div className="flex items-center gap-1.5 flex-wrap">
				{modelNames.map((name) => {
					const color = modelColors.get(name);

					return (
						<span
							key={name}
							className={cn(
								"inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ring-1 uppercase",
								color
									? "ring-current/20"
									: "bg-slate-800/40 text-slate-300 ring-slate-700/50",
							)}
							style={color ? { color } : undefined}
						>
							{name}
						</span>
					);
				})}
			</div>
		</div>
	);
}
