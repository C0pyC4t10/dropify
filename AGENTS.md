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

## Brand voice — keep commits + UI copy on-brand

Dropify sounds like a senior dispatcher who has run the floor for ten
years. See **`BRAND_GUIDELINE.md` §2.1** for the full rules. The
non-negotiable bits for code + UI copy:

- **Direct, not blunt.** "This won't work for you." beats
  "We have some concerns about whether this might be the right fit."
- **Plain, not curt.** "Stock is low." beats "Inventory levels are
  approaching a critical threshold requiring your immediate attention."
- **Confident, not braggy.** State what we will do, don't boast about
  what we have done.
- **Operator-aware, not lecture-y.** The reader is a working operator,
  not an IT director; do not explain their job to them.

**Voice checklist for every UI string you write:**

1. Could the operator say this out loud on the dispatch floor? If no,
   rewrite.
2. Is there jargon that hides what the action actually does? Cut it.
3. Are you using marketing-speak ("trusted", "innovative",
   "customer-focused")? Cut it. Those words belong to no one.
4. Is the sentence 2× longer than it needs to be? Cut it.
5. Does the message explain what to do next, not just what went wrong?
   Add the action.

**Color + visual tokens — read the design system, don't hard-code.**

- Color palette is fully tokenized in `src/app/globals.css`. Components
  must consume semantic tokens (`--color-brand`, `--color-success`,
  `--color-warning`, `--color-danger`, `--color-info`, `--tint-brand-12`,
  etc.), not the brand palette directly (`--accent-green`).
- The full system is documented live at `/admin/design-system` with
  live swatches and the brand voice card.
- Hard-coded hex values in new code are a review-blocker. Existing
  legacy hexes are tracked down over time — see the brand-guideline
  traceability table in `BRAND_GUIDELINE.md` §6.1.