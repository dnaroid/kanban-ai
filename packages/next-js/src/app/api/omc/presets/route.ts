import { NextRequest, NextResponse } from "next/server";
import {
	detectMatchingPreset,
	listPresets,
	resolveOmcPath,
} from "@/server/omc/io";

export async function GET(request: NextRequest) {
	try {
		const pathToConfig = resolveOmcPath(
			request.nextUrl.searchParams.get("path"),
		);
		if (!pathToConfig) {
			return NextResponse.json(
				{ success: false, error: "ohMyOpencodePath is not configured" },
				{ status: 400 },
			);
		}

		const presets = await listPresets(pathToConfig);
		const matchingPreset = await detectMatchingPreset(pathToConfig);
		return NextResponse.json({
			success: true,
			data: { presets, matchingPreset },
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list OMC presets";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
