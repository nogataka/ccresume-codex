import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

import { codexHistoryFilePath } from './paths.js';

export type CodexHistoryEntry = {
  sessionId: string;
  timestamp: Date | null;
  text: string | null;
};

const toMillis = (timestamp: number) => {
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
};

let cachedHistoryMtime = 0;
let cachedHistoryMap: Map<string, Date> | null = null;

export const getHistoryTimestamps = async (): Promise<Map<string, Date>> => {
  if (!existsSync(codexHistoryFilePath)) {
    cachedHistoryMap = null;
    cachedHistoryMtime = 0;
    return new Map();
  }

  const stats = await stat(codexHistoryFilePath);
  if (cachedHistoryMap && stats.mtimeMs === cachedHistoryMtime) {
    return new Map(cachedHistoryMap);
  }

  const map = new Map<string, Date>();
  const stream = createReadStream(codexHistoryFilePath, { encoding: 'utf-8' });
  const reader = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of reader) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as {
        session_id?: unknown;
        ts?: unknown;
      };

      if (typeof parsed.session_id !== 'string') {
        continue;
      }

      if (typeof parsed.ts !== 'number') {
        continue;
      }

      const timestamp = new Date(toMillis(parsed.ts));
      const current = map.get(parsed.session_id);
      if (!current || timestamp > current) {
        map.set(parsed.session_id, timestamp);
      }
    } catch (error) {
      console.warn('Failed to parse history entry', error);
    }
  }

  cachedHistoryMap = map;
  cachedHistoryMtime = stats.mtimeMs;

  return new Map(map);
};

export const readLatestHistoryEntry = async (): Promise<CodexHistoryEntry | null> => {
  if (!existsSync(codexHistoryFilePath)) {
    return null;
  }

  const stream = createReadStream(codexHistoryFilePath, {
    encoding: 'utf-8',
  });
  const reader = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let lastLine: string | null = null;
  for await (const line of reader) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    lastLine = trimmed;
  }

  if (!lastLine) {
    return null;
  }

  try {
    const parsed = JSON.parse(lastLine) as {
      session_id?: unknown;
      ts?: unknown;
      text?: unknown;
    };

    if (typeof parsed.session_id !== 'string') {
      return null;
    }

    let timestamp: Date | null = null;
    if (typeof parsed.ts === 'number') {
      timestamp = new Date(toMillis(parsed.ts));
    }

    return {
      sessionId: parsed.session_id,
      timestamp,
      text: typeof parsed.text === 'string' ? parsed.text : null,
    } satisfies CodexHistoryEntry;
  } catch (error) {
    console.warn('Failed to parse latest history entry', error);
    return null;
  }
};
