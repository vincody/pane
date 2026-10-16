# Pane

A local workspace for AI agent terminals, files and Git. Pane runs Codex and Claude Code through their own CLIs in real terminal processes, with a split-pane interface. Use it in a browser or as the Windows desktop app (which bundles its own backend).

## Requirements

- Node.js 22+ and npm (not needed for the packaged desktop app).
- Git. Codex and/or Claude Code installed and signed in separately; shell terminals work without them.
- Windows is the primary platform; others are not manually verified.

## Run

```sh
git clone https://github.com/vincody/pane.git
cd pane
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:7317**. On Windows, `scripts/Start-AIWeb.ps1` and `scripts/Stop-AIWeb.ps1` run the server in the background. After frontend changes run `npm run build`; after backend changes restart the server.

## Features

- **Projects and worktrees:** open a folder, clone a URL or create a Git project. Each project lists Local and its worktrees with branch, sessions, a status glyph (working, needs input, failed, ready for review) and +/- line totals. `Ctrl+Shift+J` jumps to the next session needing attention. New worktrees derive a branch from a task name or reuse an existing branch, fetch remote branches first, never overwrite folders, and leave Local edits in Local.
- **Terminals:** Shell, Codex, Claude or SSH. Rename, reorder, split, resize and maximize panes. Reloading reattaches to running terminals while the server runs.
- **Files:** Monaco editor, live Markdown editing, Markdown/HTML/image previews and Material Icon Theme file icons.
- **Git:** staged/unstaged/untracked changes with read-only diffs; branch status, fetch, fast-forward pull, push and publish (never force); a commit graph with branch filter, search and historical diffs.
- **GitHub:** with the GitHub CLI signed in (`gh auth login`) and a github.com `origin`, browse pull requests and issues, read descriptions, files, patches and CI checks, comment, create draft PRs and issues, and start a worktree from an issue. Merging and reviewing stay on GitHub.
- **Browser (desktop app):** open any http(s) page or a running dev server in a tab next to your terminals, with back, forward, reload, DevTools and an address bar. It runs in a separate session and cannot reach Pane itself.
- **Links:** Ctrl+click a web link in the terminal or a Markdown file and choose Pane's Browser tab or your system browser (or remember the choice in Settings → Links). Pane also offers to open a dev server when its address shows up in the terminal.
- **SSH:** connects through local OpenSSH. Only the host, user, port and key *path* are saved; credentials stay with OpenSSH.
- **History:** read local Codex/Claude session logs and resume a conversation in a terminal.
- **Usage:** quota remaining (warning below 20%) and locally recorded token totals for Codex and Claude.
- **Local servers:** listening ports per workspace and branch, with Open, Copy URL and Stop (a second click confirms). The server running Pane itself is not listed, and Pane never stops itself, its parents or a terminal.
- **Notifications:** an in-app notice while Pane is focused, a system notification while it is in the background, and optional sound.
- **Desktop app (Windows x64):** own local backend, tray, restored tabs, layouts and unsaved drafts after restart, and updates from GitHub Releases (Settings → About & Updates). See [docs/desktop.md](docs/desktop.md).
- **Settings:** Light/Dark theme following `DESIGN.md`, editor, terminal, usage, notification and keybind options, stored in the browser.

## Local data and limits

- Workspace and server state live in `.ai-web/` (not committed); CLI conversations stay in the providers' own directories. Fonts, provider marks, sounds and icons are credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- The server binds to `127.0.0.1`, requires a per-run token and checks the local origin. File access is limited to registered workspaces. It is not designed for public hosting.
- Text editing: UTF-8 files up to 2 MB; saves keep BOM and line endings and reject stale versions. Markdown previews are sanitized; HTML previews are static and sandboxed.
- Terminals replay up to the last 512 KiB after a reload; a server or machine restart ends the original processes. In browser mode, unsaved edits and exact split layouts are not restored after a reload.

## Development

```sh
npm run typecheck   # client, server, desktop and tests
npm test            # unit tests
npm run test:ui     # browser tests (npx playwright install chromium first)
npm run icons       # regenerate file icons from material-icon-theme
```

Desktop: `npm run desktop` runs it, `npm run desktop:pack` builds the unpacked app and `npm run desktop:dist` the installer into `release/` (unsigned). `npm run test:desktop` runs native tests on port 17317. A stable version tag builds a draft release on GitHub Actions; publish it after reviewing the installer. Details in [docs/desktop.md](docs/desktop.md#updates-and-releases).

All code is strict TypeScript; `shared/contracts.ts` defines the browser/server contracts. Some browser tests cover retired chat interfaces and need migrating. See [docs/repository-structure.md](docs/repository-structure.md) for source layout and conventions.
