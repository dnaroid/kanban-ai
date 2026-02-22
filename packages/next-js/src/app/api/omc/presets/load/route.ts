import { NextRequest, NextResponse } from "next/server";
import {
	buildPresetPath,
	parseMaybeJsonc,
	resolveOmcPath,
} from "@/server/omc/io";
import fs from "fs/promises";

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as {
			path?: string;
			presetName?: string;
		};

		if (!body.presetName || body.presetName.trim().length === 0) {
			return NextResponse.json(
				{ success: false, error: "presetName is required" },
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

		const presetPath = buildPresetPath(pathToConfig, body.presetName.trim());
		const content = await fs.readFile(presetPath, "utf-8");
		const config = parseMaybeJsonc(content);

		return NextResponse.json({ success: true, data: { config } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to load OMC preset";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
