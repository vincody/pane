# Pane

A local workspace for AI agent terminals, files and Git changes. Pane runs Codex and Claude Code through their own CLIs in real terminal processes, with a web interface built around split panes.

Pane runs locally in a browser or in the Windows desktop preview. The desktop build includes its backend runtime; Git and AI CLIs remain separate installations.

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

- **Desktop preview (Windows x64):** an Electron window starts its own local backend, with owner-bound native file/folder dialogs, tray hide/reopen, and explicit quit behavior. Desktop recovery restores file tabs, workspace selection, tab order, terminal/file split layouts and supported unsaved drafts. Reload reconnects live terminals; a full restart restores ended tabs without automatically starting agents or SSH. Newer disk files are protected from stale recovered saves. See [Desktop development and release](docs/desktop.md) for limits, data locations and lifecycle behavior.

- **Workspaces:** browse local folders with a centered native Windows picker, clone a Git URL, or create a new Git project. Folder browsing and new-project locations default to Downloads; manual paths remain available. Rename display names and resize or hide either sidebar. Git branches and sessions stay visible under each folder, alongside attention counts. Session rows show working, waiting for input, completed or error states, with unread markers cleared when viewed. Ctrl+Shift+J (Cmd+Shift+J on macOS) jumps to the next session needing attention.
- **Worktrees:** The Workspaces sidebar groups each project's Local checkout and named worktrees, with branches, notes and sessions inside each card. The Orca-style create composer offers Project, optional Create From, Start from and Agent. Type a task name to derive a branch, choose a branch as the starting point, or leave the name blank for a generated marine-creature name. Reuse branch checks out an available local branch; a checked-out branch can be opened separately without changing it. Advanced provides branch override, location and note. Names that collide get a numeric suffix; existing folders are never overwritten. Choose Claude Code, Codex, a blank terminal or no session. Creating from a remote branch automatically fetches that branch before creating the worktree; fetch failures stop creation and offer retrying or choosing a local branch. Local edits stay in Local, and switching working folders preserves sessions. Remove from web preserves worktree files and branches on disk.
- **Terminals:** launch Shell, Codex, Claude or SSH from New session; rename tabs; reorder, split, swap, resize and maximize panes. Right-click a tab or pane title for its management menu; terminal contents keep their own mouse handling. Focused pane titles blend into the terminal background, with compact line spacing and correctly fitted padding. Reloading the same browser tab reattaches to the existing terminal process while the Pane server remains running. Closing a terminal explicitly ends its process. Detached terminals continue running until closed or the server stops.
- **Files:** Monaco editor, Markdown/HTML/image previews, image zoom and Markdown code-block copying. Choose Editor or Preview as the default in Settings.
- **Git Changes:** list staged, unstaged and untracked changes in a local Git repository. Open read-only diffs as tabs, split them with terminals, and use inline diff in narrow panes. Newly initialized repositories work before their first commit; binary and oversized files have no supported text diff.
- **Git Sync & Graph:** use the dedicated Git button in the left sidebar toolbar for branch/upstream status, ahead/behind counts, Fetch, fast-forward Pull, Push and Publish branch. Its main Git tab shows a graph with colored merge lanes, local/remote/tag labels, branch filtering and search. Select a commit and file to open its historical diff in the editor. History loads up to 400 commits; merge diffs use the first parent. Pull requires a clean working tree and stops on divergence; pushes never force. The graph is an original Pane implementation, with workflow inspiration from [VS Code Git Graph](https://github.com/mhutchie/vscode-git-graph).
- **SSH:** New session → SSH opens a terminal connection using local OpenSSH. Save a host/alias, optional username, port and private key file path in this browser; selecting an already-open connection focuses its tab. Blank username/port preserve SSH config defaults. Choose key opens a native Windows file picker; you can also enter an absolute key path. OpenSSH reads the selected file directly; Pane saves only its path, never the key contents or passphrase. Keys, SSH agent, passwords and host key confirmations are handled by OpenSSH in the terminal; credentials are not saved in connection profiles.
- **History:** read local Codex/Claude session logs, filter by workspace and search names, then resume the exact conversation in a terminal. History does not keep closed terminals running.
- **Usage:** show account quota remaining for Codex and Claude, with a warning below 20%. Select providers and 5-hour, weekly, both or closest-to-limit windows. The Usage dialog combines current limits and reset times with locally recorded Codex/Claude tokens across all workspaces (today, last 7 days, last 30 days or all history). Input includes cache tokens; cache read/write are also shown separately. Archived Codex sessions and Claude subagent logs are included without counting copied events twice. Antigravity token history and cost accounting are not supported.
- **Local servers:** a compact server count near Settings opens listening ports, process names and status across all open workspaces and worktrees, with each server labeled by workspace and branch, with Open/Copy URL actions for recognized web servers. Detection uses terminal descendants or process directory/command paths; HTTP/HTTPS is checked locally. Servers with insufficient workspace evidence are omitted. Scan failures show unknown status; two complete missed observations confirm a stop.
- **Notifications:** optional popup and sound for completed work or input/approval requests, including an option to notify while focused. Detection depends on CLI terminal signals and may vary between CLI versions.
- **Settings:** appearance, editor, terminal layout, usage, notifications and keybinds; preferences are stored in this browser. Choose Light or Dark under Settings → Appearance → Color theme; the selection is saved and applied before the app renders. Both themes follow `DESIGN.md`: warm cream or dark surfaces, coral actions, Inter UI text, serif display headings and dark code/terminal panes. Theme tokens and surface rules live in `client/src/styles/design-theme.css`.

- **GitHub PRs & Issues:** the main Git tab has Graph, Pull requests and Issues sections. Each workspace/worktree has its own tab strip for files, terminals and Git; the selection is keyed by the working folder rather than its branch. Switching away preserves open files, unsaved edits, the selected tab, Git drafts, and terminal split groups/ratios without restarting sessions. Returning restores that workspace view. Each workspace opens one Git tab; reopening selects the existing tab. Tabs remain bound to their workspace and preserve the selected view, scroll and draft input while switching to another tab or workspace. Closing a Git tab releases its view; close is disabled during a pending write. Sign in with the locally installed GitHub CLI (`gh auth login`); the workspace must have a github.com `origin` remote. Browse recent items, read sanitized descriptions, review PR file trees and patches, and inspect CI checks. Create a draft PR from the current branch after publishing/pushing it; Pane verifies the remote commit before submitting. New issue offers a title, Markdown Write/Preview, and searchable repository labels with multi-selection and paged loading. Submissions preserve text on error and open the created issue on success; GitHub labels depend on repository permissions. Issues offer Start working (prefilled worktree name and note) and Copy prompt for your AI session. PR/issue lists are kept in a bounded browser-memory cache: reopening within 30 seconds paints immediately, older results stay visible while revalidating, and Refresh bypasses the cache. GitHub CLI concurrency is limited to four commands, duplicate server reads are coalesced, PR metadata is reused between detail sections, and successful mutations invalidate cached results. Lists show up to 50 recent items from the first 100 results; PR files are limited to 100. PR Conversation shows the description, general comments, submitted reviews and code comments, with paged loading and refresh. Write or preview a Markdown comment and post it using your CLI account; failed submissions keep the text. Merge, submitting reviews, inline replies, editing/deleting comments, issue templates, assignees and milestones remain on GitHub.

## Local data and limits

Workspace registration and server state live in `.ai-web/`, which is excluded from Git. CLI conversations remain in the providers' own local directories. Bundled fonts, provider marks and notification sounds are attributed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The server binds to `127.0.0.1`. HTTP APIs require a per-run token and check the local origin. File access is limited to registered workspaces, including checks on linked paths. The application is intended for local use and has not been designed for public Internet hosting.

Text editing is limited to UTF-8 files up to 2 MB. Saves preserve BOM and line endings and reject stale versions if another process changed the file. In browser mode, unsaved edits are not restored after a page reload. Live terminal tabs restore from session metadata in the same browser tab and replay up to the most recent 512 KiB of output. In browser mode, exact split layouts and full historical scrollback are not restored; server or machine restarts end the original processes.

Markdown previews are sanitized. HTML previews are static and sandboxed, with scripting and remote resource loading disabled.

## Development and checks

### Windows desktop preview

```sh
npm ci
npm run desktop
```

Use `npm run desktop:pack` for the unpacked Windows app or `npm run desktop:dist` for the installer. Output is in `release/`; `release/win-unpacked/Pane.exe` runs without a separately installed Node.js. Builds are currently unsigned. Settings → About & Updates manages updates from published GitHub Releases. Pushing a stable version tag builds a Draft Release through GitHub Actions; publish it after reviewing the installer. Local build commands never publish releases. See the release steps in the [desktop documentation](docs/desktop.md#updates-and-releases).

```sh
npm run test:desktop
```

Desktop runs independently on port 17317. The development build adopts registered folders from `.ai-web/projects.json` on first use without changing the web state. Browser preferences are not imported. Settings → Integrations checks local Git, OpenSSH, Codex and Claude executables and GitHub CLI sign-in. See [desktop documentation](docs/desktop.md).

### Web and shared checks

```sh
npm run build
npm run typecheck
npm test
```

Playwright tests are in `tests/e2e`; install Chromium with `npx playwright install chromium` before running `npm run test:ui`. Some older browser tests cover retired chat interfaces and need migration to the terminal-first UI.

Application source, build configuration and tests use TypeScript with strict checking. `config/typescript/client.json`, `config/typescript/server.json` and `config/typescript/tests.json` separate browser, Node and test environments. `shared/contracts.ts` defines API/session/terminal contracts; `client/src/lib/api.ts` handles the HTTP boundary. Node runs the backend through `tsx`.

`client/src/features/` groups React components and controllers by function. Shared React bridges are in `client/src/components/`. Terminal/editor controllers use `.ts` with a DOM bridge so xterm and Monaco retain their existing lifecycle. `demo/example.js` remains a JavaScript preview fixture.

For the current terminal interface, run `npx playwright test --config config/playwright/web.config.ts tests/e2e/compact-terminal-tabs.spec.ts tests/e2e/dev-servers.spec.ts tests/e2e/split-launcher.spec.ts tests/e2e/split-preview.spec.ts tests/e2e/file-git-status.spec.ts tests/e2e/react-components.spec.ts tests/e2e/typescript-files.spec.ts`. These cover workspace navigation, server tracking, split panes, preferences, History resume, terminal identity, Git decorations, editing, previews and stale-save protection. The other browser tests include retired chat flows as noted above.

See [Repository structure](docs/repository-structure.md) for source ownership and entry points. Generated builds, runtime data, logs and reference checkouts are excluded from commits.
