import type Database from "better-sqlite3";
import { dbManager } from "@/server/db";

export interface AgentRole {
	id: string;
	name: string;
	description: string;
	preferred_model_name?: string | null;
	preferred_model_variant?: string | null;
	preferred_llm_agent?: string | null;
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
	constructor(private db: Database.Database) {}

	public list(): AgentRole[] {
		return this.db
			.prepare(
				"SELECT id, name, description FROM agent_roles ORDER BY created_at ASC",
			)
			.all() as AgentRole[];
	}

	public listWithPresets(): (AgentRole & { preset_json: string })[] {
		return this.db
			.prepare(
				"SELECT id, name, description, preset_json, preferred_model_name, preferred_model_variant, preferred_llm_agent FROM agent_roles ORDER BY created_at ASC",
			)
			.all() as (AgentRole & { preset_json: string })[];
	}

	public getPresetJson(roleId: string): string | null {
		const row = this.db
			.prepare("SELECT preset_json FROM agent_roles WHERE id = ?")
			.get(roleId) as AgentRolePresetRow | undefined;

		if (!row) {
			return null;
		}

		return row.preset_json;
	}

	public upsert(role: AgentRole & { preset_json: string }): void {
		const now = new Date().toISOString();

		this.db
			.prepare(
				`INSERT INTO agent_roles (
				id,
				name,
				description,
				preset_json,
				preferred_model_name,
				preferred_model_variant,
				preferred_llm_agent,
				created_at,
				updated_at
			)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
				name = excluded.name,
				description = excluded.description,
				preset_json = excluded.preset_json,
				preferred_model_name = excluded.preferred_model_name,
				preferred_model_variant = excluded.preferred_model_variant,
				preferred_llm_agent = excluded.preferred_llm_agent,
				updated_at = excluded.updated_at`,
			)
			.run(
				role.id,
				role.name,
				role.description,
				role.preset_json,
				role.preferred_model_name ?? null,
				role.preferred_model_variant ?? null,
				role.preferred_llm_agent ?? null,
				now,
				now,
			);
	}

	public delete(id: string): void {
		this.db.prepare("DELETE FROM agent_roles WHERE id = ?").run(id);
	}
}

export const roleRepo = new RoleRepository(dbManager.connect());
