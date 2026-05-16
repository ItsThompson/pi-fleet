import { mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { getLogPath } from "@pi-fleet/shared";

export interface LogEntry {
	timestamp: string;
	event: string;
	[key: string]: unknown;
}

let logFilePath: string | undefined;
let logDirEnsured = false;

function ensureLogDir(): void {
	if (logDirEnsured) {
		return;
	}
	const filePath = getLogPath();
	mkdirSync(dirname(filePath), { recursive: true });
	logFilePath = filePath;
	logDirEnsured = true;
}

export function log(entry: LogEntry): void {
	const line = JSON.stringify(entry) + "\n";
	try {
		ensureLogDir();
		appendFileSync(logFilePath!, line);
	} catch {
		// Fall back to stderr if file logging fails
		process.stderr.write(line);
	}
}
