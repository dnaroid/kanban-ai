import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { appSettingsRepo } from "@/server/repositories";
import { readConfig, saveConfig } from "@/server/omc/io";

function getDefaultOpencodeConfigPath(): string {
	const platform = os.platform();
	const homeDir = os.homedir();

	if (platform === "win32") {
		const appData =
			process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
		return path.join(appData, "opencode", "opencode.json");
	}

	return path.join(homeDir, ".config", "opencode", "opencode.json");
}

function resolveOpencodeConfigPath(
	pathFromRequest?: string | null,
): string | null {
	if (pathFromRequest && pathFromRequest.trim().length > 0) {
		return pathFromRequest;
	}

	const stored = appSettingsRepo.get("opencodeConfigPath");
	if (stored) return stored;

	const defaultPath = getDefaultOpencodeConfigPath();
	try {
		if (fs.existsSync(defaultPath)) return defaultPath;
	} catch {
		// ignore
	}

	return null;
}

export async function GET(request: NextRequest) {
	try {
		const pathFromRequest = request.nextUrl.searchParams.get("path");
		const pathToConfig = resolveOpencodeConfigPath(pathFromRequest);

		if (!pathToConfig) {
			return NextResponse.json(
				{ success: false, error: "opencodeConfigPath is not configured" },
				{ status: 400 },
			);
		}

		const config = await readConfig(pathToConfig);
		return NextResponse.json({
			success: true,
			data: { config, path: pathToConfig },
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to read opencode config";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as {
			path?: string;
			config?: unknown;
		};

		const pathToConfig = resolveOpencodeConfigPath(body.path);
		if (!pathToConfig) {
			return NextResponse.json(
				{ success: false, error: "opencodeConfigPath is not configured" },
				{ status: 400 },
			);
		}

		if (body.path && body.path.trim().length > 0) {
			appSettingsRepo.set("opencodeConfigPath", body.path);
		}

		if (body.config === undefined) {
			return NextResponse.json(
				{ success: false, error: "config is required" },
				{ status: 400 },
			);
		}

		await saveConfig(pathToConfig, body.config);
		return NextResponse.json({ success: true, data: { ok: true } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to save opencode config";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
