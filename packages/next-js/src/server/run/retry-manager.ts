export class RetryManager {
	private blockedRetryTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly retryTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();

	public scheduleBlockedRetry(delayMs: number, onRetry: () => void): void {
		if (this.blockedRetryTimer) {
			return;
		}

		this.blockedRetryTimer = setTimeout(() => {
			this.blockedRetryTimer = null;
			onRetry();
		}, delayMs);
	}

	public setRunRetryTimer(
		runId: string,
		delayMs: number,
		onRetry: () => void,
	): void {
		this.clearRunRetryTimer(runId);
		const timer = setTimeout(() => {
			this.retryTimers.delete(runId);
			onRetry();
		}, delayMs);
		this.retryTimers.set(runId, timer);
	}

	public clearRunRetryTimer(runId: string): void {
		const timer = this.retryTimers.get(runId);
		if (!timer) {
			return;
		}

		clearTimeout(timer);
		this.retryTimers.delete(runId);
	}
}
