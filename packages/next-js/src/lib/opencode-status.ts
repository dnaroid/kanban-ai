export const OPENCODE_STATUS_TOKEN =
	"__OPENCODE_STATUS__::7f2b3b52-2a7f-4f2a-8d2e-9b6c8b0f2e7a::";

export const OPENCODE_STATUS_VALUES = [
	"done",
	"generated",
	"fail",
	"question",
	"test_ok",
	"test_fail",
] as const;

export type OpencodeStatus = (typeof OPENCODE_STATUS_VALUES)[number];

export const OPENCODE_STATUS_REGEX = new RegExp(
	`^(?:.+?:\\s*)?${OPENCODE_STATUS_TOKEN}(${OPENCODE_STATUS_VALUES.join("|")})$`,
	"i",
);

export function buildOpencodeStatusLine(status: OpencodeStatus): string {
	return `${OPENCODE_STATUS_TOKEN}${status}`;
}

export function extractOpencodeStatus(text: string): {
	status: OpencodeStatus;
	statusLine: string;
	statusLineIndex: number;
} | null {
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const match = line.trim().match(OPENCODE_STATUS_REGEX);
		if (!match) continue;

		const value = (match[1] ?? "").toLowerCase() as OpencodeStatus;
		if (!OPENCODE_STATUS_VALUES.includes(value)) continue;

		return {
			status: value,
			statusLine: line,
			statusLineIndex: index,
		};
	}

	return null;
}
