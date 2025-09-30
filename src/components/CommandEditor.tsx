import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

interface CommandEditorProps {
  initialArgs: string[];
  onComplete: (args: string[]) => void;
  onCancel: () => void;
}

interface CodexOption {
  flags: string[];
  description: string;
  hasValue: boolean;
  valueDescription?: string;
}

const codexOptions: CodexOption[] = [
  { flags: ['chat'], description: 'Start an interactive Codex chat session', hasValue: false },
  { flags: ['exec'], description: 'Execute a one-off Codex command', hasValue: false },
  { flags: ['resume'], description: 'Resume an existing session; provide the session UUID', hasValue: true, valueDescription: '<session-uuid>' },
  { flags: ['--model'], description: 'Specify the Codex model alias or full identifier', hasValue: true, valueDescription: '<model>' },
  { flags: ['--json'], description: 'Emit JSON output (useful for scripting)', hasValue: false },
  { flags: ['--sandbox'], description: 'Select sandbox mode (e.g. workspace-write, read-only)', hasValue: true, valueDescription: '<mode>' },
  { flags: ['--cd'], description: 'Change directory before running the command', hasValue: true, valueDescription: '<path>' },
  { flags: ['--debug'], description: 'Enable verbose debug logging', hasValue: false },
  { flags: ['--config'], description: 'Path to a Codex config file', hasValue: true, valueDescription: '<file>' },
  { flags: ['--help'], description: 'Show Codex CLI help', hasValue: false },
  { flags: ['--version'], description: 'Print Codex CLI version', hasValue: false },
];

const SAFETY_MARGIN = 1;

// Layout constants
const LAYOUT_CONSTANTS = {
  FIXED_ELEMENT_HEIGHT: 15,
  SUGGESTIONS_BASE_HEIGHT: 5,
  MAX_SUGGESTIONS_SHOWN: 5,
  MIN_OPTIONS_LIST_HEIGHT: 10,
  OPTIONS_LIST_MARGIN: 4,
  DEFAULT_TERMINAL_HEIGHT: 24
} as const;

export const CommandEditor: React.FC<CommandEditorProps> = ({ initialArgs, onComplete, onCancel }) => {
  const { stdout } = useStdout();
  const [commandLine, setCommandLine] = useState(initialArgs.join(' '));
  const [cursorPosition, setCursorPosition] = useState(commandLine.length);
  const [suggestions, setSuggestions] = useState<CodexOption[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  
  const terminalHeight = stdout?.rows || LAYOUT_CONSTANTS.DEFAULT_TERMINAL_HEIGHT;
  const totalHeight = terminalHeight - SAFETY_MARGIN;

  useEffect(() => {
    // Update suggestions based on current input
    const currentWord = getCurrentWord();
    if (currentWord.startsWith('-') || currentWord.length === 0) {
      const matching = codexOptions.filter(opt => 
        opt.flags.some(flag => flag.toLowerCase().startsWith(currentWord.toLowerCase()))
      );
      setSuggestions(matching);
      setSelectedSuggestion(0);
    } else {
      setSuggestions([]);
    }
  }, [commandLine, cursorPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  const getCurrentWord = () => {
    const beforeCursor = commandLine.substring(0, cursorPosition);
    const words = beforeCursor.split(' ');
    return words[words.length - 1] || '';
  };

  const insertSuggestion = (suggestion: CodexOption) => {
    // Guard against invalid suggestions
    if (!suggestion || !suggestion.flags || suggestion.flags.length === 0) {
      return;
    }
    
    // Validate cursor position
    if (cursorPosition < 0 || cursorPosition > commandLine.length) {
      return;
    }
    
    const beforeCursor = commandLine.substring(0, cursorPosition);
    const afterCursor = commandLine.substring(cursorPosition);
    const words = beforeCursor.split(' ');
    const currentWord = words[words.length - 1] || '';
    
    // Replace the current word with the suggestion
    const beforeWord = beforeCursor.substring(0, beforeCursor.length - currentWord.length);
    // Use the flag that matches the current input, or the last (long form) flag
    const matchingFlag = suggestion.flags.find(flag => flag.toLowerCase().startsWith(currentWord.toLowerCase())) || suggestion.flags[suggestion.flags.length - 1];
    // Always add a space after the flag to prevent re-matching
    const newCommand = beforeWord + matchingFlag + ' ' + afterCursor;
    setCommandLine(newCommand);
    setCursorPosition(beforeWord.length + matchingFlag.length + 1);
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    
    if (key.ctrl && input === 'c') {
      onCancel();
      return;
    }

    if (key.return) {
      if (suggestions.length > 0) {
        // If suggestions are shown, insert the selected one
        insertSuggestion(suggestions[selectedSuggestion]);
      } else {
        // Otherwise, complete the editing
        const args = commandLine.trim().split(/\s+/).filter(arg => arg.length > 0);
        onComplete(args);
      }
      return;
    }

    // Navigation in suggestions
    if (suggestions.length > 0) {
      if (key.upArrow) {
        setSelectedSuggestion(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedSuggestion(prev => Math.min(suggestions.length - 1, prev + 1));
        return;
      }
      if (key.tab) {
        insertSuggestion(suggestions[selectedSuggestion]);
        return;
      }
    }

    // Text editing
    if (key.leftArrow) {
      setCursorPosition(prev => Math.max(0, prev - 1));
    } else if (key.rightArrow) {
      setCursorPosition(prev => Math.min(commandLine.length, prev + 1));
    } else if (key.backspace || key.delete) {
      if (cursorPosition > 0) {
        setCommandLine(prev => 
          prev.substring(0, cursorPosition - 1) + prev.substring(cursorPosition)
        );
        setCursorPosition(prev => prev - 1);
      }
    } else if (input && !key.ctrl && !key.meta) {
      setCommandLine(prev => 
        prev.substring(0, cursorPosition) + input + prev.substring(cursorPosition)
      );
      setCursorPosition(prev => prev + input.length);
    }
  });

  // Calculate display with cursor
  const displayCommand = () => {
    const before = commandLine.substring(0, cursorPosition);
    const at = commandLine[cursorPosition] || ' ';
    const after = commandLine.substring(cursorPosition + 1);
    
    return (
      <>
        <Text>{before}</Text>
        <Text inverse>{at}</Text>
        <Text>{after}</Text>
      </>
    );
  };

  // Calculate dynamic heights
  // Fixed elements: title (1) + help text (1) + command box (2) + disclaimer (4) + shortcuts (1) + borders (2) + padding (2) + margins (2) = 15
  const fixedHeight = LAYOUT_CONSTANTS.FIXED_ELEMENT_HEIGHT;
  
  // Height for suggestions if shown: title (1) + items + help (1) + borders (2) + margin (1) = 5 + items
  const suggestionsHeight = suggestions.length > 0 
    ? LAYOUT_CONSTANTS.SUGGESTIONS_BASE_HEIGHT + Math.min(suggestions.length, LAYOUT_CONSTANTS.MAX_SUGGESTIONS_SHOWN) 
    : 0;
  
  // Calculate remaining height for options list
  const remainingHeight = totalHeight - fixedHeight - suggestionsHeight;
  const optionsListHeight = Math.max(
    LAYOUT_CONSTANTS.MIN_OPTIONS_LIST_HEIGHT, 
    remainingHeight - LAYOUT_CONSTANTS.OPTIONS_LIST_MARGIN
  );

  return (
    <Box height={totalHeight} flexDirection="column">
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} paddingY={1}>
        <Text bold color="cyan">Codex Command Editor</Text>
        <Text dimColor>Codex CLI に渡すオプションを編集します。Enter で決定、Esc でキャンセル。</Text>
        
        <Box marginTop={1}>
          <Text bold>Command: </Text>
          <Text>codex </Text>
          {displayCommand()}
        </Box>

        {suggestions.length > 0 && (
          <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
            <Text bold>Suggestions:</Text>
            {suggestions.slice(0, LAYOUT_CONSTANTS.MAX_SUGGESTIONS_SHOWN).map((suggestion, index) => {
              const flagText = suggestion.flags.join(', ');
              const isSelected = index === selectedSuggestion;
              return (
                <Box key={flagText}>
                  <Text color={isSelected ? 'green' : 'white'}>
                    {isSelected ? '▶ ' : '  '}
                    <Text bold>{flagText}</Text>
                    {' - '}
                    <Text dimColor>{suggestion.description}</Text>
                  </Text>
                </Box>
              );
            })}
            <Box marginTop={1}>
              <Text dimColor>↑↓ to navigate, Tab/Enter to select</Text>
            </Box>
          </Box>
        )}

        <Box marginTop={1} flexDirection="column">
          <Text bold>Available Options:</Text>
          <Box flexDirection="column" height={optionsListHeight} overflow="hidden">
            {codexOptions.map(option => {
              const flagDisplay = option.flags.join(', ') + (option.valueDescription ? ` ${option.valueDescription}` : '');
              const paddedFlag = flagDisplay.padEnd(35);
              return (
                <Text key={option.flags.join(',')} dimColor>
                  <Text>{paddedFlag}</Text>
                  {option.description}
                </Text>
              );
            })}
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text dimColor>
            ⚠️  Note: This list is based on codex --help at a specific point in time.
          </Text>
          <Text dimColor>
            Please refer to official docs for the latest valid options.
          </Text>
          <Text dimColor>
            Options like -r, -c, -h may cause ccresume-codex to malfunction.
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            Shortcuts: Enter=confirm, Esc=cancel, ←/→=move cursor, Tab=autocomplete
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
