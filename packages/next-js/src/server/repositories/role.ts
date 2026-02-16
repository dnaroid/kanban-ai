import { dbManager } from "@/server/db";

export interface AgentRole {
	id: string;
	name: string;
	description: string;
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
}

export const roleRepo = new RoleRepository();
