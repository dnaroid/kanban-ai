import Database from "better-sqlite3";
import { existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type {
	MessageTokens,
	OpenCodeMessage,
	Part,
	ToolState,
} from "@/types/ipc";

type BuildMessageContent = (parts: Part[]) => string;

interface MessageRow {
	id: string;
	session_id: string;
	time_created: number;
	data: string;
}

interface PartRow {
	id: string;
	message_id: string;
	session_id: string;
	data: string;
}

interface SessionDirectoryRow {
	directory: string;
}

function getStorageDirectoryPath(): string {
	const home = homedir();
	if (process.platform === "darwin") {
		return join(home, "Library", "Application Support", "opencode");
	}

	if (process.platform === "win32") {
		const appData = process.env.APPDATA;
		if (appData) {
			return join(appData, "opencode");
		}
		return join(home, "AppData", "Roaming", "opencode");
	}

	return join(home, ".local", "share", "opencode");
}

function sanitizeChannel(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function getDbCandidatePaths(): string[] {
	const directory = getStorageDirectoryPath();
	const channelCandidates = [
		process.env.OPENCODE_CHANNEL,
		process.env.OPENCODE_INSTALL_CHANNEL,
		process.env.OPENCODE_RELEASE_CHANNEL,
	]
		.map((value) => (typeof value === "string" ? value.trim() : ""))
		.filter((value) => value.length > 0)
		.map((channel) => `opencode-${sanitizeChannel(channel)}.db`);

	const detectedChannelFiles = existsSync(directory)
		? readdirSync(directory).filter(
				(fileName) =>
					fileName.startsWith("opencode-") && fileName.endsWith(".db"),
			)
		: [];

	const uniqueNames = new Set<string>([
		...channelCandidates,
		"opencode.db",
		...detectedChannelFiles,
	]);

	return Array.from(uniqueNames).map((fileName) => join(directory, fileName));
}

export class OpencodeStorageReader {
	private readonly buildMessageContent: BuildMessageContent;
	private db: Database.Database | null = null;
	private dbUnavailable = false;

	constructor(buildMessageContent: BuildMessageContent) {
		this.buildMessageContent = buildMessageContent;
	}

	public async getMessages(
		sessionId: string,
		limit?: number,
	): Promise<OpenCodeMessage[]> {
		try {
			const db = this.getDb();
			if (!db) {
				return [];
			}

			const messageRows =
				typeof limit === "number" && limit > 0
					? (db
							.prepare(
								"SELECT id, session_id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC, id ASC LIMIT ?",
							)
							.all(sessionId, limit) as MessageRow[])
					: (db
							.prepare(
								"SELECT id, session_id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC, id ASC",
							)
							.all(sessionId) as MessageRow[]);

			if (messageRows.length === 0) {
				return [];
			}

			const messageIds = messageRows.map((row) => row.id);
			const placeholders = messageIds.map(() => "?").join(", ");
			const partRows = db
				.prepare(
					`SELECT id, message_id, session_id, data FROM part WHERE message_id IN (${placeholders}) ORDER BY message_id, id`,
				)
				.all(...messageIds) as PartRow[];

			const partsByMessageId = new Map<string, Part[]>();
			for (const row of partRows) {
				const partData = this.parseRecord(row.data);
				const part = this.normalizePart({
					...partData,
					id: row.id,
					messageID: row.message_id,
					sessionID: row.session_id,
				});
				const existing = partsByMessageId.get(row.message_id);
				if (existing) {
					existing.push(part);
				} else {
					partsByMessageId.set(row.message_id, [part]);
				}
			}

			return messageRows.map((row) => {
				const data = this.parseRecord(row.data);
				const parts = partsByMessageId.get(row.id) ?? [];
				const content = this.extractMessageContent(parts, data);
				const role = data.role === "assistant" ? "assistant" : "user";
				const tokens = this.normalizeTokens(data.tokens);

				return {
					id: row.id,
					role,
					content,
					parts,
					timestamp: row.time_created,
					...(role === "assistant"
						? {
								modelID: this.optionalStringValue(data.modelID),
								providerID: this.optionalStringValue(data.providerID),
								variant: this.optionalStringValue(data.variant),
								...(tokens ? { tokens } : {}),
							}
						: {}),
				} satisfies OpenCodeMessage;
			});
		} catch {
			return [];
		}
	}

	public async getSessionDirectory(sessionId: string): Promise<string | null> {
		try {
			const db = this.getDb();
			if (!db) {
				return null;
			}

			const row = db
				.prepare("SELECT directory FROM session WHERE id = ?")
				.get(sessionId) as SessionDirectoryRow | undefined;

			return typeof row?.directory === "string" ? row.directory : null;
		} catch {
			return null;
		}
	}

	private getDb(): Database.Database | null {
		if (this.db) {
			return this.db;
		}

		if (this.dbUnavailable) {
			return null;
		}

		for (const dbPath of getDbCandidatePaths()) {
			if (!existsSync(dbPath)) {
				continue;
			}

			try {
				this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
				return this.db;
			} catch {
				continue;
			}
		}

		this.dbUnavailable = true;
		return null;
	}

	private extractMessageContent(
		parts: Part[],
		data: Record<string, unknown>,
	): string {
		const textContent = parts
			.filter(
				(part): part is Extract<Part, { type: "text" }> => part.type === "text",
			)
			.map((part) => part.text)
			.join("");
		if (textContent.length > 0) {
			return textContent;
		}

		const builtContent = this.buildMessageContent(parts);
		if (builtContent.length > 0) {
			return builtContent;
		}

		const summary = this.asRecord(data.summary);
		return this.toStringValue(summary?.title);
	}

	private normalizePart(raw: Record<string, unknown>): Part {
		const base = {
			id: this.optionalStringValue(raw.id),
			messageID: this.optionalStringValue(raw.messageID),
		};

		switch (raw.type) {
			case "text":
				return { ...base, type: "text", text: this.toStringValue(raw.text) };
			case "reasoning":
				return {
					...base,
					type: "reasoning",
					text: this.toStringValue(raw.text),
				};
			case "file":
				return {
					...base,
					type: "file",
					url: this.toStringValue(raw.url),
					mime: this.toStringValue(raw.mime),
					filename: this.optionalStringValue(raw.filename),
				};
			case "tool": {
				const state = this.asRecord(raw.state);
				return {
					...base,
					type: "tool",
					tool: this.toStringValue(raw.tool),
					state: this.normalizeToolState(state?.status),
					input: state?.input,
					output: state?.output,
					error: this.optionalStringValue(state?.error),
					metadata: this.asRecord(state?.metadata) ?? undefined,
				};
			}
			case "agent":
				return { ...base, type: "agent", name: this.toStringValue(raw.name) };
			case "subtask": {
				const model = this.asRecord(raw.model);
				const providerID = this.optionalStringValue(model?.providerID);
				const modelID = this.optionalStringValue(model?.modelID);
				return {
					...base,
					type: "subtask",
					sessionID: this.toStringValue(raw.sessionID),
					prompt: this.toStringValue(raw.prompt),
					description: this.toStringValue(raw.description),
					agent: this.toStringValue(raw.agent),
					model:
						typeof providerID === "string" && typeof modelID === "string"
							? { providerID, modelID }
							: undefined,
					command: this.optionalStringValue(raw.command),
				};
			}
			case "step-start":
				return { ...base, type: "step-start" };
			case "snapshot":
				return { ...base, type: "snapshot" };
			default:
				return { ...base, type: "other" };
		}
	}

	private parseRecord(value: string): Record<string, unknown> {
		try {
			const parsed = JSON.parse(value) as unknown;
			return this.asRecord(parsed) ?? {};
		} catch {
			return {};
		}
	}

	private normalizeToolState(value: unknown): ToolState {
		if (value === "pending") return "pending";
		if (value === "running") return "running";
		if (value === "completed") return "completed";
		if (value === "error") return "error";
		return "error";
	}

	private normalizeTokens(value: unknown): MessageTokens | undefined {
		const record = this.asRecord(value);
		const cache = this.asRecord(record?.cache);
		if (!record || !cache) {
			return undefined;
		}

		const input = this.asNumber(record.input);
		const output = this.asNumber(record.output);
		const reasoning = this.asNumber(record.reasoning);
		const read = this.asNumber(cache.read);
		const write = this.asNumber(cache.write);
		if (
			input === undefined ||
			output === undefined ||
			reasoning === undefined ||
			read === undefined ||
			write === undefined
		) {
			return undefined;
		}

		return {
			input,
			output,
			reasoning,
			cache: {
				read,
				write,
			},
		};
	}

	private asRecord(value: unknown): Record<string, unknown> | null {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return null;
		}
		return value as Record<string, unknown>;
	}

	private asNumber(value: unknown): number | undefined {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
		return undefined;
	}

	private toStringValue(value: unknown): string {
		return typeof value === "string" ? value : "";
	}

	private optionalStringValue(value: unknown): string | undefined {
		return typeof value === "string" ? value : undefined;
	}
}
