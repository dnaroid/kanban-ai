export const applyTopLevelConfigChange = (
	prev: Record<string, unknown>,
	key: string,
	value: unknown,
): Record<string, unknown> => {
	if (value === undefined) {
		const next = { ...prev };
		delete next[key];
		return next;
	}

	return { ...prev, [key]: value };
};
