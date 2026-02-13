import type { AppContext } from "../composition/create-app-context";
import { registerDiagnosticsHandlers } from "../diagnostics-handlers";
import { registerAppHandlers } from "./app.handlers";
import { registerProjectHandlers } from "./project.handlers";
import { registerTaskHandlers } from "./task.handlers";
import { registerBoardHandlers } from "./board.handlers";
import { registerTagsHandlers } from "./tags.handlers";
import { registerDepsHandlers } from "./deps.handlers";
import { registerScheduleHandlers } from "./schedule.handlers";
import { registerSearchHandlers } from "./search.handlers";
import { registerOhMyOpencodeHandlers } from "./oh-my-opencode.handlers";
import { registerRunHandlers } from "./run.handlers";
import { registerPluginHandlers } from "./plugin.handlers";
import { registerBackupHandlers } from "./backup.handlers";
import { registerOpenCodeHandlers } from "./opencode.handlers";
import { registerTaskEventsHandlers } from "./task-events.handlers";

export function registerAllHandlers(context: AppContext): void {
	registerAppHandlers(context);
	registerProjectHandlers(context);
	registerBoardHandlers(context);
	registerTaskHandlers(context);
	registerTagsHandlers(context);
	registerDepsHandlers();
	registerScheduleHandlers(context);
	registerSearchHandlers();
	registerOhMyOpencodeHandlers();
	registerRunHandlers(context);
	registerPluginHandlers(context);
	registerBackupHandlers();
	registerOpenCodeHandlers(context);
	registerTaskEventsHandlers();
	registerDiagnosticsHandlers();
}
