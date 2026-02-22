import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { resolveOmcPath } from "@/server/omc/io";

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as { path?: string };
		const pathToConfig = resolveOmcPath(body.path);

		if (!pathToConfig) {
			return NextResponse.json(
				{ success: false, error: "ohMyOpencodePath is not configured" },
				{ status: 400 },
			);
		}

		const backupPath = `${pathToConfig}.backup`;
		const backupContent = await fs.readFile(backupPath, "utf-8");
		await fs.writeFile(pathToConfig, backupContent, "utf-8");

		return NextResponse.json({ success: true, data: { ok: true } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to restore OMC config";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
