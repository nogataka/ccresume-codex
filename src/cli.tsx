#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import App from './App.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get command line arguments (excluding node and script path)
const args = process.argv.slice(2);

// Check if '.' is present as a standalone argument - indicates current directory filtering
const currentDirOnly = args.includes('.');
let filteredArgs = args.filter(arg => arg !== '.');

// Parse --hide option
let hideOptions: string[] = [];
const hideIndex = filteredArgs.findIndex(arg => arg === '--hide');
if (hideIndex !== -1) {
  // Valid hide options
  const validHideOptions = ['tool', 'thinking', 'user', 'assistant'];
  
  // Collect all arguments after --hide until the next option or end
  let i = hideIndex + 1;
  let argCount = 0;
  while (i < filteredArgs.length && !filteredArgs[i].startsWith('-')) {
    const arg = filteredArgs[i];
    // Only add valid hide options
    if (validHideOptions.includes(arg)) {
      hideOptions.push(arg);
      argCount++;
      i++;
    } else {
      // Stop collecting if we hit an invalid hide option
      // This argument might be meant for codex
      break;
    }
  }
  
  // If no arguments provided, use default: tool and thinking
  if (hideOptions.length === 0) {
    hideOptions = ['tool', 'thinking'];
  }
  
  // Remove --hide and its arguments from filteredArgs
  filteredArgs = [
    ...filteredArgs.slice(0, hideIndex),
    ...filteredArgs.slice(hideIndex + 1 + argCount)
  ];
}

// Handle --help
if (filteredArgs.includes('--help') || filteredArgs.includes('-h')) {
  console.log(`ccresume-codex - TUI for browsing Codex conversations

Usage: ccresume-codex [.] [options]

Options:
  .                    Filter conversations to current directory only
  --hide [types...]    Hide specific message types (tool, thinking, user, assistant)
                       Default: tool thinking (when no types specified)
  -h, --help           Show this help message
  -v, --version        Show version number

All other options are passed to the codex CLI when launching a session.

Keyboard Controls:
  ↑/↓           Navigate conversations list
  ←/→           Navigate between pages
  j/k           Scroll chat history
  Enter         Resume selected conversation
  n             Start new session in selected directory
  -             Edit command options for Codex
  c             Copy session UUID
  q             Quit

Examples:
  ccresume-codex
  ccresume-codex .
  ccresume-codex -- --json --sandbox workspace-write
  ccresume-codex . -- --model o1-preview

Configuration:
  Key bindings can be customized in: ~/.config/ccresume/config.toml
  See example: https://github.com/sasazame/ccresume/blob/develop/config.toml.example

  Note: When new features are added that conflict with your custom key bindings,
  you'll need to either:
    - Add the new key binding explicitly to your config.toml
    - Remove/modify the conflicting custom key binding

For more info: https://github.com/nogataka/ccresume-codex`);
  process.exit(0);
}

// Handle --version
if (filteredArgs.includes('--version') || filteredArgs.includes('-v')) {
  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  console.log(packageJson.version);
  process.exit(0);
}

const codexArgs = filteredArgs;

// Show Windows-specific notice at startup with pause
if (process.platform === 'win32') {
  const { spawn } = await import('child_process');
  
  console.log('');
  console.log('📝 Windows ユーザー向けの注意: Codex CLI 起動後に入力できない場合は ENTER を押してください。');
  console.log('   これは既知の Windows 環境での制限に対する一時的な回避策です。');
  console.log('');
  
  // Use spawn with inherited stdio to ensure proper pause behavior
  const pause = spawn('cmd.exe', ['/c', 'pause'], { stdio: 'inherit' });
  
  // Wait for pause to complete before continuing
  await new Promise((resolve) => {
    pause.on('close', resolve);
  });
}

// Render the app in fullscreen mode
const { unmount } = render(
  <App codexArgs={codexArgs} currentDirOnly={currentDirOnly} hideOptions={hideOptions} />,
  {
    exitOnCtrlC: true
  }
);

// Handle graceful exit
process.on('exit', () => {
  unmount();
});
