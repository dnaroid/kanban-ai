import { createLogger } from "@/lib/logger";
import {
	subscribeSessionEvents,
	unsubscribeSessionEvents,
} from "@/server/opencode/session-store";

const log = createLogger("runs-queue");

type LiveRunSubscription = {
	runId: string;
	sessionId: string;
	subscriberId: string;
	debounceTimer: ReturnType<typeof setTimeout> | null;
	lastEventAt: number;
};

interface RunLiveSubscriptionServiceDeps {
	reconcileRun: (runId: string) => Promise<void>;
	listActiveRunsWithSessions: () => Array<{ id: string; sessionId: string }>;
}

const DEBOUNCE_MS = 150;

export class RunLiveSubscriptionService {
	private readonly deps: RunLiveSubscriptionServiceDeps;
	private readonly subscriptions = new Map<string, LiveRunSubscription>();
	private readonly reconciling = new Set<string>();

	public constructor(deps: RunLiveSubscriptionServiceDeps) {
		this.deps = deps;
	}

	public async ensureSubscribed(
		runId: string,
		sessionId: string,
	): Promise<void> {
		const existing = this.subscriptions.get(runId);
		const subscriberId = `run-live:${runId}`;

		if (existing && existing.sessionId === sessionId) {
			log.debug("live subscribe already attached", { runId, sessionId });
			return;
		}

		if (existing) {
			log.info("live subscribe re-attaching", {
				runId,
				oldSessionId: existing.sessionId,
				newSessionId: sessionId,
			});
			this.clearTimer(runId);
			await unsubscribeSessionEvents(existing.sessionId, existing.subscriberId);
			this.subscriptions.delete(runId);
		}

		const entry: LiveRunSubscription = {
			runId,
			sessionId,
			subscriberId,
			debounceTimer: null,
			lastEventAt: Date.now(),
		};
		this.subscriptions.set(runId, entry);

		await subscribeSessionEvents(sessionId, subscriberId, (_event: unknown) => {
			const current = this.subscriptions.get(runId);
			if (!current) {
				return;
			}
			current.lastEventAt = Date.now();
			log.debug("live event received, scheduling reconcile", { runId });
			this.scheduleReconcile(runId);
		});

		log.info("live subscribe attached", { runId, sessionId });
	}

	public async unsubscribe(runId: string): Promise<void> {
		const entry = this.subscriptions.get(runId);
		if (!entry) {
			return;
		}

		this.clearTimer(runId);
		this.subscriptions.delete(runId);
		this.reconciling.delete(runId);

		await unsubscribeSessionEvents(entry.sessionId, entry.subscriberId);
		log.info("live unsubscribe", { runId, sessionId: entry.sessionId });
	}

	public async unsubscribeAll(): Promise<void> {
		const runIds = [...this.subscriptions.keys()];
		for (const runId of runIds) {
			await this.unsubscribe(runId);
		}
	}

	public getLastEventAt(runId: string): number | null {
		const entry = this.subscriptions.get(runId);
		return entry?.lastEventAt ?? null;
	}

	public async restoreActiveRunSubscriptions(): Promise<void> {
		log.info("live restore subscriptions started");

		const activeRuns = this.deps.listActiveRunsWithSessions();
		for (const run of activeRuns) {
			await this.ensureSubscribed(run.id, run.sessionId);
		}

		log.info("live restore subscriptions finished", {
			count: activeRuns.length,
		});
	}

	private scheduleReconcile(runId: string): void {
		const entry = this.subscriptions.get(runId);
		if (!entry) {
			return;
		}

		if (entry.debounceTimer !== null) {
			clearTimeout(entry.debounceTimer);
		}

		entry.debounceTimer = setTimeout(() => {
			const current = this.subscriptions.get(runId);
			if (current) {
				current.debounceTimer = null;
			}
			void this.reconcile(runId);
		}, DEBOUNCE_MS);
	}

	private async reconcile(runId: string): Promise<void> {
		if (this.reconciling.has(runId)) {
			log.debug("live reconcile skipped, already running", { runId });
			return;
		}

		this.reconciling.add(runId);
		try {
			await this.deps.reconcileRun(runId);
		} finally {
			this.reconciling.delete(runId);
		}
	}

	private clearTimer(runId: string): void {
		const entry = this.subscriptions.get(runId);
		if (entry?.debounceTimer !== null && entry) {
			clearTimeout(entry.debounceTimer);
			entry.debounceTimer = null;
		}
	}
}
