import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface DirEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	isFile: boolean;
}

interface BrowseResponse {
	currentPath: string;
	parentPath: string | null;
	homePath: string;
	entries: DirEntry[];
}

export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams;
		const targetPath = searchParams.get("path") || os.homedir();
		const normalizedPath = path.resolve(targetPath);
		const homePath = os.homedir();

		if (!fs.existsSync(normalizedPath)) {
			return NextResponse.json(
				{ error: "Path does not exist" },
				{ status: 404 },
			);
		}

		const stats = fs.statSync(normalizedPath);
		if (!stats.isDirectory()) {
			return NextResponse.json(
				{ error: "Path is not a directory" },
				{ status: 400 },
			);
		}

		const entries: DirEntry[] = [];
		const dirents = fs.readdirSync(normalizedPath, { withFileTypes: true });

		for (const dirent of dirents) {
			if (dirent.name.startsWith(".")) continue;
			entries.push({
				name: dirent.name,
				path: path.join(normalizedPath, dirent.name),
				isDirectory: dirent.isDirectory(),
				isFile: dirent.isFile(),
			});
		}

		entries.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		const parentPath = path.dirname(normalizedPath);
		const hasParent = parentPath !== normalizedPath;

		const response: BrowseResponse = {
			currentPath: normalizedPath,
			parentPath: hasParent ? parentPath : null,
			homePath,
			entries,
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error("Browse error:", error);
		return NextResponse.json(
			{ error: "Failed to browse directory" },
			{ status: 500 },
		);
	}
}
