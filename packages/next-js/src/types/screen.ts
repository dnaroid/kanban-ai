export type Screen =
	| { id: "projects" }
	| { id: "board"; projectId: string; projectName: string }
	| { id: "settings" };
