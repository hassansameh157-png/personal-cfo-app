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

`npm test` runs each script under `timeout -k 10 90` (needs GNU coreutils'
`timeout` — already on any GitHub Actions Linux runner and most Linux dev
boxes; macOS needs `brew install coreutils` and to alias `gtimeout` as
`timeout`) so one script hanging can't block the whole suite indefinitely —
seen for real once, when a runner under load pushed an ordinarily-instant
click well past Playwright's own action timeout. A script that legitimately
needs longer than 90s would need this bumped, but nothing in the suite has
come close so far.

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
- `check_category_icons.js` — a real icon per built-in category on
  Dashboard's category bars and each categorized transaction row's badge,
  a sensible fallback glyph for a custom (user-added) category rather than
  a blank/broken one, and no badge at all on an uncategorized/transfer row.
- `check_quick_add_fab.js` — the persistent floating "+" (mobile only,
  hidden on desktop where the topbar's own "+ Expense" already covers it):
  opens/closes its quick-add sheet, is mutually exclusive with the More
  sheet, and each of its three items opens the right modal.
- `check_swipe_actions.js` — swipe-to-reveal Edit/Delete on transaction
  rows: only an `app.txEditable()` row gets the swipe wrapper at all, at
  rest (no swipe at all) Edit/Delete never visually bleed through the row
  (a real bug reported by the user with a screenshot, and the actual root
  cause behind it: `.swipe-content` used the same translucent "glass"
  background token every other card uses, invisible against the app's own
  muted background but sitting here directly over `.swipe-actions`'
  saturated Edit/purple and Delete/red buttons instead, so the same
  translucency let a real chunk of that color show straight through with
  no swipe needed at all -- fixed with a dedicated fully-opaque surface
  token used only here), a drag past halfway snaps open and a short one snaps back closed, opening
  one row closes any other, RTL (Arabic) reveals on the correct physical
  side (a real bug: `translateX` is a physical property, `.swipe-actions`
  is positioned with a logical one), tapping a revealed button doesn't
  slide the row shut under the tap (a real bug: the buttons live in
  `.swipe-actions`, a sibling of `.swipe-content`, not inside it), an
  ordinary vertical scroll through the list never gets mistaken for a
  swipe (a real bug reported by the user with a screenshot: a bare
  `dx > dy` tiebreak past a tiny 6px dead zone let a scroll's very first,
  barely-sideways pixel decide the whole gesture, leaving rows stuck open
  in production), and a steady diagonal swipe still opens the row despite
  that fix's stronger scroll bias (a real bug caught in code review: the
  fix's `dx > dy*1.75` bar left a dead band a proportional diagonal drag
  could never cross, so the swipe would silently do nothing).
- `check_budget_ring.js` — the circular progress ring for the overall
  monthly budget: appears only once a budget is set, tracks
  normal/near/over color state, the label reads the true percentage even
  past 100% while the ring geometry itself still clamps to a full circle,
  and the label no longer overlaps the amount now that both share a row
  with the ring (a real layout bug found and fixed during development).
- `check_scoped_metrics.js` — the per-account/per-category metrics row:
  filtering Transactions to one plain account, one credit card, or one
  category swaps the global Available/Net worth/... row for that one
  thing's own numbers (Balance+in/out, Outstanding/Available/Limit/
  Statement due, or This month+Budget remaining+Transaction count), the
  global row returns once the filter clears back to "all", an account
  filter wins over a simultaneous category filter, and a credit card's
  4th tile ("Statement due") actually stays visible on a narrow mobile
  viewport (a real layout bug found in review: the global row's own
  "hide the 4th/5th tile on mobile" CSS rule matched by nth-child
  position alone, so it would have silently swallowed the scoped row's
  4th tile too without its own `.scoped` modifier class).
- `check_page_transition.js` — the light slide+fade on a real page
  switch: fires exactly once on genuine navigation, never on a same-page
  re-render (typing in the transaction search, opening a modal), fires
  again on the next real nav after that, and `prefers-reduced-motion`
  disables the animation itself.
- `check_haptic_feedback.js` — `navigator.vibrate()` feedback: fires on
  an accepted destructive `confirm()` dialog and a successful modal
  save, stays silent on a cancelled dialog or a rejected (validation
  failure) save.
- `check_chart_scrub.js` — dragging a finger across a bar chart
  (`.chart-cols`) live-updates the existing tap tooltip through every
  bar it crosses, a tiny haptic tick per bar, a plain tap still works
  as before, an ordinary vertical scroll never triggers it, and a
  short bar right next to a tall one is still picked up correctly even
  while the touch stays at the tall bar's own Y (a real bug caught in
  review: finding the crossed bar via `document.elementFromPoint()`
  only works while the touch happens to still be over that specific
  bar's own bottom-aligned box, so a short bar next to a tall one
  would be missed entirely — fixed by matching on each bar's column's
  X-range instead, independent of bar height).
- `check_card_usage_bar.js` — the thin Outstanding/Limit usage bar on
  each credit-card tile in Accounts: present and matches the real
  percentage on every card, entirely absent on a plain balance account
  (wallet/bank/cash), which has no natural ceiling to show usage
  against.
- `check_first_category_badge.js` — the "First <category>" badge on
  the one transaction that's the true earliest use of its own category:
  shows on the earliest, not on a later one in the same category, moves
  with the badge-worthy transaction when it's edited to an earlier
  date (date-driven, not entry-order), a same-date tie goes to the
  earlier `created` timestamp, and both the mobile card and desktop
  table render it consistently (one shared helper, not two copies that
  could drift — a real duplication caught in review).
- `check_group_similar_tx.js` — the opt-in, mobile-only "Group similar"
  toggle on Transactions: off by default with every row still plain,
  turning it on collapses rows sharing type + category + description
  into one expandable summary (correct occurrence count and aggregate
  total), a same-text description under a different category or with
  no repeat stays ungrouped, expanding reveals every real member with
  its full normal Edit/Delete/Duplicate actions intact, and the
  desktop table is completely untouched by the toggle. Also covers two
  real bugs caught in review before shipping: a voided/reversed row
  matching an otherwise-groupable description never joins the group
  (its amount previously inflated the total with no visual sign once
  merged in), and two `installment_payment` rows from economically
  opposite-direction plans never group together (that type's sign
  depends on the specific plan, not the type alone, so the type is
  excluded from grouping entirely rather than risk netting unrelated
  debts into one misleading figure).
- `check_account_timeline.js` — the vertical Account Timeline shown only
  while Transactions is filtered to exactly one account: absent
  everywhere else, newest-first, each dot's color genuinely tracks its
  own transaction's sign, reflects every other active filter too (not
  just the account), and disappears again once the account filter
  clears. A real bug caught in review is folded into this file rather
  than a separate one: a reversed/voided transaction used to render
  with a full-color dot like a live one, unlike its own muted/
  strikethrough treatment everywhere else in this same page.
- `check_todos.js` — the To-do list: adding, editing, checking off and
  deleting a to-do never creates a transaction and never moves available
  balance, net worth, or the transaction count by even one (verified
  before and after the whole flow) — Engine.submit()'s "todo"/"todo_edit"
  branches deliberately never call the `push()` closure every other kind
  in that function uses. A due-soon (within 3 days) or overdue to-do
  surfaces as its own "To-do due —" card in the Dashboard's Needs
  Attention section and in the attentionCount badge; one with no due date,
  or one due more than 3 days out, never does; editing a to-do's due date
  into the past re-surfaces it worded as overdue ("Was due", negative
  tone) instead of upcoming; checking it off drops it from both the
  Dashboard and the badge without deleting the row. Also covers a real XSS
  finding from code review: a to-do's `due` field can arrive unvalidated
  via Settings → Restore from JSON (same as title/notes), and an
  HTML-bearing value used to render unescaped on both the To-do list row
  and the Dashboard reminder card's body — fixed by escaping it on both
  sites, and by extracting one shared `Engine.isTodoOverdue()` so the list
  page and the Dashboard/badge can never quietly disagree about which row
  counts as overdue.
- `check_dashboard_recut.js` — six purely visual/layout changes to
  Dashboard, previewed for the user as a concept mockup before shipping:
  Needs Attention collapses to its first 3 alert cards with a "+N more"
  expand button (starting collapsed again on every fresh visit, not stuck
  open from a previous one), the hero card's background carries a real
  multi-layer aurora gradient instead of a flat fill, its headline value
  renders larger and semibold, the "Where my money is" tiles get a
  matching icon + color tint for each of the 6 real money-bucket tiles
  (deliberately NOT the 3 derived-total tiles — I owe/Total assets/Net
  worth aren't a place money sits), the Available Balance headline gets
  its own sparkline (previously only the smaller Net worth sub-value had
  one, drawn as a genuinely separate `<svg>`, not the same element moved),
  and Dashboard's/Reports' shared `catBar()` category-bar icons now match
  the colored circular badge Transactions already uses for the same
  category instead of a flat muted-grey glyph. Collapsing Needs Attention
  to 3 cards meant several *other* existing tests could no longer find an
  alert card by text past that cutoff — `check_todos.js`, `shot_statements.js`,
  `smoke_loans.js`, `smoke_batch3.js` and `check_overall_states.js` were all
  updated to expand the list (or set the expanded flag directly) before
  asserting on a specific card, and `check_category_icons.js`'s Dashboard
  section was updated for the new `.cat-badge` markup in place of the old
  `.bar-name-ico` (removed entirely, no longer referenced anywhere).
- `check_transactions_recut.js` — a real charset/doctype bug fix plus four
  mobile-focused changes to Transactions (#33's desktop table row-height
  was explicitly out of scope -- this user's own usage is 100% mobile).
  `index.html` had neither a `<meta charset>` nor a `<!DOCTYPE html>`,
  relying entirely on the browser's own charset-sniffing and quirks-mode
  fallback -- confirmed for real via mangled `—`/`→` bytes in one browser
  context and not another with nothing else about the page changed; both
  are now declared explicitly, first thing in the file. #31: Edit/Reverse/
  Duplicate/Delete moved off up to 4 always-visible inline links per row
  into one shared "..." trigger opening `UI.renderTxActionSheet()`, reusing
  the exact `.sheet`/`.sheet-backdrop` markup (and desktop popover
  treatment) `renderMoreSheet()`/`renderQuickAddSheet()` already
  established. #32: the 4 structural filter dropdowns (type/account/
  period/category) now collapse behind a `.filters-toggle` (badged with
  how many are active); search stays in its own always-visible row --
  first built collapsing all 5 filters together including search, which
  broke both real usage and every test reaching straight for `#txSearch`,
  so it was redesigned to this split instead of patched around. #34: a
  small color dot per real account (2 for a transfer-like row) now sits
  ahead of the account name in every transaction row, Transactions and
  Person Detail's History both. #35: a plain date-section header ("Today"/
  "Yesterday"/weekday/short-date) now precedes the first card of each new
  calendar day in the mobile list, skipped while "Group similar" is on
  (a group can legitimately span several real dates). Two real bugs
  surfaced by the full suite, not by ad-hoc checking, both regression-
  guarded here: `deleteTxC()` only called `render()` on a *confirmed*
  delete, so cancelling left the action-sheet's `.sheet-backdrop` stuck in
  the DOM, silently intercepting the next click anywhere else on the page;
  and `txDateGroupLabel()`'s weekday name was computed by re-parsing the
  date-only string with the viewer's own local timezone instead of UTC,
  rolling the displayed weekday back a day for anyone west of UTC. A third
  bug caught in code review (not by any test failure): Person Detail's
  History shares `txSign()` with Transactions and so already computed
  `accColors` for #34's dots, but its own row markup never read them --
  fixed alongside the others. Rewriting `txRowActions()` around the new
  sheet broke a second, larger wave of tests across 9 other files that
  clicked the old always-visible `button.link-btn:has-text('Edit'/'Delete'/
  'Duplicate')` inline links directly (`check_category_filter.js`,
  `smoke_batch5.js`, `check_other_kind_scoping.js`, `smoke_batch3.js`,
  `shot_statements.js`, `check_haptic_feedback.js`, `smoke_tx_edit.js`,
  `check_category_bug.js`, `shot_person_history.js`) -- each updated to
  open the row's `.tx-more-btn` sheet first, and `check_swipe_actions.js`/
  `check_group_similar_tx.js` updated their own row-actions assertions the
  same way.
- `check_accounts_recut.js` — five mobile-focused changes to Accounts.
  #36: Edit/[+ Statement, credit cards only]/Move up/Move down/Delete all
  moved off up to 5 always-visible inline links per tile/row into one
  shared "..." trigger opening `UI.renderAcctActionSheet()`, reusing the
  same `.sheet`/`.sheet-backdrop` markup Transactions' own action sheet
  established. #37: a real per-type icon (cash/bank/wallet/ecard, reusing
  Dashboard's own `ICON_CASH` etc.) now fills the small corner mark on a
  balance tile instead of a blank circle -- a credit card keeps its
  existing gold chip mark untouched. #38: a brand-new account/card no
  longer defaults to the same flat grey/navy every time
  (`Engine.nextAccountAutoColor()`, cycling through `ACCOUNT_AUTO_COLORS`
  and skipping anything already in use) -- a real color pick still always
  wins. #39: the tile types now render under 3 headed sub-sections ("Cash
  & bank"/"Wallets & e-cards"/"Credit cards", headings only shown once
  there's more than one non-empty group to actually tell apart) --
  `Engine.acctTileGroup()` is shared by both that display grouping and
  `Engine.moveAccount()`, which now scopes an up/down reorder to the exact
  same finer sub-group instead of the old coarse tile/row boolean, so an
  enabled arrow can never silently jump an account across a group boundary
  the user can see. #40: a balance-trend sparkline (same `weeklyDerives`/
  5-cutoff pattern Dashboard's own hero-card sparklines use) now sits on
  every non-debt tile -- deliberately skipped on credit cards, whose
  3-column Outstanding/Available/Limit row is already tight on width and
  which already have their own usage bar covering "how full" instead of a
  trend. Two real bugs surfaced during implementation, both fixed and
  regression-guarded here: `deleteAccountC()` only called `render()` when
  the delete was actually confirmed (same class of bug as Transactions
  Recut's own `deleteTxC` fix); and the sheet's Edit/+ Statement items
  originally called `UI.openModal(...)` directly without first clearing
  `_acctActionRow`, so the sheet's own markup stayed in the DOM underneath
  the modal and could reappear once it closed -- fixed by routing both
  through new `openAcctEdit(id)`/`openAcctStatement(id)` wrapper methods
  that clear the sheet state before handing off to `openModal()`, the same
  pattern `UI.openTxEdit()` already used. `smoke_accounts.js`,
  `smoke_batch5.js`, `smoke_batch6.js`, `smoke_batch7.js`, and
  `shot_statements.js` were updated for the new `.acct-more-btn` sheet
  trigger in place of the old inline buttons.
- `check_people_recut.js` — seven mobile-focused changes to People and
  Person Detail. #41: "+ Lend / owed to me"/"+ Debt I owe"/Edit/Delete
  moved off up to 5 always-visible buttons per card/row into one shared
  "..." trigger opening `UI.renderPersonActionSheet()`, reusing the same
  `.sheet`/`.sheet-backdrop` markup Transactions'/Accounts' own action
  sheets established -- Pay/Collect stay their own always-visible primary
  button, the one action common enough to keep right there. #42: a
  name/phone/notes search (`S.peopleQ`), its own field rather than reusing
  Transactions' `filt.q`, so searching People never leaks into (or gets
  clobbered by) an unrelated search left on the Transactions page. #43: a
  count-based summary tile (people who owe me / people I owe / settled) --
  deliberately counts, not amounts, since the total owed to/by me already
  has a real home on Dashboard's own position tiles; repeating that figure
  here would just be a duplicate, while a relationship count is genuinely
  new information. #44: a "last active Xd ago" line per person (mobile
  only), reusing the exact same `r.personId === p.id` query Person
  Detail's own History section already keys off. #45: a person whose net
  balance is effectively zero (settled) collapses into its own section by
  default (mobile only), same "+N more"/expand-on-demand pattern
  Dashboard's own Needs Attention already established (idea 25) -- an
  active search always shows them uncollapsed, since hiding a person you
  just searched for by name because they happen to be settled would be
  actively unhelpful. #46: `tel:`/`wa.me` links next to a phone number
  (`personPhoneLinks()`), previously plain unreachable text on a page
  whose whole point is tracking money owed to/by real people -- no
  WhatsApp logo (trademarked, same "no bank logos" reasoning
  `cardBackground()` already gives for account tiles), just a generic
  message-circle icon and the "Message" label. #47: a real bug fix --
  tapping a person's own "Transactions" link used to set
  `filt.q = person.name` (a free-text search), which both over-matched
  (any unrelated transaction whose description happened to mention that
  name) and under-matched (a transaction genuinely tied to them via
  `personId`, but whose description never said their name at all) -- the
  same shape as the already-documented "Food" category bug. Replaced with
  a real `filt.person` exact match (`UI.viewPersonTx(id)`) and a new
  "Person" dropdown alongside type/account/period/category in
  Transactions' own filter row.

  Two real bugs surfaced during implementation, both fixed and
  regression-guarded here: `deletePersonC()` only called `render()` on a
  *confirmed* delete, same class of bug as `deleteTxC`/`deleteAccountC`'s
  own fixes; and the sheet's "+ Lend"/"+ Debt"/Edit items originally
  called `UI.openModal(...)` directly without first clearing
  `_personActionRow`, leaving the sheet's own markup in the DOM underneath
  the modal, ready to reappear once it closed -- fixed via new
  `openPersonForm(kind, id)`/`openPersonEdit(id)` wrapper methods that
  clear the sheet state first, the same pattern Accounts'
  `openAcctEdit`/`openAcctStatement` already established. A third,
  narrower bug caught in code review (not a test failure): the People
  list's own summary tile (#43) counted from the full unfiltered list
  instead of the search-filtered one, so it visibly disagreed with the
  cards/table underneath it while a search was narrowing them down.
  `smoke_batch7.js`, `smoke_tx_edit.js`, `smoke_v2.js`,
  `check_xss_hardening.js`, and `check_transactions_recut.js` (now 5
  filter-row dropdowns, not 4) were updated for the new sheet trigger and
  the settled-collapse default -- a brand-new, zero-balance person is
  settled by construction, so any test creating one and immediately
  expecting to find their card needs to expand that section first.

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
