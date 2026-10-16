# Repository structure

Pane uses one package with separate browser and Node source trees. Modules are grouped by the feature they serve; moving files does not change API routes, browser preferences, workspace data or CLI session locations.

```text
client/
  index.html                 Browser HTML entry
  public/                    App icon, provider marks, fonts and sounds
  src/
    app/main.ts              Application startup and feature coordination
    components/              Shared React bridges and component contracts
    features/
      agents/                Agent transcript controller
      dev-servers/           Workspace server tracking UI
      files/                 Documents, previews, images and Git decorations
                             File tree, file languages and Monaco worker setup
                             File and folder icons: file-icons.ts, file-icon-lookup.ts and the
                             generated file-icon-manifest.json; SVGs live in client/public/file-icons
      git/                   Git graph, sync, GitHub PRs and issues
      history/               CLI session history and resume
      layout/                Titlebar, tab order, drag/drop and sidebar resizing
      notifications/         Notification signals, titles and activity animation
      settings/              Settings UI
      terminal/              PTY view, pane layout, input, activity and naming
                             Connection lifecycle and shared pane types
      usage/                 Account quota UI
      workspaces/            Workspace sidebar and selection helpers
                             Worktree creation lives in worktree-dialog.ts;
                             row status and +/- totals in session-attention.ts and workspace-diff.ts
    lib/                     Browser HTTP and DOM utilities
    styles/                  Ordered stylesheet entry and application styles
      styles.css             Imports foundation, workspace-chat, navigation,
                             then workbench; preserve this cascade order
      workspace-sidebar.css  Project list rows; imported last so it overrides design-theme.css
server/
  src/
    index.ts                 Server entry point
    app.ts                   HTTP routes and service coordination
    features/
      agents/                Tool action parsing
      codex/                 Codex transport, control and live sessions
      dev-servers/           Port collection and workspace attribution
      files/                 Workspace registry and safe file access
      git/                   Branch detection, changes and diffs
                             Worktrees, sync and GitHub integration
      integrations/          Local tool availability and authentication
      sessions/              Local CLI logs, lifecycle and runners
      terminal/              PTY transport and process discovery
      usage/                 Provider account quotas
    lib/                     CLI binary discovery
shared/                      Browser/server API and terminal contracts
desktop/                     Electron startup, preload bridge and native APIs
                             Update controller and background check schedule
config/
  typescript/                Client, server, desktop and test typecheck configs
  playwright/                Browser and desktop test runner configs
tests/
  unit/                      Node test suite, including service integration checks
  e2e/                       Playwright browser checks and fixtures
  desktop/                   Native Electron and packaged updater checks
  helpers/                   Shared server and Codex test helpers
scripts/                     Desktop build and Windows start/stop scripts
docs/                        Architecture and implementation notes
demo/                        File preview examples
```

## Conventions

- Put feature-specific views, controllers and types beside their feature.
- Use shared browser components or utilities only when multiple features need them.
- Keep browser/server payload definitions in `shared/contracts.ts`.
- Keep Vite, npm commands and the shared `tsconfig.json` at the root. TypeScript environment configs live in `config/typescript/`; Playwright configs live in `config/playwright/`.
- Keep generated `dist/`, runtime `.ai-web/`, screenshots, logs and reference checkouts out of source control.
- Keep file tree rendering in `features/files/file-tree.ts` and terminal connection handling in `features/terminal/terminal-connection.ts`. Pass coordination callbacks from the application or view instead of importing their mutable state.
- The `/api/sub-workspaces` route remains unchanged for compatibility; source and test filenames use worktree terminology.
- File and folder icons come from material-icon-theme (MIT). Regenerate `client/public/file-icons/` and the manifest with `npm run icons` after changing the package version, and commit the output.
- The stylesheet split preserves existing overrides. Move rules between these files only after checking cascade order; feature-local styles such as Live Editor stay beside their modules.

## Checks

`npm run typecheck`, `npm run build` and `npm test` use the source paths above. `npm run test:ui` discovers `tests/e2e`; the README lists current terminal-focused browser checks. Older chat checks remain available for migration and are not the acceptance suite for the terminal UI.
