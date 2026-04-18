import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ALLOWED_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"image/bmp",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const STALE_UPLOAD_TTL_HOURS = 24;

function getUploadDir(): string {
	return path.join(os.tmpdir(), "kanban-ai", "uploads");
}

export function ensureUploadDir(): string {
	const dir = getUploadDir();

	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	return dir;
}

export function validateUpload(mimeType: string, size: number): string | null {
	if (!ALLOWED_MIME_TYPES.has(mimeType)) {
		return `Unsupported file type: ${mimeType}. Allowed: image/*`;
	}

	if (size > MAX_FILE_SIZE) {
		return `File too large: ${(size / 1024 / 1024).toFixed(1)}MB. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`;
	}

	return null;
}

export async function saveUploadFile(
	file: File,
): Promise<{ storedName: string; absolutePath: string; size: number }> {
	const uploadDir = ensureUploadDir();
	const ext = guessExtension(file.type, file.name);
	const storedName = `${randomUUID()}${ext}`;
	const absolutePath = path.join(uploadDir, storedName);
	const buffer = Buffer.from(await file.arrayBuffer());

	fs.writeFileSync(absolutePath, buffer);

	return { storedName, absolutePath, size: buffer.length };
}

export function deleteUploadFile(absolutePath: string): void {
	try {
		if (fs.existsSync(absolutePath)) {
			fs.unlinkSync(absolutePath);
		}
	} catch (error) {
		console.error(
			"[UploadStorage] Failed to delete file:",
			absolutePath,
			error,
		);
	}
}

export function getStaleTtlHours(): number {
	return STALE_UPLOAD_TTL_HOURS;
}

function guessExtension(mimeType: string, originalName: string): string {
	const ext = path.extname(originalName).toLowerCase();
	if (ext) {
		return ext;
	}

	const mimeToExt: Record<string, string> = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/gif": ".gif",
		"image/webp": ".webp",
		"image/svg+xml": ".svg",
		"image/bmp": ".bmp",
	};

	return mimeToExt[mimeType] || ".bin";
}
