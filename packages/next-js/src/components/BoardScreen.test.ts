import { describe, expect, it } from "vitest";
import { buildConfirmedReadyStartOptions } from "./BoardScreen";

describe("buildConfirmedReadyStartOptions", () => {
	it("returns null without confirmation state", () => {
		expect(buildConfirmedReadyStartOptions(null)).toBeNull();
	});

	it("preserves dirty-git acknowledgement and confirms active session", () => {
		expect(
			buildConfirmedReadyStartOptions({
				message: "already running",
				forceDirtyGit: true,
			}),
		).toEqual({
			forceDirtyGit: true,
			confirmActiveSession: true,
		});
	});
});
