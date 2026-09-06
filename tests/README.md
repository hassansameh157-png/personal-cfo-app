# Tests

Playwright scripts that drive `../index.html` directly from disk (`file://`), since
the whole app is one self-contained static file with no dev server. Each script is a
small end-to-end scenario, not a unit test — click through the real UI, assert on
what actually rendered.

## Running

```sh
cd tests
npm install
npx playwright install chromium   # first time only
npm test
```

Chromium's launch path can be overridden (e.g. a sandboxed environment with its own
pre-installed browser) via `PW_CHROMIUM_PATH=/path/to/chromium npm test` — otherwise
Playwright uses the browser it just installed.

Every script blocks all non-`file://` network requests before navigating, so a
flaky `fonts.googleapis.com` preconnect (the app's only external reference) can
never affect a result.

## What's covered

**Core flows** (`smoke_batch1.js`–`smoke_batch7.js`, `smoke_accounts.js`,
`smoke_tx_edit.js`, `smoke_loans.js`, `smoke_v2.js`): the day-to-day surface —
adding/editing/duplicating/reversing transactions, accounts (cards, wallets,
e-cards, reordering, custom colors), people, tags, category auto-suggest, the
payoff calculator, quick-add chips, the what-if simulator, statement payments,
recurring rules, and dozens of smaller invariants (e.g. a zero-transaction
account can be deleted, a card's Available/Limit stay consistent).

**Specific regressions, each tied to a real bug that shipped and was fixed**
(so a future change can't silently reintroduce it):
- `check_batch3.js` / `check_batch3_fixes.js` — the credit-card flip animation,
  chart tap-tooltips, and the expandable net-worth trend (correct newest-first
  ordering on the card's back face, focus management, `inert` on the hidden
  face, lazy computation).
- `check_category_bug.js` — category auto-suggest silently overwriting a
  manual pick or an edit's already-saved category.
- `check_category_filter.js` — the category-bar/budget-alert exact-match
  filter (a category name that's also ordinary English text, like "Food",
  used to falsely match on substring instead of the real category field).
- `check_storage_fixes.js` / `check_migration.js` / `check_migration_fixes.js`
  — a failed save/load being surfaced honestly instead of silently showing
  demo data as if it were real, and the legacy-storage-key migration path
  (including skipping past a corrupted legacy key to reach a valid older one).
- `check_xss_hardening.js` — every onclick-argument escape site (person
  names, tags, categories) hardened against the same backslash-before-quote
  injection class.
- `check_backup_reminder.js` — the "you haven't backed up in a while" nudge
  and its exact trigger conditions.
- `check_forecast_stmt.js`, `check_overall_states.js`, `check_batch4a.js`,
  `verify_internal_transfer.js`, `shot_person_history.js`,
  `shot_statements.js` — Forecast statement labeling, the overall-budget
  progress states, focus rings/flash-pill stacking/PWA metadata, internal
  transfers never counting as income or expense, Person Detail history, and
  card-statement rendering.

## Adding a new one

Match the existing shape: launch Chromium (respecting `PW_CHROMIUM_PATH`),
block non-`file://` requests, navigate to `../index.html`, `require("./_watchdog")`
right after the `require`s at the top, drive the UI with Playwright locators,
and `console.log` clearly-labeled assertions rather than using a real
assertion library — these scripts are meant to be read top to bottom like a
script of what a person clicked and what they should see, not just a
pass/fail count. If the script exists specifically because of a bug someone
found, say so in a comment, the way the ones above do.

`_watchdog.js` (any file starting with `_` is a shared helper, not a test —
`npm test`'s glob skips them) is what makes a wrong result actually fail the
run instead of just printing something a human has to notice: it treats any
logged literal `false` as a failure and sets a non-zero exit code once the
script ends. Follow the suite's existing "`<label>: <expected-true-boolean>`"
phrasing for anything that should be caught this way. A check that can't
naturally be phrased as a boolean (a raw count, a captured-errors array
that's fine to be non-empty in the label but not the whole story) needs its
own explicit boolean line, the way the `errors.length ? errors : "none"`
dump used everywhere is followed by `errors.length === 0` — don't rely on
the watchdog to infer pass/fail from a non-boolean value, it deliberately
doesn't (see the comment in `_watchdog.js` for why).
