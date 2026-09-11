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
- `check_installments_recut.js` -- two real bugs plus nine mobile-focused
  changes to the Installments screen. #48: a plan with nothing left owed on
  it (`remaining <= 0.001`) loses its "Record payment" button -- previously
  a guaranteed dead end, since `submit()`'s own cap check refuses any
  amount against 0 remaining -- the same condition Person Detail's own
  `planSection` already applied. #49: a direction (owed to me / I owe)
  with zero plans in it at all now hides its whole KPI header and 4-tile
  group, not just an all-zero one sitting there for nothing to act on.
  #50: a plan's person name is a tappable link (`UI.viewPerson()`), the one
  remaining place in the app holding a person's name that wasn't also a way
  to jump to their own page. #51: the next unpaid schedule row now shows
  right on the closed card ("Next: #3 · 2026-09-01 · 6d overdue") --
  previously "when's my next payment?" cost a tap into "Show schedule" plus
  a scan down the rows. #52: a slim collected/total progress bar
  (`.bar-track`/`.bar-fill`, the same language Savings goals and Accounts
  already draw progress in), colored by state (negative tone while
  overdue, positive once fully paid, plain accent otherwise) -- the two raw
  numbers alone took an actual subtraction to read as "almost done" vs
  "barely started". #53: a plan that's fully paid off collapses into its
  own "N completed" section by default, the same pattern People's own
  settled-collapse (#45) established -- nothing ever archives a finished
  plan, so without this the active list fills up with years-old finished
  plans. #54: the "Record payment" plan-picker dropdown now names each
  option's direction and remaining amount instead of a bare title, and
  labels an already-settled plan "(paid)" rather than silently removing it
  from the list -- removing it outright would have broken re-opening an
  *existing* payment against that same now-settled plan (its saved
  `planId` would no longer match any option). #55: plans sort most-urgent
  first -- any plan carrying an overdue row, then by its own next due date
  soonest-first -- the same "surface what needs attention first"
  convention Dashboard and People already apply. #56: the "Due this month"
  banner's own total already silently folded in the gam3eya share (see
  `duesThisMonth()`'s "P1 KPI quirk" comment) but nothing on the page ever
  explained that half -- a one-line breakdown ("Installments: X · Gam3eya:
  Y") now appears whenever a gam3eya contribution is due this month, with
  the gam3eya figure itself a link to Savings groups, where it actually
  lives. #57: an overdue schedule row now says how overdue ("Overdue · 6d
  overdue"), reusing `daysUntilText()` (already used for card statements
  and savings goals) instead of just the bare word "Overdue". #58: a
  completely empty plan list now shows a real empty state ("No installment
  plans yet") instead of just the due banner sitting over a blank list --
  falls out naturally once #49 hides both now-empty KPI groups.

  A real bug caught by inspection while reviewing screenshots, not by any
  of the ideas above: the "Show schedule"/"Hide schedule" toggle -- shared
  with Savings groups' own plan cards -- used `app.L()`'s generic ARW
  dictionary lookup, which has no entry for either phrase, silently falling
  back to English under Arabic even though `t.showSchedule`/`t.hideSchedule`
  already carried a real Arabic translation ("عرض الجدول"/"إخفاء الجدول")
  that was simply never used. Fixed on both cards; regression-guarded here
  on both screens.

  A second real bug, caught by the test itself while writing #54 (not the
  original design idea): the first attempt at the plan-picker's option
  labels formatted the remaining amount with `fmt()`, which wraps its
  output in a `<bdi>` tag for correct bidi rendering -- fine in HTML markup,
  but an `<option>`'s label is plain text, so the tag showed up literally
  ("— Owed to me — <bdi ...>EGP 18,800</bdi>") instead of being parsed.
  Fixed by using `fmtPlain()` instead, the same helper already documented
  for exactly this ("a chart tooltip's textContent, an onclick argument
  that can't carry HTML").
- `check_batch8.js` -- a grab-bag batch, not a single-screen recut: a real
  missing feature, a full Savings Groups Recut, and three smaller
  cross-screen gaps, all spotted during the same review pass.

  **Real missing feature fixed:** a recurring rule had no Edit or Delete
  anywhere in the app once created -- a typo'd amount/account, or a
  cancelled subscription, was permanent. Added a `recurring_edit` modal
  kind (same fields as `recurring`) and `recurringCanDelete`/
  `deleteRecurring()` (same "blocked once it's actually posted a real
  transaction" gate every other structural record already uses). The
  card also now shows its account and category, previously invisible
  without opening Edit.

  **Savings Groups Recut** (mirrors Installments Recut on its direct
  sibling -- same `openPlan`/`togglePlanRows`, same `duesThisMonth`
  banner): action-sheet consolidation (Edit/Delete moved into a shared
  "..." trigger via `UI.renderGroupActionSheet()`, the same pattern every
  other list already uses -- Contribute/Payout stay their own
  always-visible primary buttons, the two actual money-moving actions); a
  collected/total progress bar and a surfaced next-due line (same
  `.bar-track`/`daysUntilText()` language Installments' own cards use);
  urgency sort (overdue first, then soonest due date); a real empty
  state; and a fully-settled-group collapse into its own "N completed"
  section. `dueThisMonthBanner()` (the #56 breakdown) is now a shared
  method both Installments and Groups call, instead of a second
  copy-pasted banner that would have stayed missing the breakdown --
  the real gap that started this whole batch.

  Three real bugs surfaced during implementation, all fixed and
  regression-guarded here: `deleteGroupC()` only called `render()` on a
  *confirmed* delete (same class as `deletePlanC`/`deletePersonC`'s own
  fixes, now that delete lives behind the new sheet); "Record
  contribution" stayed visible on a group that's already fully paid in,
  a guaranteed dead end since `group_payment`'s own cap check in
  submit() refuses it (same shape as Installments' #48); and the
  `group_payment`/`group_payout` plan-pickers named a group by a bare
  title, with no sense of how much was left to pay in or whether it was
  already settled (same fix as #54, via a new shared `groupOptions`).

  Two more real bugs caught in code review (not by any test failure):
  the completed-group split used `remainingPay` alone, silently
  collapsing a group whose payout genuinely hadn't been collected yet
  ("Payout not collected yet" is still a live task, not finished
  history) -- fixed by requiring `g.taken` too. And the shared due-banner
  breakdown's first draft only showed when *both* halves were nonzero,
  reintroducing the exact "mystery total" #56 fixed whenever one half
  was entirely zero (e.g. 0 installments due, gam3eya due > 0 -- the
  Installments page would show a bare total explained by nothing on it)
  -- fixed by keying the breakdown on the *other* page's own share alone.

  **Smaller cross-screen gaps:** Ledgers' own person names are now a
  tappable link (`UI.viewPerson()`) -- the one remaining list in the app
  that hadn't already made that switch. Investments' P&L line now shows
  a percentage return alongside the raw amount (skipped when nothing was
  invested, since a percentage against a 0 base is meaningless). Card
  statements' Edit/Delete moved off two more always-visible inline
  buttons into a shared "..." sheet (`UI.renderStmtActionSheet()`), Pay
  staying primary -- `shot_statements.js` updated for the new trigger.
- `check_batch9.js` -- a second grab-bag batch: a real missing feature and
  two real gaps, spotted while reviewing Settings/Reports/Cash Flow.

  **Real missing feature fixed:** `app.css` already carried a complete
  `:root[data-theme="dark"]`/`="light"` override (every color token
  redefined both ways, guarded against the OS-driven `@media` query) --
  but nothing in the app ever set that attribute, so a user stuck with
  whatever their OS/browser preferred had no way to override it in
  either direction. Added `getTheme()`/`setTheme()` (localStorage-backed,
  same per-device-preference pattern as the PIN/notification toggle, not
  `state.data`) and a System/Light/Dark segmented control in Settings ->
  Display. "System" (the default) means genuinely no attribute at all --
  identical behavior to before this existed.

  **Real gap fixed -- Reports had no period control:** `D.live` sums
  *every* transaction ever recorded with no way to scope it down --
  harmless on a new account, but after a year or two "biggest expense
  category" quietly meant "biggest since the account was created," not
  anything close to current spending. Every other page with real numbers
  has some period control (Transactions' own preset filter, Forecast's
  horizon pills) -- Reports had none. Added period pills (This month / 3
  / 6 / 12 months / All time, defaulting to 6 months) that scope the
  category/source breakdown; the net worth trend chart above stays its
  own fixed 6-month view on purpose -- it's a real historical
  trajectory, not a summable total, so a period selector over it
  wouldn't mean the same thing.

  **Real gap fixed -- Cash Flow was locked to the current month:** no way
  to check how last month actually broke down. Added prev/next month
  navigation (`S.cashFlowMonth`, the same transient view-state category
  as `reportsPreset`/`horizon` -- resets on reload, never persisted) with
  a "Today" shortcut back to the current month once you've navigated
  away from it.

  **Real bug caught in code review, not by any test failure:**
  `new Date("2026-09-01")` parses as UTC midnight; reading it back with
  local-time getters (`getFullYear`/`getMonth`) in a timezone west of UTC
  returns the *previous* day, silently shifting the whole month
  computation back by one -- `mEnd` could even land before `mStart`,
  making `cashFlowStatement`'s own `date >= from && date <= to` filter
  match nothing and the entire previous-month view go quietly blank.
  Fixed by building the `Date` from its Y/M/D parts directly instead of
  parsing the ISO string, the same way `new Date()` itself is used
  everywhere else in this file. Regression-guarded here by actually
  launching a page with `timezoneId: "America/New_York"` and checking a
  past month's figures are real, not a suspicious 0/0.

  **Smaller polish:** an existing budget can now be edited in place --
  `setBudget()` itself already overwrote on a repeat call (there was
  never a technical need to Remove first), just no shortcut existed to
  pre-fill the category/amount instead of re-finding the category in the
  dropdown and retyping the number from scratch.
- `check_batch10.js` -- a single real bug reported directly by a user: the
  mobile/Android back button closed the whole app instead of navigating
  back a step inside it. Root cause: this is a pure in-memory SPA -- every
  navigation (`setPage`, `viewPerson`, `openModal`, every action sheet,
  More, quick-add) only ever mutated `app.state` and re-rendered, never
  touching the browser's own history stack (confirmed by an exhaustive
  grep across both `ui.js` and `engine.js` -- zero `pushState`/`popstate`
  anywhere). With no history entries of its own to pop, the back button
  fell straight through to the browser's default action -- closing the
  tab or exiting the installed PWA.

  Fixed with `UI.initBackTrap()`/`onPopState()`/`closeTopLayer()`: exactly
  one "trap" history entry is kept one step ahead of the real page at all
  times, so a back press always reaches the app's own popstate handler
  instead of the browser's default. The handler closes whichever single
  layer is topmost, in a fixed priority order (modal > any action sheet >
  More/quick-add > the mobile Transactions filter panel > `person_detail`
  back to wherever it was opened from, via a new `_personDetailFrom` --
  > any other tab back to Dashboard), then immediately re-arms the trap so
  the next back press is caught too; only when there is truly nothing left
  to close does it leave the trap consumed, letting *that* press actually
  exit. Deliberately one shared trap entry rather than a real per-layer
  history stack (one `pushState` per `openModal()`/`openXActions()`/etc.
  call) -- this app only ever has one such layer open at a time in
  practice (opening a modal already clears More/quick-add, every sheet's
  own "Edit" wrapper clears its sheet before opening the modal, ...), so
  the fixed priority order gets the same real-world behavior without
  needing every existing `close*()`/Cancel/backdrop-click call site
  across this whole file to also pop history in exact lockstep. Closing a
  layer normally (Cancel, a backdrop tap, a completed submit) is
  untouched by any of this -- it never consumes the trap entry, so it has
  no effect on how many back presses are queued up (regression-guarded in
  section 7).

  Two real bugs caught in code review on the first draft, both fixed
  before shipping:
  1. `initBackTrap()` pushed its trap entry unconditionally on every
     `init()` call. A reload does NOT reset the tab's own session
     history, so each reload piled one more untracked entry on top of the
     last one -- a user who reloaded a few times in a row would need that
     many back presses before one actually closed anything, reproducing
     the exact "back button feels broken" complaint this whole fix exists
     for. Fixed by checking `history.state` first -- `pushState`'s own
     state survives a reload of that same entry, so a trap is only ever
     laid when the current entry isn't already one (regression-guarded in
     section 8, which reloads three times in a row and checks the history
     stack never grows past its very first trap entry).
  2. The pre-existing `?action=expense`/`?action=income` home-screen
     shortcut handler (`index.html`'s own bootstrap `<script>`, outside
     `ui.js`/`engine.js`) used to call `UI.init()` -- which lays the trap
     -- *before* reading and stripping its own query param. That left the
     trap sitting on the now-clean URL while the *original* entry
     underneath it still carried `?action=...`, so closing the
     auto-opened modal via the back button landed back on that entry and
     resurrected the stale param (silently reopening the modal again on
     the next reload) instead of the one-time deep link it was always
     meant to be. Fixed by reading + stripping the param first, then
     calling `UI.init()`, then opening the modal -- not covered by an
     automated test here (the shortcut only fires from a real installed
     PWA's home-screen icon, not a plain `file://` load Playwright can
     drive), verified by hand instead.

  A third real bug, caught in a second code-review pass after the above
  two were already fixed: Person Detail's own on-screen "← People" link
  was (and had always been) hardcoded to the People tab, harmless before
  this feature existed since there was no other "back" affordance on the
  page to compare it against -- but a real inconsistency now that the
  hardware back button correctly returns to wherever the page was really
  opened from (`_personDetailFrom`, e.g. Installments or Savings groups):
  two "back" controls on one screen disagreeing about where "back" goes.
  Fixed by building both the link's destination *and* its label from
  `_personDetailFrom` the same way `closeTopLayer()` already does,
  falling back to People only when there's truly no real origin to
  return to. Regression-guarded in section 4b, opening a person from an
  Installment plan card specifically to exercise the non-default origin.

  A pre-existing, unrelated issue surfaced while chasing a full green
  suite for this fix, fixed alongside it since it was actively blocking
  that verification: two assertions in `check_installments_recut.js`
  (#51, #57) hardcoded a literal day-count ("in 13d", "Overdue · 6d
  overdue") for a due date that's seeded *relative to whatever "today"
  happens to be* (see `engine.js`'s own `seed()`) -- correct only on the
  one real calendar day they were written on, and silently wrong on every
  other. Confirmed pre-existing (still failed against the unmodified
  `HEAD` commit, before any of this batch's changes) and unrelated to
  history/back-button work. Fixed by computing the expected day-count in
  the test itself, from the app's own `planState()`, instead of a
  hardcoded literal.
- `check_batch11.js` -- a small two-item batch: a real missing feature and a
  real bug, both spotted sweeping the screens that hadn't had a "Recut" pass
  yet (Savings Goals, Settings' custom categories).

  **Real gap fixed -- Savings Goals: a reached goal never left the active
  list.** Same pattern already applied to Installments (#53) and Savings
  groups: a goal that hit its target stayed inline forever, sorted purely
  by its now-moot due date -- an old finished goal with an early due date
  could sit at the very top, crowding out what's actually still being
  tracked. Splits into active/reached the same way, a "N reached" toggle
  collapsed by default (`_goalsCompletedExpanded`, reset on `setPage()`
  same as `_plansCompletedExpanded`/`_groupsCompletedExpanded`).

  **Real bug fixed -- deleting a custom category never warned it was still
  in use.** `Engine.deleteCategory()` can't actually break anything when
  it removes a category (it's a free-text label on existing rows, not an
  id anything depends on) so it never blocked the delete -- but nothing
  told the user beforehand that an existing transaction or a live budget
  still carrying that exact name would silently lose the ability to be
  re-picked (including re-opening that very transaction to edit it) once
  the category disappeared from every dropdown. Added `categoryInUse()`
  (checks live, non-void transactions of the matching kind plus
  `data.budgets`) and a confirm message that names what's actually still
  using it -- a transaction count, a budget, or both -- falling back to
  the original plain "Delete X?" when nothing is.
- `check_batch12.js` -- a real missing feature requested directly by a user:
  a custom category (Settings) could only ever be added or deleted, with no
  way to fix a typo or give it a real color/icon instead of the flat
  neutral gray + plain tag every one of them shared. Added a proper
  `category_edit` modal (name + a `"color"` field, reusing the exact same
  swatch-row/native-picker `renderModal()` already draws for account/
  person/goal colors, + a new `"icon"` field type: a swatch grid of every
  distinct glyph `CATEGORY_ICONS` already draws, so there's no separate
  icon set to design) reached from a new Edit button on each category
  chip, which now also shows its own live badge.

  Renaming is the actual point of Edit over delete + re-add: a category
  lives as a bare name on every transaction/budget/recurring-rule row that
  uses it (there's no id to key off), so the rename cascades to all three
  -- `deleteCategoryC`'s own in-use warning (`check_batch11.js`) exists
  specifically because skipping this orphans them.

  Four real bugs caught across three rounds of code review, all fixed
  before shipping:
  1. The native color picker always needs *some* concrete hex, seeded to
     light mode's own `--cat-neutral` shade -- saving that unconditionally
     on every edit would have frozen "no custom color yet" into a
     permanently wrong, no-longer-theme-adaptive gray the moment someone
     edited a category's icon without ever touching color. Fixed with the
     same seeded/touched tracking `_color2Seeded`/`_color2Touched` already
     use for account/card secondary colors, except resolved in
     `UI.submitModal()` itself (there's no default to recompute from
     another field the way `resolveColor2()` does, since the placeholder
     here depends on the active theme).
  2. `categoryStyles` was first keyed by bare category name -- but
     categories are namespaced per kind everywhere else in this app
     (`addCategory` only checks uniqueness within the same kind), so an
     expense and an income category can share a name and be two unrelated
     categories. Fixed by keying `"kind|name"` (the same composite key
     `firstCategoryUseIds()` already uses), everywhere a style is read,
     written, or deleted.
  3. `categoryColor()`/`categoryIcon()` normalized "income" too narrowly
     (`kind === "income"`), missing that several call sites (a transaction
     card, a grouped-transactions header) pass the row's real `type` --
     "refund"/"investment_return" are income-side everywhere else in this
     app, so a refund tagged with a customized income category silently
     missed its own style and fell back to the plain default. Fixed by
     centralizing the income/expense check into one `Engine.isIncomeType()`
     (also removes four separately copy-pasted `incomeTypes` arrays this
     same review flagged as a drift risk).
  4. The rename's own budget-key move (`data.budgets[clean] =
     data.budgets[oldName]`) ran unconditionally -- reachable because
     `deleteCategory()` deliberately leaves a deleted category's own
     budget behind ("stays until you remove it separately"), so renaming
     a *different* category onto that exact freed-up name would silently
     discard whichever budget was already sitting there. Fixed by only
     moving it when the destination doesn't already have one of its own.

  Also extended alongside these: `categoryInUse()` (the delete warning)
  didn't check `data.recurring` at all, even though the rename cascade
  above exists specifically because a recurring rule holds its own copy of
  the category -- a category with zero transactions and no budget, but an
  active recurring rule, got the plain unwarned "Delete X?" confirm.
  `deleteCategoryC`'s message is now built from a list of parts (a
  transaction count, a budget, a recurring rule -- any combination) rather
  than a fixed set of and/or branches.
- `check_batch13.js` -- Investments: a real bug and a real missing feature
  found sweeping the one screen that hadn't had a "Recut" pass yet.

  **Real bug fixed -- the page went silently blank once every investment
  was gone.** Every other list in the app (Savings goals, Savings groups,
  To-dos) already falls back to a real empty state; Investments' own
  `renderInvestments()` just returned an empty `<div class="card-list">`
  with nothing in it. Added the same `emptyState()` call the others use,
  gated on `d.investments.length` (not just the active count, so it stays
  correctly hidden while every investment is merely sold/closed -- see
  below).

  **Real gap fixed -- there was no way to actually sell/close a position.**
  `investment_return` was a fully wired transaction type everywhere else
  (`derive()`'s balance/bucket handling, `categoryColor`/`categoryIcon`'s
  income-side normalization, `categoryInUse`) -- `txEditableTypes()`'s own
  comment even said so explicitly ("not yet exposed through an entry form
  of their own"). Added an `investment_sell` modal (pick the investment,
  the sale proceeds, which account it lands in) reached from a new "..."
  action sheet (`renderInvestActionSheet`/`openInvestActions`, mirroring
  Card statements' `renderStmtActionSheet` exactly) that also now holds
  Edit and Delete -- moved off the row itself, same "one primary action
  stays inline" convention as Card statements/Savings groups, since Sell
  is a rare/terminal action unlike the frequent "Update value".

  Deliberately a full close only, not a partial sell -- a partial cash-out
  would need proportional cost-basis math this app has no other precedent
  for. Selling marks the investment `closed` (kept, not deleted --
  `invested`/`value` stay as a permanent record so the closed section can
  show real realized P&L) and posts a real `investment_return` tx tagged
  with `investmentId`, which automatically blocks the sold position's own
  deletion the same way any other tied transaction does. Closed positions
  split into their own collapsed "N sold" section, the same active/"N
  more" pattern Installments/Groups/Savings goals already use;
  `derive()`'s `invValue`/`invCost` now sum only active (non-closed)
  positions, so a sold position's stale value doesn't get double-counted
  once as real cash (via the account balance the sale tx already updated)
  and once as a phantom holding that no longer exists.

  One real bug caught in code review: the closed card's "Sold <date>"
  subtitle used a mistranslated Arabic word (`اتباع`, not a real word for
  "sold") where the section header two lines above correctly used
  `متباع` for the same concept -- fixed to match.
- `check_batch14.js` -- another orphaned-but-fully-wired transaction type,
  found the same way `investment_return` was (batch13): "refund" already
  had its own translated label (`txTypeLabels()`), its own income-side
  normalization (`isIncomeType()`, `categoryColor`/`categoryIcon`,
  `cashFlowBucket`), and its own entry in the Transactions type filter --
  but nothing anywhere could ever actually create one, so filtering by it
  always came back empty.

  Rather than a whole new button/screen for something that's otherwise
  identical to plain income, added one "Type" select (Income/Refund) to
  the income form itself (`FORMS().income`) that decides the real stored
  `tx.type` on submit. The field is deliberately named `"type"`, the same
  field name/shape the `"recurring"` form's own income/expense selector
  already uses -- `Engine.open()`'s existing `Object.assign(form, pre)`
  pre-fill then does the rest for free: opening Edit/Duplicate on an
  existing refund spreads its real `t.type` ("refund") straight into the
  new field with no extra glue code anywhere.

  Three small wiring changes made "refund" a first-class editable kind,
  the same as plain income already was:
  - `txEditKind()`: added `refund: "income"` so `openTxEdit`/`duplicateTxC`
    reopen a refund through the income form, the same shape the existing
    `gam3ya_payment -> group_payment` mapping already uses.
  - `txEditableTypes()`: added `"refund"` -- it used to be explicitly
    excluded ("not yet exposed through an entry form of their own"), the
    same comment `investment_return` carried before batch13.
  - `submit()`'s shared income/expense/receivable/payable branch: computes
    `txType` from the new field (only ever changes behavior when
    `k === "income"` -- every other kind in that branch has no such field,
    so `f.type` is simply `undefined` for them and `txType` falls back to
    `k`, unchanged).

  One real bug caught in code review: the audit-trail note for a new
  refund used a hardcoded English `"Refund"` literal, while every other
  kind in that same branch already builds its note from
  `this.FORMS()[k].title` -- itself locale-dependent (`FORMS()` resolves
  `t = this.T[this.state.lang]` fresh on each call) -- so a refund's own
  note was the one case in that branch that silently ignored the current
  UI language. Fixed to `this.L("Refund", "مرتجع")`, matching the same
  locale rule as everything else there.
- `check_batch15.js` -- real bug reported directly by a user, with a
  screenshot: paying more than a card statement's remaining balance
  showed the raw error message as literal
  `<bdi dir="ltr" class="amt-bidi">EGP 7,021</bdi>` text instead of a
  normal formatted amount.

  `fmt()`/`fmtS()` wrap their output in a `<bdi>` tag (see `bidiWrap()`)
  so an RTL page context can't strand a sign away from its digits --
  markup meant to be inserted into rendered HTML. But this message goes
  through `this.state.err`, which the modal's error banner displays via
  `esc(S.err)` (plain-text escaping, so a genuinely malicious value in it
  can never execute) -- so any HTML embedded in it shows up escaped and
  literal instead of rendered. The engine already had `fmtPlain()` built
  for exactly this "needs a plain string, not markup" case (a chart
  tooltip's `textContent`, an onclick argument) -- just not used in these
  three spots. Fixed all three "That is more than the `<cap>` ..." cap
  messages that had this bug: installment payment, statement payment
  (the one in the bug report), and gam3ya payment.
- `check_batch16.js` -- real bug reported directly by a user: tapping the
  "Other" bar in Reports' "By source"/"By category" (or any of the other
  category bars sharing the same click-through) found zero transactions
  whenever the amount it showed came from rows genuinely categorized
  "Other" -- a completely ordinary, selectable category (the last entry
  in `Engine.builtinCategories()` for both income and expense) -- rather
  than uncategorized ones.

  Every category aggregation this app has (`monthCategorySpend`,
  `unusualSpending`, Reports' `catMap`/`srcMap`) buckets a transaction
  with no category at all under `"Other"` too (via `category ||
  "Other"`), so a bar's own total always means both halves together --
  but `UI.renderTransactions()`'s own click-through filter only ever
  checked `!r.category`, missing the `r.category === "Other"` half. The
  filter's own comment already said it "has to match both", stated
  intent the code itself never actually implemented. Fixed to
  `!r.category || r.category === "Other"`.

  One real bug caught in code review, in the sibling function: `Engine.
  categoryMonthStats()` -- the scoped "This month" stats tile shown right
  above the same filtered list (see `scopedCategoryMetrics()`) -- had the
  identical `!t.category`-only bug, and its own comment explicitly says
  it "matches `UI.renderTransactions()`'s own category filter exactly",
  which this same fix had just changed. Without the matching fix here,
  the stats tile and the list right under it would have silently
  disagreed for any category genuinely tagged "Other". Fixed the same
  way.
- `check_batch17.js` -- real bug reported directly by a user, with a
  screenshot: the error read "That is more than the EGP 7,021 still
  outstanding on this statement" -- but typing exactly `7021`, what the
  message itself said, still got refused.

  `fmtPlain()` (batch15) displays a cap rounded to whole EGP -- this app
  never surfaces piastres anywhere -- but the three "That is more than
  the `<cap>` ..." checks (installment payment, statement payment, gam3ya
  payment) compared against the raw, cents-precision `cap` value. A real
  remaining of e.g. `7020.55` displays as "EGP 7,021", but `7021 >
  7020.551`, so the exact amount the message told the user to pay was
  rejected. Fixed by rounding the comparison the same way the message
  rounds for display -- safe in all three, since the underlying
  remaining/`remainingPay` is already clamped to `>= 0` (see
  `statementState`/`planState`/`groupState`), so a slight rounding
  "overpay" just settles cleanly at 0/"paid" rather than leaving a
  stray sub-pound balance nothing in the UI would ever show clearly
  enough to clear.

  One real regression caught in code review, self-introduced by the
  first pass of this exact fix: a plain `Math.round(cap)` rounds in
  *either* direction, and a cap like `500.30` rounds *down* to `500` --
  so `Math.round(cap)` alone would have newly refused paying `500.30`
  itself (`500.30 > 500.001`), the exact true amount owed, whenever a
  cap's fractional part was under `.50`. Fixed to `Math.max(cap,
  Math.round(cap))`, which only ever raises the ceiling to match a
  rounded-up display and never lowers it below the real cap. Covered by
  a dedicated regression case (a `500.30` cap, paid as exactly `500.30`).
- `check_batch18.js` -- two things reported directly by a user in the
  same conversation, right after batch17 shipped.

  **Real gap closed: "Pay statement" now reachable straight from the
  account itself.** Paying a card's own statement used to mean leaving
  Accounts entirely for Card statements just to find the same Pay button
  already shown right on the tile's own "Statement due" line. Added "Pay
  statement" to the account's own "..." sheet (`renderAcctActionSheet`) --
  shown only when the card has a real unpaid statement, computed the
  exact same "nearest due, not yet paid" way the tile's own `nearestStmt`
  already does. `UI.openAcctPayStatement()` recomputes that pick fresh
  (not passed in as a stale argument) so it can never open a statement
  that's gone stale between the sheet rendering and the tap landing, and
  opens the real `statement_payment` form pre-filled, same as the
  Card-statements page's own Pay button always has.

  **Real bug this surfaced: a screenshot showed "Outstanding EGP 1" on a
  card whose "Available" already showed the full credit limit** --
  self-contradictory, since 1 outstanding should mean limit-1 available.
  Paying the rounded display amount (batch17's own fix) can leave the
  card's real account balance a few piastres in credit rather than
  exactly zero -- a genuine, harmless overpayment, not more debt -- but
  the tile showed that raw signed balance under "Outstanding" with no
  sign at all (`app.fmt()` only prefixes a minus for negative values), so
  a small credit read as if there were still an "Outstanding" amount.
  Fixed to the exact same debt-only convention the aggregate "Total card
  debt" tile (`ccSummary`) already used one section above it --
  `Math.abs(Math.min(0, bal))` instead of the raw `bal` -- so a credit
  now reads as 0 outstanding, consistent with Available already showing
  the full limit right next to it. Real debt (a genuinely negative
  balance) is completely unaffected -- still shows its correct positive
  magnitude, covered by a dedicated regression case.

  One real bug self-caught before this ever ran: the first pass of the
  `Outstanding` fix accidentally deleted the adjacent `const spark = ...`
  line (the tile's own weekly-trend sparkline, used by plain balance
  accounts) while editing right next to it, throwing `spark is not
  defined` and silently breaking the whole Accounts page render.
  Caught immediately by actually running the page rather than trusting
  the edit, and restored before this test or the regression suite ever
  saw it.
- `check_reconciliation.js` -- real feature request: recording a loan/advance
  and its later repayment as two separate transactions left nothing tying
  them together, so reviewing a person's page meant eyeballing dates and
  amounts to work out which payment closed which loan.

  `loanRows()` already settled repayments against open loans automatically
  (oldest-first, FIFO) -- the gap was that it was never a *choice*, and once
  a loan hit `rem: 0` it vanished from the person's page with no trace of
  what closed it. `receivable_payment`/`debt_payment` now carry an optional
  `settlesId`, picked from a "Settles" field listing every person's open
  loans (same flat list + label convention as `installment_payment`'s own
  `planId`), capped to that specific loan's remaining the same
  rounding-safe way as the installment/statement payment caps above. Picking
  a loan from someone else's list overrides whatever was picked in the
  Person field, the same precedent `installment_payment` already set with
  `personId: plan.personId`.

  `loanRows()` itself now tracks *which* payment(s) closed each loan
  (`settledBy`, a list of `{id, date, amount}`), not just how much is left.
  A payment that never picked a loan still falls into the exact same shared
  FIFO pool as before this feature existed -- nothing about existing data
  changes; `poolPaid` on the loan row folds all of that into one honest
  "(auto)" line rather than pretending a choice was made that never was.

  On the person's own page, a fully-settled loan no longer disappears
  without a trace -- it collapses behind an "N settled" toggle (the same
  convention Installments' own completed plans already use), and expanding
  it shows exactly which payment(s) closed it. Every collection/repayment
  in the History section below shows its own "Settles: ..." line pointing
  back the other way. A per-loan "Record payment" button (new) opens the
  payment form pre-filled with that exact loan already picked, instead of
  the existing person-level Pay/Collect buttons, which still settle the
  oldest open loan automatically when no particular one matters.

  Real regression caught by the existing suite, not this new test:
  `shot_person_history.js` had asserted a fully-settled loan's whole
  section *disappeared* -- true before this feature, wrong now that a
  settled loan deliberately stays visible (collapsed) so its settlement
  trail isn't lost. Updated to assert the section stays and shows an "N
  settled" toggle instead, matching the same expectation
  `check_installments_recut.js` already established for plans ("the plan
  is settled, not gone").

  Three real bugs caught in code review before this ever shipped, all
  covered by dedicated cases in this same test (step 8):
  1. **Excess from a shrunk, already-settled loan was silently dropped**
     instead of rejoining the shared pool. Editing a loan's own amount down
     *after* a direct payment already fully covered it (fixing a data-entry
     mistake) used to just discard whatever no longer fit -- the person's
     recorded payments (History) and what `loanRows()` said was actually
     applied would permanently disagree, and the freed money never reached
     this person's other open loans the way the old pool-only model already
     handled this case for free. Fixed by feeding that excess back into
     `pool` instead of dropping it.
  2. **The "Settled by" trail could overclaim past the loan's own amount**
     for the same shrink-after-settlement scenario -- two payments (200 +
     100) that validly settled a 300 loan would still show "200 + 100"
     after the loan was corrected to 250, an internal contradiction in the
     exact trail this feature exists to make trustworthy. Fixed by running
     the same FIFO cap the loan's own `paid`/`rem` already uses over the
     *displayed* trail too, so it always sums to exactly what's actually
     credited to that loan -- oldest payment keeps its full display amount
     first, any shortfall lands on the newest one.
  3. **`allLoanRows()`'s open-loan filter used a bare `rem > 0`**, unlike
     every other open/settled boundary this feature added (`loanSection`'s
     own split, `loanRows()`'s own `status`), which all treat a sub-cent
     rounding residue as settled via a `0.001` epsilon. Since this function
     now also feeds the new "Settles" picker (previously it only fed
     Dashboard alerts/Forecast), that mismatch meant a loan the rest of the
     UI already shows as settled could still be picked and "paid" from the
     dropdown. Tightened to the same `0.001` epsilon everywhere else in
     this feature already uses.
- `check_dashboard_signal.js` -- the Dashboard's "Signal" redesign (user's
  explicit choice, after reviewing three published concept mockups): three
  new, purely additive chart-forward visuals, none of them replacing any
  existing element or data source.

  **Hero trend chart + delta chip.** `UI.heroTrendChart()` -- a new
  function, deliberately separate from the small existing `sparkline()` --
  draws a gradient-filled area + line under the Available-balance headline,
  from the same 5-point weekly `available` series the small inline
  sparkline already computes (`weeklyDerives`). A `.delta-chip` next to the
  headline shows the first-vs-last percentage change across that same
  window, so the two can't disagree about what "this month" (in the loose
  ~5-week sense the weekly cadence already uses on this card) means.

  **"Where my money is" -- a proportional stacked bar.** Sits above the
  existing tile grid, built from the exact same 6 real "money sits here"
  buckets `positionTiles` already defines (not the 3 derived totals --
  payables/assets/net worth -- which stay tile-only, nothing real to
  depict as a share of a whole), reusing each bucket's own tint color so a
  segment reads as the same color as its tile right below it.

  **"This month" -- a diverging income/expense bar.** The same two numbers
  the stat boxes above it already show, given a proportional shape between
  the budget ring and category bars underneath -- both untouched.

  Every element this redesign touches was chosen specifically because
  nothing already tested it structurally beyond a text/count assertion the
  new markup doesn't disturb -- confirmed against the whole suite, which
  passes unmodified (only this one new file was added; no existing test
  needed updating), unlike the reconciliation feature just above, where an
  existing test's assumption had to change because the underlying behavior
  genuinely did.

  Real bug caught in review, covered by a dedicated case here: the delta
  chip's percentage divided by `Math.abs(heroFirst || 1)` instead of
  checking `heroFirst > 0` -- a zero (or negative, an overdrawn week)
  starting balance produced a wildly misleading figure (e.g. "+500000%
  this month" off a `0 -> 5000` swing) instead of hiding the chip, which is
  what `Engine.monthOverMonth()`'s own percentage badges already do in the
  same situation and what this code's own comment claimed to match.
  Reproduced by stubbing `Engine.derive()` to force every older weekly
  point to exactly `0` (simply clearing transactions doesn't reach this --
  every account's own static opening balance holds regardless of a
  derive() cutoff date, so `available` was never actually zero at any real
  past point reachable that way).
- `check_reconciliation.js` (scenarios 9-10 added) -- real bug reported by
  a user, screenshot included: opening `receivable_payment`/`debt_payment`
  from a specific person's own "Pay"/"Collect" button (personId already
  known) still showed the "Settles" picker listing *every* person's open
  loans, not just theirs -- confusing, and an easy way to link a payment
  to the wrong person's loan by mistake. `loanOptions()`'s own
  `this.state.form.personId` (read fresh on every `FORMS()` call) now
  scopes the list to that one person whenever a person is already
  selected, falling back to the flat every-person list only when the
  field is opened with no person picked yet. Changing Person mid-edit
  re-scopes the list live via a new `UI.syncSettlesOptions()`, generalized
  select-field `onchange` support, and the same direct-DOM,
  no-`render()` convention `setPersonRelation()` already established --
  a full render() here would wipe out an amount/date/description already
  typed but not yet submitted, exactly the reason that convention exists.
- `check_people_ledger.js` -- the People screen's "Ledger" redesign. After
  the user rejected several earlier rounds of alternative concepts as "not
  what I pictured" with no concrete reference to work from, this is a
  single committed direction (not more alternatives), pushed for real
  visual craft: a private-wealth-management feel with a status ring around
  every avatar, a portfolio-level hero, and a "Needs a look" priority strip
  -- all additive next to the existing People Recut structure (`.person-card`,
  `.card-row-meta`, the count-summary tile, search, settled-collapse...),
  none of which changed, so the whole existing suite kept passing unmodified.

  **Portfolio hero.** The exact same `.hero-card.alt` treatment Person
  Detail's own page already uses for one person's net position, reused
  here for everyone's combined position -- Owed to me / I owe / a people
  count in the same sub-row layout, so the list and detail pages read as
  one system rather than a plain list leading into a nicely-designed
  detail page.

  **Status rings.** `ringColor()` -- new, shared logic between the list and
  Person Detail's own header avatar -- picks a ring color: overdue (a real
  overdue plan installment or plain loan, regardless of which direction
  the balance runs) always wins over a merely-positive or merely-negative
  net, which only wins over a genuinely settled (net ~0, nothing overdue)
  person, who gets a plain neutral ring. Confirmed against real seed data,
  not an invented scenario: Hazem carries a large positive net (owed to
  me) *and* a genuinely overdue MacBook Pro installment, so his ring
  correctly reads as overdue (rose), not positive (teal) -- and he
  correctly appears in the priority strip despite an overall healthy
  balance.

  **Priority strip.** A horizontal-scroll triage row ahead of the full
  list -- overdue people float first, then largest open balance, both
  already true of `activeRows`' own existing sort.

  Two real bugs caught in code review before this shipped, both covered by
  dedicated cases here:
  1. **`.priority-strip{display:flex}` silently defeated `.mobile-only`'s
     own `display:none` on desktop.** Two same-specificity class selectors
     (`.priority-strip`, `.mobile-only`) setting the same element's
     `display` resolve by *source order*, not by which one is meant to win
     -- and `.priority-strip`'s own rule sat later in app.css, so it won on
     every viewport, desktop included, showing the "Needs a look" strip
     next to the desktop table it was never meant to appear beside. Fixed
     by making `.priority-strip` self-contained (`display:none` base + its
     own `@media (max-width:780px)` override), never depending on winning
     a tie against another class for its own visibility.
  2. **An empty `--ring-c:` doesn't trigger CSS's `var()` fallback.**
     `ringColor()` originally returned `""` for a settled person, written
     into the inline style as `--ring-c:` (a valid, if empty, custom
     property) -- but `var(--ring-c, var(--c-line))` only substitutes the
     fallback when the property is *unset or invalid*, not merely empty,
     so the ring's `conic-gradient()` got a missing color argument, invalid
     at computed-value time, and the whole background dropped instead of
     showing the intended neutral ring. Fixed by having `ringColor()`
     always return a real value (`var(--c-line)` for "nothing to flag"),
     removing the reliance on the fallback trick entirely.
- `check_txreports_ledger.js` -- Transactions and Reports both carry the
  "Ledger" language the Dashboard/People redesigns already established,
  shown to the user as mockups first and applied once approved. Additive
  next to each page's own existing structure (Transactions Recut's search/
  filter-row/date-headers, Reports' own period-preset pills), so nothing
  pre-existing needed to change behavior -- only three OTHER tests did, for
  a real reason each (see below).

  **Transactions: a type quick-pill row.** A curated, always-visible
  `.tx-type-pills` row (All / Income / Expense / Transfer) next to search,
  the one filter dimension reached for most -- a second way to set the
  exact same `F.type` the existing 5-dropdown `.filter-row` already sets,
  so the two can't disagree (confirmed: opening the panel after tapping a
  pill shows the native `<select>` already agreeing). The `.filter-row`
  itself, and `check_transactions_recut.js`'s own `select count === 5`
  assertion, are completely untouched -- this is a second control, not a
  replacement. Real testing gotcha caught in review: the row count on
  screen is capped by pagination (`S.txVisible`, 25 of 217 seed rows), so
  narrowing a filter doesn't necessarily shrink what's rendered -- the test
  reads the real match total off `.tab-sub` ("N records match your
  filters") instead of counting `.card-row` elements.

  **Transactions: a per-day net total.** Each `.tx-date-header` now carries
  its own day's signed total next to the date, summed from the same
  already-filtered, already-signed `items` the cards below it render from
  (so it can't disagree with what's actually listed) -- confirmed against
  an independent recomputation of that day's real rows, not just checked
  for presence. Real bug caught in code review, covered by a dedicated
  case: the first version summed every row for the day unconditionally,
  but `txSign()` never zeroes a *voided* row's own `signed` amount -- it
  only mutes the row's display (opacity, strikethrough, a `muted-amt`
  tone) -- so a voided expense would still silently count toward the day's
  printed total, disagreeing with what the strikethrough row itself
  visually says. Fixed with a plain `!it.r.void` filter, matching how
  `D.live` already drops void rows entirely everywhere else in the app;
  regression-tested by seeding a huge voided expense on today's date and
  confirming the printed total doesn't move at all.

  **Reports: a net worth hero.** The plain `barChart()` net worth trend
  replaced with the same `heroTrendChart()` gradient area/line + delta-chip
  language Dashboard's own Available balance and People's own portfolio
  hero already carry, in a `.hero-card.alt` panel -- cross-screen cohesion,
  not a one-off redesign. Same `nwFirst > 0` delta-chip guard as
  Dashboard's own (see its entry above) against the same divide-by-a-
  fudged-1 bug. `nwTrendMonths()` itself, and the fixed-6-month-regardless-
  of-the-period-pills behavior it gives, are unchanged -- confirmed the
  hero's own value and chart don't move when the period preset does.

  **Reports: a period income-vs-expense diverge bar.** A `.flow-card`
  ahead of the category/source breakdown, reusing the exact `.diverge`/
  `.div-in`/`.div-out` component Dashboard's own "This month" section
  already validated -- `catTotal`/`srcTotal` (the same expense-only /
  income+refund+investment_return-only split the bars below it already
  use) feed both this bar and each row's own new "% of total", so the two
  can't drift apart. Real wording bug caught in code review: this card was
  first labeled "Cash flow this period", with a comment claiming
  `catTotal`/`srcTotal` were "the period's total out/in" -- but the app
  already has a real Cash Flow Statement page (Operating/Investing/
  Financing, every money movement) that label would misleadingly overlap,
  and the actual totals here are only the narrower income/expense split
  Dashboard's own "This month" already uses (a debt payment or an
  investment buy, for instance, moves real money but lands in neither
  map). Relabeled "Income vs. expense this period" and the comment
  corrected to say so plainly, rather than widening the feature's scope to
  match the old label.

  **Reports: % of total + a top-item callout on each bar list.**
  `catBar()` gained an optional trailing `pct` param (Dashboard's own "This
  month" call site leaves it `undefined`, so nothing there changed --
  confirmed no stray `%` appears on Dashboard's own category bars) and a
  "leads at N%" note next to the top category/source. Real regression
  caught by the *existing* suite, not this one: the note was first built
  as a sibling `<div class="section-head">` wrapping the `<h2>`, which
  broke `check_batch16.js`'s own `h2:has-text('By source')` ->
  `xpath=following-sibling::div[1]` lookup for the bar-list underneath (the
  wrapper div, not the bar-list, was now the first following sibling div).
  Fixed by nesting the note *inside* the same `<h2>` as its last child
  (`.section-title.has-note` makes just that heading a flex row) instead of
  wrapping it -- the `<h2>` stays exactly where every existing test already
  expects it, and every other `.section-title` in the app (no note) is
  completely unaffected.

  Two more existing tests needed a real update, not a code fix -- both lost
  their target when Reports' own net worth chart stopped being a
  `barChart()` (SVG `.chart-bar` tap-tooltip elements) and became
  `heroTrendChart()` (a decorative, `aria-hidden` SVG line with no tooltip
  of its own): `check_batch3.js`'s and `check_batch3_fixes.js`'s own chart-
  tooltip cases now exercise Cash Flow's own 6-month operating trend
  instead, which still uses the shared `barChart()` unchanged. And
  `check_batch9.js`'s "net worth trend is untouched by the period pills"
  case now reads the hero's own value + `.hero-trend` presence rather than
  counting `.chart-bar` elements -- same real behavior it always tested,
  just read off the new markup.
- `check_builtin_categories.js` -- two real gaps reported directly by a
  user, one with a screenshot.

  **The delta-chip color.** Reports/People's net worth delta-chip (see
  `check_dashboard_signal.js`'s own entry above) used the exact same
  hardcoded pastel-mint-on-dark-tint pairing as Dashboard's own hero-chip
  -- correct for Dashboard's `.hero-card`, which is a FIXED dark glass
  panel regardless of site theme, but `.hero-card.alt` (Reports/People)
  genuinely follows the theme, so in light mode it sat on a near-white
  surface: a washed-out, uncomfortable-to-read mint on a barely-tinted
  pale chip. Fixed by scoping `.hero-card.alt .delta-chip.tone-pos/-neg`
  to the app's own already-contrast-checked `--c-pos`/`--c-neg` tokens (a
  teal/blue in light mode, not green -- see that token's own P1
  accessibility-fix comment) instead of a third hardcoded pairing.
  Dashboard's own `.hero-card` chip is untouched (confirmed both stay
  exactly as before).

  **Built-in category editing.** Settings' Categories section used to
  list custom categories ONLY -- a built-in one (Food, Rent, ...) had no
  Edit/Remove anywhere, so fixing a typo, giving it a real color, or
  dropping an old unused one was simply impossible; a user asked for
  exactly this directly. `builtinCategories()` is the same hardcoded list
  on every install (not this user's own data), so it can't be rewritten
  in place -- `hiddenBuiltinCategories` (a new data field, same shape as
  `customCategories`) and `Engine.activeBuiltinCategories()` (built-ins
  minus whatever's been hidden) are the actual mechanism: a pure recolor/
  re-icon needs neither (the category stays built-in, only its
  `categoryStyles` entry changes), but a real RENAME hides the old name
  and promotes the new one into `customCategories`, a real, independently
  editable/deletable category from then on -- reusing the exact same
  tx/budget/recurring-rule rename cascade `check_batch12.js` already
  proved for a custom category, now confirmed to reach a built-in
  category's own history too. Deleting an unused built-in now actually
  hides it (previously a silent no-op, since `deleteCategory()` only ever
  filtered `customCategories`); deleting an IN-USE one still warns first,
  identical to a custom one, since `categoryInUse()`/`deleteCategoryC()`
  never cared about a category's origin to begin with.

  Real bug caught in code review: "Other" is not an ordinary category --
  `monthCategorySpend`, Reports' own `catMap`/`srcMap`, and the
  Transactions "Other" filter all hardcode it as the literal fallback
  bucket every UNCATEGORIZED transaction buckets under
  (`category || "Other"`), regardless of what this picker offers.
  `categoryInUse()` only counts transactions explicitly TAGGED "Other" (a
  different, smaller set), so hiding or renaming it here would have
  sailed through with no in-use warning while every one of those
  aggregations kept showing a real "Other" bucket the user could then no
  longer select or reconcile against anywhere. Fixed by excluding "Other"
  from the editable chip list entirely (same scope boundary it already
  had as a name no one could add a duplicate custom category under) --
  confirmed it stays a real, pickable category everywhere else, just with
  no Edit/Remove exposed for it specifically.
- `check_accounts_ledger.js` -- Accounts' own "Ledger" pass, completing
  the redesign across every screen (Dashboard/People/Transactions/
  Reports/Accounts). Additive next to the existing Accounts Recut
  structure (tile groups, `ccSummary`, flip/action-sheet/sparkline/usage-
  bar tiles) -- none of it changed, confirmed still there.

  **Portfolio hero.** No page had a single "net across everything this
  screen tracks" figure before -- deliberately its OWN figure, not a
  duplicate of Dashboard's (Available, cash-only) or Reports' (net worth,
  investments/receivables included too): every non-card account's
  balance minus every card's own debt, scoped to exactly what this page
  lists so it can never disagree with the tiles below it. Confirmed
  against an independent recomputation, not just checked for presence.
  Real edge case handled: a ledger of nothing but credit cards still gets
  a real (negative) hero and a real trend -- `weeklyDerives`' own gate
  widened from "has a balance tile" to "has any account at all", since
  the hero needs it even when every account is a card.

  **"Needs a look" strip.** Same triage-row idea People's own portfolio
  page already established, for what actually needs a look on Accounts:
  a card nearing its own limit (>=70%, red past 90%), or carrying a due-
  within-7-days/overdue statement (`stmtSoon`, matching Dashboard's own
  Needs Attention alert window exactly, not a second definition) -- none
  of which had an aggregate view before, only buried one tile at a time.
  Confirmed against real seed data, not an invented scenario: Platinum
  carries a genuinely overdue statement (well under 70% usage on its
  own, proving the two severity triggers are independent) and sorts
  first; Titanium's statement is due this week and sorts second, flagged
  gold not red.
- `check_recurring_yearly.js` -- a real, long-pending bug (task #30): a
  yearly recurring rule stored only a day of month, never a month at all.
  `Engine.nextOccurrence()`'s own yearly branch faked one via
  `x.setMonth(new Date(base).getMonth())` -- `base`'s OWN month, at
  whatever moment this happened to be called -- so the computed "next
  occurrence" silently drifted to match whichever month you happened to
  check Forecast/Dashboard in, instead of staying pinned to a real fixed
  annual month. A December-25th yearly rule, checked from January, July
  and October in turn, used to come back December/July/October
  respectively -- now comes back December every time, confirmed directly
  against `nextOccurrence()`, not just eyeballed on a screen.

  Fixed with a real `month` field (FORMS()' own locale-aware 12-name
  select, same `toLocaleDateString` convention Cash Flow's own month
  label already uses, not a hand-typed Arabic array that could drift from
  the app's real date formatting elsewhere) -- `nextOccurrence()` reads
  `r.month` directly, falling back to `base.getMonth()` (the exact
  previous behavior) only for a rule saved before this field existed, so
  an untouched legacy rule keeps behaving exactly as it already did
  rather than jumping to a new month on its own. Confirmed against the
  real seed data's own pre-existing "Streaming bundle" rule, which
  genuinely has no stored month -- still returns a valid date, not a
  crash. The year-rollover case (checked after this year's date has
  already passed) still correctly advances to next year, not stuck in
  the past. New rules default to the current month rather than the
  generic "first option" every other select field without its own
  default falls back to (January) -- far more likely to be near the real
  renewal month being set up. End-to-end: a real yearly rule created
  through the actual modal persists the chosen month, `nextOccurrence()`
  agrees with it, and re-opening Edit shows the same month pre-filled.
- `check_goals_groups_forecast_ledger.js` -- three more screens carry
  "Ledger" language, after checking each one for a genuine gap first
  rather than mechanically reapplying the same hero everywhere (see the
  in-app discussion this round: Installments already has a full KPI
  tile-grid, so it was deliberately left alone -- a second hero there
  would just be a duplicate, not a fix).

  **Savings Goals / Savings Groups: a new portfolio hero, on each.**
  Neither page ever had one "across everything" figure before, only a
  scroll of individual cards -- the same real gap Accounts had. The
  trend itself reuses `Engine.derive(cutoff)`'s own
  `savingsGoalStates()`/`groupState()` results (exactly what
  `D.savingsGoals`/`D.groups` are already built from) at 5 weekly
  cutoffs, the same `weeklyDerives` pattern Dashboard/Accounts already
  established, rather than a second way to compute "saved so far" or
  "net position." Confirmed against an independent recomputation, not
  just checked for presence -- including Savings Groups' own hero, whose
  real seed value is negative (received so far exceeds paid-in), proving
  the sign isn't silently clamped.

  **Forecast: the old plain proj-bar becomes the same gold trend line.**
  `Engine.forecast()` already computed a full running-balance trajectory
  across the selected horizon (`fc.points`, built for the event list's
  own `.running` field) -- this only had to be READ into
  `heroTrendChart()`, not recomputed. Confirmed the old `.proj-bar`
  element is gone (not left dangling alongside the new chart) and that
  switching the horizon pill (7 vs. 365 days) genuinely changes both the
  chart and the hero's own projected value, proving it tracks the real
  selected horizon rather than a cached figure.

- `check_recurring_transfer.js` -- new feature: a recurring rule can now be
  type "transfer" (an automatic monthly sweep into a savings wallet, say),
  not just income/expense. `toAccountId` is the new "to" side; `accountId`
  doubles as "from", same distinct-accounts check (`f.accountId !==
  f.toAccountId`) the plain "transfer" transaction type already uses.
  `postRecurring()` posts a real plain-transfer row (`fromId`/`toId`, no
  category) instead of its usual income/expense shape when it fires.
  `forecast()`'s own event amount is the rule's REAL impact on
  `D.available` (cash+bank+wallets+otherBalance, which excludes cards) —
  confirmed directly against the formula: ~0 between two ordinary accounts
  (the common case), the real signed amount when a card sits on either
  side — not a blind `-amount` the way an expense gets. The event-dot/amt
  tone ternaries (Dashboard's Upcoming 30 days + Forecast's own list) gain
  a shared `eventTone()` helper with a neutral third state for that ~0
  case, checked live in Forecast's own rendered event row, not just the
  underlying number.

  **Real bug caught by code review, fixed and regression-tested in the
  same pass:** the To-account field is always visible on the recurring
  form (same "(yearly only)"-labelled-but-always-shown convention the
  Month field already established for #30 — this app has no per-type
  dynamic show/hide for form fields), so its value always rides along in
  the submitted data regardless of which type is actually picked. Without
  forcing it null for anything but a transfer rule, a plain Expense rule
  would have silently saved whatever account the untouched `#f_toAccountId`
  select happened to default to — and `accountCanDelete()`, which
  (correctly) treats a transfer rule's own `toAccountId` as a real
  scheduled reference blocking deletion, would have made that unrelated
  account permanently undeletable for no visible reason. Fixed at both
  ends: `submit()` now forces `toAccountId`/`category` null for whichever
  side doesn't apply to the rule's actual type, and `accountCanDelete()`
  itself re-checks `r.type === "transfer"` rather than trusting a bare
  non-null check, so neither side depends on the other alone. Covered with
  an isolated synthetic probe (a scratch account nothing else legitimately
  references, since every real seed account already has some genuine
  reference of its own) proving a leftover `toAccountId` on a non-transfer
  rule no longer blocks deleting that account.

- `check_global_search.js` -- new feature (#36): a unified search bar +
  notification bell in every page's topbar, applied from a set of 4
  approved design-canvas mockups (Dashboard/Accounts/People/Transactions).
  `Engine.globalSearch(q)` matches transactions, accounts, people,
  recurring rules, savings goals and savings groups by name/description in
  one plain case-insensitive pass, capped at 6 per section and gated on
  `q.length >= 2` (never scans the ledger against a near-empty query). The
  bell reads `UI._badgeCount` -- the exact same `attentionCount(D)` already
  computed for the PWA app-icon badge and the one-shot Notification
  summary, so all three surfaces can never disagree.

  **Real bug caught by its own regression test, fixed in the same pass:**
  without filtering to `txEditable(x)`, a query could surface a system-
  generated row (an opening-balance "adjustment") that `UI.searchGoTx()` ->
  `openTxEdit()` silently refuses to open -- no modal, no error, and
  (`openTxEdit()`'s own early return never calls `render()`) the search
  sheet itself stayed stuck open behind a stale DOM. `globalSearch()` now
  only ever returns transactions the tap can actually act on.

- `check_ledger_refresh_batch.js` -- the rest of that same 4-screen batch,
  applied to the real app. Dashboard gets NO new section: its own "This
  month" already shows income/expense (with a diverge bar) and a per-
  category bar-list with budget context a bare KPI-row/donut can't carry,
  so a second, differently-styled copy at the top would be pure
  duplication (same "match the app's own real structure first" call this
  project made before for Installments/Cash Flow's own heroes). No new
  "Quick Actions" grid anywhere either -- every screen already has
  equivalent actions (`tabHeader`'s own header buttons, the global quick-
  add FAB). What's real: Accounts gets functional type tabs (All/Cash &
  bank/Wallets/Credit cards, narrowing `tileGroups` for real, not just
  relabeling) and an issuer-initials badge on every tile (`UI.acctInitials()`
  -- a real bank/wallet logo can't be drawn, trademarked, so this derives
  short letters from `a.bank || a.name`, same technique person avatars
  already use for the identical problem); People gets functional net-sign
  tabs (All/Owes me/I owe/Settled, narrowing the list only -- the summary
  tile's own totals stay global, unaffected by which tab is selected, same
  split Accounts' tabs established first) and its summary tile gets icon
  badges (the same up/down-arrow pair every delta-chip already draws, plus
  `ICON_CHECK` for "settled"); Transactions gets a real KPI row (Income/
  Expense/Net/Records) for whatever's currently filtered -- a genuine gap,
  since `renderMetricsRow` only ever shows a total once scoped to a single
  account/category.

  **Real bug caught mid-implementation, fixed before it ever shipped:**
  `renderAccounts()`'s own new tab code read `S.acctTab`, but that
  function only ever destructures `app`/`d`, not `S` -- a bare
  `ReferenceError` on every load of the Accounts page. Caught by the new
  test itself (not a separate review pass) and fixed by reading
  `app.state.acctTab` directly.

  **Real regression this batch caused in 7 already-shipped test files**,
  found by the first full-suite run after implementing and fixed by
  scoping each locator to the real collapse-toggle's own
  `.btn-secondary.block` class: the new People "Settled" tab pill shares
  its exact visible text with the pre-existing "N settled" collapse-toggle
  button, so every existing `button:has-text("settled")`/
  `page.locator("button", {hasText: "settled"})` locator on the People
  page (`check_people_ledger.js`, `check_people_recut.js` ×2,
  `check_reconciliation.js`, `check_xss_hardening.js`, `smoke_batch7.js`
  ×2, `smoke_tx_edit.js`) either threw a strict-mode "2 elements" error
  once a real toggle also existed, or silently clicked the wrong button
  (switching tabs instead of expanding) whenever it didn't.
  `shot_person_history.js`'s own two occurrences were checked and left
  alone -- both run on Person Detail, which never carries this pill at
  all, so there was nothing there to collide.

  **Real CI-only flake this batch caused in `check_swipe_actions.js`**,
  caught by the very next push's CI run (passed locally every time before
  that, then failed ~4/5 runs once actually chased down): Transactions'
  new KPI row pushes the whole list down by its own height, and the
  seed's first row (multi-line notes/tags) is tall enough that its lower
  half now sits, unscrolled, behind the fixed `.primary-nav` bar --
  `position:fixed` with a real `z-index` above ordinary content. Test 1b's
  "pointer routing sanity check" sampled the dead center of
  `.swipe-actions`' own bounding box, which for this specific row can now
  be a point the nav bar itself wins, not `.swipe-content` -- that's the
  fixed bottom bar beating a stacking fight the check was never about, not
  the opacity fix regressing (the actual regression guard, the `alpha===1`
  assertion right above it, was never affected and still passes). Fixed by
  clamping the sample point to stay above `.primary-nav`'s own top edge,
  same as where a real finger would actually land.

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
