"use client";

import { useState } from "react";
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

	return (
		<div className={cn("space-y-3", className)}>
			<div className="flex items-center justify-between pl-1">
				<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
					<Palette className="h-3.5 w-3.5" />
					{label}
				</span>
				<div className="relative">
					<button
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

					{isOpen && (
						<>
							<button
								type="button"
								className="fixed inset-0 z-10 cursor-default"
								onClick={() => setIsOpen(false)}
								aria-label="Close color picker"
							/>
							<div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-slate-800 bg-[#161B26] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
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
						</>
					)}
				</div>
			</div>
		</div>
	);
}
