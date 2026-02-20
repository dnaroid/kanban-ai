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
		};
		return {
			name: record.name,
			enabled: Boolean(record.enabled),
			difficulty: record.difficulty,
			variants: record.variants ?? "",
		};
	});
}

function getProviderModels(
	providersPayload: unknown,
): Array<{ name: string; variants: string[] }> {
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

	const variantsByModel = new Map<string, Set<string>>();

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
			};
			if (!model.id) continue;

			const baseName = `${provider.id}/${model.id}`;
			const variants = variantsByModel.get(baseName) ?? new Set<string>();
			for (const variantName of Object.keys(model.variants ?? {})) {
				if (variantName.trim().length > 0) variants.add(variantName);
			}
			variantsByModel.set(baseName, variants);
		}
	}

	return Array.from(variantsByModel.entries()).map(([name, variantsSet]) => ({
		name,
		variants: Array.from(variantsSet).sort(),
	}));
}

export function listAllModels(): OpencodeModel[] {
	const db = dbManager.connect();
	const rows = db
		.prepare(
			`SELECT name, enabled, difficulty, COALESCE(variants, '') as variants FROM opencode_models ORDER BY name ASC`,
		)
		.all() as unknown[];
	return normalizeModelRows(rows);
}

export function listEnabledModels(): OpencodeModel[] {
	const db = dbManager.connect();
	const rows = db
		.prepare(
			`SELECT name, enabled, difficulty, COALESCE(variants, '') as variants FROM opencode_models WHERE enabled = 1 ORDER BY name ASC`,
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
			`SELECT name, enabled, difficulty, COALESCE(variants, '') as variants FROM opencode_models WHERE name = ?`,
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
			`SELECT name, enabled, difficulty, COALESCE(variants, '') as variants FROM opencode_models WHERE name = ?`,
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
		}))
		.filter((entry) => entry.name.length > 0);

	const byName = new Map<string, string>();
	for (const model of normalized) {
		byName.set(model.name, model.variants.sort().join(","));
	}

	const existingRows = db
		.prepare(`SELECT name FROM opencode_models`)
		.all() as Array<{
		name: string;
	}>;
	const insertStmt = db.prepare(
		`INSERT OR IGNORE INTO opencode_models (name, variants) VALUES (?, ?)`,
	);
	const updateVariantsStmt = db.prepare(
		`UPDATE opencode_models SET variants = ? WHERE name = ?`,
	);
	const deleteStmt = db.prepare(`DELETE FROM opencode_models WHERE name = ?`);

	const tx = db.transaction(() => {
		for (const [name, variantsCsv] of byName.entries()) {
			insertStmt.run(name, variantsCsv);
			updateVariantsStmt.run(variantsCsv, name);
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
