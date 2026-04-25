export interface ActiveExecutionSessionConfirmationState {
	message: string;
	forceDirtyGit: boolean;
}

export const buildConfirmedReadyStartOptions = (
	confirmation: ActiveExecutionSessionConfirmationState | null,
): {
	forceDirtyGit: boolean;
	confirmActiveSession: true;
} | null => {
	if (!confirmation) {
		return null;
	}

	return {
		forceDirtyGit: confirmation.forceDirtyGit,
		confirmActiveSession: true,
	};
};
