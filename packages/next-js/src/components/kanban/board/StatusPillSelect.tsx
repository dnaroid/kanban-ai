import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatusPillOption {
	icon: LucideIcon;
	label: string;
	style: { color: string; backgroundColor: string; borderColor: string };
	iconStyle: { color: string };
}

interface StatusPillSelectProps {
	value: string;
	options: Record<string, StatusPillOption>;
	onChange: (value: string) => void;
	tone: string;
}

export function StatusPillSelect({
	value,
	options,
	onChange,
	tone,
}: StatusPillSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const [popupPosition, setPopupPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const popupRef = useRef<HTMLDivElement | null>(null);
	const entries = Object.entries(options);

	const updatePosition = useCallback(() => {
		const trigger = triggerRef.current;
		if (!trigger) return;

		const rect = trigger.getBoundingClientRect();
		const popupWidth = 160;
		const popupHeight = popupRef.current?.offsetHeight ?? 200;
		const viewportPadding = 8;

		const left = Math.min(
			Math.max(viewportPadding, rect.left),
			window.innerWidth - popupWidth - viewportPadding,
		);

		const defaultTop = rect.bottom + 8;
		const flippedTop = rect.top - popupHeight - 8;
		const top =
			defaultTop + popupHeight <= window.innerHeight - viewportPadding
				? defaultTop
				: Math.max(viewportPadding, flippedTop);

		setPopupPosition({ top, left });
	}, []);

	useLayoutEffect(() => {
		if (!isOpen) return;

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

	if (entries.length === 0) return null;

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => {
					if (isOpen) {
						setIsOpen(false);
						return;
					}
					setPopupPosition(null);
					setIsOpen(true);
				}}
				className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:brightness-110 transition-all"
				style={{
					color: tone,
					backgroundColor: `color-mix(in srgb, ${tone} 20%, rgb(15, 23, 42))`,
					border: `1px solid ${tone}50`,
				}}
			>
				{value.replace(/_/g, " ")}
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
								aria-label="Close status select"
							/>
							<div
								ref={popupRef}
								className="fixed z-50 min-w-[160px] bg-[#161B26] border border-slate-800 rounded-xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-200"
								style={{
									top: popupPosition.top,
									left: popupPosition.left,
								}}
							>
								{entries.map(([key, opt]) => {
									const isSelected = key === value;
									const isHovered = hoveredKey === key;
									const Icon = opt.icon;
									return (
										<button
											key={key}
											type="button"
											onClick={() => {
												onChange(key);
												setPopupPosition(null);
												setIsOpen(false);
											}}
											onMouseEnter={() => setHoveredKey(key)}
											onMouseLeave={() => setHoveredKey(null)}
											className={cn(
												"w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-all text-left rounded-lg cursor-pointer",
												!(isSelected || isHovered) && "opacity-70",
											)}
											style={
												isSelected || isHovered
													? opt.style
													: { color: opt.style.color }
											}
										>
											<Icon
												className="w-3.5 h-3.5"
												style={
													isSelected || isHovered ? opt.iconStyle : undefined
												}
											/>
											<span className="uppercase tracking-wider whitespace-nowrap">
												{opt.label || key.replace(/_/g, " ")}
											</span>
										</button>
									);
								})}
							</div>
						</>,
						document.body,
					)
				: null}
		</>
	);
}
