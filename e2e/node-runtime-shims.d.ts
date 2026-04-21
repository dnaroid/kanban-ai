declare module "fs" {
	export function existsSync(path: string): boolean;
	export function mkdtempSync(prefix: string): string;
	export function writeFileSync(path: string, data: string): void;
	export function readdirSync(path: string): string[];
	export function unlinkSync(path: string): void;
	export function rmdirSync(path: string): void;
}

declare module "os" {
	export function tmpdir(): string;
}

declare module "path" {
	export function resolve(...paths: string[]): string;
	export function join(...paths: string[]): string;
}

declare const process: {
	env: Record<string, string | undefined>;
	cwd(): string;
	loadEnvFile?: (path: string) => void;
};
