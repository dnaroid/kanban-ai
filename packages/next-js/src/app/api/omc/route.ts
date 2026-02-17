import { NextRequest, NextResponse } from "next/server";
import { appSettingsRepo } from "@/server/repositories";
import { readConfig, resolveOmcPath, saveConfig } from "@/server/omc/io";

export async function GET(request: NextRequest) {
	try {
		const pathFromRequest = request.nextUrl.searchParams.get("path");
		const pathToConfig = resolveOmcPath(pathFromRequest);

		if (!pathToConfig) {
			return NextResponse.json(
				{ success: false, error: "ohMyOpencodePath is not configured" },
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
			error instanceof Error ? error.message : "Failed to read OMC config";
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

		const pathToConfig = resolveOmcPath(body.path);
		if (!pathToConfig) {
			return NextResponse.json(
				{ success: false, error: "ohMyOpencodePath is not configured" },
				{ status: 400 },
			);
		}

		if (body.path && body.path.trim().length > 0) {
			appSettingsRepo.set("ohMyOpencodePath", body.path);
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
			error instanceof Error ? error.message : "Failed to save OMC config";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
