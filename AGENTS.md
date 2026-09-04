# Project preferences — meat-delivery-ops

## GitHub / Git workflow

- **NEVER push to GitHub without explicit confirmation.** After every
  implementation that touches committed code, STOP and ask the user before
  running `git push`. Phrase the prompt clearly: "Push it?" with a short
  diff stat so they can decide. Do not push until they confirm.
- **Committing is fine without asking; pushing is NOT.** If the user asks
  for "commit and push" in one breath, still split it into two steps and
  ask before the push. Never chain `git commit` and `git push` into a
  single bash command.
- Before pushing, show what's in the commit (`git show --stat`) so the user
  can review the diff before approving.
- When pushing requires credentials, prefer `gh auth setup-git` (uses the
  existing `gh` CLI keyring auth — already set up on this machine for the
  `C0pyC4t10` account). Run it once per fresh machine:
  ```
  gh auth setup-git && git push
  ```
  No token needs to be pasted again; `gh` is already authenticated.
  Fallback if `gh` is not installed/authenticated: ask once per session for a
  PAT, cache it in `$GITHUB_TOKEN` for that session only, and remind the
  user to revoke it after the session.
- Do not amend, force-push, or run `git commit --amend` without explicit
  confirmation.
- When asked to commit+push, commit the feature files explicitly
  (`git add <specific-files>`), not `git add -A` or `git add .` — leave any
  unrelated local changes (e.g. auto-installed deps, build artifacts) for
  the user to review separately.

## Dev server (auto-start on login)

- The Next.js dev server is configured to start automatically when the user
  logs into this laptop (Ubuntu 24.04) via a systemd **user** service:
  `~/.config/systemd/user/meat-delivery.service`.
- It runs `npm run dev:lan` from the project root, listening on `0.0.0.0:3000`
  (so the LAN IP works too). Auto-restarts on failure (`Restart=on-failure`,
  `RestartSec=5`).
- It was set up once with:
  ```
  mkdir -p ~/.config/systemd/user
  systemctl --user daemon-reload
  systemctl --user enable meat-delivery.service
  systemctl --user start meat-delivery.service
  ```
- To check status / stop / restart manually:
  ```
  systemctl --user status meat-delivery
  systemctl --user stop meat-delivery
  systemctl --user restart meat-delivery
  systemctl --user disable meat-delivery   # to remove auto-start
  ```
- Logs go to the journal (`journalctl --user -u meat-delivery -f`) and to
  `meat-delivery.log` / `startup.log` in the project root.
- If the user reports the server is down, check `systemctl --user status`
  first before re-running anything.

## Project conventions

- UI framework: Next.js 16 (App Router, Turbopack), React 19, Tailwind v4.
- DB: SQLite via `better-sqlite3` (file at `data/meat_delivery.db`).
- All order/parser logic lives in `src/lib/`. UI components in
  `src/components/`, routes in `src/app/`.
- Order source enum (`OrderSource` in `src/lib/types.ts`):
  `manual | facebook | wordpress | phone | whatsapp | walkin`.
- Type-check with `npx tsc --noEmit`; lint with `npm run lint` (pre-existing
  warnings/errors in unrelated files are expected — don't try to fix them
  unless asked).