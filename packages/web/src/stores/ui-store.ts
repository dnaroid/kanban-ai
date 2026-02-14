import type { Screen } from "@web/types/screen";

const STORAGE_KEY = "kanban-ai-ui-settings";

export type BoardViewMode = "board" | "list";
export type SettingsTab =
	| "all-models"
	| "my-models"
	| "oh-my-opencode"
	| "tags"
	| "danger";

export interface UISettings {
	/** Sidebar collapsed state */
	sidebarCollapsed: boolean;
	/** Current screen/page */
	currentScreen: Screen;
	/** Last selected project ID */
	lastProjectId: string | null;
	/** Last selected project name */
	lastProjectName: string | null;
	/** TaskDrawer expanded state (fullscreen) */
	taskDrawerExpanded: boolean;
	/** Board view mode */
	boardViewMode: BoardViewMode;
	/** Selected task ID in TaskDrawer */
	selectedTaskId: string | null;
	/** Selected task's project ID (to know which project the task belongs to) */
	selectedTaskProjectId: string | null;
	/** Last selected settings tab */
	settingsActiveTab: SettingsTab;
}

const DEFAULT_SETTINGS: UISettings = {
	sidebarCollapsed: false,
	currentScreen: { id: "projects" },
	lastProjectId: null,
	lastProjectName: null,
	taskDrawerExpanded: false,
	boardViewMode: "board",
	selectedTaskId: null,
	selectedTaskProjectId: null,
	settingsActiveTab: "all-models",
};

type Subscriber = (settings: UISettings) => void;

class UIStore {
	private settings: UISettings;
	private subscribers: Set<Subscriber> = new Set();

	constructor() {
		this.settings = this.load();
	}

	private load(): UISettings {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as Partial<UISettings>;
				// Merge with defaults to handle new fields
				return { ...DEFAULT_SETTINGS, ...parsed };
			}
		} catch (e) {
			console.error("Failed to load UI settings:", e);
		}
		return { ...DEFAULT_SETTINGS };
	}

	private save(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
		} catch (e) {
			console.error("Failed to save UI settings:", e);
		}
	}

	private notify(): void {
		this.subscribers.forEach((sub) => sub(this.settings));
	}

	subscribe(subscriber: Subscriber): () => void {
		this.subscribers.add(subscriber);
		// Immediately call with current state
		subscriber(this.settings);
		// Return unsubscribe function
		return () => {
			this.subscribers.delete(subscriber);
		};
	}

	getSettings(): UISettings {
		return { ...this.settings };
	}

	updateSettings(patch: Partial<UISettings>): void {
		this.settings = { ...this.settings, ...patch };
		this.save();
		this.notify();
	}

	// Sidebar
	setSidebarCollapsed(collapsed: boolean): void {
		this.updateSettings({ sidebarCollapsed: collapsed });
	}

	// Screen
	setCurrentScreen(screen: Screen): void {
		this.updateSettings({ currentScreen: screen });
	}

	// Project
	setLastProject(id: string | null, name: string | null): void {
		this.updateSettings({ lastProjectId: id, lastProjectName: name });
	}

	// TaskDrawer
	setTaskDrawerExpanded(expanded: boolean): void {
		this.updateSettings({ taskDrawerExpanded: expanded });
	}

	// Board view mode
	setBoardViewMode(mode: BoardViewMode): void {
		this.updateSettings({ boardViewMode: mode });
	}

	// Selected task
	setSelectedTask(taskId: string | null, projectId: string | null): void {
		this.updateSettings({
			selectedTaskId: taskId,
			selectedTaskProjectId: projectId,
		});
	}

	// Settings tab
	setSettingsActiveTab(tab: SettingsTab): void {
		this.updateSettings({ settingsActiveTab: tab });
	}

	// Clear selected task (when drawer closes or task deleted)
	clearSelectedTask(): void {
		this.updateSettings({ selectedTaskId: null, selectedTaskProjectId: null });
	}

	// Reset to defaults
	reset(): void {
		this.settings = { ...DEFAULT_SETTINGS };
		this.save();
		this.notify();
	}
}

// Singleton instance
export const uiStore = new UIStore();
