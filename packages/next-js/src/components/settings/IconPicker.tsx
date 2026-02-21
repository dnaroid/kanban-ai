"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

import {
	getWorkflowIcon,
	toneBadgeStyle,
	toneTextStyle,
} from "@/components/kanban/workflow-display";
import { cn } from "@/lib/utils";
import { WORKFLOW_ICON_KEYS, type WorkflowIconKey } from "@/types/workflow";

interface IconPickerProps {
	value: WorkflowIconKey;
	onChange: (icon: WorkflowIconKey) => void;
	label?: string;
	tone?: string;
	className?: string;
}

function toLabel(icon: WorkflowIconKey): string {
	return icon.replace(/-/g, " ");
}

export function IconPicker({
	value,
	onChange,
	label = "Status Icon",
	tone = "#94a3b8",
	className,
}: IconPickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [popupPosition, setPopupPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const popupRef = useRef<HTMLDivElement | null>(null);

	const CurrentIcon = getWorkflowIcon(value);
	const badgeStyle = toneBadgeStyle(tone);
	const textStyle = toneTextStyle(tone);

	const filteredIcons = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) {
			return WORKFLOW_ICON_KEYS;
		}
		return WORKFLOW_ICON_KEYS.filter((iconKey) =>
			toLabel(iconKey).toLowerCase().includes(normalized),
		);
	}, [query]);

	const updatePosition = useCallback(() => {
		const trigger = triggerRef.current;
		if (!trigger) {
			return;
		}

		const rect = trigger.getBoundingClientRect();
		const popupWidth = 280;
		const popupHeight = popupRef.current?.offsetHeight ?? 340;
		const viewportPadding = 8;

		const left = Math.min(
			Math.max(viewportPadding, rect.right - popupWidth),
			window.innerWidth - popupWidth - viewportPadding,
		);

		const defaultTop = rect.bottom + viewportPadding;
		const flippedTop = rect.top - popupHeight - viewportPadding;
		const top =
			defaultTop + popupHeight <= window.innerHeight - viewportPadding
				? defaultTop
				: Math.max(viewportPadding, flippedTop);

		setPopupPosition({ top, left });
	}, []);

	useLayoutEffect(() => {
		if (!isOpen) {
			return;
		}

		updatePosition();
		const frame = window.requestAnimationFrame(updatePosition);

		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);

		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	}, [isOpen, updatePosition]);

	return (
		<div className={cn("space-y-1.5", className)}>
			<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
				{label}
			</span>
			<div className="relative">
				<button
					ref={triggerRef}
					type="button"
					onClick={() => {
						if (isOpen) {
							setIsOpen(false);
							return;
						}
						setQuery("");
						setPopupPosition(null);
						setIsOpen(true);
					}}
					className={cn(
						"inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all hover:brightness-110",
						isOpen &&
							"ring-1 ring-offset-1 ring-offset-[#0B0E14] ring-slate-700",
					)}
					style={badgeStyle}
				>
					<CurrentIcon className="h-3.5 w-3.5" style={textStyle} />
					<span style={textStyle}>{toLabel(value)}</span>
					<ChevronDown
						className={cn(
							"h-3 w-3 opacity-70 transition-transform",
							isOpen && "rotate-180",
						)}
						style={textStyle}
					/>
				</button>

				{isOpen && popupPosition
					? createPortal(
							<>
								<button
									type="button"
									className="fixed inset-0 z-40 cursor-default"
									onClick={() => {
										setPopupPosition(null);
										setIsOpen(false);
									}}
									onKeyDown={(event) => {
										if (event.key === "Escape") {
											setPopupPosition(null);
											setIsOpen(false);
										}
									}}
									aria-label="Close icon picker"
								/>
								<div
									ref={popupRef}
									className="fixed z-50 w-[280px] rounded-2xl border border-slate-800 bg-[#161B26] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
									style={{ top: popupPosition.top, left: popupPosition.left }}
								>
									<div className="relative mb-3">
										<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
										<input
											type="text"
											value={query}
											onChange={(event) => setQuery(event.target.value)}
											placeholder="Search icon..."
											className="h-8 w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-2 text-[11px] text-slate-300 outline-none placeholder:text-slate-600 focus:border-slate-600"
										/>
									</div>

									<div className="max-h-64 space-y-1 overflow-y-auto pr-1">
										{filteredIcons.length === 0 ? (
											<p className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-xs text-slate-500">
												No icons found.
											</p>
										) : (
											filteredIcons.map((iconKey) => {
												const Icon = getWorkflowIcon(iconKey);
												const isActive = value === iconKey;
												return (
													<button
														key={iconKey}
														type="button"
														onClick={() => {
															onChange(iconKey);
															setPopupPosition(null);
															setIsOpen(false);
														}}
														className={cn(
															"flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] uppercase tracking-wide transition-colors",
															isActive
																? "border-slate-600 bg-slate-800/70 text-slate-100"
																: "border-slate-800 bg-slate-950/20 text-slate-400 hover:border-slate-700 hover:text-slate-200",
														)}
													>
														<Icon className="h-3.5 w-3.5" />
														<span>{toLabel(iconKey)}</span>
													</button>
												);
											})
										)}
									</div>
								</div>
							</>,
							document.body,
						)
					: null}
			</div>
		</div>
	);
}
