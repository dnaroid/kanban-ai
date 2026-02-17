import fs from "fs/promises";
import path from "path";
import { appSettingsRepo } from "@/server/repositories";

export const OMC_PRESET_SUFFIX = ".oh-my-opencode.json";
export const OMC_ORIGINAL_PRESET_NAME = `_original${OMC_PRESET_SUFFIX}`;

function stripJsonComments(content: string): string {
	return content
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|\s)\/\/.*$/gm, "$1");
}

export function parseMaybeJsonc(content: string): unknown {
	try {
		return JSON.parse(content);
	} catch {
		return JSON.parse(stripJsonComments(content));
	}
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
