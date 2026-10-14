# Terminal notification signals

Pane uses its own detector; Herdr is not a runtime dependency.

The design reference is Herdr's `src/detect/manifests/codex.toml`,
`src/detect/manifests/claude.toml`, and
`src/server/headless/notifications.rs` on the upstream master branch,
reviewed 2026-10-14: https://github.com/herdrdev/herdr.

CLI OSC titles supply action-required and spinner signals. Live question and
approval panels outrank completion evidence. Transcript viewers preserve the
previous status; command menus are not agent action requests. Completion needs
a previously observed working turn plus a finished marker or an agent OSC
title returning to idle. Resolving an action request alone is not completion.

Terminal-screen parsing remains a fallback and can vary with CLI versions.
No CLI hooks or user CLI configuration are installed or changed.
