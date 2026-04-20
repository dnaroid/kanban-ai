import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { parse as parseJsonc, ParseError } from "jsonc-parser";
import { appSettingsRepo } from "@/server/repositories";

export const OMC_PRESET_SUFFIX = ".oh-my-openagent.json";
export const OMC_ORIGINAL_PRESET_NAME = `_original${OMC_PRESET_SUFFIX}`;

export function parseMaybeJsonc(content: string): unknown {
	const errors: ParseError[] = [];
	const result = parseJsonc(content, errors, { allowTrailingComma: true });
	if (errors.length > 0) {
		throw new Error(`Failed to parse JSONC: ${errors.length} error(s)`);
	}
	return result;
}

export function resolveOmcPath(pathFromRequest?: string | null): string | null {
	if (pathFromRequest && pathFromRequest.trim().length > 0) {
		return pathFromRequest;
	}
	return appSettingsRepo.get("ohMyOpencodePath");
}

export async function readConfig(pathToConfig: string): Promise<unknown> {
	const content = await fs.readFile(pathToConfig, "utf-8");
	return parseMaybeJsonc(content);
}

export async function saveConfig(
	pathToConfig: string,
	config: unknown,
): Promise<void> {
	const originalPath = path.join(
		path.dirname(pathToConfig),
		OMC_ORIGINAL_PRESET_NAME,
	);

	const originalExists = await fs
		.stat(originalPath)
		.then(() => true)
		.catch(() => false);

	if (!originalExists) {
		const currentContent = await fs.readFile(pathToConfig, "utf-8");
		await fs.writeFile(originalPath, currentContent, "utf-8");
	}

	await fs.writeFile(pathToConfig, JSON.stringify(config, null, 2), "utf-8");
}

export async function listPresets(pathToConfig: string): Promise<string[]> {
	const presetDir = path.dirname(pathToConfig);
	const baseConfigName = path.basename(pathToConfig);
	const entries = await fs.readdir(presetDir);

	return entries
		.filter(
			(entry) =>
				entry.endsWith(OMC_PRESET_SUFFIX) &&
				entry !== OMC_ORIGINAL_PRESET_NAME &&
				entry !== baseConfigName,
		)
		.map((entry) => entry.replace(OMC_PRESET_SUFFIX, ""))
		.sort((a, b) => a.localeCompare(b));
}

export function buildPresetPath(
	pathToConfig: string,
	presetName: string,
): string {
	return path.join(
		path.dirname(pathToConfig),
		`${presetName}${OMC_PRESET_SUFFIX}`,
	);
}

function sortObjectKeys(obj: unknown): unknown {
	if (obj === null || typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map(sortObjectKeys);
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
		sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
	}
	return sorted;
}

/**
 * Compute a deterministic SHA-256 hash — key order and whitespace are normalized.
 */
export function computeContentHash(content: unknown): string {
	const sorted = sortObjectKeys(content);
	const normalized = JSON.stringify(sorted);
	return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function detectMatchingPreset(
	pathToConfig: string,
): Promise<string | null> {
	const config = await readConfig(pathToConfig);
	const configHash = computeContentHash(config);
	const presetNames = await listPresets(pathToConfig);

	for (const presetName of presetNames) {
		const presetPath = buildPresetPath(pathToConfig, presetName);
		const presetContent = await readConfig(presetPath);
		const presetHash = computeContentHash(presetContent);
		if (presetHash === configHash) {
			return presetName;
		}
	}
	return null;
}
