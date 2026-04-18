import { describe, expect, it } from "vitest";

import {
	buildOpencodeStatusLine,
	extractOpencodeStatus,
} from "@/lib/opencode-status";

describe("extractOpencodeStatus", () => {
	it("parses a bare status marker line", () => {
		expect(extractOpencodeStatus(buildOpencodeStatusLine("generated"))).toEqual(
			{
				status: "generated",
				statusLine: buildOpencodeStatusLine("generated"),
				statusLineIndex: 0,
			},
		);
	});

	it("parses prompt-style labeled status marker lines", () => {
		const text = [
			"<STORY>",
			"## Title",
			"Generated story",
			"</STORY>",
			`success: ${buildOpencodeStatusLine("generated")}`,
		].join("\n");

		expect(extractOpencodeStatus(text)).toEqual({
			status: "generated",
			statusLine: `success: ${buildOpencodeStatusLine("generated")}`,
			statusLineIndex: 4,
		});
	});

	it("parses question marker lines with human-readable prefixes", () => {
		const line = `need user input: ${buildOpencodeStatusLine("question")}`;

		expect(extractOpencodeStatus(line)).toEqual({
			status: "question",
			statusLine: line,
			statusLineIndex: 0,
		});
	});
});
