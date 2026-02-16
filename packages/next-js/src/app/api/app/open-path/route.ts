import { execFile } from "child_process";
import { access } from "fs/promises";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

type OpenPathRequestBody = {
	path?: unknown;
};

function getOpenCommand(targetPath: string): {
	command: string;
	args: string[];
} {
	if (process.platform === "darwin") {
		return { command: "open", args: [targetPath] };
	}

	if (process.platform === "win32") {
		return {
			command: "cmd",
			args: ["/c", "start", "", targetPath],
		};
	}

	return { command: "xdg-open", args: [targetPath] };
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as OpenPathRequestBody;
		const targetPath = typeof body.path === "string" ? body.path.trim() : "";

		if (!targetPath) {
			return NextResponse.json(
				{ success: false, error: "path is required" },
				{ status: 400 },
			);
		}

		await access(targetPath);

		const { command, args } = getOpenCommand(targetPath);
		await execFileAsync(command, args);

		return NextResponse.json({ success: true, data: { success: true } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to open path";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
