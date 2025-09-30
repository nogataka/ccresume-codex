import type {
  CodexConversationEntry,
  CodexMessage,
  CodexMetaEvent,
  CodexReasoning,
  CodexSessionMeta,
  CodexSessionTurn,
  CodexToolCall,
  CodexToolResult,
} from './types.js';

type CodexLogLine = {
  timestamp?: string;
  type?: string;
  payload?: unknown;
};

type MessageContentItem = {
  type?: unknown;
  text?: unknown;
};

type ResponseMessagePayload = {
  type?: unknown;
  role?: unknown;
  content?: unknown;
};

type ResponseReasoningPayload = {
  type?: unknown;
  summary?: unknown;
  content?: unknown;
  encrypted_content?: unknown;
};

type ResponseFunctionCallPayload = {
  type?: unknown;
  name?: unknown;
  arguments?: unknown;
  call_id?: unknown;
};

type ResponseFunctionCallOutputPayload = {
  type?: unknown;
  call_id?: unknown;
  output?: unknown;
};

type EventMessagePayload = {
  type?: unknown;
  text?: unknown;
  message?: unknown;
};

const stripTagWrappers = (source: string, tag: string) => {
  const opening = `<${tag}>`;
  const closing = `</${tag}>`;
  let result = source;

  let startIndex = result.indexOf(opening);
  while (startIndex !== -1) {
    const endIndex = result.indexOf(closing, startIndex + opening.length);
    if (endIndex === -1) {
      break;
    }

    const inner = result.slice(startIndex + opening.length, endIndex);
    result = `${result.slice(0, startIndex)}${inner}${result.slice(endIndex + closing.length)}`;
    startIndex = result.indexOf(opening, startIndex + inner.length);
  }

  return result;
};

const filterInstructionTags = (text: string) => {
  const withoutWrappers = ['user_instructions', 'environment_context'].reduce(
    (acc, tag) => stripTagWrappers(acc, tag),
    text,
  );

  return withoutWrappers
    .replace(/<\/?[^>]+>/g, '')
    .trim();
};

const extractTextFromContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return filterInstructionTags(content);
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const texts: string[] = [];
  for (const item of content) {
    if (typeof item === 'string') {
      texts.push(filterInstructionTags(item));
      continue;
    }
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const contentItem = item as MessageContentItem;
    if (typeof contentItem.text === 'string') {
      texts.push(filterInstructionTags(contentItem.text));
    }
  }
  return texts.join('\n\n').trim();
};

const createEntryId = (() => {
  let counter = 0;
  return (prefix: string) => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
})();

export const parseCodexSession = (
  content: string,
): {
  entries: CodexConversationEntry[];
  turns: CodexSessionTurn[];
  metaEvents: CodexMetaEvent[];
  sessionMeta: CodexSessionMeta;
} => {
  const entries: CodexConversationEntry[] = [];
  const turns: CodexSessionTurn[] = [];
  const metaEvents: CodexMetaEvent[] = [];
  let sessionMeta: CodexSessionMeta = {
    sessionUuid: null,
    cwd: null,
    instructions: null,
    originator: null,
    cliVersion: null,
    timestamp: null,
  };

  let turnCounter = 0;
  const createTurn = (): CodexSessionTurn => {
    const turn: CodexSessionTurn = {
      id: `turn-${++turnCounter}`,
      userMessage: null,
      assistantMessages: [],
      reasonings: [],
      toolCalls: [],
      toolResults: [],
      metaEvents: [],
    };
    turns.push(turn);
    return turn;
  };

  const getCurrentTurn = (): CodexSessionTurn => {
    if (turns.length === 0) {
      return createTurn();
    }
    return turns[turns.length - 1] ?? createTurn();
  };

  const startNewTurn = (): CodexSessionTurn => {
    return createTurn();
  };

  const callIdToTurn = new Map<string, CodexSessionTurn>();
  const lastMessageText: Record<'user' | 'assistant', string | null> = {
    user: null,
    assistant: null,
  };

  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    let parsed: CodexLogLine;
    try {
      parsed = JSON.parse(line) as CodexLogLine;
    } catch (error) {
      console.warn('Failed to parse Codex log line', { error, line });
      continue;
    }

    const timestamp =
      typeof parsed.timestamp === 'string' ? parsed.timestamp : null;

    if (parsed.type === 'session_meta') {
      if (parsed.payload && typeof parsed.payload === 'object') {
        const payload = parsed.payload as Partial<{
          id: string;
          cwd: string;
          instructions: string;
          originator: string;
          cli_version: string;
          timestamp: string;
        }>;
        const idValue = payload.id;
        const cwdValue = payload.cwd;
        const instructionsValue = payload.instructions;
        const originatorValue = payload.originator;
        const cliVersionValue = payload.cli_version;
        const timestampValue = payload.timestamp;
        sessionMeta = {
          sessionUuid:
            typeof idValue === 'string' ? idValue : sessionMeta.sessionUuid,
          cwd: typeof cwdValue === 'string' ? cwdValue : sessionMeta.cwd,
          instructions:
            typeof instructionsValue === 'string'
              ? instructionsValue
              : sessionMeta.instructions,
          originator:
            typeof originatorValue === 'string'
              ? originatorValue
              : sessionMeta.originator,
          cliVersion:
            typeof cliVersionValue === 'string'
              ? cliVersionValue
              : sessionMeta.cliVersion,
          timestamp:
            typeof timestampValue === 'string' ? timestampValue : timestamp,
        } satisfies CodexSessionMeta;
      }
      continue;
    }

    if ((parsed.type === 'response_item' || parsed.type === 'response_message') && parsed.payload) {
      const payload = parsed.payload as
        | ResponseMessagePayload
        | ResponseReasoningPayload
        | ResponseFunctionCallPayload
        | ResponseFunctionCallOutputPayload
        | undefined;

      if (!payload || typeof payload !== 'object') {
        continue;
      }

      switch ((payload as { type?: unknown }).type) {
        case 'message': {
          const messagePayload = payload as ResponseMessagePayload;
          const role = messagePayload.role === 'assistant' ? 'assistant' : 'user';
          const text = extractTextFromContent(messagePayload.content);
          const normalized = text.trim();

          if (normalized.length === 0) {
            break;
          }

          if (lastMessageText[role] === normalized) {
            break;
          }

          const entryId = createEntryId(role);
          entries.push({
            type: role,
            id: entryId,
            timestamp,
            text: normalized,
            source: 'response_item',
          });
          const message: CodexMessage = {
            id: entryId,
            text: normalized,
            timestamp,
            source: 'response_item',
          };
          if (role === 'user') {
            const currentTurn = turns.length > 0 ? turns[turns.length - 1] : null;
            if (!currentTurn || currentTurn.userMessage) {
              const turn = startNewTurn();
              turn.userMessage = message;
            } else {
              currentTurn.userMessage = message;
            }
          } else {
            const turn = getCurrentTurn();
            turn.assistantMessages.push(message);
          }
          lastMessageText[role] = normalized;
          break;
        }
        case 'reasoning': {
          const reasoningPayload = payload as ResponseReasoningPayload;
          const summary =
            typeof reasoningPayload.summary === 'string'
              ? reasoningPayload.summary
              : null;
          const content = extractTextFromContent(reasoningPayload.content);
          const entryId = createEntryId('assistant-reasoning');
          const encrypted = Boolean(reasoningPayload.encrypted_content);
          entries.push({
            type: 'assistant-reasoning',
            id: entryId,
            timestamp,
            summary,
            text: content,
            encrypted,
          });
          const turn = getCurrentTurn();
          const reasoning: CodexReasoning = {
            id: entryId,
            summary,
            text: content,
            timestamp,
            encrypted,
          };
          turn.reasonings.push(reasoning);
          break;
        }
        case 'function_call': {
          const callPayload = payload as ResponseFunctionCallPayload;
          const name = typeof callPayload.name === 'string' ? callPayload.name : 'tool';
          const args =
            typeof callPayload.arguments === 'string'
              ? callPayload.arguments
              : callPayload.arguments
                ? JSON.stringify(callPayload.arguments)
                : null;
          const callId =
            typeof callPayload.call_id === 'string' ? callPayload.call_id : null;
          const entryId = createEntryId('tool-call');
          entries.push({
            type: 'tool-call',
            id: entryId,
            timestamp,
            name,
            arguments: args,
            callId,
          });
          const turn = getCurrentTurn();
          const toolCall: CodexToolCall = {
            id: entryId,
            name,
            arguments: args,
            callId,
            timestamp,
          };
          turn.toolCalls.push(toolCall);
          if (callId) {
            callIdToTurn.set(callId, turn);
          }
          break;
        }
        case 'function_call_output': {
          const outputPayload = payload as ResponseFunctionCallOutputPayload;
          const callId =
            typeof outputPayload.call_id === 'string'
              ? outputPayload.call_id
              : null;
          const output =
            typeof outputPayload.output === 'string'
              ? outputPayload.output
              : outputPayload.output
                ? JSON.stringify(outputPayload.output)
                : null;
          const entryId = createEntryId('tool-result');
          entries.push({
            type: 'tool-result',
            id: entryId,
            timestamp,
            callId,
            output,
          });
          const mappedTurn = callId ? callIdToTurn.get(callId) : undefined;
          const callTurn = mappedTurn ?? getCurrentTurn();
          const toolResult: CodexToolResult = {
            id: entryId,
            callId,
            output,
            timestamp,
          };
          callTurn.toolResults.push(toolResult);
          break;
        }
        default:
          break;
      }

      continue;
    }

    if (parsed.type === 'event_msg' && parsed.payload) {
      const payload = parsed.payload as EventMessagePayload | undefined;
      if (!payload || typeof payload !== 'object') {
        continue;
      }

      if (payload.type === 'agent_reasoning') {
        const rawText =
          typeof payload.text === 'string'
            ? payload.text
            : typeof payload.message === 'string'
              ? payload.message
              : null;
        if (rawText) {
          const text = filterInstructionTags(rawText);
          if (!text) {
            continue;
          }
          const entryId = createEntryId('reasoning');
          entries.push({
            type: 'assistant-reasoning',
            id: entryId,
            timestamp,
            summary: text,
            text,
            encrypted: false,
          });
          const turn = getCurrentTurn();
          turn.reasonings.push({
            id: entryId,
            summary: text,
            text,
            timestamp,
            encrypted: false,
          });
        }
        continue;
      }

      if (payload.type === 'agent_message' || payload.type === 'user_message') {
        const rawText =
          typeof payload.text === 'string'
            ? payload.text
            : typeof payload.message === 'string'
              ? payload.message
              : null;
        if (rawText) {
          const text = filterInstructionTags(rawText);
          if (!text) {
            continue;
          }
          const role = payload.type === 'agent_message' ? 'assistant' : 'user';
          const normalized = text.trim();
          if (normalized.length === 0) {
            continue;
          }
          if (lastMessageText[role] === normalized) {
            continue;
          }

          const currentTurn = turns.length > 0 ? getCurrentTurn() : null;
          if (role === 'user') {
            const duplicate = currentTurn?.userMessage
              ? currentTurn.userMessage.text.trim() === normalized
              : false;
            if (duplicate) {
              continue;
            }
            const entryId = createEntryId(role);
            entries.push({
              type: role,
              id: entryId,
              timestamp,
              text: normalized,
              source: 'event_msg',
            });
            const message: CodexMessage = {
              id: entryId,
              text: normalized,
              timestamp,
              source: 'event_msg',
            };
            if (currentTurn && !currentTurn.userMessage) {
              currentTurn.userMessage = message;
            } else {
              const turn = startNewTurn();
              turn.userMessage = message;
            }
          } else {
            const turn = currentTurn ?? startNewTurn();
            const assistantDuplicate = turn.assistantMessages.some(
              (msg) => msg.text.trim() === normalized,
            );
            if (assistantDuplicate) {
              continue;
            }
            const entryId = createEntryId(role);
            entries.push({
              type: role,
              id: entryId,
              timestamp,
              text: normalized,
              source: 'event_msg',
            });
            const message: CodexMessage = {
              id: entryId,
              text: normalized,
              timestamp,
              source: 'event_msg',
            };
            turn.assistantMessages.push(message);
          }
          lastMessageText[role] = normalized;
        }
        continue;
      }

      if (payload.type === 'token_count') {
        const event: CodexMetaEvent = {
          type: 'token_count',
          timestamp,
          info: (payload as { info?: unknown }).info ?? null,
        };
        metaEvents.push(event);
        const turn = turns.length > 0 ? getCurrentTurn() : null;
        if (turn) {
          turn.metaEvents.push(event);
        }
        continue;
      }

      if (payload.type === 'turn_context') {
        const event: CodexMetaEvent = {
          type: 'turn_context',
          timestamp,
          context: payload,
        };
        metaEvents.push(event);
        const turn = turns.length > 0 ? getCurrentTurn() : null;
        if (turn) {
          turn.metaEvents.push(event);
        }
        continue;
      }

      if (payload.type === 'turn_aborted') {
        startNewTurn();
        continue;
      }

      if (typeof payload.type === 'string') {
        const text =
          typeof payload.text === 'string'
            ? payload.text
            : typeof payload.message === 'string'
              ? payload.message
              : null;
        const entryId = createEntryId('event');
        entries.push({
          type: 'system',
          id: entryId,
          timestamp,
          subtype: payload.type,
          text,
        });
      }
      continue;
    }

    if (parsed.type === 'system_message' && parsed.payload) {
      const payload = parsed.payload as { text?: unknown; subtype?: unknown };
      const text = typeof payload.text === 'string' ? payload.text : null;
      const subtype = typeof payload.subtype === 'string' ? payload.subtype : 'system';
      const entry: CodexConversationEntry = {
        id: createEntryId('system'),
        type: 'system',
        timestamp,
        subtype,
        text,
      };
      entries.push(entry);
      continue;
    }
  }

  return {
    entries,
    turns,
    metaEvents,
    sessionMeta,
  };
};
