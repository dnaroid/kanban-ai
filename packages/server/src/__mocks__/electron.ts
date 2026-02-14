import { vi } from "vitest";

export const app = {
	getPath: vi.fn(() => "/tmp/test-app-data"),
	getVersion: vi.fn(() => "1.0.0"),
	on: vi.fn(),
	quit: vi.fn(),
};

export const ipcMain = {
	handle: vi.fn(),
	on: vi.fn(),
};

export const BrowserWindow = vi.fn();
export const Menu = vi.fn();
export const MenuItem = vi.fn();
export const Notification = vi.fn();
export const shell = vi.fn();
export const dialog = vi.fn();
