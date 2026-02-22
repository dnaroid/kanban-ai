import { NextResponse } from "next/server";
import {
	exportModelsConfig,
	importModelsConfig,
	getCurrentModelsHash,
	type ModelsExportData,
} from "@/server/opencode/models-store";

export async function GET() {
	try {
		const config = exportModelsConfig();
		return NextResponse.json({ success: true, data: config });
	} catch (error) {
		console.error("Failed to export models config:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to export models config" },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	try {
		const data = (await request.json()) as ModelsExportData;
		if (!data.models || !Array.isArray(data.models)) {
			return NextResponse.json(
				{ success: false, error: "Invalid config format" },
				{ status: 400 },
			);
		}

		const currentHash = getCurrentModelsHash();
		const hashMismatch =
			data.allModelsHash && data.allModelsHash !== currentHash;

		const result = importModelsConfig(data);
		return NextResponse.json({
			success: true,
			data: {
				...result,
				hashMismatch,
				currentHash,
				fileHash: data.allModelsHash,
			},
		});
	} catch (error) {
		console.error("Failed to import models config:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to import models config" },
			{ status: 500 },
		);
	}
}
