export type CodexConversationEntry =
  | {
      type: 'user' | 'assistant';
      id: string;
      timestamp: string | null;
      text: string;
      source: 'response_item' | 'event_msg';
    }
  | {
      type: 'assistant-reasoning';
      id: string;
      timestamp: string | null;
      summary: string | null;
      text?: string | null;
      encrypted?: boolean;
    }
  | {
      type: 'tool-call';
      id: string;
      timestamp: string | null;
      name: string;
      arguments: string | null;
      callId: string | null;
    }
  | {
      type: 'tool-result';
      id: string;
      timestamp: string | null;
      callId: string | null;
      output: string | null;
    }
  | {
      type: 'system';
      id: string;
      timestamp: string | null;
      subtype: string;
      text: string | null;
    };

export type CodexMessage = {
  id: string;
  text: string;
  timestamp: string | null;
  source: 'response_item' | 'event_msg';
};

export type CodexReasoning = {
  id: string;
  summary: string | null;
  text: string | null;
  timestamp: string | null;
  encrypted: boolean;
};

export type CodexToolCall = {
  id: string;
  name: string;
  arguments: string | null;
  callId: string | null;
  timestamp: string | null;
};

export type CodexToolResult = {
  id: string;
  callId: string | null;
  output: string | null;
  timestamp: string | null;
};

export type CodexMetaEvent =
  | {
      type: 'token_count';
      timestamp: string | null;
      info: unknown;
    }
  | {
      type: 'turn_context';
      timestamp: string | null;
      context: unknown;
    };

export type CodexSessionTurn = {
  id: string;
  userMessage: CodexMessage | null;
  assistantMessages: CodexMessage[];
  reasonings: CodexReasoning[];
  toolCalls: CodexToolCall[];
  toolResults: CodexToolResult[];
  metaEvents: CodexMetaEvent[];
};

export type CodexSessionMeta = {
  sessionUuid: string | null;
  cwd: string | null;
  instructions: string | null;
  originator: string | null;
  cliVersion: string | null;
  timestamp: string | null;
};

export type ProjectMeta = {
  workspaceName: string;
  workspacePath: string;
  lastSessionAt: Date | null;
  sessionCount: number;
};

export type Project = {
  id: string;
  workspacePath: string;
  meta: ProjectMeta;
};

export type SessionMeta = {
  messageCount: number;
  firstCommand: ParsedCommand | null;
  lastModifiedAt: string | null;
  startedAt: string | null;
};

export type Session = {
  id: string;
  sessionUuid: string | null;
  jsonlFilePath: string;
  meta: SessionMeta;
};

export type SessionDetail = Session & {
  entries: CodexConversationEntry[];
  turns: CodexSessionTurn[];
  metaEvents: CodexMetaEvent[];
  sessionMeta: CodexSessionMeta;
};

export type ParsedCommand =
  | {
      kind: 'command';
      commandName: string;
      commandArgs?: string;
      commandMessage?: string;
    }
  | {
      kind: 'local-command';
      stdout: string;
    }
  | {
      kind: 'text';
      content: string;
    };
