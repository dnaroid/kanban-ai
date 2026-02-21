"use client";

import { useEffect, useRef, useMemo } from "react";
import mermaid from "mermaid";
import { WorkflowConfig } from "@/lib/api-client";

// Initialize mermaid with dark theme
mermaid.initialize({
	startOnLoad: false,
	theme: "dark",
	securityLevel: "loose",
	flowchart: {
		useMaxWidth: true,
		htmlLabels: true,
		curve: "basis",
	},
	themeVariables: {
		primaryColor: "#3b82f6",
		primaryTextColor: "#f1f5f9",
		primaryBorderColor: "#1e293b",
		lineColor: "#64748b",
		secondaryColor: "#0f172a",
		tertiaryColor: "#0f172a",
		mainBkg: "#0f172a",
		nodeBkg: "#1e293b",
		nodeBorder: "#334155",
		clusterBkg: "rgba(15, 23, 42, 0.4)",
		clusterBorder: "#334155",
		labelStyle: "font-family: inherit; font-size: 12px; font-weight: bold;",
	},
});

interface WorkflowMermaidProps {
	config: WorkflowConfig;
}

function escapeMermaidLabel(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toMermaidBaseId(value: string, prefix: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "_")
		.replace(/^_+|_+$/g, "");

	const safeValue = normalized.length > 0 ? normalized : "item";
	return `${prefix}_${safeValue}`;
}

function createMermaidIdMap(
	values: string[],
	prefix: string,
): Map<string, string> {
	const used = new Set<string>();
	const map = new Map<string, string>();

	values.forEach((value) => {
		const baseId = toMermaidBaseId(value, prefix);
		let candidate = baseId;
		let suffix = 2;

		while (used.has(candidate)) {
			candidate = `${baseId}_${suffix}`;
			suffix += 1;
		}

		used.add(candidate);
		map.set(value, candidate);
	});

	return map;
}

export function WorkflowMermaid({ config }: WorkflowMermaidProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	const diagramCode = useMemo(() => {
		const lines: string[] = ["graph LR"];
		const sortedColumns = [...config.columns].sort(
			(a, b) => a.orderIndex - b.orderIndex,
		);
		const statusIdMap = createMermaidIdMap(
			config.statuses.map((s) => s.status),
			"status",
		);
		const statusColorMap = new Map(
			config.statuses.map((s) => [s.status, s.color] as const),
		);
		const columnIdMap = createMermaidIdMap(
			sortedColumns.map((col) => col.systemKey),
			"column",
		);

		// Add subgraphs for columns
		sortedColumns.forEach((col) => {
			const statusesInCol = config.statuses.filter(
				(s) => s.preferredColumnSystemKey === col.systemKey,
			);
			const subgraphId = columnIdMap.get(col.systemKey);

			if (!subgraphId) {
				return;
			}

			lines.push(`  subgraph ${subgraphId}["${escapeMermaidLabel(col.name)}"]`);
			statusesInCol.forEach((s) => {
				const isDefault = col.defaultStatus === s.status;
				const label = isDefault ? `${s.status} (Default)` : s.status;
				const statusId = statusIdMap.get(s.status);

				if (!statusId) {
					return;
				}

				lines.push(`    ${statusId}["${escapeMermaidLabel(label)}"]`);
			});
			lines.push("  end");
		});

		// Add status transitions
		Object.entries(config.statusTransitions).forEach(([from, targets]) => {
			const fromId = statusIdMap.get(from);
			if (!fromId) {
				return;
			}

			targets.forEach((to) => {
				const toId = statusIdMap.get(to);

				if (toId) {
					lines.push(`  ${fromId} --> ${toId}`);
				}
			});
		});

		// Add column-specific styles
		sortedColumns.forEach((col) => {
			const subgraphId = columnIdMap.get(col.systemKey);
			if (!subgraphId) {
				return;
			}

			lines.push(
				`  style ${subgraphId} fill:transparent,stroke:${col.color},stroke-width:2px,stroke-dasharray:5 5`,
			);
		});

		config.statuses.forEach((status) => {
			const statusId = statusIdMap.get(status.status);
			const color = statusColorMap.get(status.status);

			if (!statusId || !color) {
				return;
			}

			lines.push(
				`  style ${statusId} fill:${color},stroke:${color},stroke-width:2px,color:#ffffff`,
			);
		});

		return lines.join("\n");
	}, [config]);

	useEffect(() => {
		const renderDiagram = async () => {
			if (containerRef.current && diagramCode) {
				try {
					containerRef.current.innerHTML = "";
					const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
					const { svg } = await mermaid.render(id, diagramCode);
					if (containerRef.current) {
						containerRef.current.innerHTML = svg;
					}
				} catch (error) {
					console.error("Mermaid rendering failed:", error);
				}
			}
		};

		void renderDiagram();
	}, [diagramCode]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between px-2">
				<h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
					Workflow Diagram (Mermaid)
				</h3>
				<span className="text-[10px] font-bold text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded border border-slate-700/50">
					Auto-generated
				</span>
			</div>
			<div
				className="w-full min-h-[500px] rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 p-8 overflow-auto flex items-center justify-center custom-scrollbar"
				ref={containerRef}
			/>
		</div>
	);
}
