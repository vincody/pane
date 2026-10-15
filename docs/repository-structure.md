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
      history/               CLI session history and resume
      layout/                Titlebar, tab order, drag/drop and sidebar resizing
      notifications/         Notification signals, titles and activity animation
      settings/              Settings UI
      terminal/              PTY view, pane layout, input, activity and naming
      usage/                 Account quota UI
      workspaces/            Workspace sidebar and selection helpers
    lib/                     Browser HTTP and DOM utilities
    styles/                  Application styles
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
      sessions/              Local CLI logs, lifecycle and runners
      terminal/              PTY transport and process discovery
      usage/                 Provider account quotas
    lib/                     CLI binary discovery
shared/                      Browser/server API and terminal contracts
config/
  typescript/                Client, server, desktop and test typecheck configs
  playwright/                Browser and desktop test runner configs
tests/
  unit/                      Node test suite, including service integration checks
  e2e/                       Playwright browser checks and fixtures
  helpers/                   Shared server and Codex test helpers
scripts/                     Windows background start/stop scripts
docs/                        Architecture and implementation notes
demo/                        File preview examples
```

## Conventions

- Put feature-specific views, controllers and types beside their feature.
- Use shared browser components or utilities only when multiple features need them.
- Keep browser/server payload definitions in `shared/contracts.ts`.
- Keep Vite, npm commands and the shared `tsconfig.json` at the root. TypeScript environment configs live in `config/typescript/`; Playwright configs live in `config/playwright/`.
- Keep generated `dist/`, runtime `.ai-web/`, screenshots, logs and reference checkouts out of source control.

## Checks

`npm run typecheck`, `npm run build` and `npm test` use the source paths above. `npm run test:ui` discovers `tests/e2e`; the README lists current terminal-focused browser checks. Older chat checks remain available for migration and are not the acceptance suite for the terminal UI.
