import { homedir } from "os";
import { join } from "path";
import { readdir, readFile } from "fs/promises";
import type { OpenCodeMessage, Part } from "@/types/ipc";

function getStorageBasePath(): string {
	const home = homedir();
	if (process.platform === "darwin") {
		return join(home, "Library", "Application Support", "opencode", "storage");
	}

	if (process.platform === "win32") {
		const appData = process.env.APPDATA;
		if (appData) {
			return join(appData, "opencode", "storage");
		}
		return join(home, "AppData", "Roaming", "opencode", "storage");
	}

	return join(home, ".local", "share", "opencode", "storage");
}

type BuildMessageContent = (parts: Part[]) => string;

export class OpencodeStorageReader {
	private readonly storageBasePath = getStorageBasePath();
	private readonly buildMessageContent: BuildMessageContent;

	constructor(buildMessageContent: BuildMessageContent) {
		this.buildMessageContent = buildMessageContent;
	}

	public async getMessagesFromFilesystem(
		sessionId: string,
		limit?: number,
	): Promise<OpenCodeMessage[]> {
		try {
			const messageDir = join(this.storageBasePath, "message", sessionId);
			let messageFiles = await readdir(messageDir);
			messageFiles = messageFiles
				.filter(
					(fileName) =>
						fileName.startsWith("msg_") && fileName.endsWith(".json"),
				)
				.sort();

			if (limit && limit > 0 && messageFiles.length > limit) {
				messageFiles = messageFiles.slice(-limit);
			}

			const messages = await Promise.all(
				messageFiles.map(async (fileName) => {
					try {
						const filePath = join(messageDir, fileName);
						const content = await readFile(filePath, "utf-8");
						const messageData = JSON.parse(content) as {
							id?: string;
							role?: "user" | "assistant";
							time?: { created?: number };
							content?: string;
							summary?: { title?: string };
						};

						if (!messageData.id) {
							return null;
						}

						const parts = await this.loadPartsForMessage(messageData.id);
						const contentText =
							(messageData.content?.trim() ??
								this.buildMessageContent(parts)) ||
							messageData.summary?.title ||
							"";

						return {
							id: messageData.id,
							role: messageData.role === "assistant" ? "assistant" : "user",
							content: contentText,
							timestamp: messageData.time?.created ?? Date.now(),
							parts,
						} satisfies OpenCodeMessage;
					} catch {
						return null;
					}
				}),
			);

			return messages
				.filter((message): message is OpenCodeMessage => message !== null)
				.sort((a, b) => a.timestamp - b.timestamp);
		} catch {
			return [];
		}
	}

	public async getSessionDirectoryFromStorage(
		sessionId: string,
	): Promise<string | null> {
		try {
			const sessionPath = join(
				this.storageBasePath,
				"session",
				`${sessionId}.json`,
			);
			const content = await readFile(sessionPath, "utf8");
			const data = JSON.parse(content) as { directory?: string; dir?: string };
			return data.directory ?? data.dir ?? null;
		} catch {
			return null;
		}
	}

	private async loadPartsForMessage(messageId: string): Promise<Part[]> {
		try {
			const partDir = join(this.storageBasePath, "part", messageId);
			const partFiles = (await readdir(partDir))
				.filter(
					(fileName) =>
						fileName.startsWith("prt_") && fileName.endsWith(".json"),
				)
				.sort();

			const parts = await Promise.all(
				partFiles.map(async (fileName) => {
					try {
						const filePath = join(partDir, fileName);
						const content = await readFile(filePath, "utf-8");
						return this.normalizePart(
							JSON.parse(content) as Record<string, unknown>,
						);
					} catch {
						return null;
					}
				}),
			);

			return parts.filter((part): part is Part => part !== null);
		} catch {
			return [];
		}
	}

	private normalizePart(raw: Record<string, unknown>): Part | null {
		const type = raw.type;
		if (type === "text") {
			return { type: "text", text: this.toStringValue(raw.text) };
		}

		if (type === "reasoning") {
			return { type: "reasoning", text: this.toStringValue(raw.text) };
		}

		if (type === "file") {
			return {
				type: "file",
				url: this.toStringValue(raw.url),
				mime: this.toStringValue(raw.mime),
				filename: this.optionalStringValue(raw.filename),
			};
		}

		if (type === "tool") {
			const state = this.normalizeToolState(raw.state);

			const stateObj =
				typeof raw.state === "object" && raw.state !== null
					? (raw.state as Record<string, unknown>)
					: null;

			return {
				type: "tool",
				tool: this.toStringValue(raw.tool),
				state,
				input: stateObj?.input ?? raw.input,
				output: stateObj?.output ?? raw.output,
				error: this.optionalStringValue(stateObj?.error ?? raw.error),
			};
		}

		if (type === "agent") {
			return { type: "agent", name: this.toStringValue(raw.name) };
		}

		if (type === "step-start") {
			return { type: "step-start" };
		}

		if (type === "snapshot") {
			return { type: "snapshot" };
		}

		return { type: "other" };
	}

	private normalizeToolState(
		value: unknown,
	): "pending" | "running" | "completed" | "error" {
		let stateStr = "";
		if (typeof value === "string") {
			stateStr = value.trim().toLowerCase();
		} else if (
			typeof value === "object" &&
			value !== null &&
			"status" in value
		) {
			const status = value.status;
			if (typeof status === "string") {
				stateStr = status.trim().toLowerCase();
			}
		}

		if (stateStr === "pending") return "pending";

		if (
			stateStr === "running" ||
			stateStr === "in_progress" ||
			stateStr === "in-progress"
		) {
			return "running";
		}

		if (
			stateStr === "completed" ||
			stateStr === "complete" ||
			stateStr === "done" ||
			stateStr === "success" ||
			stateStr === "succeeded" ||
			stateStr === "result" ||
			stateStr === "finished"
		) {
			return "completed";
		}

		return "error";
	}

	private toStringValue(value: unknown): string {
		return typeof value === "string" ? value : "";
	}

	private optionalStringValue(value: unknown): string | undefined {
		return typeof value === "string" ? value : undefined;
	}
}
