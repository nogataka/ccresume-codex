import type { ParsedCommand } from './types.js';

const commandTagRegExp = /<(?<tag>[^>]+)>(?<content>\s*[^<]*?\s*)<\/\k<tag>>/g;

type MatchGroups = {
  tag?: string;
  content?: string;
};

export const parseCommandXml = (content: string): ParsedCommand => {
  const matches = Array.from(content.matchAll(commandTagRegExp))
    .map((match) => match.groups as MatchGroups | undefined)
    .filter((groups): groups is Required<MatchGroups> => {
      return Boolean(groups?.tag && groups?.content);
    })
    .map((groups) => ({ tag: groups.tag!, content: groups.content!.trim() }));

  if (matches.length === 0) {
    return {
      kind: 'text',
      content,
    };
  }

  const get = (tag: string) => {
    return matches.find((match) => match.tag === tag)?.content;
  };

  const commandName = get('command-name');
  const commandArgs = get('command-args');
  const commandMessage = get('command-message');
  const localCommandStdout = get('local-command-stdout');

  if (commandName) {
    return {
      kind: 'command',
      commandName,
      commandArgs: commandArgs || undefined,
      commandMessage: commandMessage || undefined,
    };
  }

  if (localCommandStdout) {
    return {
      kind: 'local-command',
      stdout: localCommandStdout,
    };
  }

  return {
    kind: 'text',
    content,
  };
};
