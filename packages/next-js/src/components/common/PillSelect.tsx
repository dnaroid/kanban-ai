import { useState } from "react";
import { LucideIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PillSelectOption {
	icon: LucideIcon;
	color?: string;
	bg?: string;
	border?: string;
	style?: {
		color?: string;
		backgroundColor?: string;
		borderColor?: string;
	};
	iconStyle?: {
		color?: string;
	};
	label?: string;
}

interface PillSelectProps {
	label: string;
	value: string;
	options: Record<string, PillSelectOption>;
	onChange: (value: string) => void;
	className?: string;
	displayValue?: string;
}

export function PillSelect({
	label,
	value,
	options,
	onChange,
	className,
	displayValue,
}: PillSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const entries = Object.entries(options);
	const currentOption = options[value] ?? entries[0]?.[1];

	if (!currentOption) {
		return null;
	}

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
				{label}
			</span>
			<div className="relative">
				<button
					type="button"
					onClick={() => setIsOpen(!isOpen)}
					className={cn(
						"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition-all cursor-pointer hover:brightness-110",
						currentOption.bg,
						currentOption.border,
						isOpen &&
							"ring-1 ring-offset-1 ring-offset-[#0B0E14] ring-slate-700",
					)}
					style={currentOption.style}
				>
					<currentOption.icon
						className={cn("w-3.5 h-3.5", currentOption.color)}
						style={currentOption.iconStyle}
					/>
					<span
						className={cn(
							"text-[11px] font-bold uppercase tracking-wider",
							currentOption.color,
						)}
						style={
							currentOption.style?.color
								? { color: currentOption.style.color }
								: undefined
						}
					>
						{displayValue || value.replace("_", " ")}
					</span>
					<ChevronDown
						className={cn(
							"w-3 h-3 ml-1 opacity-50 transition-transform",
							isOpen && "rotate-180",
							currentOption.color,
						)}
						style={
							currentOption.style?.color
								? { color: currentOption.style.color }
								: undefined
						}
					/>
				</button>

				{isOpen && (
					<>
						<button
							type="button"
							className="fixed inset-0 z-10"
							onClick={() => setIsOpen(false)}
							onKeyDown={(e) => {
								if (e.key === "Escape") setIsOpen(false);
							}}
							aria-label="Close select"
						/>
						<div className="absolute left-0 top-full mt-2 min-w-[140px] bg-[#161B26] border border-slate-800 rounded-xl shadow-2xl z-20 py-1.5 animate-in fade-in zoom-in-95 duration-200">
							{Object.entries(options).map(([key, opt]) => {
								const isSelected = key === value;
								const isHovered = hoveredKey === key;
								return (
									<button
										key={key}
										type="button"
										onClick={() => {
											onChange(key);
											setIsOpen(false);
										}}
										onMouseEnter={() => setHoveredKey(key)}
										onMouseLeave={() => setHoveredKey(null)}
										className={cn(
											"w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-all text-left rounded-lg",
											isSelected || isHovered
												? cn(opt.bg, opt.color)
												: cn(opt.color, "opacity-70"),
										)}
										style={isSelected || isHovered ? opt.style : undefined}
									>
										<opt.icon
											className={cn(
												"w-3.5 h-3.5",
												isSelected || isHovered ? opt.color : "text-slate-500",
											)}
											style={
												isSelected || isHovered
													? (opt.iconStyle ??
														(opt.style?.color
															? { color: opt.style.color }
															: undefined))
													: undefined
											}
										/>
										<span
											className="uppercase tracking-wider whitespace-nowrap"
											style={
												isSelected || isHovered
													? opt.style?.color
														? { color: opt.style.color }
														: undefined
													: undefined
											}
										>
											{opt.label || key.replace("_", " ")}
										</span>
									</button>
								);
							})}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
