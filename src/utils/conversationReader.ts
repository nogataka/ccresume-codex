import { readFile } from 'node:fs/promises';

import { encodeSessionId } from '../codex/identifiers.js';
import {
  listCodexSessionRecords,
  getWorkspaceName,
} from '../codex/sessionFiles.js';
import { parseCodexSession } from '../codex/parseCodexSession.js';
import type { CodexConversationEntry } from '../codex/types.js';
import type { Conversation, Message } from '../types.js';
import { extractMessageText } from './messageUtils.js';

interface PaginationOptions {
  limit: number;
  offset: number;
  currentDirFilter?: string;
}

const toDate = (timestamp: string | null | undefined): Date | null => {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
};

const convertEntryToMessage = (
  entry: CodexConversationEntry,
  sessionId: string,
  workspacePath: string,
): Message | null => {
  const timestamp = entry.timestamp ?? new Date().toISOString();
  const base = {
    sessionId,
    timestamp,
    cwd: workspacePath,
  } as const;

  switch (entry.type) {
    case 'user':
      return {
        ...base,
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: entry.text }],
        },
      } satisfies Message;
    case 'assistant':
      return {
        ...base,
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: entry.text }],
        },
      } satisfies Message;
    case 'assistant-reasoning':
      return {
        ...base,
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'thinking',
              thinking: entry.text ?? entry.summary ?? '[Reasoning]',
            },
          ],
        },
      } satisfies Message;
    case 'tool-call':
      return {
        ...base,
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: entry.name,
              input: entry.arguments ? { command: entry.arguments } : undefined,
            },
          ],
        },
      } satisfies Message;
    case 'tool-result':
      return {
        ...base,
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_result',
              text: entry.output ?? '[Tool Result]',
            },
          ],
        },
      } satisfies Message;
    case 'system':
      return {
        ...base,
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: entry.text ?? `[System] ${entry.subtype}`,
            },
          ],
        },
      } satisfies Message;
    default:
      return null;
  }
};

const buildConversationFromFile = async (
  filePath: string,
  workspacePath: string,
  sessionUuid: string | null,
  lastModifiedAt: Date | null,
): Promise<Conversation | null> => {
  try {
    const fileContent = await readFile(filePath, 'utf-8');
    if (!fileContent.trim()) {
      return null;
    }

    const parsed = parseCodexSession(fileContent);
    const sessionId = sessionUuid ?? encodeSessionId(filePath);
    const messages = parsed.entries
      .map((entry) => convertEntryToMessage(entry, sessionId, workspacePath))
      .filter((message): message is Message => message !== null);

    if (messages.length === 0) {
      return null;
    }

    const userMessages = messages.filter((message) => message.type === 'user');
    const firstUser = userMessages.at(0);
    const lastUser = userMessages.at(-1);

    const allTimestamps = parsed.entries
      .map((entry) => toDate(entry.timestamp))
      .filter((date): date is Date => date !== null);
    const sessionTimestamp = toDate(parsed.sessionMeta.timestamp);
    const startTime = allTimestamps.at(0) ?? sessionTimestamp ?? lastModifiedAt ?? null;
    const endTime = allTimestamps.at(-1) ?? lastModifiedAt ?? sessionTimestamp ?? null;

    const firstMessage = firstUser
      ? extractMessageText(firstUser.message?.content)
      : extractMessageText(messages[0]?.message?.content);
    const lastMessage = lastUser
      ? extractMessageText(lastUser.message?.content)
      : extractMessageText(messages[messages.length - 1]?.message?.content);

    return {
      sessionId,
      sessionUuid,
      sessionPath: filePath,
      projectPath: workspacePath,
      projectName: workspacePath ? getWorkspaceName(workspacePath) : '(unknown)',
      gitBranch: '-',
      messages,
      firstMessage,
      lastMessage,
      startTime: startTime ?? new Date(messages[0]?.timestamp ?? Date.now()),
      endTime: endTime ?? new Date(messages[messages.length - 1]?.timestamp ?? Date.now()),
    } satisfies Conversation;
  } catch (error) {
    console.warn(`Failed to parse conversation at ${filePath}`, error);
    return null;
  }
};

export async function getPaginatedConversations({
  limit,
  offset,
  currentDirFilter,
}: PaginationOptions): Promise<{
  conversations: Conversation[];
  total: number;
}> {
  const records = await listCodexSessionRecords();
  const filtered = records
    .filter((record) => {
      if (currentDirFilter && record.workspacePath) {
        return record.workspacePath === currentDirFilter;
      }
      return Boolean(record.workspacePath);
    })
    .sort((a, b) => {
      const aTime = a.lastModifiedAt?.getTime() ?? 0;
      const bTime = b.lastModifiedAt?.getTime() ?? 0;
      return bTime - aTime;
    });

  const total = filtered.length;
  const slice = filtered.slice(offset, offset + limit);

  const conversations: Conversation[] = [];
  for (const record of slice) {
    if (!record.workspacePath) {
      continue;
    }
    const conversation = await buildConversationFromFile(
      record.filePath,
      record.workspacePath,
      record.sessionUuid,
      record.lastModifiedAt,
    );
    if (conversation) {
      conversations.push(conversation);
    }
  }

  return { conversations, total };
}

export async function getAllConversations(currentDirFilter?: string): Promise<Conversation[]> {
  const records = await listCodexSessionRecords();
  const filtered = records.filter((record) => {
    if (!record.workspacePath) {
      return false;
    }
    if (!currentDirFilter) {
      return true;
    }
    return record.workspacePath === currentDirFilter;
  });

  const conversations: Conversation[] = [];
  for (const record of filtered) {
    if (!record.workspacePath) {
      continue;
    }
    const conversation = await buildConversationFromFile(
      record.filePath,
      record.workspacePath,
      record.sessionUuid,
      record.lastModifiedAt,
    );
    if (conversation) {
      conversations.push(conversation);
    }
  }

  conversations.sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
  return conversations;
}

export function formatConversationSummary(conversation: Conversation): string {
  const firstMessagePreview = conversation.firstMessage
    .replace(/\n/g, ' ')
    .substring(0, 80)
    .trim();

  return `${firstMessagePreview}${conversation.firstMessage.length > 80 ? '...' : ''}`;
}
