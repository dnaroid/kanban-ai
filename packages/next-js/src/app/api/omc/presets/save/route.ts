import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { buildPresetPath, resolveOmcPath } from "@/server/omc/io";

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as {
			path?: string;
			presetName?: string;
			config?: unknown;
		};

		if (!body.presetName || body.presetName.trim().length === 0) {
			return NextResponse.json(
				{ success: false, error: "presetName is required" },
				{ status: 400 },
			);
		}

		if (body.config === undefined) {
			return NextResponse.json(
				{ success: false, error: "config is required" },
				{ status: 400 },
			);
		}

		const pathToConfig = resolveOmcPath(body.path);
		if (!pathToConfig) {
			return NextResponse.json(
				{ success: false, error: "ohMyOpencodePath is not configured" },
				{ status: 400 },
			);
		}

		const presetName = body.presetName
			.trim()
			.replace(/\.oh-my-openagent\.json$/i, "");
		const presetPath = buildPresetPath(pathToConfig, presetName);

		await fs.writeFile(
			presetPath,
			JSON.stringify(body.config, null, 2),
			"utf-8",
		);

		return NextResponse.json({
			success: true,
			data: { ok: true, presetPath },
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to save OMC preset";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
