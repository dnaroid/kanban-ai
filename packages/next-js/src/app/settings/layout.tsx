"use client";

import { type ReactNode } from "react";
import {
	Trash2,
	Tag as TagIcon,
	Cpu,
	CheckCircle2,
	Settings2,
	Users,
	GitBranch,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SettingsStatusProvider } from "@/components/settings/SettingsStatusProvider";

type Tab =
	| "all-models"
	| "my-models"
	| "team"
	| "oh-my-opencode"
	| "workflow"
	| "tags"
	| "danger";

const tabs: {
	id: Tab;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}[] = [
	{ id: "all-models", label: "All Models", icon: Cpu },
	{ id: "my-models", label: "My Models", icon: CheckCircle2 },
	{ id: "team", label: "Team", icon: Users },
	{ id: "oh-my-opencode", label: "Oh-My-Opencode", icon: Settings2 },
	{ id: "workflow", label: "Workflow", icon: GitBranch },
	{ id: "tags", label: "Tags", icon: TagIcon },
	{ id: "danger", label: "Danger Zone", icon: Trash2 },
];

function SettingsLayoutInner({ children }: { children: ReactNode }) {
	const pathname = usePathname();

	const activeTab =
		tabs.find((tab) => pathname?.includes(tab.id))?.id ?? "all-models";

	return (
		<div className="flex flex-col h-dvh">
			<div className="shrink-0 bg-[#0B0E14]/80 backdrop-blur-md px-8 pt-4 border-b border-slate-800/40 flex items-center gap-2">
				{tabs.map((tab) => {
					const Icon = tab.icon;
					const isActive = activeTab === tab.id;
					return (
						<Link
							href={`/settings/${tab.id}`}
							key={tab.id}
							className={cn(
								"flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-t-xl transition-all border-b-2 -mb-[1px] focus:outline-none",
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

			<div className="flex-1 overflow-auto">
				<div className="flex flex-col px-8 pt-5 pb-12">{children}</div>
			</div>
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
