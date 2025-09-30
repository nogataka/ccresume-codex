import type { Dirent } from 'node:fs';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { codexSessionsRootPath } from './paths.js';
import { getHistoryTimestamps } from './history.js';

export type CodexSessionHeader = {
  sessionUuid: string | null;
  workspacePath: string | null;
  startedAt: string | null;
  instructions: string | null;
};

export type CodexSessionRecord = CodexSessionHeader & {
  filePath: string;
  lastModifiedAt: Date | null;
};

const sessionCache = new Map<string, CodexSessionRecord>();

const isJsonlFile = (name: string) => name.endsWith('.jsonl');

const readFirstLine = async (filePath: string): Promise<string | null> => {
  return await new Promise((resolve, reject) => {
    let buffer = '';
    const stream = createReadStream(filePath, {
      encoding: 'utf-8',
      highWaterMark: 4 * 1024,
    });

    stream.on('data', (chunk) => {
      buffer += chunk;
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        stream.close();
        resolve(buffer.slice(0, newlineIndex));
      }
    });

    stream.on('error', (error) => {
      reject(error);
    });

    stream.on('close', () => {
      if (buffer.length > 0) {
        resolve(buffer);
      } else {
        resolve(null);
      }
    });
  });
};

export const readSessionHeader = async (filePath: string): Promise<CodexSessionHeader | null> => {
  try {
    const firstLine = await readFirstLine(filePath);
    if (!firstLine) {
      return null;
    }

    const parsed = JSON.parse(firstLine) as {
      type?: string;
      timestamp?: string;
      payload?: {
        id?: string;
        cwd?: string;
        timestamp?: string;
        instructions?: string;
      };
    };

    if (parsed.type !== 'session_meta') {
      return null;
    }

    return {
      sessionUuid: parsed.payload?.id ?? null,
      workspacePath: parsed.payload?.cwd ?? null,
      startedAt: parsed.payload?.timestamp ?? parsed.timestamp ?? null,
      instructions: parsed.payload?.instructions ?? null,
    } satisfies CodexSessionHeader;
  } catch (error) {
    console.warn(`Failed to read session header for ${filePath}`, error);
    return null;
  }
};

export const listCodexSessionRecords = async (): Promise<CodexSessionRecord[]> => {
  const root = codexSessionsRootPath;
  const records: CodexSessionRecord[] = [];
  const sessionUuidMap = new Map<string, CodexSessionRecord>();

  const stack: string[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let dirents: Dirent[];
    try {
      dirents = (await readdir(current, {
        withFileTypes: true,
      })) as unknown as Dirent[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      console.warn(`Failed to read directory ${current}`, error);
      continue;
    }

    for (const dirent of dirents) {
      const entryName = dirent.name.toString();
      const fullPath = join(current, entryName);

      if (dirent.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!dirent.isFile() || !isJsonlFile(entryName)) {
        continue;
      }

      const header = await readSessionHeader(fullPath);
      if (!header) {
        continue;
      }

      let fileStats: Awaited<ReturnType<typeof stat>> | null = null;
      try {
        fileStats = await stat(fullPath);
      } catch (error) {
        console.warn(`Failed to stat session file ${fullPath}`, error);
      }

      const record: CodexSessionRecord = {
        ...header,
        filePath: fullPath,
        lastModifiedAt: fileStats?.mtime ?? null,
      };
      records.push(record);
      sessionCache.set(fullPath, record);
      if (record.sessionUuid) {
        sessionUuidMap.set(record.sessionUuid, record);
      }
    }
  }

  const historyTimestamps = await getHistoryTimestamps();
  for (const [sessionUuid, timestamp] of historyTimestamps.entries()) {
    const record = sessionUuidMap.get(sessionUuid);
    if (!record) {
      continue;
    }
    if (!record.lastModifiedAt || timestamp > record.lastModifiedAt) {
      record.lastModifiedAt = timestamp;
    }
  }

  return records;
};

export const listSessionsForWorkspace = async (workspacePath: string) => {
  const records = await listCodexSessionRecords();
  return records.filter((record) => record.workspacePath === workspacePath);
};

export const getWorkspaceName = (workspacePath: string) => {
  return basename(workspacePath);
};

export const findSessionRecordByUuid = async (
  sessionUuid: string,
): Promise<CodexSessionRecord | null> => {
  for (const record of sessionCache.values()) {
    if (record.sessionUuid === sessionUuid) {
      return record;
    }
  }

  const records = await listCodexSessionRecords();
  for (const record of records) {
    if (record.sessionUuid === sessionUuid) {
      return record;
    }
  }

  return null;
};

export const findLatestSessionForWorkspace = async (
  workspacePath: string,
  afterTimestamp?: number,
): Promise<CodexSessionRecord | null> => {
  const records = await listCodexSessionRecords();
  const filtered = records.filter((record) => {
    if (record.workspacePath !== workspacePath) {
      return false;
    }
    if (!afterTimestamp) {
      return true;
    }
    const modified = record.lastModifiedAt?.getTime() ?? 0;
    return modified >= afterTimestamp - 2000;
  });

  if (filtered.length === 0) {
    return null;
  }

  filtered.sort((a, b) => {
    const aTime = a.lastModifiedAt?.getTime() ?? 0;
    const bTime = b.lastModifiedAt?.getTime() ?? 0;
    return bTime - aTime;
  });

  return filtered.at(0) ?? null;
};

export const getCachedSessionRecord = (filePath: string) => {
  return sessionCache.get(filePath) ?? null;
};
