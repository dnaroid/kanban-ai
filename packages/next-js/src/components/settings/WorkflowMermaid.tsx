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

export function WorkflowMermaid({ config }: WorkflowMermaidProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	const diagramCode = useMemo(() => {
		let code = "graph LR";

		// Add subgraphs for columns
		config.columns
			.sort((a, b) => a.orderIndex - b.orderIndex)
			.forEach((col) => {
				const statusesInCol = config.statuses.filter(
					(s) => s.preferredColumnSystemKey === col.systemKey,
				);

				code += `  subgraph ${col.systemKey} ["${col.name}"]
`;
				statusesInCol.forEach((s) => {
					const isDefault = col.defaultStatus === s.status;
					const label = isDefault ? `${s.status} (Default)` : s.status;
					code += `    ${s.status}["${label}"]
`;
				});
				code += "  end";
			});

		// Add status transitions
		Object.entries(config.statusTransitions).forEach(([from, targets]) => {
			targets.forEach((to) => {
				// Only draw if both statuses exist
				if (
					config.statuses.find((s) => s.status === from) &&
					config.statuses.find((s) => s.status === to)
				) {
					code += `  ${from} --> ${to}`;
				}
			});
		});

		// Add column-specific styles
		config.columns.forEach((col) => {
			code += `  style ${col.systemKey} fill:rgba(0,0,0,0),stroke:${col.color},stroke-width:2px,stroke-dasharray: 5 5
`;
		});

		return code;
	}, [config]);

	useEffect(() => {
		const renderDiagram = async () => {
			if (containerRef.current && diagramCode) {
				try {
					containerRef.current.innerHTML = "";
					const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
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
