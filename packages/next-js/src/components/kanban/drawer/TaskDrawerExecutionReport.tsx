import { useCallback, useEffect, useState } from "react";
import {
	AlertTriangle,
	CheckCircle2,
	FileText,
	Loader2,
	ScrollText,
	Terminal,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types/kanban";
import type { Run } from "@/types/ipc";
import {
	parseExecutionReport,
	hasExecutionReportContent,
	type ExecutionReport,
} from "@/types/execution-report";
import { api } from "@/lib/api";
import { LightMarkdown } from "@/components/LightMarkdown";

interface TaskDrawerExecutionReportProps {
	task: KanbanTask;
	isActive: boolean;
}

function selectReportRun(runs: Run[]): Run | null {
	const completed = runs.filter(
		(r) =>
			(r.status === "completed" || r.status === "failed") &&
			hasExecutionReportContent(r.metadata?.lastExecutionStatus ?? null),
	);
	if (completed.length === 0) return null;
	return completed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function TaskDrawerExecutionReport({
	task,
	isActive,
}: TaskDrawerExecutionReportProps) {
	const [runs, setRuns] = useState<Run[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const fetchRuns = useCallback(async () => {
		setIsLoading(true);
		try {
			const response = await api.run.listByTask({ taskId: task.id });
			setRuns(response.runs);
		} catch (error) {
			console.error("Failed to fetch runs:", error);
		} finally {
			setIsLoading(false);
		}
	}, [task.id]);

	useEffect(() => {
		if (isActive) {
			void fetchRuns();
		}
	}, [isActive, fetchRuns]);

	const reportRun = selectReportRun(runs);
	const executionStatus = reportRun?.metadata?.lastExecutionStatus;
	const hasContent = hasExecutionReportContent(executionStatus ?? null);

	const report: ExecutionReport | null =
		hasContent && executionStatus?.content
			? parseExecutionReport(executionStatus.content)
			: null;

	if (isLoading && runs.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
				<Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
				<span className="text-xs text-slate-500">Loading report...</span>
			</div>
		);
	}

	if (!report || !hasContent) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 opacity-50 py-12">
				<div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
					<ScrollText className="w-8 h-8 text-slate-600" />
				</div>
				<div className="text-center space-y-1">
					<p className="text-sm font-medium text-slate-400">
						No execution report
					</p>
					<p className="text-xs text-slate-600 max-w-[240px]">
						{runs.length === 0
							? "Run this task to generate an execution report."
							: "The latest run has not produced a report yet."}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full bg-[#0B0E14] animate-in fade-in duration-300">
			<div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
				<ReportHeader run={reportRun} />

				{report.isUnstructured ? (
					<UnstructuredReport content={report.rawContent} />
				) : (
					<StructuredReport report={report} />
				)}
			</div>
		</div>
	);
}

function ReportHeader({ run }: { run: Run | null }) {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				<div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
					<ScrollText className="w-4 h-4 text-blue-400" />
				</div>
				<div>
					<h3 className="text-sm font-bold text-slate-200">Execution Report</h3>
					{run && (
						<span className="text-[10px] text-slate-500 font-mono">
							{run.id.slice(0, 8)} · {new Date(run.updatedAt).toLocaleString()}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function StructuredReport({ report }: { report: ExecutionReport }) {
	return (
		<>
			{report.summary && (
				<ReportSection
					icon={<FileText className="w-3.5 h-3.5" />}
					title="Summary"
				>
					<div className="text-xs text-slate-300 leading-relaxed prose-sm">
						<LightMarkdown text={report.summary} />
					</div>
				</ReportSection>
			)}

			{report.changedFiles.length > 0 && (
				<ReportSection
					icon={<Terminal className="w-3.5 h-3.5" />}
					title={`Changed Files (${report.changedFiles.length})`}
				>
					<ul className="space-y-1">
						{report.changedFiles.map((file, i) => (
							<li
								key={`${file}-${i}`}
								className="text-xs font-mono text-slate-400 bg-slate-900/40 rounded px-2 py-1 border border-slate-800/50"
							>
								{file}
							</li>
						))}
					</ul>
				</ReportSection>
			)}

			{report.testResults && (
				<ReportSection
					icon={<CheckCircle2 className="w-3.5 h-3.5" />}
					title="Test Results"
				>
					<div className="flex items-center gap-3 mb-2">
						<span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
							<CheckCircle2 className="w-3 h-3" />
							{report.testResults.passed} passed
						</span>
						{report.testResults.failed > 0 && (
							<span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">
								<XCircle className="w-3 h-3" />
								{report.testResults.failed} failed
							</span>
						)}
						{report.testResults.skipped > 0 && (
							<span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5">
								{report.testResults.skipped} skipped
							</span>
						)}
					</div>
					{report.testResults.details && (
						<div className="text-xs text-slate-400 leading-relaxed">
							<LightMarkdown text={report.testResults.details} />
						</div>
					)}
				</ReportSection>
			)}

			{report.errors.length > 0 && (
				<ReportSection
					icon={<XCircle className="w-3.5 h-3.5 text-red-400" />}
					title={`Errors (${report.errors.length})`}
					variant="error"
				>
					<ul className="space-y-1.5">
						{report.errors.map((err, i) => (
							<li
								key={`err-${i}`}
								className="text-xs text-red-300 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2"
							>
								{err}
							</li>
						))}
					</ul>
				</ReportSection>
			)}

			{report.warnings.length > 0 && (
				<ReportSection
					icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
					title={`Warnings (${report.warnings.length})`}
					variant="warning"
				>
					<ul className="space-y-1.5">
						{report.warnings.map((warn, i) => (
							<li
								key={`warn-${i}`}
								className="text-xs text-amber-300 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2"
							>
								{warn}
							</li>
						))}
					</ul>
				</ReportSection>
			)}
		</>
	);
}

function UnstructuredReport({ content }: { content: string }) {
	return (
		<ReportSection icon={<FileText className="w-3.5 h-3.5" />} title="Report">
			<div className="text-xs text-slate-300 leading-relaxed prose-sm">
				<LightMarkdown text={content} />
			</div>
		</ReportSection>
	);
}

function ReportSection({
	icon,
	title,
	variant = "default",
	children,
}: {
	icon: React.ReactNode;
	title: string;
	variant?: "default" | "error" | "warning";
	children: React.ReactNode;
}) {
	const borderClass =
		variant === "error"
			? "border-red-500/10"
			: variant === "warning"
				? "border-amber-500/10"
				: "border-slate-800/60";

	return (
		<div
			className={cn(
				"bg-[#11151C] rounded-xl border p-4 space-y-3",
				borderClass,
			)}
		>
			<div className="flex items-center gap-2 text-slate-300">
				{icon}
				<span className="text-xs font-bold uppercase tracking-wider">
					{title}
				</span>
			</div>
			{children}
		</div>
	);
}
