"use client";

import { useState, useEffect, useCallback } from "react";
import {
	Activity,
	RefreshCw,
	Server,
	Cpu,
	Layers,
	Database,
	ListFilter,
	Zap,
	AlertCircle,
	RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import type { QueueStatsResponse } from "@/types/ipc";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";

const getUtilizationColor = (percent: number) => {
	if (percent >= 90) return "bg-red-500";
	if (percent >= 70) return "bg-amber-500";
	if (percent >= 40) return "bg-blue-500";
	return "bg-emerald-500";
};

const getUtilizationLabel = (percent: number) => {
	if (percent >= 90) return "Critical";
	if (percent >= 70) return "High";
	if (percent >= 40) return "Moderate";
	return "Low";
};

const getUtilizationTextColor = (percent: number) => {
	if (percent >= 90) return "text-red-400";
	if (percent >= 70) return "text-amber-400";
	if (percent >= 40) return "text-blue-400";
	return "text-emerald-400";
};

export default function DiagnosticsPage() {
	const [queueStats, setQueueStats] = useState<QueueStatsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isPolling, setIsPolling] = useState(false);
	const [isRestarting, setIsRestarting] = useState(false);
	const [isRestartWarningOpen, setIsRestartWarningOpen] = useState(false);
	const [restartBusySessionCount, setRestartBusySessionCount] = useState(0);

	const loadStats = useCallback(
		async (silent = false) => {
			if (isPolling && silent) return;
			try {
				if (!silent) setLoading(true);
				if (silent) setIsPolling(true);
				setError(null);
				const stats = await api.run.queueStats();
				setQueueStats(stats);
			} catch (err) {
				console.error("Failed to load queue stats:", err);
				setError(
					err instanceof Error ? err.message : "Failed to load queue stats",
				);
			} finally {
				if (!silent) setLoading(false);
				if (silent) setIsPolling(false);
			}
		},
		[isPolling],
	);

	useEffect(() => {
		loadStats();

		const interval = setInterval(() => {
			loadStats(true);
		}, 8000);

		return () => clearInterval(interval);
	}, [loadStats]);

	const handleRestart = async () => {
		try {
			const sessionStats = await api.opencode.activeSessionStats();
			if (sessionStats.busySessions > 0) {
				setRestartBusySessionCount(sessionStats.busySessions);
				setIsRestartWarningOpen(true);
				return;
			}
		} catch {}
		await performRestart(false);
	};

	const performRestart = async (force: boolean) => {
		setIsRestarting(true);
		try {
			await api.opencode.restartServe({ force });
			await loadStats();
		} catch (err) {
			if (!force && err instanceof Error) {
				try {
					const stats = await api.opencode.activeSessionStats();
					if (stats.busySessions > 0) {
						setIsRestarting(false);
						setRestartBusySessionCount(stats.busySessions);
						setIsRestartWarningOpen(true);
						return;
					}
				} catch {}
			}
			console.error("Failed to restart opencode serve:", err);
			setError(
				err instanceof Error ? err.message : "Failed to restart opencode serve",
			);
		} finally {
			setIsRestarting(false);
		}
	};

	return (
		<div className="flex flex-col min-h-screen animate-in fade-in duration-500 pb-12">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-8 py-6 border-b border-slate-800/60 bg-[#0B0E14] sticky top-0 z-40">
				<div className="flex items-center gap-4">
					<div className="w-12 h-12 rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10 transition-transform hover:scale-110">
						<Activity className="w-6 h-6 animate-pulse" />
					</div>
					<div>
						<h1 className="text-xl font-black text-white tracking-tight leading-tight uppercase">
							System Diagnostics
						</h1>
						<div className="flex items-center gap-2 mt-1">
							<div className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
								Real-time Monitor
							</div>
							<p className="text-[10px] text-slate-500 font-mono truncate max-w-[400px]">
								Queue status and provider performance
							</p>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handleRestart}
						disabled={isRestarting}
						className="h-10 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20 active:scale-95 disabled:opacity-50 text-[10px] uppercase tracking-wider"
					>
						<RotateCcw
							className={cn("w-4 h-4", isRestarting && "animate-spin")}
						/>
						<span>Restart OpenCode</span>
					</button>
					<button
						type="button"
						onClick={() => loadStats()}
						disabled={loading}
						className="h-10 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50 text-[10px] uppercase tracking-wider"
					>
						<RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
						<span>Refresh Status</span>
					</button>
				</div>
			</div>

			<div className="p-8 space-y-8">
				{/* Top Metrics Cards */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					<MetricCard
						label="Total Queued"
						value={queueStats?.totalQueued ?? 0}
						icon={ListFilter}
						color="text-amber-400"
						loading={loading}
					/>
					<MetricCard
						label="Total Running"
						value={queueStats?.totalRunning ?? 0}
						icon={Zap}
						color="text-emerald-400"
						loading={loading}
					/>
					<MetricCard
						label="Active Providers"
						value={queueStats?.providers.length ?? 0}
						icon={Server}
						color="text-blue-400"
						loading={loading}
					/>
					<MetricCard
						label="Platform"
						value="Production"
						icon={Cpu}
						color="text-purple-400"
						loading={loading}
					/>
				</div>

				{/* Queue Status Section */}
				<div className="space-y-4">
					<div className="flex items-center gap-2 px-1">
						<Layers className="w-5 h-5 text-slate-400" />
						<h2 className="text-xl font-semibold text-white">
							Provider Queue Stats
						</h2>
					</div>

					{error ? (
						<div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-3">
							<AlertCircle className="w-10 h-10 text-red-500 opacity-50" />
							<div>
								<h3 className="text-red-400 font-semibold">Connection Error</h3>
								<p className="text-red-400/70 text-sm max-w-md">{error}</p>
							</div>
							<button
								type="button"
								onClick={() => loadStats()}
								className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
							>
								Retry Connection
							</button>
						</div>
					) : (
						<div className="bg-[#11151C] border border-slate-800/50 rounded-2xl overflow-hidden shadow-xl">
							<div className="overflow-x-auto">
								<table className="w-full text-left border-collapse">
									<thead>
										<tr className="bg-slate-800/20 border-b border-slate-800/50">
											<th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
												Provider Key
											</th>
											<th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">
												Queued
											</th>
											<th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">
												Running
											</th>
											<th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">
												Concurrency
											</th>
											<th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">
												Utilization
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-800/30">
										{!queueStats || queueStats.providers.length === 0 ? (
											<tr>
												<td
													colSpan={5}
													className="px-6 py-12 text-center text-slate-500"
												>
													{loading ? (
														<div className="flex flex-col items-center gap-2">
															<RefreshCw className="w-6 h-6 animate-spin text-blue-500/50" />
															<span>Fetching provider data...</span>
														</div>
													) : (
														"No active providers reported"
													)}
												</td>
											</tr>
										) : (
											queueStats.providers.map((provider) => {
												const utilization =
													provider.concurrency > 0
														? Math.min(
																100,
																Math.round(
																	(provider.running / provider.concurrency) *
																		100,
																),
															)
														: 0;

												return (
													<tr
														key={provider.providerKey}
														className="hover:bg-slate-800/20 transition-colors group"
													>
														<td className="px-6 py-4">
															<div className="flex items-center gap-3">
																<div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
																<span className="font-mono text-sm text-slate-200 group-hover:text-blue-400 transition-colors">
																	{provider.providerKey}
																</span>
															</div>
														</td>
														<td className="px-6 py-4 text-center">
															<span
																className={cn(
																	"px-2.5 py-1 rounded-lg border text-xs font-mono transition-colors",
																	provider.queued > 0
																		? "bg-amber-500/10 border-amber-500/30 text-amber-400"
																		: "bg-slate-800/50 border-slate-700/30 text-slate-500",
																)}
															>
																{provider.queued}
															</span>
														</td>
														<td className="px-6 py-4 text-center">
															<span
																className={cn(
																	"px-2.5 py-1 rounded-lg border text-xs font-mono transition-colors",
																	provider.running > 0
																		? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
																		: "bg-slate-800/50 border-slate-700/30 text-slate-500",
																)}
															>
																{provider.running}
															</span>
														</td>
														<td className="px-6 py-4 text-center">
															<span className="px-2.5 py-1 bg-slate-800/50 border border-slate-700/30 text-slate-300 rounded-lg text-xs font-mono">
																{provider.concurrency}
															</span>
														</td>
														<td className="px-6 py-4 text-right">
															<div className="flex flex-col items-end gap-1.5">
																<div className="flex items-center gap-2">
																	<span
																		className={cn(
																			"text-[10px] font-bold uppercase tracking-wider",
																			getUtilizationTextColor(utilization),
																		)}
																	>
																		{getUtilizationLabel(utilization)}
																	</span>
																	<div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/30">
																		<div
																			className={cn(
																				"h-full transition-all duration-500 ease-out",
																				getUtilizationColor(utilization),
																			)}
																			style={{ width: `${utilization}%` }}
																		/>
																	</div>
																</div>
																<span className="text-[10px] font-mono text-slate-500">
																	{utilization}% capacity
																</span>
															</div>
														</td>
													</tr>
												);
											})
										)}
									</tbody>
								</table>
							</div>
						</div>
					)}
				</div>

				{/* Bottom Grid for additional info */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Database Info Placeholder (consistent with legacy) */}
					<div className="bg-[#11151C] border border-slate-800/50 rounded-2xl overflow-hidden shadow-xl">
						<div className="p-4 border-b border-slate-800/50 flex items-center gap-3 bg-gradient-to-r from-emerald-600/10 to-transparent">
							<Database className="w-5 h-5 text-emerald-500" />
							<h3 className="font-bold text-white text-sm uppercase tracking-wider">
								Storage Persistence
							</h3>
						</div>
						<div className="p-6">
							<div className="flex items-center justify-center h-24 border-2 border-dashed border-slate-800 rounded-xl">
								<span className="text-slate-500 text-sm">
									Database metrics coming soon...
								</span>
							</div>
						</div>
					</div>

					{/* System Info Placeholder */}
					<div className="bg-[#11151C] border border-slate-800/50 rounded-2xl overflow-hidden shadow-xl">
						<div className="p-4 border-b border-slate-800/50 flex items-center gap-3 bg-gradient-to-r from-purple-600/10 to-transparent">
							<Server className="w-5 h-5 text-purple-500" />
							<h3 className="font-bold text-white text-sm uppercase tracking-wider">
								Infrastructure
							</h3>
						</div>
						<div className="p-6">
							<div className="flex items-center justify-center h-24 border-2 border-dashed border-slate-800 rounded-xl">
								<span className="text-slate-500 text-sm">
									Environment diagnostics coming soon...
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<ConfirmationModal
				isOpen={isRestartWarningOpen}
				onClose={() => {
					setIsRestartWarningOpen(false);
					setRestartBusySessionCount(0);
				}}
				onConfirm={async () => {
					setIsRestartWarningOpen(false);
					await performRestart(true);
				}}
				title="Active sessions in progress"
				description="There are OpenCode sessions currently running. Restarting will interrupt them."
				confirmLabel="Restart anyway"
				variant="danger"
				isLoading={isRestarting}
			>
				{restartBusySessionCount > 0 && (
					<div className="mt-3">
						<div className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center">
							<div className="text-lg font-bold text-amber-400 font-mono">
								{restartBusySessionCount}
							</div>
							<div className="text-[10px] text-amber-400/70 uppercase tracking-wider font-semibold">
								Active sessions
							</div>
						</div>
					</div>
				)}
			</ConfirmationModal>
		</div>
	);
}

function MetricCard({
	label,
	value,
	icon: Icon,
	color,
	loading,
}: {
	label: string;
	value: string | number;
	icon: LucideIcon;
	color: string;
	loading?: boolean;
}) {
	return (
		<div className="bg-[#11151C] border border-slate-800/50 p-6 rounded-2xl shadow-xl hover:border-slate-700/50 transition-all group">
			<div className="flex items-center justify-between mb-2">
				<div
					className={cn(
						"p-2 rounded-xl bg-slate-800/50 group-hover:bg-slate-800 transition-colors",
						color,
					)}
				>
					<Icon className="w-5 h-5" />
				</div>
				{loading && (
					<RefreshCw className="w-3 h-3 animate-spin text-slate-600" />
				)}
			</div>
			<div className="text-2xl font-bold text-white font-mono">{value}</div>
			<div className="text-xs text-slate-500 uppercase tracking-widest mt-1">
				{label}
			</div>
		</div>
	);
}
