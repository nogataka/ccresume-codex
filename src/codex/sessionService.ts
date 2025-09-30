import { readFile } from 'node:fs/promises';

import { parseCodexSession } from './parseCodexSession.js';
import { parseCommandXml } from './parseCommandXml.js';
import type { ParsedCommand, Session, SessionDetail, SessionMeta } from './types.js';
import { decodeProjectId, decodeSessionId, encodeSessionId } from './identifiers.js';
import { listSessionsForWorkspace } from './sessionFiles.js';

const getTime = (date: string | null) => {
  if (date === null) {
    return 0;
  }
  return new Date(date).getTime();
};

const createFirstCommandFromTurns = (
  content: ReturnType<typeof parseCodexSession>,
): ParsedCommand | null => {
  const firstTurnWithUserMessage = content.turns.find((turn) => {
    const text = turn.userMessage?.text;
    return typeof text === 'string' && text.trim().length > 0;
  });

  if (!firstTurnWithUserMessage?.userMessage?.text) {
    return null;
  }

  return parseCommandXml(firstTurnWithUserMessage.userMessage.text);
};

export const getSessionsForProject = async (
  projectId: string,
): Promise<{ sessions: Session[] }> => {
  const workspacePath = decodeProjectId(projectId);
  const sessionRecords = await listSessionsForWorkspace(workspacePath);

  const sessions = await Promise.all(
    sessionRecords.map(async (record): Promise<Session> => {
      const fileContent = await readFile(record.filePath, 'utf-8').catch(() => '');
      const parsed = parseCodexSession(fileContent);
      const firstCommand = createFirstCommandFromTurns(parsed);

      const meta: SessionMeta = {
        messageCount: parsed.entries.length,
        firstCommand,
        lastModifiedAt: record.lastModifiedAt?.toISOString() ?? null,
        startedAt: record.startedAt,
      };

      return {
        id: encodeSessionId(record.filePath),
        sessionUuid: record.sessionUuid,
        jsonlFilePath: record.filePath,
        meta,
      } satisfies Session;
    }),
  );

  sessions.sort((a, b) => {
    return getTime(b.meta.lastModifiedAt) - getTime(a.meta.lastModifiedAt);
  });

  return { sessions };
};

export const getSessionDetail = async (
  projectId: string,
  sessionId: string,
): Promise<{ session: SessionDetail }> => {
  const workspacePath = decodeProjectId(projectId);
  const sessionPath = decodeSessionId(sessionId);

  const fileContent = await readFile(sessionPath, 'utf-8').catch(() => '');
  const parsed = parseCodexSession(fileContent);
  const firstCommand = createFirstCommandFromTurns(parsed);

  const sessionDetail: SessionDetail = {
    id: sessionId,
    sessionUuid: parsed.sessionMeta.sessionUuid,
    jsonlFilePath: sessionPath,
    meta: {
      messageCount: parsed.entries.length,
      firstCommand,
      lastModifiedAt: parsed.sessionMeta.timestamp,
      startedAt: parsed.sessionMeta.timestamp,
    },
    entries: parsed.entries,
    turns: parsed.turns,
    metaEvents: parsed.metaEvents,
    sessionMeta: {
      ...parsed.sessionMeta,
      cwd: parsed.sessionMeta.cwd ?? workspacePath,
    },
  };

  return { session: sessionDetail };
};
