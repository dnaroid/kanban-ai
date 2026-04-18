import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Returns a readable text color ("#ffffff" or "#1e293b") for a given hex background.
 * Uses the W3C relative luminance formula with a 0.179 threshold.
 */
export function getContrastColor(hex: string): "#ffffff" | "#1e293b" {
	const raw = hex.replace("#", "");
	const full =
		raw.length === 3
			? raw
					.split("")
					.map((c) => c + c)
					.join("")
			: raw;
	const r = Number.parseInt(full.slice(0, 2), 16);
	const g = Number.parseInt(full.slice(2, 4), 16);
	const b = Number.parseInt(full.slice(4, 6), 16);
	// ITU-R BT.709 relative luminance
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.55 ? "#1e293b" : "#ffffff";
}
