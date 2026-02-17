import fs from "fs";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const targetPath = request.nextUrl.searchParams.get("path");
		if (!targetPath) {
			return NextResponse.json(
				{ success: false, error: "path query parameter is required" },
				{ status: 400 },
			);
		}

		const exists = fs.existsSync(targetPath);
		return NextResponse.json({ success: true, data: { exists } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to check path existence";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
