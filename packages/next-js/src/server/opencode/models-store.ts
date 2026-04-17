import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { dbManager } from "@/server/db";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import type { OpencodeModel } from "@/types/ipc";

type Difficulty = OpencodeModel["difficulty"];

function normalizeModelRows(rows: unknown[]): OpencodeModel[] {
	return rows.map((row) => {
		const record = row as {
			name: string;
			enabled: number;
			difficulty: Difficulty;
			variants?: string;
			context_limit?: number;
		};
		return {
			name: record.name,
			enabled: Boolean(record.enabled),
			difficulty: record.difficulty,
			variants: record.variants ?? "",
			contextLimit:
				typeof record.context_limit === "number" && record.context_limit > 0
					? record.context_limit
					: undefined,
		};
	});
}

function getProviderModels(
	providersPayload: unknown,
): Array<{ name: string; variants: string[]; contextLimit: number }> {
	const payloadRecord =
		typeof providersPayload === "object" && providersPayload !== null
			? (providersPayload as Record<string, unknown>)
			: null;
	const dataRecord =
		payloadRecord && typeof payloadRecord.data === "object"
			? (payloadRecord.data as Record<string, unknown>)
			: payloadRecord;

	const allProviders = Array.isArray(dataRecord?.all)
		? (dataRecord.all as unknown[])
		: [];
	const connectedProviders = new Set(
		Array.isArray(dataRecord?.connected)
			? (dataRecord.connected as string[])
			: [],
	);

	const modelData = new Map<
		string,
		{ variants: Set<string>; contextLimit: number }
	>();

	for (const providerEntry of allProviders) {
		if (typeof providerEntry !== "object" || providerEntry === null) continue;
		const provider = providerEntry as {
			id?: string;
			models?: Record<string, unknown>;
		};

		if (!provider.id || !connectedProviders.has(provider.id)) continue;

		const models = Object.values(provider.models ?? {});
		for (const modelEntry of models) {
			if (typeof modelEntry !== "object" || modelEntry === null) continue;
			const model = modelEntry as {
				id?: string;
				variants?: Record<string, unknown>;
				limit?: { context?: number };
			};
			if (!model.id) continue;

			const baseName = `${provider.id}/${model.id}`;
			const existing = modelData.get(baseName) ?? {
				variants: new Set<string>(),
				contextLimit: 0,
			};
			for (const variantName of Object.keys(model.variants ?? {})) {
				if (variantName.trim().length > 0) existing.variants.add(variantName);
			}
			if (typeof model.limit?.context === "number" && model.limit.context > 0) {
				existing.contextLimit = model.limit.context;
			}
			modelData.set(baseName, existing);
		}
	}

	return Array.from(modelData.entries()).map(
		([name, { variants: variantsSet, contextLimit }]) => ({
			name,
			variants: Array.from(variantsSet).sort(),
			contextLimit,
		}),
	);
}

export function listAllModels(): OpencodeModel[] {
	const db = dbManager.connect();
	const rows = db
		.prepare(
			`SELECT name, enabled, difficulty, COALESCE(variants, '') as variants, COALESCE(context_limit, 0) as context_limit FROM opencode_models ORDER BY name ASC`,
		)
		.all() as unknown[];
	return normalizeModelRows(rows);
}

export function listEnabledModels(): OpencodeModel[] {
	const db = dbManager.connect();
	const rows = db
		.prepare(
			`SELECT name, enabled, difficulty, COALESCE(variants, '') as variants, COALESCE(context_limit, 0) as context_limit FROM opencode_models WHERE enabled = 1 ORDER BY name ASC`,
		)
		.all() as unknown[];
	return normalizeModelRows(rows);
}

export function toggleModel(
	name: string,
	enabled: boolean,
): OpencodeModel | null {
	const db = dbManager.connect();
	const result = db
		.prepare(`UPDATE opencode_models SET enabled = ? WHERE name = ?`)
		.run(enabled ? 1 : 0, name);

	if (result.changes === 0) return null;

	const row = db
		.prepare(
			`SELECT name, enabled, difficulty, COALESCE(variants, '') as variants, COALESCE(context_limit, 0) as context_limit FROM opencode_models WHERE name = ?`,
		)
		.get(name) as unknown;

	if (!row) return null;
	return normalizeModelRows([row])[0] ?? null;
}

export function updateModelDifficulty(
	name: string,
	difficulty: Difficulty,
): OpencodeModel | null {
	const db = dbManager.connect();
	const result = db
		.prepare(`UPDATE opencode_models SET difficulty = ? WHERE name = ?`)
		.run(difficulty, name);

	if (result.changes === 0) return null;

	const row = db
		.prepare(
			`SELECT name, enabled, difficulty, COALESCE(variants, '') as variants, COALESCE(context_limit, 0) as context_limit FROM opencode_models WHERE name = ?`,
		)
		.get(name) as unknown;

	if (!row) return null;
	return normalizeModelRows([row])[0] ?? null;
}

export async function refreshModelsFromProviders(): Promise<OpencodeModel[]> {
	const service = getOpencodeService();
	await service.start();

	const baseUrl =
		process.env.OPENCODE_URL ?? `http://127.0.0.1:${service.getPort()}`;
	const client = createOpencodeClient({
		baseUrl,
		throwOnError: true,
		directory: process.cwd(),
	});

	const providers = await client.provider.list();
	const sdkModels = getProviderModels(providers);

	const db = dbManager.connect();
	const normalized = sdkModels
		.map((entry) => ({
			name: entry.name.trim(),
			variants: Array.from(new Set(entry.variants.map((v) => v.trim()))).filter(
				Boolean,
			),
			contextLimit: entry.contextLimit,
		}))
		.filter((entry) => entry.name.length > 0);

	const byName = new Map<string, { variants: string; contextLimit: number }>();
	for (const model of normalized) {
		byName.set(model.name, {
			variants: model.variants.sort().join(","),
			contextLimit: model.contextLimit,
		});
	}

	const existingRows = db
		.prepare(`SELECT name FROM opencode_models`)
		.all() as Array<{
		name: string;
	}>;
	const insertStmt = db.prepare(
		`INSERT OR IGNORE INTO opencode_models (name, variants) VALUES (?, ?)`,
	);
	const updateStmt = db.prepare(
		`UPDATE opencode_models SET variants = ?, context_limit = ? WHERE name = ?`,
	);
	const deleteStmt = db.prepare(`DELETE FROM opencode_models WHERE name = ?`);

	const tx = db.transaction(() => {
		for (const [name, data] of byName.entries()) {
			insertStmt.run(name, data.variants);
			updateStmt.run(data.variants, data.contextLimit, name);
		}

		const keep = new Set(byName.keys());
		for (const row of existingRows) {
			if (!keep.has(row.name)) {
				deleteStmt.run(row.name);
			}
		}
	});

	tx();
	return listAllModels();
}

export type ModelsExportData = {
	version: 1;
	exportedAt: string;
	models: Array<{
		name: string;
		difficulty: Difficulty;
	}>;
	defaultModels: Record<string, string>;
	allModelsHash: string;
};

function computeModelsHash(modelNames: string[]): string {
	let hash = 0;
	const sorted = [...modelNames].sort().join(",");
	for (let i = 0; i < sorted.length; i++) {
		const char = sorted.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(16).padStart(8, "0");
}

export function exportModelsConfig(): ModelsExportData {
	const db = dbManager.connect();

	const allRows = db
		.prepare(`SELECT name FROM opencode_models ORDER BY name ASC`)
		.all() as Array<{ name: string }>;

	const allModelsHash = computeModelsHash(allRows.map((r) => r.name));

	const enabledRows = db
		.prepare(
			`SELECT name, difficulty FROM opencode_models WHERE enabled = 1 ORDER BY name ASC`,
		)
		.all() as Array<{
		name: string;
		difficulty: string;
	}>;

	const models = enabledRows.map((row) => ({
		name: row.name,
		difficulty: row.difficulty as Difficulty,
	}));

	const defaultModels: Record<string, string> = {};
	const difficulties: Difficulty[] = ["easy", "medium", "hard", "epic"];

	for (const diff of difficulties) {
		const row = db
			.prepare(`SELECT value FROM app_settings WHERE key = ?`)
			.get(`defaultModel_${diff}`) as { value: string } | undefined;
		if (row?.value) {
			defaultModels[diff] = row.value;
		}
	}

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		models,
		defaultModels,
		allModelsHash,
	};
}

export function getCurrentModelsHash(): string {
	const db = dbManager.connect();
	const rows = db
		.prepare(`SELECT name FROM opencode_models ORDER BY name ASC`)
		.all() as Array<{ name: string }>;
	return computeModelsHash(rows.map((r) => r.name));
}

export function importModelsConfig(data: ModelsExportData): {
	imported: number;
	skipped: number;
} {
	const db = dbManager.connect();
	const existingNames = new Set(
		(
			db.prepare(`SELECT name FROM opencode_models`).all() as Array<{
				name: string;
			}>
		).map((r) => r.name),
	);

	let imported = 0;
	let skipped = 0;

	const tx = db.transaction(() => {
		db.prepare(`UPDATE opencode_models SET enabled = 0`).run();

		for (const model of data.models) {
			if (!existingNames.has(model.name)) {
				skipped++;
				continue;
			}

			db.prepare(
				`UPDATE opencode_models SET enabled = 1, difficulty = ? WHERE name = ?`,
			).run(model.difficulty, model.name);
			imported++;
		}

		if (data.defaultModels) {
			for (const [difficulty, modelName] of Object.entries(
				data.defaultModels,
			)) {
				db.prepare(
					`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`,
				).run(`defaultModel_${difficulty}`, modelName);
			}
		}
	});

	tx();

	return { imported, skipped };
}
