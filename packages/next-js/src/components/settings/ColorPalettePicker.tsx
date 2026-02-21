"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_PRESET_COLORS } from "@/components/settings/color-palette";

interface ColorPalettePickerProps {
	value: string;
	onChange: (color: string) => void;
	label?: string;
	palette?: readonly string[];
	className?: string;
}

export function ColorPalettePicker({
	value,
	onChange,
	label = "Color Signature",
	palette = DEFAULT_PRESET_COLORS,
	className,
}: ColorPalettePickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const popupRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const updatePosition = () => {
			const trigger = triggerRef.current;
			if (!trigger) {
				return;
			}

			const rect = trigger.getBoundingClientRect();
			const popupWidth = 224;
			const popupHeight = popupRef.current?.offsetHeight ?? 260;
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
		};

		updatePosition();
		const frame = window.requestAnimationFrame(updatePosition);

		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);

		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	}, [isOpen]);

	return (
		<div className={cn("space-y-3", className)}>
			<div className="flex items-center justify-between pl-1">
				<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
					<Palette className="h-3.5 w-3.5" />
					{label}
				</span>
				<div className="relative">
					<button
						ref={triggerRef}
						type="button"
						onClick={() => setIsOpen((prev) => !prev)}
						className={cn(
							"flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[10px] font-mono uppercase transition-colors",
							isOpen
								? "border-slate-600 bg-slate-900 text-slate-200"
								: "border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-700 hover:text-slate-300",
						)}
					>
						<div
							className="h-4 w-4 rounded-full ring-1 ring-white/20 shadow-sm"
							style={{ backgroundColor: value }}
						/>
						<span>{value}</span>
					</button>

					{isOpen
						? createPortal(
								<>
									<button
										type="button"
										className="fixed inset-0 z-40 cursor-default"
										onClick={() => setIsOpen(false)}
										aria-label="Close color picker"
									/>
									<div
										ref={popupRef}
										className="fixed z-50 w-56 rounded-2xl border border-slate-800 bg-[#161B26] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
										style={{ top: popupPosition.top, left: popupPosition.left }}
									>
										<div className="mb-3 flex items-center gap-2">
											<input
												type="text"
												value={value}
												onChange={(e) => onChange(e.target.value)}
												className="h-8 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2 text-[10px] font-mono text-slate-300 uppercase outline-none focus:border-slate-600"
											/>
											<div className="relative h-8 w-8 overflow-hidden rounded-lg border border-slate-800">
												<input
													type="color"
													value={value}
													onChange={(e) => onChange(e.target.value)}
													className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
												/>
												<div
													className="h-full w-full"
													style={{ backgroundColor: value }}
												/>
											</div>
										</div>

										<div className="grid grid-cols-6 gap-2">
											{palette.map((color) => (
												<button
													key={color}
													type="button"
													onClick={() => {
														onChange(color);
														setIsOpen(false);
													}}
													className={cn(
														"relative flex aspect-square items-center justify-center rounded-lg transition-all",
														value === color
															? "scale-110 ring-2 ring-white/40 shadow-[0_0_15px_rgba(0,0,0,0.4)]"
															: "hover:scale-110",
													)}
													style={{
														backgroundColor: color,
														boxShadow:
															value === color ? `0 0 16px ${color}50` : "none",
													}}
												>
													{value === color ? (
														<Check className="h-3.5 w-3.5 text-white drop-shadow-md" />
													) : null}
												</button>
											))}
										</div>
									</div>
								</>,
								document.body,
							)
						: null}
				</div>
			</div>
		</div>
	);
}
