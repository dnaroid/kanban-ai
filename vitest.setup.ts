import { vi } from "vitest";

// Mock electron for server tests
vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => "/tmp/test-app-data"),
		getVersion: vi.fn(() => "1.0.0"),
		on: vi.fn(),
		quit: vi.fn(),
	},
	ipcMain: {
		handle: vi.fn(),
		on: vi.fn(),
	},
	BrowserWindow: vi.fn(),
	Menu: vi.fn(),
	MenuItem: vi.fn(),
	Notification: vi.fn(),
	shell: vi.fn(),
	dialog: vi.fn(),
}));

// Import web-specific setup
import "./packages/web/src/test/setup.ts";
