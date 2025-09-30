# Repository Guidelines

## Project Structure & Module Organization
- `src/cli.tsx` boots the Ink-powered CLI, handling argument parsing and platform notices.
- `src/App.tsx` orchestrates pagination, key bindings, and launching Codex sessions.
- `src/components/` contains Ink view components (conversation list, previews, command editor).
- `src/utils/` houses helpers for reading Codex logs, loading TOML config, truncation, and key matching.
- `src/__tests__/` includes Jest specs; keep new tests alongside related modules.
- `docs/` stores screenshots and demo assets referenced in the README.

## Build, Test, and Development Commands
- `npm install` — install dependencies (Node.js 18+ required).
- `npm run dev` — run the CLI in watch mode via `tsx src/cli.tsx`.
- `npm run build` — compile TypeScript to `dist/` with declaration files.
- `npm run typecheck` — run the TypeScript compiler with `--noEmit` for fast validation.
- `npm run lint` — apply the ESLint flat config across `src/`.
- `npm test` / `npm run test:watch` / `npm run test:coverage` — execute Jest once, in watch mode, or with coverage.

## Coding Style & Naming Conventions
- TypeScript with strict compiler flags; prefer explicit types for public APIs.
- Two-space indentation, single quotes, trailing commas where allowed.
- Follow React functional component patterns; keep JSX concise and typed.
- ESLint (`@typescript-eslint`, React, Hooks) is the source of truth; resolve warnings before submitting.
- Export shared interfaces from `src/types/`; name files in `kebab-case` or `camelCase` to match existing modules.

## Testing Guidelines
- Use Jest with `ts-jest` (ESM) and `ink-testing-library` for component behavior.
- Place test files in `src/__tests__/` using the pattern `*.test.ts` or `*.test.tsx`.
- Cover edge cases like absent Codex logs, missing config files, and key-binding overrides.
- Run `npm test` before pushing; add coverage for new utilities or CLI flows.

## Commit & Pull Request Guidelines
- Write imperative, descriptive commit titles (e.g., `fix: retry reading conversations`); group related edits.
- Reference GitHub issues in the body when applicable, and summarize user-facing effects.
- PRs should describe motivation, outline testing (commands run), and include screenshots or terminal clips if UI output changed.
- Verify `npm run lint`, `npm run typecheck`, and relevant tests locally before requesting review.

## Configuration Tips
- Provide sample key bindings or overrides in `config.toml.example`; keep docs synchronized with new flags.
- When adding Codex CLI integrations, confirm unknown args are forwarded safely and document usage in the README.
