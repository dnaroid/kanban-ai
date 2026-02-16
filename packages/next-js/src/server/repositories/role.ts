import { dbManager } from "@/server/db";

export interface AgentRole {
	id: string;
	name: string;
	description: string;
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
}

export const roleRepo = new RoleRepository();
