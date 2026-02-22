import { dbManager } from "@/server/db";

export interface AgentRole {
	id: string;
	name: string;
	description: string;
}

export interface AgentRolePreset {
	version: string;
	provider: string;
	modelName: string;
	skills: string[];
	systemPrompt: string;
	mustDo: string[];
	outputContract: string[];
	behavior?: AgentRoleBehavior;
}

export interface AgentRoleBehavior {
	preferredForStoryGeneration?: boolean;
	preferredForQaTesting?: boolean;
	recommended?: boolean;
	optional?: boolean;
	quickSelect?: boolean;
}

interface AgentRolePresetRow {
	preset_json: string;
}

export class RoleRepository {
	public list(): AgentRole[] {
		const db = dbManager.connect();
		return db
			.prepare(
				"SELECT id, name, description FROM agent_roles ORDER BY created_at ASC",
			)
			.all() as AgentRole[];
	}

	public listWithPresets(): (AgentRole & { preset_json: string })[] {
		const db = dbManager.connect();
		return db
			.prepare(
				"SELECT id, name, description, preset_json FROM agent_roles ORDER BY created_at ASC",
			)
			.all() as (AgentRole & { preset_json: string })[];
	}

	public getPresetJson(roleId: string): string | null {
		const db = dbManager.connect();
		const row = db
			.prepare("SELECT preset_json FROM agent_roles WHERE id = ?")
			.get(roleId) as AgentRolePresetRow | undefined;

		if (!row) {
			return null;
		}

		return row.preset_json;
	}

	public upsert(role: AgentRole & { preset_json: string }): void {
		const db = dbManager.connect();
		const now = new Date().toISOString();

		db.prepare(
			`INSERT INTO agent_roles (id, name, description, preset_json, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
				name = excluded.name,
				description = excluded.description,
				preset_json = excluded.preset_json,
				updated_at = excluded.updated_at`,
		).run(role.id, role.name, role.description, role.preset_json, now, now);
	}

	public delete(id: string): void {
		const db = dbManager.connect();
		db.prepare("DELETE FROM agent_roles WHERE id = ?").run(id);
	}
}

export const roleRepo = new RoleRepository();
