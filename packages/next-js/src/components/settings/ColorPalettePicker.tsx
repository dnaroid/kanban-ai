"use client";

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
	return (
		<div className={cn("space-y-3", className)}>
			<div className="flex items-center justify-between pl-1">
				<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
					<Palette className="h-3.5 w-3.5" />
					{label}
				</span>
				<div className="flex items-center gap-2">
					<input
						type="text"
						value={value}
						onChange={(e) => onChange(e.target.value)}
						className="w-16 bg-transparent border-none text-[10px] font-mono text-slate-500 uppercase text-right focus:outline-none"
					/>
					<div className="relative h-4 w-4">
						<input
							type="color"
							value={value}
							onChange={(e) => onChange(e.target.value)}
							className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
						/>
						<div
							className="h-4 w-4 rounded-full ring-1 ring-white/20 shadow-sm"
							style={{ backgroundColor: value }}
						/>
					</div>
				</div>
			</div>
			<div className="grid grid-cols-6 gap-2.5 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
				{palette.map((color) => (
					<button
						key={color}
						type="button"
						onClick={() => onChange(color)}
						className={cn(
							"relative flex aspect-square items-center justify-center rounded-xl transition-all duration-500",
							value === color
								? "scale-110 ring-2 ring-white/30 shadow-[0_0_25px_rgba(0,0,0,0.4)]"
								: "shadow-sm hover:scale-110",
						)}
						style={{
							backgroundColor: color,
							boxShadow: value === color ? `0 0 20px ${color}50` : "none",
						}}
					>
						{value === color ? (
							<Check className="h-4 w-4 animate-in zoom-in-50 duration-500 text-white drop-shadow-md" />
						) : null}
					</button>
				))}
			</div>
		</div>
	);
}
