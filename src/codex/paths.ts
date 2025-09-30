import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const codexSessionsRootPath = resolve(homedir(), '.codex', 'sessions');
export const codexHistoryFilePath = resolve(homedir(), '.codex', 'history.jsonl');
