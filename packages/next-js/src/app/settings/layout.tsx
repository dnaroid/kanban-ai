"use client";

import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";
import {
	Trash2,
	Tag as TagIcon,
	Cpu,
	CheckCircle2,
	Settings2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = "all-models" | "my-models" | "oh-my-opencode" | "tags" | "danger";

type Status = {
	message: string;
	type: "info" | "error" | "success";
} | null;

type SettingsContextType = {
	status: Status;
	setStatus: (status: Status) => void;
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function useSettingsStatus() {
	const context = useContext(SettingsContext);
	if (!context) {
		throw new Error("useSettingsStatus must be used within SettingsLayout");
	}
	return context;
}

function SettingsStatusProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<Status>(null);

	useEffect(() => {
		if (status) {
			const timer = setTimeout(() => setStatus(null), 5000);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [status]);

	return (
		<SettingsContext.Provider value={{ status, setStatus }}>
			{children}
		</SettingsContext.Provider>
	);
}

const tabs: {
	id: Tab;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}[] = [
	{ id: "all-models", label: "All Models", icon: Cpu },
	{ id: "my-models", label: "My Models", icon: CheckCircle2 },
	{ id: "oh-my-opencode", label: "Oh-My-Opencode", icon: Settings2 },
	{ id: "tags", label: "Tags", icon: TagIcon },
	{ id: "danger", label: "Danger Zone", icon: Trash2 },
];

function SettingsLayoutInner({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const { status } = useSettingsStatus();

	const activeTab =
		tabs.find((tab) => pathname?.includes(tab.id))?.id ?? "all-models";

	return (
		<div className="flex flex-col h-full w-full">
			{status && (
				<div className="fixed top-20 right-8 z-50">
					<div
						className={cn(
							"px-5 py-3 rounded-2xl border backdrop-blur-xl animate-in slide-in-from-top-4 shadow-2xl",
							status.type === "success"
								? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
								: status.type === "error"
									? "bg-red-500/10 border-red-500/20 text-red-400"
									: "bg-blue-500/10 border-blue-500/20 text-blue-400",
						)}
					>
						<div className="flex items-center gap-3">
							<div
								className={cn(
									"w-2 h-2 rounded-full animate-pulse",
									status.type === "success"
										? "bg-emerald-500"
										: status.type === "error"
											? "bg-red-500"
											: "bg-blue-500",
								)}
							/>
							<p className="text-sm font-bold tracking-tight">
								{status.message}
							</p>
						</div>
					</div>
				</div>
			)}

			<div className="flex items-center gap-2 mb-4 border-b border-slate-800/40">
				{tabs.map((tab) => {
					const Icon = tab.icon;
					const isActive = activeTab === tab.id;
					return (
						<Link
							href={`/settings/${tab.id}`}
							key={tab.id}
							className={cn(
								"flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-t-xl transition-all border-b-2 focus:outline-none",
								isActive
									? "border-blue-500 text-blue-400 bg-blue-500/5"
									: "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/20",
							)}
						>
							<Icon
								className={cn(
									"w-4 h-4",
									isActive ? "text-blue-400" : "text-slate-500",
								)}
							/>
							{tab.label}
						</Link>
					);
				})}
			</div>

			<div className="flex-1 flex flex-col overflow-hidden">{children}</div>
		</div>
	);
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
	return (
		<SettingsStatusProvider>
			<SettingsLayoutInner>{children}</SettingsLayoutInner>
		</SettingsStatusProvider>
	);
}
