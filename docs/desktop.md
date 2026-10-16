# Pane desktop preview

The Windows x64 desktop app reuses the existing web UI and backend. Electron hosts a sandboxed, context-isolated renderer; Node integration and webviews are disabled. The preload bridge is limited to lifecycle checkpoints and bounded native notifications. File selection stays behind authenticated backend routes and uses an owner-bound Electron dialog. New windows are blocked; HTTP(S) links open in the system browser.

## Build and run

```sh
npm ci
npm run desktop
npm run desktop:pack
npm run desktop:dist
```

`desktop` launches the development app; `desktop:pack` produces `release/win-unpacked/Pane.exe`; `desktop:dist` produces the NSIS installer. Build on Windows x64. Electron includes its runtime; an installed Node.js is not needed to run the packaged application. Git, OpenSSH and AI CLIs must be installed separately. The native node-pty addon uses its N-API Windows prebuild; its binaries and ConPTY helpers are unpacked from ASAR. Do not replace them with an ABI-specific build from another runtime.

The desktop backend listens only on `127.0.0.1:17317`. The original browser server remains independent at port 7317. A single-instance lock prevents a second app instance; launching again reveals the existing window. If the desktop port is occupied, startup reports the error instead of attaching to an unrelated service. For isolated development/tests, set `PANE_DESKTOP_DATA_DIR` and `PANE_DESKTOP_PORT`.

## Window controls

The desktop window uses a single in-app title/tab row, with a Pane menu and minimize, maximize/restore and close buttons. Its left and right sections follow the sidebar edges, keeping tabs aligned with the working area during sidebar resizing and collapse. Empty title/tab areas drag the window; interactive controls and tabs remain clickable/draggable independently. The native Windows caption and menu bar are removed. Closing uses the same tray/quit safeguards. Ctrl+Q quits, F11 toggles fullscreen, and Ctrl+R reloads.

## Closing and recovery

- Closing a window with running terminals or unsaved files offers **Keep running in tray**, **Quit Pane**, and **Cancel**. Tray → Show Pane reveals the same window and processes.
- **Quit Pane** checkpoints state and ends Pane-owned terminals/agents. Original processes do not survive a full app quit, server crash or machine restart. Pending Git/GitHub writes block normal quit until they finish.
- Desktop saves file/image tabs, the presence of Git tabs, workspace selection, tab positions, terminal/file split trees and ratios, and supported unsaved text drafts. Data is local to the Electron profile and is not written into the repository.
- Reload reattaches live PTYs. After a full restart, previous terminals appear as ended placeholders. **Restart terminal** starts a fresh CLI/shell/SSH session; **History** can resume an exact supported AI conversation. Pane never silently starts a fresh agent or sends a prompt as part of recovery.
- Newer files on disk are not overwritten by recovered drafts: the original version remains the save precondition. Copy the recovered text before closing the tab if you need to reconcile it with the new file. A missing file with a draft is opened as an unsaved recovery buffer; saving cannot recreate it automatically.
- Recovery is bounded to 64 file tabs, 2 MiB per draft and 3 MiB per workbench snapshot. Failed persistence is reported and quitting warns if recovery could not be confirmed. It is not a replacement for saving files. Historical diff tabs, GitHub form inputs, exact editor cursor/scroll state, and full terminal scrollback are not persisted across a full restart.

Normally `%APPDATA%/Pane` contains workspace registration, the Chromium profile, window geometry and `desktop.log`. Pane → Open diagnostics folder opens it. The development app adopts `.ai-web/projects.json` on first use without modifying the browser state. Packaged first use starts without registered workspaces. Browser preferences are not imported. The installer preserves user data during upgrades and uninstall.

## Verification

```sh
npm run typecheck
npm test
npm run test:desktop
```

Desktop tests use isolated profiles, real PowerShell PTYs, stubbed native dialog selections and temporary files. They verify renderer isolation, file picker ownership, draft/split recovery, keeping sessions alive while hidden, stopping a real child process on quit, stale-file protection and ended-session restoration. They do not send AI prompts or make GitHub writes.

To test the packaged runtime, build it first and set `PANE_DESKTOP_EXECUTABLE` to the absolute path of `release/win-unpacked/Pane.exe`, then run `npx playwright test --config config/playwright/desktop.config.ts`.

## File editing modes

Markdown (`.md` and `.markdown`) shows **Source / Live Editor** when rich editing is compatible, and **Source / Preview** otherwise. Existing Preview preferences and restored preview views automatically select Live Editor for compatible Markdown. Ctrl+Shift+V toggles Source and the available visual mode. Live Editor provides formatted editing for headings, emphasis, lists/tasks, tables, code blocks and local images. It shares the same Monaco document buffer, dirty indicator, save/version checks and draft recovery. Simply opening a rich view does not rewrite or dirty the source. YAML front matter is preserved verbatim and edited in Source. Other text/code files retain Editor and Preview; images and Git diffs retain their existing viewers.

The Markdown codec loads lazily when checking a Markdown file; the editable surface mounts only when selected. The Live Editor button is enabled only after eligibility passes using the same extension/schema configuration as the mounted editor; unsupported files keep Source and Preview. Files over 256 KiB, embedded HTML/JSX, reference definitions/footnotes, and unsupported round trips stay editable in Source, with Preview still available. A parsed-content comparison refuses rich editing when the Markdown codec would lose meaning, while treating HTML entities and reordered inline marks as equivalent. External images are not fetched. Primary, secondary and detached file panes have their own view switches; desktop recovery includes the selected live view and supported unsaved drafts.

## Files context menu

Right-click a file, folder or empty area in Files (or use Shift+F10 on a focused entry) to create files/folders, copy absolute/relative paths, duplicate, rename, reveal in File Explorer, or move items to Recycle Bin. Creation uses the selected folder or the selected file's parent. Existing names are never silently overwritten. Rename/trash close affected clean tabs; renamed files are reopened at their new paths. Save or close affected unsaved files before renaming, duplicating or deleting them.

Recycle Bin and File Explorer use scoped Electron shell actions and are disabled in browser-only mode. There is no permanent-delete fallback. Workspace roots, open nested workspaces, metadata paths and linked entries are protected from these mutations. Failed recursive copies report that a partial copy may remain; originals are retained.

## Updates and releases

Settings → **About & Updates** displays the actual runtime version, platform, stable channel, last check, release notes and download progress. The installed Windows x64 app checks GitHub Releases five seconds after a fresh launch, then every six hours; a recent successful check retains its remaining interval across restarts; automatic checks can be disabled in this page (saved to `updates.json`). Manual checks still work. Focus/wake triggers an overdue check; transient failures retry after 15 minutes with exponential backoff capped at six hours. Known available releases are retained across restarts and background network failures. Overlapping requests share one check. Downloads are explicit. A small titlebar button announces an available/downloaded update and opens this page.

Updates use `electron-updater` with the public `vincody/pane` GitHub release feed, generated `latest.yml`, installer and blockmap. Drafts and prereleases are excluded; downgrades are disabled. No GitHub CLI or user GitHub token is required. The feed must remain publicly readable; if source becomes private, move releases to a public distribution repository and change `publish` before distributing builds. Never embed a GitHub token in the app.

**Update now** approves the full download/install/relaunch flow. Installation waits for pending writes and requires successful recovery; it uses silent NSIS installation without a second confirmation. An ordinary quit never silently installs an unapproved update. Original terminal/agent/SSH processes cannot survive an update. Development and browser editions do not download desktop updates. Install using the NSIS installer before validating actual upgrades; the unpacked executable is only for smoke checks.

To publish a stable release:

1. Change `package.json` and the lockfile together with `npm version 0.1.1 --no-git-tag-version` (use the next unused version).
2. Commit and push all required app/workflow changes. Then run `git tag v0.1.1` and `git push origin v0.1.1`.
3. `.github/workflows/desktop-release.yml` validates the tag/version match, checks types and units, exercises native recovery, and builds Windows x64 NSIS on GitHub Actions.
4. The workflow creates a **Draft Release** with installer, `.blockmap` and `latest.yml`. Only the job's short-lived `GITHUB_TOKEN` is used to upload; ensure repository Actions policy permits the job's `contents: write` permission. Reruns may replace draft assets but refuse already published releases.
5. Download/install and review the draft build, edit its release notes, then **Publish release** in GitHub. Published metadata becomes visible to installed clients. Pushing normal commits does not create a release.

The first public release establishes the update baseline. To verify end-to-end, install that version and publish a higher version, then exercise checking, downloading, canceling restart, and installing with supported drafts and terminals. An unpublished feed may report an update-check error; it must not claim the app is up to date. No release/tag is created by local build commands (`--publish never` should be used when packaging manually).

## Release status

This is a desktop preview, not a signed public release. The GitHub update feed and draft-release workflow are configured; a published baseline and a higher release are still required to verify a real installed upgrade. Windows builds are currently unsigned; release signing and clean-machine upgrade verification remain release gates, alongside broader DPI/multi-monitor/native-dialog checks. When signing is configured, keep updater publisher-signature verification enabled. macOS and Linux desktop packaging are not configured or verified.


## Notifications

Settings → Notifications separates in-app **Popup notifications** from **System notifications**. Both retain completion, input-request and error events and transition deduplication. System notifications are enabled by default, including for existing profiles; existing popup, sound and focused preferences are preserved. Background native notifications use Electron. **Notification sound** offers App sound (default), Windows default, or Off. App sound plays bundled `done.mp3` for completion and `request.mp3` for action requests/errors, while silencing the Windows toast to avoid duplicate sounds. A single player prevents overlapping tones, including while minimized or hidden in the tray. The desktop renderer permits this local audio without an initial click. Existing sound-off preferences migrate to Off. Windows default uses the OS toast sound; Off silences both. Enabling **Notify while focused** also permits delivery while Pane is focused. Clicking a notification restores Pane and opens its session.

**Test notification** always sends an explicit system notification while Settings is open, even if automatic notifications or UI popups are off. It uses the sound preference and reports confirmed delivery, unsupported platforms or errors. Windows Do Not Disturb / notification settings can suppress banners even after accepting delivery. System notification delivery is desktop-only and always uses Electron IPC, never the browser Notification API. An old native bridge reports a required full quit/reopen instead of requesting browser permission.


## One-step updates

After a new version is found, **Update now** approves downloading, silent installation and automatic relaunch in one action. The UI explains that running terminal/agent/SSH processes will end and supported drafts/layout will be recovered. Background checks still never download or install without that action. Downloads expose progress; failures require an explicit retry. Before installation, main checks for active writes and waits for them to finish, saves session recovery and flushes storage. If recovery cannot be saved, it stops without closing sessions. Windows NSIS installs with silent mode and force-relaunch enabled. Normal quit keeps its existing confirmation behavior.
