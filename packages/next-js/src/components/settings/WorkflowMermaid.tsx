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
	const signalStatusRef = useRef<HTMLDivElement>(null);
	const columnStatusRef = useRef<HTMLDivElement>(null);

	const signalStatusDiagramCode = useMemo(() => {
		const lines: string[] = ["graph LR"];
		const sortedSignals = [...config.signals].sort(
			(a, b) => a.orderIndex - b.orderIndex,
		);
		const statusIdMap = createMermaidIdMap(
			config.statuses.map((s) => s.status),
			"status",
		);
		const statusColorMap = new Map(
			config.statuses.map((s) => [s.status, s.color] as const),
		);
		const signalIdMap = createMermaidIdMap(
			sortedSignals.map((signal) => signal.key),
			"signal",
		);

		lines.push(`  subgraph signals_config["Signals"]`);
		sortedSignals.forEach((signal) => {
			const signalId = signalIdMap.get(signal.key);
			if (!signalId) {
				return;
			}

			const signalState = signal.isActive ? "active" : "inactive";
			const label = `${signal.title} [${signal.key}] (${signal.scope}, ${signalState})`;
			lines.push(`    ${signalId}["${escapeMermaidLabel(label)}"]`);
		});
		lines.push("  end");

		lines.push(`  subgraph statuses_config["Statuses"]`);
		config.statuses.forEach((status) => {
			const statusId = statusIdMap.get(status.status);
			if (!statusId) {
				return;
			}
			lines.push(`    ${statusId}["${escapeMermaidLabel(status.status)}"]`);
		});
		lines.push("  end");

		config.signalRules.forEach((rule) => {
			const signalId = signalIdMap.get(rule.signalKey);
			const statusId = statusIdMap.get(rule.toStatus);
			if (!signalId || !statusId) {
				return;
			}

			const selectorParts: string[] = [];
			if (rule.fromStatus) {
				selectorParts.push(`from:${rule.fromStatus}`);
			}
			if (rule.runStatus) {
				selectorParts.push(`run:${rule.runStatus}`);
			}
			if (rule.runKind) {
				selectorParts.push(`kind:${rule.runKind}`);
			}

			const edgeLabel =
				selectorParts.length > 0 ? selectorParts.join(" | ") : "default";
			lines.push(
				`  ${signalId} -. "${escapeMermaidLabel(edgeLabel)}" .-> ${statusId}`,
			);
		});

		lines.push(
			`  style signals_config fill:transparent,stroke:#475569,stroke-width:1px,stroke-dasharray:4 4`,
		);
		lines.push(
			`  style statuses_config fill:transparent,stroke:#475569,stroke-width:1px,stroke-dasharray:4 4`,
		);

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

		sortedSignals.forEach((signal) => {
			const signalId = signalIdMap.get(signal.key);
			if (!signalId) {
				return;
			}

			const fillColor = signal.isActive
				? signal.scope === "run"
					? "#1e3a8a"
					: "#14532d"
				: "#334155";
			const strokeColor = signal.isActive
				? signal.scope === "run"
					? "#3b82f6"
					: "#22c55e"
				: "#64748b";

			lines.push(
				`  style ${signalId} fill:${fillColor},stroke:${strokeColor},stroke-width:2px,color:#ffffff`,
			);
		});

		return lines.join("\n");
	}, [config]);

	const columnStatusDiagramCode = useMemo(() => {
		const lines: string[] = ["graph LR"];
		const sortedColumns = [...config.columns].sort(
			(a, b) => a.orderIndex - b.orderIndex,
		);
		const columnKeys: string[] = sortedColumns.map((col) => col.systemKey);
		const columnIdMap = createMermaidIdMap(columnKeys, "column");
		const statusToColumn = new Map<string, string>(
			config.statuses.map(
				(status) => [status.status, status.preferredColumnSystemKey] as const,
			),
		);

		sortedColumns.forEach((column) => {
			const columnId = columnIdMap.get(column.systemKey);
			if (!columnId) {
				return;
			}

			const statuses = config.statuses
				.filter(
					(status) => status.preferredColumnSystemKey === column.systemKey,
				)
				.map((status) => status.status)
				.join(", ");
			const label = statuses
				? `${column.name}\\n[${statuses}]`
				: `${column.name}\\n[no statuses]`;

			lines.push(`  ${columnId}["${escapeMermaidLabel(label)}"]`);
		});

		const transitions = new Map<string, string[]>();
		config.statuses.forEach(({ status: fromStatus }) => {
			const fromColumn = statusToColumn.get(fromStatus);
			if (!fromColumn) {
				return;
			}

			const toStatuses = config.statusTransitions[fromStatus] ?? [];
			toStatuses.forEach((toStatus) => {
				const toColumn = statusToColumn.get(toStatus);
				if (!toColumn || toColumn === fromColumn) {
					return;
				}

				const key = `${fromColumn}->${toColumn}`;
				const value = `${fromStatus}→${toStatus}`;
				const existing = transitions.get(key) ?? [];
				if (!existing.includes(value)) {
					existing.push(value);
					transitions.set(key, existing);
				}
			});
		});

		if (transitions.size === 0) {
			lines.push(`  note_empty["No cross-column transitions"]`);
		}

		for (const [key, values] of transitions.entries()) {
			const [fromColumn, toColumn] = key.split("->");
			const fromId = columnIdMap.get(fromColumn);
			const toId = columnIdMap.get(toColumn);
			if (!fromId || !toId) {
				continue;
			}

			const label = values.slice(0, 3).join(", ");
			const hiddenCount = values.length - 3;
			const edgeLabel = hiddenCount > 0 ? `${label} +${hiddenCount}` : label;
			lines.push(
				`  ${fromId} -- "${escapeMermaidLabel(edgeLabel)}" --> ${toId}`,
			);
		}

		sortedColumns.forEach((column) => {
			const columnId = columnIdMap.get(column.systemKey);
			if (!columnId) {
				return;
			}
			lines.push(
				`  style ${columnId} fill:#111827,stroke:${column.color},stroke-width:2px,color:#ffffff`,
			);
		});

		if (transitions.size === 0) {
			lines.push(
				"  style note_empty fill:#334155,stroke:#64748b,stroke-width:1px,color:#ffffff",
			);
		}

		return lines.join("\n");
	}, [config]);

	useEffect(() => {
		const renderDiagram = async (
			container: HTMLDivElement | null,
			diagramCode: string,
		) => {
			if (!container || !diagramCode) {
				return;
			}

			try {
				container.innerHTML = "";
				const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
				const { svg } = await mermaid.render(id, diagramCode);
				container.innerHTML = svg;
			} catch (error) {
				console.error("Mermaid rendering failed:", error);
			}
		};

		void renderDiagram(signalStatusRef.current, signalStatusDiagramCode);
		void renderDiagram(columnStatusRef.current, columnStatusDiagramCode);
	}, [signalStatusDiagramCode, columnStatusDiagramCode]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between px-2">
				<h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
					Workflow Diagrams (Mermaid)
				</h3>
				<span className="text-[10px] font-bold text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded border border-slate-700/50">
					Auto-generated
				</span>
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<div className="flex flex-col gap-2">
					<p className="px-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
						Status Transitions by Signals
					</p>
					<div
						className="w-full min-h-[420px] rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 p-6 overflow-auto flex items-center justify-center custom-scrollbar"
						ref={signalStatusRef}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<p className="px-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
						Column Transitions by Statuses
					</p>
					<div
						className="w-full min-h-[420px] rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 p-6 overflow-auto flex items-center justify-center custom-scrollbar"
						ref={columnStatusRef}
					/>
				</div>
			</div>
		</div>
	);
}
