class ProjectUpdatesService {
	private projects = new Map<
		string,
		{ lastSeenAt: number; lastActivityAt: number }
	>();

	public recordActivity(projectId: string): void {
		const now = Date.now();
		const existing = this.projects.get(projectId);
		if (!existing) {
			this.projects.set(projectId, {
				lastSeenAt: now,
				lastActivityAt: now,
			});
			return;
		}

		this.projects.set(projectId, {
			lastSeenAt: existing.lastSeenAt,
			lastActivityAt: now,
		});
	}

	public markSeen(projectId: string): void {
		const now = Date.now();
		const existing = this.projects.get(projectId);
		this.projects.set(projectId, {
			lastSeenAt: now,
			lastActivityAt: existing?.lastActivityAt ?? now,
		});
	}

	public getUpdatedProjectIds(): string[] {
		const projectIds: string[] = [];
		for (const [projectId, timestamps] of this.projects.entries()) {
			if (timestamps.lastActivityAt > timestamps.lastSeenAt) {
				projectIds.push(projectId);
			}
		}
		return projectIds;
	}
}

export const projectUpdatesService = new ProjectUpdatesService();
