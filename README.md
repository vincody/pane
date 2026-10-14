# Pane

A local workspace for AI agent terminals, files and Git changes. Pane runs Codex and Claude Code through their own CLIs in real terminal processes, with a web interface built around split panes.

The current application runs locally in a browser. Desktop packaging is planned.

## Requirements

- Node.js 22 or newer and npm.
- Git for the Changes view.
- Codex and/or Claude Code installed and signed in separately. Shell terminals work without an AI CLI.
- Windows is the primary development platform. Other platforms have not received the same manual verification.

## Run

```sh
git clone https://github.com/vincody/pane.git
cd pane
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:7317**. Keep the server running while using the app.

On Windows, the included scripts can start the server in the background or stop it:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-AIWeb.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Stop-AIWeb.ps1
```

On a fresh checkout, the start script installs dependencies and builds the frontend. After frontend changes, run `npm run build` and reload the browser; after backend changes, restart the server.

## Features

- **Workspaces:** open local folders, rename their display names, resize or hide either sidebar.
- **Terminals:** launch Shell, Codex or Claude; rename tabs; reorder, split, swap, resize and maximize panes. Closing a terminal ends its process.
- **Files:** Monaco editor, Markdown/HTML/image previews, image zoom and Markdown code-block copying. Choose Editor or Preview as the default in Settings.
- **Git Changes:** list staged, unstaged and untracked changes in a local Git repository. Open read-only diffs as tabs, split them with terminals, and use inline diff in narrow panes. Newly initialized repositories work before their first commit; binary and oversized files have no supported text diff.
- **History:** read local Codex/Claude session logs, filter by workspace and search names, then resume the exact conversation in a terminal. History does not keep closed terminals running.
- **Usage:** show account quota remaining for Codex/Claude. Select providers and 5-hour, weekly, both or closest-to-limit windows. The Usage dialog shows limits and reset times; token/cost accounting is not implemented yet.
- **Dev servers:** a compact server count near Settings opens the current workspace's listening ports, process names and status, with Open/Copy URL actions for recognized web servers. Detection uses terminal descendants or process directory/command paths; HTTP/HTTPS is checked locally. Servers with insufficient workspace evidence are omitted. Scan failures show unknown status; two complete missed observations confirm a stop.
- **Notifications:** optional popup and sound for completed work or input/approval requests, including an option to notify while focused. Detection depends on CLI terminal signals and may vary between CLI versions.
- **Settings:** appearance, editor, terminal layout, usage, notifications and keybinds; preferences are stored in this browser.

## Local data and limits

Workspace registration and server state live in `.ai-web/`, which is excluded from Git. CLI conversations remain in the providers' own local directories. Bundled fonts, provider marks and notification sounds are attributed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The server binds to `127.0.0.1`. HTTP APIs require a per-run token and check the local origin. File access is limited to registered workspaces, including checks on linked paths. The application is intended for local use and has not been designed for public Internet hosting.

Text editing is limited to UTF-8 files up to 2 MB. Saves preserve BOM and line endings and reject stale versions if another process changed the file. Unsaved edits and terminal scrollback are not restored after a page reload.

Markdown previews are sanitized. HTML previews are static and sandboxed, with scripting and remote resource loading disabled.

## Development and checks

```sh
npm run build
npm run typecheck
npm test
```

Playwright tests are in `tests/e2e`; install Chromium with `npx playwright install chromium` before running `npm run test:ui`. Some older browser tests cover retired chat interfaces and need migration to the terminal-first UI.

Application source, build configuration and tests use TypeScript with strict checking. `tsconfig.client.json`, `tsconfig.server.json` and `tsconfig.tests.json` separate browser, Node and test environments. `shared/contracts.ts` defines API/session/terminal contracts; `client/src/lib/api.ts` handles the HTTP boundary. Node runs the backend through `tsx`.

`client/src/features/` groups React components and controllers by function. Shared React bridges are in `client/src/components/`. Terminal/editor controllers use `.ts` with a DOM bridge so xterm and Monaco retain their existing lifecycle. `demo/example.js` remains a JavaScript preview fixture.

For the current terminal interface, run `npx playwright test tests/e2e/compact-terminal-tabs.spec.ts tests/e2e/dev-servers.spec.ts tests/e2e/split-launcher.spec.ts tests/e2e/split-preview.spec.ts tests/e2e/file-git-status.spec.ts tests/e2e/react-components.spec.ts tests/e2e/typescript-files.spec.ts`. These cover workspace navigation, server tracking, split panes, preferences, History resume, terminal identity, Git decorations, editing, previews and stale-save protection. The other browser tests include retired chat flows as noted above.

See [Repository structure](docs/repository-structure.md) for source ownership and entry points. Generated builds, runtime data, logs and reference checkouts are excluded from commits.
