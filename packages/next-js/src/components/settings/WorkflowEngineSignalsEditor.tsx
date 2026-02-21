"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Code2, ListTree, RotateCcw } from "lucide-react";

import type {
	WorkflowSignalConfig,
	WorkflowSignalRuleConfig,
	WorkflowStatusConfig,
	WorkflowTaskStatus,
	WorkflowRunStatus,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface WorkflowEngineSignalsEditorProps {
	signals: WorkflowSignalConfig[];
	signalRules: WorkflowSignalRuleConfig[];
	statuses: WorkflowStatusConfig[];
	onSignalsChange: (signals: WorkflowSignalConfig[]) => void;
	onSignalRulesChange: (rules: WorkflowSignalRuleConfig[]) => void;
	onErrorChange: (message: string | null) => void;
}

const TASK_STATUSES: readonly WorkflowTaskStatus[] = [
	"queued",
	"running",
	"question",
	"paused",
	"done",
	"failed",
	"generating",
];

const RUN_STATUSES: readonly WorkflowRunStatus[] = [
	"queued",
	"running",
	"completed",
	"failed",
	"cancelled",
	"timeout",
	"paused",
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function isSignalScope(value: string): value is "run" | "user_action" {
	return value === "run" || value === "user_action";
}

function isWorkflowTaskStatus(value: string): value is WorkflowTaskStatus {
	return (TASK_STATUSES as readonly string[]).includes(value);
}

function isWorkflowRunStatus(value: string): value is WorkflowRunStatus {
	return (RUN_STATUSES as readonly string[]).includes(value);
}

function parseSignalsJson(text: string): WorkflowSignalConfig[] {
	const parsed = JSON.parse(text) as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error("Signals JSON must be an array");
	}

	return parsed.map((item, index) => {
		if (!isRecord(item)) {
			throw new Error(`signals[${index}] must be an object`);
		}

		const key = item.key;
		const scope = item.scope;
		const title = item.title;
		const description = item.description;
		const orderIndex = item.orderIndex;
		const isActive = item.isActive;

		if (typeof key !== "string" || !key.trim()) {
			throw new Error(`signals[${index}].key must be a non-empty string`);
		}
		if (typeof scope !== "string" || !isSignalScope(scope)) {
			throw new Error(`signals[${index}].scope must be 'run' or 'user_action'`);
		}
		if (typeof title !== "string" || !title.trim()) {
			throw new Error(`signals[${index}].title must be a non-empty string`);
		}
		if (typeof description !== "string") {
			throw new Error(`signals[${index}].description must be a string`);
		}
		if (
			typeof orderIndex !== "number" ||
			!Number.isInteger(orderIndex) ||
			orderIndex < 0
		) {
			throw new Error(
				`signals[${index}].orderIndex must be a non-negative integer`,
			);
		}
		if (typeof isActive !== "boolean") {
			throw new Error(`signals[${index}].isActive must be boolean`);
		}

		return {
			key,
			scope,
			title,
			description,
			orderIndex,
			isActive,
		};
	});
}

function parseSignalRulesJson(text: string): WorkflowSignalRuleConfig[] {
	const parsed = JSON.parse(text) as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error("Signal rules JSON must be an array");
	}

	return parsed.map((item, index) => {
		if (!isRecord(item)) {
			throw new Error(`signalRules[${index}] must be an object`);
		}

		const key = item.key;
		const signalKey = item.signalKey;
		const runKind = item.runKind;
		const runStatus = item.runStatus;
		const fromStatus = item.fromStatus;
		const toStatus = item.toStatus;

		if (typeof key !== "string" || !key.trim()) {
			throw new Error(`signalRules[${index}].key must be a non-empty string`);
		}
		if (typeof signalKey !== "string" || !signalKey.trim()) {
			throw new Error(
				`signalRules[${index}].signalKey must be a non-empty string`,
			);
		}
		if (
			runKind !== null &&
			runKind !== undefined &&
			typeof runKind !== "string"
		) {
			throw new Error(`signalRules[${index}].runKind must be string or null`);
		}
		if (
			runStatus !== null &&
			runStatus !== undefined &&
			(typeof runStatus !== "string" || !isWorkflowRunStatus(runStatus))
		) {
			throw new Error(
				`signalRules[${index}].runStatus must be a valid run status or null`,
			);
		}
		if (
			fromStatus !== null &&
			fromStatus !== undefined &&
			(typeof fromStatus !== "string" || !isWorkflowTaskStatus(fromStatus))
		) {
			throw new Error(
				`signalRules[${index}].fromStatus must be a valid task status or null`,
			);
		}
		if (typeof toStatus !== "string" || !isWorkflowTaskStatus(toStatus)) {
			throw new Error(
				`signalRules[${index}].toStatus must be a valid task status`,
			);
		}

		return {
			key,
			signalKey,
			runKind: typeof runKind === "string" ? runKind : null,
			runStatus:
				typeof runStatus === "string" && isWorkflowRunStatus(runStatus)
					? runStatus
					: null,
			fromStatus:
				typeof fromStatus === "string" && isWorkflowTaskStatus(fromStatus)
					? fromStatus
					: null,
			toStatus,
		};
	});
}

function toPrettyJson(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

export function WorkflowEngineSignalsEditor({
	signals,
	signalRules,
	statuses,
	onSignalsChange,
	onSignalRulesChange,
	onErrorChange,
}: WorkflowEngineSignalsEditorProps) {
	const [signalsText, setSignalsText] = useState(() => toPrettyJson(signals));
	const [rulesText, setRulesText] = useState(() => toPrettyJson(signalRules));

	useEffect(() => {
		setSignalsText(toPrettyJson(signals));
	}, [signals]);

	useEffect(() => {
		setRulesText(toPrettyJson(signalRules));
	}, [signalRules]);

	const activeSignalsCount = useMemo(
		() => signals.filter((signal) => signal.isActive).length,
		[signals],
	);

	const configuredStatuses = useMemo(
		() => new Set(statuses.map((status) => status.status)),
		[statuses],
	);

	const ruleCoverage = useMemo(() => {
		const invalidRules = signalRules.filter(
			(rule) => !configuredStatuses.has(rule.toStatus),
		).length;
		return {
			total: signalRules.length,
			invalid: invalidRules,
		};
	}, [configuredStatuses, signalRules]);

	const applySignalsJson = () => {
		try {
			const parsed = parseSignalsJson(signalsText);
			onSignalsChange(parsed);
			onErrorChange(null);
		} catch (error) {
			onErrorChange(
				error instanceof Error ? error.message : "Invalid signals JSON",
			);
		}
	};

	const applySignalRulesJson = () => {
		try {
			const parsed = parseSignalRulesJson(rulesText);
			onSignalRulesChange(parsed);
			onErrorChange(null);
		} catch (error) {
			onErrorChange(
				error instanceof Error ? error.message : "Invalid signal rules JSON",
			);
		}
	};

	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-3">
				<div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-4">
					<p className="text-xs font-bold tracking-widest text-slate-500 uppercase">
						Signals
					</p>
					<p className="mt-2 text-2xl font-bold text-slate-100">
						{signals.length}
					</p>
					<p className="mt-1 text-xs text-slate-500">
						{activeSignalsCount} active
					</p>
				</div>
				<div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-4">
					<p className="text-xs font-bold tracking-widest text-slate-500 uppercase">
						Rules
					</p>
					<p className="mt-2 text-2xl font-bold text-slate-100">
						{ruleCoverage.total}
					</p>
					<p className="mt-1 text-xs text-slate-500">status mapping rules</p>
				</div>
				<div
					className={cn(
						"rounded-xl border p-4",
						ruleCoverage.invalid === 0
							? "border-emerald-700/30 bg-emerald-500/5"
							: "border-amber-700/30 bg-amber-500/5",
					)}
				>
					<p className="text-xs font-bold tracking-widest text-slate-500 uppercase">
						Rule Coverage
					</p>
					<p className="mt-2 text-2xl font-bold text-slate-100">
						{ruleCoverage.invalid === 0 ? "OK" : "CHECK"}
					</p>
					<p className="mt-1 text-xs text-slate-500">
						{ruleCoverage.invalid === 0
							? "All rule targets exist in statuses"
							: `${ruleCoverage.invalid} rules target missing statuses`}
					</p>
				</div>
			</div>

			<div className="grid gap-6 xl:grid-cols-2">
				<section className="rounded-2xl border border-slate-800/50 bg-slate-900/30 p-5">
					<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2 text-slate-100">
							<ListTree className="h-4 w-4 text-blue-400" />
							<h3 className="text-sm font-bold tracking-wide uppercase">
								Signals JSON
							</h3>
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setSignalsText(toPrettyJson(signals))}
								className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
							>
								<RotateCcw className="h-3.5 w-3.5" />
								Reset
							</button>
							<button
								type="button"
								onClick={applySignalsJson}
								className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
							>
								<Check className="h-3.5 w-3.5" />
								Apply
							</button>
						</div>
					</div>
					<textarea
						value={signalsText}
						onChange={(event) => setSignalsText(event.target.value)}
						spellCheck={false}
						className="h-[420px] w-full resize-y rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs text-slate-200 outline-none focus:border-blue-500"
					/>
				</section>

				<section className="rounded-2xl border border-slate-800/50 bg-slate-900/30 p-5">
					<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2 text-slate-100">
							<Code2 className="h-4 w-4 text-cyan-400" />
							<h3 className="text-sm font-bold tracking-wide uppercase">
								Signal Rules JSON
							</h3>
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setRulesText(toPrettyJson(signalRules))}
								className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
							>
								<RotateCcw className="h-3.5 w-3.5" />
								Reset
							</button>
							<button
								type="button"
								onClick={applySignalRulesJson}
								className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
							>
								<Check className="h-3.5 w-3.5" />
								Apply
							</button>
						</div>
					</div>
					<textarea
						value={rulesText}
						onChange={(event) => setRulesText(event.target.value)}
						spellCheck={false}
						className="h-[420px] w-full resize-y rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs text-slate-200 outline-none focus:border-blue-500"
					/>
				</section>
			</div>
		</div>
	);
}
