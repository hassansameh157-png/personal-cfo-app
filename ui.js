/* Personal CFO — presentation layer (rebuilt).
   Fixes the 5 agreed P0 mobile issues only:
   1) primary nav (5 fixed tabs) + a "More" sheet, instead of a 12-item
      horizontally-scrolling strip with no affordance
   2) responsive card rows instead of a table with a second horizontal
      scrollbar, on every data-heavy tab
   3) no manifest/service-worker registration that silently fails
   4) Transactions is paginated (25 at a time) instead of rendering ~180
      rows into the DOM at once
   5) Dashboard shows the 5 headline numbers once, and "Needs attention"
      is promoted right under the hero instead of ~3 screens down
   Everything else (business logic, labels, even known P1 quirks like the
   Installments KPI only counting money owed *to* the user) is preserved
   as-is on purpose — those are separate, already-scoped follow-up items. */

function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// Real bug, found and fixed once (the chart tooltip), then found again at
// every other call site that builds an onclick="Fn(event,'...')" argument
// out of user-controlled text (a person's name, a tag, a custom category)
// -- each one hand-rolled esc(x).replace(/'/g, "\\'") on its own, which
// escapes the closing quote but not a literal backslash that might sit
// right before it. A value ending in a backslash-then-quote (a person
// named ...\", say) would let that backslash escape the ESCAPED quote
// instead, closing the onclick string early -- the exact bug the chart
// tooltip had. One shared helper closes this off structurally, so a
// future call site gets it right by construction instead of needing the
// same fix re-derived and re-verified by hand every time: esc()
// (HTML-attribute-safe) plus backslash-before-quote (JS-string-literal-
// safe). The two don't actually interact -- esc() only ever touches
// & < > ", the backslash/quote step only ever touches \ and ' -- so
// unlike the original bug (missing the backslash step entirely), the
// order between these two specific steps isn't itself what's load-
// bearing here; doing both, in either order, is what the original bug
// skipped.
function escJsArg(s) {
  return esc(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
function svgIcon(d, size) {
  size = size || 16;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"></path></svg>';
}
// One glyph per built-in category (engine.js's own expense/income category
// lists -- see FORMS()'s `cats`/`inc` arrays), so a category reads at a
// glance instead of only by its color, which needs a legend to decode.
// Categories that share a real-world theme intentionally share a glyph
// (e.g. Rental income and Home both use the house icon; Family/Children
// share one, since neither has an unambiguous icon of its own) rather than
// forcing a distinct-but-arbitrary shape on every single one. A custom
// category (added from Settings) or anything not in this table at all
// falls back to CATEGORY_ICON_FALLBACK -- a plain tag, since there's no
// real-world glyph for a name only the user knows.
const CATEGORY_ICONS = {
  // -- expense --
  Food: "M7 2v6a2 2 0 0 0 4 0V2M9 8v14M16 2v8a2.5 2.5 0 0 0 5 0V2M18.5 12.5V22",
  Transportation: "M4 16h16M6 16a2 2 0 1 0 4 0M14 16a2 2 0 1 0 4 0M4 16V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M7 6v4M12 6v4M17 6v4",
  Rent: "M14.5 2a5.5 5.5 0 0 0-5.4 6.6L2 15.7V20h4.3l1-1h2v-2h2l2.3-2.3A5.5 5.5 0 1 0 14.5 2zM17.5 6.5h.01",
  Electricity: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  Water: "M12 2.7C12 2.7 6 9 6 13.5a6 6 0 0 0 12 0C18 9 12 2.7 12 2.7z",
  Internet: "M2 20h2v-4H2v4zM7 20h2v-8H7v8zM12 20h2v-12h-2v12zM17 20h2V4h-2v16z",
  Mobile: "M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM11 18h2",
  Shopping: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  Clothing: "M8 3 4 6v4l3-1v12h10V9l3 1V6l-4-3-2 2h-4z",
  Medical: "M12 21s-7-4.35-9.5-8.5C1 9 2.5 6 5.5 6c2 0 3.5 1.5 4.5 3 1-1.5 2.5-3 4.5-3 3 0 4.5 3 3 6.5C19 16.65 12 21 12 21z",
  Education: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z",
  Entertainment: "M3 3h18v18H3zM7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4",
  Family: "M12 2a10 10 0 1 0 .001 0zM8 10h.01M16 10h.01M8 15c1 1.5 2.5 2 4 2s3-.5 4-2",
  Children: "M12 2l2.9 6.9L22 9.6l-5.5 5.1L18 22l-6-3.5L6 22l1.5-7.3L2 9.6l7.1-.7z",
  Car: "M5 17h14M7 17a2 2 0 1 0 4 0M13 17a2 2 0 1 0 4 0M5 17v-5l2-4h10l2 4v5",
  Home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  Subscriptions: "M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6zM2 10h20M6 15h4",
  Loans: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6M9 9h2",
  // -- income --
  Salary: "M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM8 7V5h8v2",
  Freelance: "M6 8 2 12l4 4M18 8l4 4-4 4M14 4l-4 16",
  Business: "M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M17 21v-9a1 1 0 0 1 1-1h3v10M9 7h.01M9 11h.01M9 15h.01M4 21h17",
  Commission: "M23 6 13.5 15.5 8.5 10.5 1 18M17 6h6v6",
  Interest: "M19 5 5 19M6.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
};
// Shared glyphs -- reused by name below instead of repeating the same `d`
// string under two keys, so fixing one fixes both.
CATEGORY_ICONS.Rental = CATEGORY_ICONS.Home;
CATEGORY_ICONS["Selling items"] = CATEGORY_ICONS.Shopping;
const CATEGORY_ICON_FALLBACK = "M20.6 12.3 12.7 20.2a2 2 0 0 1-2.8 0l-8-8a2 2 0 0 1 0-2.8L9.8 1.5H12l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01";
function categoryIcon(name) {
  return CATEGORY_ICONS[name] || CATEGORY_ICON_FALLBACK;
}
// Curated preset swatches for every color field (account/card color, its
// secondary color, a person's avatar color) -- approved from the card
// customizer preview. Chosen to look good as a card face specifically
// (rich/saturated, not pastel), spread across the same aurora-adjacent
// hue family the rest of the Neon Aurora system already uses. Purely a
// shortcut in front of the plain native color input, which stays and
// still works exactly as before for any color outside this list.
// Three reused empty-state icon shapes (see UI.emptyState) -- not a
// bespoke icon per call site, so a future new empty state just picks
// whichever of these three actually describes it instead of inventing a
// fourth. CHECK: a genuinely good state, nothing to act on. PLUS: "add
// one to get started". SEARCH: "your filter/search matched nothing".
const ICON_CHECK = "M20 6 9 17l-5-5";
const ICON_PLUS = "M12 5v14M5 12h14";
const ICON_SEARCH = "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3";
// Dashboard Recut #28 -- one icon per real money-bucket tile in "Where my
// money is" (UI.renderDashboard). Multi-element inner markup (rect/circle,
// not one path), so these hold full innerHTML rather than a single "d"
// string the way ICON_CHECK/ICON_PLUS/ICON_SEARCH above do (those go
// through svgIcon(), which only ever wraps one <path>). Hoisted to module
// scope like every other shared icon table in this file, rather than
// re-allocated as local consts on every single Dashboard render.
const ICON_CASH = '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>';
const ICON_BANK_TILE = '<rect x="2" y="7" width="20" height="12" rx="2"/><path d="M2 11h20"/>';
const ICON_WALLET_TILE = '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="2.5"/>';
const ICON_CARDS_TILE = '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/>';
const ICON_INVESTED_TILE = '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>';
const ICON_OWED_TILE = '<path d="M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>';

const COLOR_PALETTE = [
  "#0088b0", "#1d4ed8", "#2563eb", "#0ea5e9", "#0d9488", "#10b981", "#16a34a", "#65a30d",
  "#7c3aed", "#8b5cf6", "#a855f7", "#6d28d9", "#db2777", "#ec4899", "#be185d", "#e11d48",
  "#dc2626", "#f43f5e", "#d97706", "#f59e0b", "#ca8a04", "#334155", "#1e293b", "#475569"
];

const UI = {
  app: null,
  init(engine) {
    this.app = engine;
    this.app.load();
    this.app.state.locked = this.app.hasPin();
    window.addEventListener("resize", () => {});
    this.initSwipeRows();
    this.initChartScrub();
    this.render();
    this.maybeNotify();
  },
  // Swipe-to-reveal on .card-row.swipe-row (renderTransactions' cards --
  // see the comment there). Attached once, here, via delegation on
  // `document` rather than on each .swipe-content element directly,
  // because render() replaces #root's entire innerHTML on every call (see
  // render()'s own comment on #flashStack for why) -- a listener bound to
  // a specific row element would be silently destroyed the next time
  // anything re-renders, while delegation from a node that's never
  // replaced keeps working across every future render for free.
  // Pure DOM manipulation during the drag itself (direct style.transform,
  // no state/render involved) is deliberate: this is a transient, purely
  // visual gesture with nothing worth persisting, and routing every
  // touchmove through app state + a full re-render would both be
  // needless work and guarantee visible jank on a real phone.
  initSwipeRows() {
    const DIST = 144; // matches .swipe-actions' own width
    let drag = null;
    // .swipe-actions sits at inset-inline-end (CSS), which is the physical
    // *left* in RTL -- transform:translateX is a physical property with no
    // logical equivalent, so which direction "reveal" actually means has
    // to be decided per-drag from the page's current dir, not hardcoded
    // negative. A real bug caught by review: hardcoding negative-only left
    // Arabic (this app's one RTL language) with a swipe that only ever
    // revealed empty space on the wrong side, never the actions themselves.
    const openX = () => document.documentElement.getAttribute("dir") === "rtl" ? DIST : -DIST;
    const closeAllExcept = (except) => {
      document.querySelectorAll(".swipe-content.swipe-open").forEach((el) => {
        if (el === except) return;
        el.style.transition = "";
        el.style.transform = "translateX(0)";
        el.classList.remove("swipe-open");
      });
    };
    document.addEventListener("touchstart", (e) => {
      const content = e.target.closest(".swipe-content");
      // A tap landing on the revealed Edit/Delete buttons themselves
      // isn't inside .swipe-content (they're .swipe-actions, a sibling,
      // not a child) -- closeAllExcept(null) would then match every open
      // row including the one whose own button was just tapped, sliding
      // it shut out from under the tap. Except that row's own
      // .swipe-content too whenever the touch lands anywhere in its
      // .swipe-row, not just when it lands in .swipe-content directly.
      const ownRow = e.target.closest(".swipe-row");
      closeAllExcept(content || (ownRow && ownRow.querySelector(".swipe-content")));
      if (!content) { drag = null; return; }
      const t = e.touches[0];
      const openAt = openX();
      drag = { el: content, startX: t.clientX, startY: t.clientY, openAt, base: content.classList.contains("swipe-open") ? openAt : 0, horizontal: null, lastX: 0 };
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!drag) return;
      const t = e.touches[0];
      const dx = t.clientX - drag.startX, dy = t.clientY - drag.startY;
      // Real bug reported with a screenshot: ordinary vertical scrolling
      // through the transactions list was getting misread as swipes,
      // leaving rows stuck part-open (Edit/Delete visibly showing behind
      // the content instead of staying hidden until an actual swipe). Fixed
      // by biasing hard toward "this is a scroll" (a since-caught second bug
      // -- a diagonal-drag dead band -- folded in too); see
      // classifyDragAxis()'s own comment for the full story and the exact
      // numbers, shared with initChartScrub()'s identical problem.
      if (drag.horizontal === null) drag.horizontal = this.classifyDragAxis(dx, dy);
      if (drag.horizontal !== true) return;
      e.preventDefault();
      const lo = Math.min(0, drag.openAt), hi = Math.max(0, drag.openAt);
      drag.lastX = Math.max(lo, Math.min(hi, drag.base + dx));
      drag.el.style.transition = "none";
      drag.el.style.transform = "translateX(" + drag.lastX + "px)";
    }, { passive: false });
    const finishDrag = () => {
      if (!drag || !drag.horizontal) { drag = null; return; }
      const el = drag.el, open = Math.abs(drag.lastX) > Math.abs(drag.openAt) / 2;
      el.style.transition = "";
      el.style.transform = "translateX(" + (open ? drag.openAt : 0) + "px)";
      el.classList.toggle("swipe-open", open);
      drag = null;
    };
    document.addEventListener("touchend", finishDrag);
    document.addEventListener("touchcancel", finishDrag);
  },
  // One-shot, on open only (not on every render) — a foreground summary
  // notification of how many things need attention, gated on the user
  // having opted in from Settings and actually granted permission. Skipped
  // while locked; unlockC() calls this again once the PIN is entered.
  maybeNotify() {
    try {
      const app = this.app;
      if (app.state.locked || !app.notifEnabled() || !("Notification" in window) || Notification.permission !== "granted") return;
      const D = app.derive();
      const n = app.attentionCount(D);
      if (n > 0) new Notification(app.T[app.state.lang].brand, { body: n + " " + app.L("item(s) need attention.", "بند محتاج انتباه.") });
    } catch (e) {}
  },
  updateBadge(n) {
    try {
      if (!("setAppBadge" in navigator)) return;
      if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge();
    } catch (e) {}
  },

  // ---- generic actions ---------------------------------------------------
  setPage(p) { this.app.state.page = p; this.app.state.moreOpen = false; this.app.state.quickAddOpen = false; this.app.state.txVisible = 25; this._needsAttentionExpanded = false; this._txActionRow = null; this._txFiltersOpen = false; this._acctActionRow = null; this._personActionRow = null; this._peopleSettledExpanded = false; this._plansCompletedExpanded = false; this._groupActionRow = null; this._groupsCompletedExpanded = false; this._stmtActionRow = null; this.render(); window.scrollTo({ top: 0 }); },
  // A person's own page: every loan and installment plan tied to them (both
  // directions) in one place, instead of scattered across Receivables &
  // Payables and Installments — the gap that made juggling several loans
  // with the same person (e.g. a normal loan plus money held in trust) hard
  // to see at a glance.
  viewPerson(id) { this.app.state.personDetailId = id; this.app.state.page = "person_detail"; this.app.state.moreOpen = false; this.app.state.quickAddOpen = false; this.render(); window.scrollTo({ top: 0 }); },
  // Tapping an account/card jumps straight to its own transactions —
  // Transactions' account filter already matches accountId, fromId and
  // toId (a transfer either side), so this is the same filter a person
  // could set by hand from the dropdown there, just one tap instead of two.
  viewAccountTx(id) { this.app.state.filt.account = id; this.setPage("transactions"); },
  // 47 (People Recut): a real, exact-match filter.person (matching
  // r.personId, same field Person Detail's own historyTx already keys
  // off), replacing what used to be UI.setFilter('q', p.name) here -- a
  // real bug, same shape as viewCategoryTx's own "Food" one below: a
  // person's name as free text both over-matches (any unrelated
  // transaction whose description happens to mention it) and under-
  // matches (a transaction genuinely tied to them via personId, but whose
  // description never says their name at all).
  viewPersonTx(id) { this.app.state.filt.person = id; this.setPage("transactions"); },
  // Same idea for a category/source bar (Dashboard's This month, Reports'
  // by-category and by-source breakdowns) -- a real, dedicated exact-match
  // filter (see renderTransactions/Engine's filt.category), NOT the
  // free-text search. That used to be reused here, which was a genuine
  // bug a user reported: "Food" is both a category name and ordinary
  // English text people type into descriptions ("Work food -Talabat"),
  // so a re-categorized transaction whose description still happened to
  // mention "food" kept showing up under Food regardless of its real,
  // already-changed category field.
  // kind ("expense"/"income", matching catBar's own param) disambiguates
  // "Other" specifically -- a real bug, found by inspection: an
  // uncategorized expense and an uncategorized income both fall into
  // "Other" (see Engine's category aggregations, all `category ||
  // "Other"`), so without knowing which side's bar was tapped, filtering
  // by category name alone would show BOTH kinds mixed together under
  // one "Other" click -- more than that specific bar's own total ever
  // counted. A real, named category never needs this (its name alone is
  // already unambiguous in the ordinary case), so this only matters for
  // "Other"; renderTransactions ignores categoryKind for anything else.
  viewCategoryTx(name, kind) { this.app.state.filt.category = name; this.app.state.filt.categoryKind = kind || ""; this.setPage("transactions"); },
  // A tag isn't a category field value -- unlike viewCategoryTx above,
  // this one genuinely belongs in the free-text search (a tag chip click
  // is "search for this word", not "filter to this exact category"),
  // same as searching for it by hand would do.
  viewTagTx(name) { this.app.state.filt.q = name; this.setPage("transactions"); },
  toggleMore() { this.app.state.moreOpen = !this.app.state.moreOpen; this.app.state.quickAddOpen = false; this.render(); },
  // The FAB's own quick-add sheet -- same shape as toggleMore() above,
  // just a different sheet (see renderQuickAddSheet) and mutually
  // exclusive with it for the same reason openModal() above clears both.
  toggleQuickAdd() { this.app.state.quickAddOpen = !this.app.state.quickAddOpen; this.app.state.moreOpen = false; this.render(); },
  setLang(l) { this.app.state.lang = l; this.render(); },
  // Off by default -- the plain flat Transactions list is unchanged unless
  // the user turns this on. Mobile-only (see groupTxItems()'s own comment
  // for why): the desktop table is already a denser, all-columns-visible
  // view where a repeated row is easy to spot on its own, and keeping this
  // to one layout means only one grouping/pagination interaction to reason
  // about.
  toggleGroupTx() { this.app.state.groupTx = !this.app.state.groupTx; this.render(); },
  // 32 (Transactions Recut): mobile-only -- the 4 structural filter
  // dropdowns start collapsed behind this toggle (search itself stays
  // always visible, see renderTransactions()'s own comment on that split);
  // purely a UI convenience flag, not persisted app state, so it's reset
  // (collapsed again) by setPage() the same way _needsAttentionExpanded is.
  toggleTxFilters() { this._txFiltersOpen = !this._txFiltersOpen; this.render(); },
  // Expand/collapse one "similar transactions" group -- transient view
  // state, not app data, so it lives on the UI object (this._expandedTxGroups,
  // lazily created) rather than app.state, same reasoning flipCardC's own
  // per-tile flip state already establishes.
  toggleTxGroup(id) {
    this._expandedTxGroups = this._expandedTxGroups || new Set();
    if (this._expandedTxGroups.has(id)) this._expandedTxGroups.delete(id); else this._expandedTxGroups.add(id);
    this.render();
  },
  // Dashboard's Needs Attention list -- collapsed to the first
  // NEEDS_ATTENTION_COLLAPSED cards by default (see renderDashboard()),
  // expanded on demand. Transient view state, not app data -- same
  // this-instance-property reasoning as _expandedTxGroups above -- and
  // setPage() resets it back to collapsed on every navigation, so landing
  // on Dashboard fresh never silently starts pre-expanded from a previous
  // visit.
  toggleNeedsAttention() { this._needsAttentionExpanded = !this._needsAttentionExpanded; this.render(); },
  // Short physical buzz for a real moment -- currently every destructive
  // confirm() dialog (see hapticConfirm() below), the instant the user
  // actually accepts it. Feature-detected: navigator.vibrate doesn't exist
  // on desktop browsers or Safari/iOS at all, and the try/catch also
  // covers a real-world case seen on some Android builds where it exists
  // but throws when called outside a user gesture -- either way this is
  // purely an enhancement, never something anything else depends on.
  haptic(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern || 15); } catch (e) {}
  },
  // Wraps the native confirm() (same synchronous dialog, same boolean
  // return every call site already depends on) with a haptic() on accept
  // only -- cancelling a destructive action shouldn't buzz.
  hapticConfirm(msg) {
    const ok = confirm(msg);
    if (ok) this.haptic();
    return ok;
  },
  togglePrivacy() { this.app.state.privacy = !this.app.state.privacy; this.render(); },
  toggleArabicNumerals() { this.app.state.arabicNumerals = !this.app.state.arabicNumerals; this.render(); },
  setPayoffOrder(v) { this.app.state.payoffOrder = v; this.render(); },
  setPayoffCalc(field, v) { this.app.state.payoffCalc[field] = v; this.render(true); },
  // Picking a Relation resets Color to that type's default (the field's
  // hint says so) -- same "pick a default, override after" pattern as the
  // account color field, just wired live since relation/color live in the
  // same modal here (an account's type isn't editable after creation, so
  // it never needed this). Deliberately NOT a full render() -- like
  // suggestCategoryFromDesc, this modal's fields only sync into state.form
  // on submit (see submitModal's FormData read), so a render() here would
  // silently wipe out whatever the user already typed into Name/Phone/Notes
  // and hadn't submitted yet. Setting the color input's value directly
  // avoids that; submit() still picks it up correctly either way.
  setPersonRelation(v) {
    const rt = this.app.relationTypes().find(r => r.v === v);
    if (!rt) return;
    const el = document.getElementById("f_color");
    if (el) el.value = rt.color;
  },
  // A preset swatch button click -- same "set the real input's value
  // directly, no render()" reasoning as setPersonRelation just above, so
  // it can't wipe out unsaved text elsewhere in the same modal. fieldKey
  // is which color field the swatch belongs to (a modal with a secondary
  // color has two independent rows, each wired to its own input).
  setColorField(fieldKey, hex) {
    const el = document.getElementById("f_" + fieldKey);
    if (el) el.value = hex;
    if (fieldKey === "color") this.syncColor2Default(hex);
    else if (fieldKey === "color2") this._color2Touched = true;
  },
  // While color2 is still just the auto-darkened placeholder Engine.open()
  // invented (never a real choice -- see _color2Seeded there), keep it
  // tracking live edits to the primary Color field/swatches, so picking a
  // two-color pattern without ever touching Secondary color still pairs it
  // with a shade of whatever color ended up primary, not a stale one from
  // whatever the primary color was when the form first opened. The moment
  // the user touches color2 themselves (here or via its own swatches),
  // _color2Touched latches true and this stops overwriting their choice.
  syncColor2Default(hex) {
    if (this._color2Touched) return;
    const el = document.getElementById("f_color2");
    if (el) el.value = this.app.darkenHex(hex);
  },
  // A category pill click -- same direct-set, no-render() reasoning as
  // setColorField, so it can't wipe out unsaved text elsewhere in the
  // modal (an amount already typed in, a description mid-edit). Latches
  // _categoryTouched, same as picking straight from the <select> does via
  // its own onchange -- a pill is just another way of making the same
  // deliberate choice, and suggestCategoryFromDesc must stop overwriting
  // it either way.
  setCategoryField(name) {
    const el = document.getElementById("f_category");
    if (el) el.value = name;
    this._categoryTouched = true;
  },
  // Card flip -- direct DOM class toggle, no render(): a flip is a
  // transient view of the same tile, not a data change, so it doesn't
  // need to survive (or trigger) a re-render, same reasoning
  // setColorField/syncColor2Default already establish for this kind of
  // state elsewhere. #ccflip-<id> is unique to this specific tile.
  flipCardC(id) {
    const el = document.getElementById("ccflip-" + id);
    if (!el) return;
    // Recorded BEFORE toggling inert below: making the just-clicked
    // button's face inert force-blurs it straight to <body>, so this has
    // to be captured while it's still the real activeElement.
    const cameFromFlipBtn = el.contains(document.activeElement) && document.activeElement.classList.contains("cc-flip-btn");
    const flipped = el.classList.toggle("flipped");
    // Keep the face that's rotated out of view out of the tab order/a11y
    // tree too, not just visually hidden -- see the `inert` comment on
    // .cc-face-back's markup.
    const front = el.querySelector(".cc-face-front"), back = el.querySelector(".cc-face-back");
    if (front) front.toggleAttribute("inert", flipped);
    if (back) back.toggleAttribute("inert", !flipped);
    // Recent activity is built the first time a tile actually flips open,
    // not for every account on every render() -- see ccBackRowsHtml().
    if (flipped && back) {
      const list = back.querySelector(".cc-back-list");
      if (list && !list.innerHTML) list.innerHTML = this.ccBackRowsHtml(el.dataset.accId);
    }
    // Move focus on to the newly visible face's own flip button, so a
    // keyboard user's next Tab continues from there instead of from the
    // top of the page (where the forced blur above would otherwise leave
    // it). Gated on the flip button actually having had focus, not just
    // unconditional, so this can never steal focus from something
    // unrelated elsewhere on the page.
    if (cameFromFlipBtn) {
      const newFace = flipped ? back : front;
      const newBtn = newFace && newFace.querySelector(".cc-flip-btn");
      if (newBtn) newBtn.focus();
    }
  },
  // Chart bar tap -> a small floating tooltip. #chartTooltip lives outside
  // #root (same reasoning as #flashStack) so positioning it doesn't get
  // wiped by an unrelated render(); it's just simplest to reuse that
  // established pattern here too, even though a bar tap itself never
  // triggers a render(). Auto-hides itself; a second tap elsewhere (or a
  // real render(), e.g. switching tabs) also clears it via chartTooltipHideT.
  showChartTooltip(evt, text) {
    this.positionChartTooltip(evt.currentTarget, text);
    evt.stopPropagation();
  },
  // The actual positioning logic, factored out of showChartTooltip() (a
  // real DOM click/keydown event, always has evt.currentTarget) so
  // initChartScrub() below can drive the same tooltip from a touchmove --
  // there, the bar under the finger is found via elementFromPoint(), not
  // an event's currentTarget, since a touchmove's own target is always
  // wherever the touch STARTED, not whatever is currently under it.
  positionChartTooltip(bar, text) {
    const el = document.getElementById("chartTooltip");
    if (!el || !bar) return;
    const r = bar.getBoundingClientRect();
    el.textContent = text;
    el.classList.add("show");
    // Position centered above the tapped bar, clamped to the viewport so it
    // never clips off-screen for bars near the left/right edge. Also clamped
    // to never rise above the chart's own container (.chart-cols) -- a tall
    // bar's top can sit just a few px below the section heading above the
    // chart, which would otherwise put the tooltip right over that text;
    // pinning it to the container top instead means it overlaps at most the
    // chart's own bars, never unrelated content above the chart.
    el.style.left = "0px";
    el.style.top = "0px";
    const tw = el.offsetWidth, th = el.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    const container = bar.closest(".chart-cols");
    const containerTop = container ? container.getBoundingClientRect().top : r.top;
    const top = Math.max(8, containerTop + 2, r.top - th - 10);
    el.style.left = left + "px";
    el.style.top = top + "px";
    if (this._chartTooltipHideT) clearTimeout(this._chartTooltipHideT);
    this._chartTooltipHideT = setTimeout(() => el.classList.remove("show"), 2500);
  },
  // The .chart-bar whose .chart-col contains x, regardless of the bar's
  // own height/Y position -- see initChartScrub()'s own comment for why
  // this can't just be document.elementFromPoint(x, y).
  chartBarAtX(container, x) {
    const cols = container.querySelectorAll(".chart-col");
    for (const col of cols) {
      const r = col.getBoundingClientRect();
      if (x >= r.left && x <= r.right) return col.querySelector(".chart-bar");
    }
    return null;
  },
  // Shared horizontal-vs-vertical drag classification, used by both
  // initSwipeRows() and initChartScrub() -- one source of truth for these
  // exact numbers rather than two copies that could quietly drift apart.
  // Arrived at through two real bug fixes on the swipe-row side (a too-
  // eager 6px dead zone that misread ordinary scrolling as a swipe, then a
  // too-strict ratio that left a dead band a steady diagonal drag could
  // never cross) -- see initSwipeRows()'s own touchmove handler for the
  // full story. Returns true (horizontal), false (vertical), or null
  // (still ambiguous -- wait for more movement before deciding).
  classifyDragAxis(dx, dy) {
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (ady > 8 && ady >= adx) return false;
    if (adx > 12 && adx > ady * 1.75) return true;
    if (adx > 24 || ady > 24) return adx > ady;
    return null;
  },
  // Drag a finger across a bar chart (Dashboard's net-worth trend, the
  // by-month/by-category charts) to scrub through every bar's value live,
  // instead of having to tap each one separately -- the way a stock app's
  // price chart works. Delegated on document (like initSwipeRows -- charts
  // get rebuilt by every render(), so per-bar listeners would need
  // re-attaching constantly); scoped to whichever .chart-cols the touch
  // actually started in, so a scrub can't jump between two different
  // charts on a long page.
  //
  // Reuses the exact same asymmetric, scroll-biased horizontal-vs-vertical
  // classification as initSwipeRows() (see its own comment for the full
  // story of the bug that shaped these numbers) rather than inventing new
  // thresholds -- the underlying problem is identical: don't let an
  // ordinary vertical scroll over the chart get mistaken for a deliberate
  // sideways gesture.
  initChartScrub() {
    let scrub = null;
    document.addEventListener("touchstart", (e) => {
      const container = e.target.closest && e.target.closest(".chart-cols");
      scrub = container ? { container, startX: e.touches[0].clientX, startY: e.touches[0].clientY, horizontal: null, lastBar: null } : null;
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!scrub) return;
      const t = e.touches[0];
      if (scrub.horizontal === null) scrub.horizontal = this.classifyDragAxis(t.clientX - scrub.startX, t.clientY - scrub.startY);
      if (scrub.horizontal !== true) return;
      e.preventDefault();
      // Real bug caught in review: finding the crossed bar via
      // document.elementFromPoint() only works while the touch Y happens
      // to still be over that bar's own painted box -- .chart-bar sits
      // bottom-aligned inside its full-height .chart-col (see app.css),
      // so a short bar's box covers only the lower slice of the chart;
      // held at the Y of a taller neighboring bar, elementFromPoint over
      // a short bar's column hits the empty column, not the bar, and the
      // scrub would silently freeze instead of updating for every bar
      // crossed -- exactly the data shape (one tall month next to a near-
      // zero one) this feature is most useful for. Matching by X against
      // each .chart-col's own horizontal range instead is independent of
      // bar height/Y entirely.
      const bar = this.chartBarAtX(scrub.container, t.clientX);
      if (!bar || bar === scrub.lastBar) return;
      scrub.lastBar = bar;
      this.positionChartTooltip(bar, bar.getAttribute("aria-label") || "");
      // A tiny tick per bar crossed -- same haptic() as everywhere else,
      // a lighter pattern than the default confirm/save buzz since this
      // fires many times in quick succession while dragging.
      this.haptic(4);
    }, { passive: false });
    const endScrub = () => { scrub = null; };
    document.addEventListener("touchend", endScrub);
    document.addEventListener("touchcancel", endScrub);
  },
  // Net worth sparkline tap -> expand/collapse the full 6-month trend chart
  // inline. renderDashboard() leaves #nwTrendExpand empty; the 6-derive()
  // trend series (nwTrendMonths(), shared with Reports) is only actually
  // built the first time this expands, and injected straight in via
  // innerHTML -- no render() call, same direct-DOM reasoning as
  // flipCardC, just building real markup instead of toggling a class on
  // markup that was already there. Collapsing is a plain classList
  // toggle; a render() in between (e.g. a save while the panel is open)
  // resets #nwTrendExpand to empty/collapsed, so a re-expand after that
  // rebuilds it fresh rather than trusting stale cached HTML.
  toggleNwTrend(evt) {
    if (evt) evt.stopPropagation();
    const el = document.getElementById("nwTrendExpand");
    if (!el) return;
    if (!el.classList.contains("show") && !el.innerHTML) {
      const app = this.app, t = app.T[app.state.lang];
      el.innerHTML = '<h2 class="section-title">' + esc(t.netWorthTrend) + "</h2>" +
        this.barChart(this.nwTrendMonths(), (i) => i.value >= 0 ? "var(--c-pos)" : "var(--c-neg)");
    }
    const nowShown = el.classList.toggle("show");
    if (evt && evt.currentTarget) evt.currentTarget.setAttribute("aria-expanded", nowShown ? "true" : "false");
  },
  // Reorder accounts -- swap one step up/down within their own visual
  // section (see Engine.moveAccount).
  moveAccountC(id, dir) { this._acctActionRow = null; this.app.moveAccount(id, dir); this.render(); },
  openModal(kind, pre) {
    // Both sheets (More, quick-add) share the modal's own "sheet-backdrop"
    // class/z-index (see renderModal below), so a modal opened while either
    // was still open -- reachable now that the quick-add FAB's own items
    // call this directly, unlike More's, which only ever call setPage() --
    // would otherwise render both the sheet and the dialog at once.
    this.app.state.quickAddOpen = false;
    this.app.state.moreOpen = false;
    this.app.open(kind, pre);
    // A real saved color2 (not just our placeholder) must never be
    // silently overwritten by a later primary-color edit -- see
    // syncColor2Default -- so start "touched" whenever it wasn't freshly
    // seeded this open (including forms with no color2 field at all,
    // where _color2Seeded is undefined and this is simply inert).
    this._color2Touched = !this.app.state.form._color2Seeded;
    // Same reasoning for the description -> category autocomplete (see
    // suggestCategoryFromDesc): a category the form already opened with
    // (an edit's saved value, a Duplicate's copy of the original, a
    // Dashboard "Quick add" chip's remembered category) is a deliberate
    // value, not the blank guess autocomplete exists to fill in -- so it
    // starts "touched" and stays untouched by the user's own further
    // edits to Description. Keyed on pre.category itself (not e.g.
    // pre.id) so it covers all of those pre-fill sources at once, not
    // just editing. A brand new blank entry has no pre.category, so
    // autocomplete still does its job as the description is first typed.
    this._categoryTouched = !!(pre && pre.category);
    this.render();
  },
  closeModal() { this.app.state.modal = null; this.app.state.err = ""; this.render(); },
  submitModal() {
    const modalEl = document.getElementById("modalForm");
    if (modalEl) {
      const fd = new FormData(modalEl);
      for (const [k, v] of fd.entries()) this.app.state.form[k] = v;
    }
    const ok = this.app.submit();
    this.render();
    // Single choke point every modal save funnels through (add/edit a
    // transaction, an account, a person, a budget...), so this is also the
    // one place a "you just confirmed something" haptic belongs, rather
    // than scattering it across every individual submit path.
    if (ok) { this.flash(); this.haptic(); }
  },
  // #flashStack lives outside #root in the static page shell (see
  // index.html/personal_cfo_app_final.html), not inside anything render()
  // ever regenerates -- render() replaces #root's whole innerHTML on every
  // call, so a flash pill living inside that tree would vanish the instant
  // any other action re-rendered before its own 1.8s was up, which is the
  // common case (submitModal() itself calls render() right before this).
  // Each pill manages its own lifecycle via its own setTimeout, so several
  // queued in a row (a quick run of edits/deletes) stack and fade
  // independently instead of one replacing the last.
  // saveError branch: a real bug, found by inspection, not reported by a
  // user -- Engine.persist() used to swallow localStorage.setItem's own
  // failure (a full quota, or Safari private browsing blocking writes
  // outright) and still report success. A save that genuinely failed
  // needs a warning that's actually seen, not a 1.8s pill indistinguishable
  // from every routine success one -- so this variant carries its own
  // danger styling, a role="alert" (not "status", which many screen
  // readers announce far less assertively), stays until the user
  // dismisses it, and reads as an alert-triangle rather than the usual
  // checkmark.
  flash() {
    const stack = document.getElementById("flashStack");
    if (!stack) return;
    const app = this.app;
    const pill = document.createElement("div");
    if (app.state.saveError) {
      pill.className = "flash-pill danger flash-pill-enter";
      pill.setAttribute("role", "alert");
      pill.setAttribute("aria-live", "assertive");
      pill.innerHTML = svgIcon("M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01", 15) +
        '<span>' + esc(app.L("Not saved — check your browser storage isn't full or blocked.", "لم يُحفظ — تأكد إن تخزين المتصفح مش ممتلئ أو محظور.")) + "</span>" +
        '<button type="button" class="flash-dismiss" aria-label="' + esc(app.L("Dismiss")) + '" onclick="this.closest(\'.flash-pill\').remove()">×</button>';
      stack.appendChild(pill);
      requestAnimationFrame(() => pill.classList.remove("flash-pill-enter"));
      return;
    }
    pill.className = "flash-pill flash-pill-enter";
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");
    pill.innerHTML = svgIcon("M20 6 9 17l-5-5", 15) + esc(app.state.saved);
    stack.appendChild(pill);
    requestAnimationFrame(() => pill.classList.remove("flash-pill-enter"));
    setTimeout(() => {
      pill.classList.add("flash-pill-exit");
      setTimeout(() => pill.remove(), 250);
    }, 1800);
  },
  loadMoreTx() { this.app.state.txVisible += 25; this.render(true); },
  setFilter(k, v) { this.app.state.filt[k] = v; this.app.state.txVisible = 25; this.render(true); },
  // Sets several filter fields at once with a single render() -- for the
  // spots that used to chain two UI.setFilter() calls back to back (the
  // category dropdown resetting categoryKind alongside category, the
  // budget/unusual-spending alerts setting both together): each
  // setFilter() call independently re-derives the whole app state and
  // rebuilds the page, so two chained calls did that work twice for one
  // user action. obj is applied in whatever order Object.entries gives it,
  // which is fine here since none of these fields' effects on each other
  // depend on write order (unlike, say, category needing categoryKind
  // already in place before rendering -- both land in state before the
  // one render() call reads either).
  setFilters(obj) { Object.assign(this.app.state.filt, obj); this.app.state.txVisible = 25; this.render(true); },
  reverseTx(id) { this._txActionRow = null; this.app.reverse(id); this.render(); },
  // Opens the same add-modal a plain entry was created from (income,
  // expense, transfer, a loan or a payment against it, an installment or a
  // gam3ya installment), pre-filled from the transaction itself — submit()
  // recognizes the carried-over `id` and updates that row in place instead
  // of posting a new one.
  openTxEdit(id) {
    this._txActionRow = null;
    const t = this.app.state.data.tx.find(x => x.id === id);
    if (!this.app.txEditable(t)) return;
    this.openModal(this.app.txEditKind(t), Object.assign({}, t));
  },
  addWhatIfC() {
    const app = this.app, title = document.getElementById("wiTitle").value;
    const amount = app.n(document.getElementById("wiAmount").value);
    const kind = document.getElementById("wiKind").value;
    const date = document.getElementById("wiDate").value;
    if (!amount) return;
    app.addWhatIf(title, kind === "expense" ? -Math.abs(amount) : Math.abs(amount), date);
    this.render();
  },
  removeWhatIf(id) { this.app.removeWhatIf(id); this.render(); },
  clearWhatIfC() { this.app.state.whatIf = []; this.render(); },
  suggestCategoryFromDesc(desc) {
    // Real bug, reported by a user: this used to fire on every keystroke
    // in Description regardless of whether Category already held a real
    // choice -- the user's own deliberate pick (or an edit's already-saved
    // category, see openModal) could silently flip to whatever this
    // guessed next, with no warning, just by continuing to type or tweak
    // the description afterward. _categoryTouched (set the moment the
    // category <select> itself changes, or immediately on opening an edit
    // -- see openModal/the select's onchange) means autocomplete only
    // ever fills in a category nobody has chosen yet, exactly like
    // _color2Touched already does for the color2 field.
    if (this._categoryTouched) return;
    const app = this.app, kind = app.state.modal;
    const cat = app.suggestCategory(desc, kind);
    if (!cat) return;
    const sel = document.getElementById("f_category");
    if (!sel) return;
    // suggestCategory reads it off past transactions, which can outlive the
    // category itself — deleteCategory() has no in-use guard, unlike
    // deletePlan/deleteInvestment/deleteGroup. Setting a value with no
    // matching <option> would silently blank the field instead of leaving
    // the user's own selection alone.
    const stillExists = Array.prototype.some.call(sel.options, (o) => o.value === cat);
    if (stillExists && sel.value !== cat) sel.value = cat;
  },
  // Opens the same add-modal openTxEdit does, pre-filled from the original
  // row — but with `id` stripped and the date reset to today, so submit()
  // posts it as a brand-new transaction instead of updating the original.
  duplicateTxC(id) {
    this._txActionRow = null;
    const t = this.app.state.data.tx.find((x) => x.id === id);
    if (!this.app.txEditable(t)) return;
    const pre = Object.assign({}, t, { id: undefined, date: this.app.today(), created: undefined });
    this.openModal(this.app.txEditKind(t), pre);
  },
  deleteTxC(id) {
    this._txActionRow = null;
    const app = this.app, t = app.state.data.tx.find(x => x.id === id);
    // render() must fire unconditionally, even when hapticConfirm() is
    // cancelled -- otherwise _txActionRow's reset above never reaches the
    // DOM and the stale .sheet-backdrop stays live, intercepting every
    // click underneath it (real bug caught by the full test suite).
    if (app.txEditable(t) && this.hapticConfirm(app.L("Delete this transaction? This cannot be undone.", "مسح الحركة دي؟ الإجراء ده لا يمكن التراجع عنه."))) { app.deleteTx(id); }
    this.render();
  },
  deleteAccountC(id) {
    this._acctActionRow = null;
    const a = this.app.state.data.accounts.find(x => x.id === id);
    // render() must fire unconditionally, even when hapticConfirm() is
    // cancelled or the account isn't found -- same lesson learned from
    // deleteTxC's own real bug (see its comment): otherwise _acctActionRow's
    // reset above never reaches the DOM and a stale .sheet-backdrop stays
    // live, intercepting the next click anywhere else on the page.
    if (a && this.app.accountCanDelete(id) && this.hapticConfirm(this.app.L("Delete ") + a.name + "?")) { this.app.deleteAccount(id); }
    this.render();
  },
  deletePersonC(id) {
    this._personActionRow = null;
    // render() must fire unconditionally, even when hapticConfirm() is
    // cancelled -- same lesson learned from deleteTxC/deleteAccountC's own
    // real bugs (see their comments): otherwise _personActionRow's reset
    // above never reaches the DOM and a stale .sheet-backdrop stays live,
    // intercepting the next click anywhere else on the page.
    if (!this.app.personHasRecords(id) && this.hapticConfirm(this.app.L("Delete ") + this.app.personName(id) + "?")) { this.app.deletePerson(id); }
    this.render();
  },
  // 41 (People Recut): the sheet UI.openPersonActions() opens -- reuses
  // the exact .sheet/.sheet-backdrop/.sheet-actions markup Transactions'/
  // Accounts' own action sheets established (see renderTxActionSheet()/
  // renderAcctActionSheet()), just for "+ Lend / owed to me"/"+ Debt I
  // owe"/Edit/Delete instead. Pay/Collect stay their own always-visible
  // primary button on both the People list and Person Detail -- the one
  // action most likely to actually be needed for a person with an open
  // balance, same reasoning search stayed always-visible in Transactions'
  // own filter split (idea 32) instead of folding everything behind one
  // toggle. this._personActionRow holds which person's sheet (if any) is
  // open -- reused as-is by both the People list and Person Detail, since
  // only one such sheet can ever be open at a time regardless of page.
  renderPersonActionSheet() {
    const app = this.app, id = this._personActionRow;
    if (!id) return "";
    const p = app.state.data.people.find(x => x.id === id);
    if (!p) return "";
    const canDelete = !app.personHasRecords(p.id);
    const items = [
      ["M12 5v14M19 12l-7 7-7-7", app.L("+ Lend / owed to me", "+ سلفة / لي"), "UI.openPersonForm('receivable','" + p.id + "')", false],
      ["M12 19V5M5 12l7-7 7 7", app.L("+ Debt I owe", "+ دين عليّ"), "UI.openPersonForm('payable','" + p.id + "')", false],
      ["M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z", app.L("Edit"), "UI.openPersonEdit('" + p.id + "')", false],
      canDelete ? ["M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6", app.L("Delete"), "UI.deletePersonC('" + p.id + "')", true] : null,
    ].filter(Boolean);
    return '<div class="sheet-backdrop" onclick="UI.closePersonActions()"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(p.name) + '">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-title">' + esc(p.name) + "</div>" +
        '<div class="sheet-actions">' + items.map(([ico, label, onclick, danger]) =>
          '<button type="button" class="sheet-action' + (danger ? " danger" : "") + '" onclick="' + onclick + '"><span class="sheet-action-ico">' + svgIcon(ico, 18) + "</span>" + esc(label) + "</button>"
        ).join("") + "</div>" +
      "</div>";
  },
  openPersonActions(id) { this._personActionRow = id; this.render(); },
  closePersonActions() { this._personActionRow = null; this.render(); },
  // "receivable"/"payable" both take a bare {personId} pre-fill already
  // (same as the People list's own inline "+ Lend"/"+ Debt" buttons always
  // did) -- this just also closes the sheet first, the same pattern
  // UI.openAcctEdit()/openAcctStatement() already established for Accounts'
  // own sheet, so it doesn't linger in the DOM underneath the modal.
  openPersonForm(kind, id) { this._personActionRow = null; this.openModal(kind, { personId: id }); },
  openPersonEdit(id) {
    this._personActionRow = null;
    const p = this.app.state.data.people.find(x => x.id === id);
    if (!p) return;
    this.openModal("person_edit", { id: p.id, name: p.name, phone: p.phone || "", relation: p.relation || "other", color: this.personColor(p), color2: p.color2 || "", pattern: p.pattern || "diag1", textColor: p.textColor || "auto", notes: p.notes || "" });
  },
  togglePeopleSettled() { this._peopleSettledExpanded = !this._peopleSettledExpanded; this.render(); },
  setPeopleQuery(v) { this.app.state.peopleQ = v; this.render(); },
  deletePlanC(id) {
    const plan = this.app.state.data.plans.find(p => p.id === id); if (!plan) return;
    if (this.app.planCanDelete(id) && this.hapticConfirm(this.app.L("Delete ") + plan.title + "?")) { this.app.deletePlan(id); this.render(); }
  },
  deleteInvestmentC(id) {
    const iv = this.app.state.data.investments.find(i => i.id === id); if (!iv) return;
    if (this.app.investmentCanDelete(id) && this.hapticConfirm(this.app.L("Delete ") + iv.name + "?")) { this.app.deleteInvestment(id); this.render(); }
  },
  // Real bug fix: recurring rules had no delete path anywhere -- same
  // shape as deleteInvestmentC just above.
  deleteRecurringC(id) {
    const r = this.app.state.data.recurring.find(x => x.id === id); if (!r) return;
    if (this.app.recurringCanDelete(id) && this.hapticConfirm(this.app.L("Delete ") + r.name + "?")) { this.app.deleteRecurring(id); this.render(); }
  },
  deleteCardStatementC(id) {
    // Real bug fix, same class as deletePlanC/deleteGroupC's own: now that
    // this can be invoked from the statement's action sheet, render() must
    // run even on a cancelled confirm(), or the sheet's own backdrop is
    // left stuck in the DOM, blocking clicks underneath it.
    this._stmtActionRow = null;
    const s = (this.app.state.data.cardStatements || []).find(x => x.id === id); if (!s) return;
    if (this.app.cardStatementCanDelete(id) && this.hapticConfirm(this.app.L("Delete ") + (s.period || s.due || "") + "?")) { this.app.deleteCardStatement(id); }
    this.render();
  },
  deleteGroupC(id) {
    // Real bug fix, same class as deletePlanC/deletePersonC's own: now that
    // this can be invoked from the group's action sheet, render() must run
    // even on a CANCELLED confirm(), or the sheet's own backdrop is left
    // stuck in the DOM, blocking clicks underneath it.
    this._groupActionRow = null;
    const g = (this.app.state.data.groups || []).find(x => x.id === id); if (!g) return;
    if (this.app.groupCanDelete(id) && this.hapticConfirm(this.app.L("Delete ") + g.name + "?")) { this.app.deleteGroup(id); }
    this.render();
  },
  deleteSavingsGoalC(id) {
    const g = (this.app.state.data.savingsGoals || []).find(x => x.id === id); if (!g) return;
    if (this.hapticConfirm(this.app.L("Delete ") + g.name + "?")) { this.app.deleteSavingsGoal(id); this.render(); }
  },
  // No confirm() here (unlike delete below) -- checking a to-do off, or
  // reopening one, is never destructive: nothing is lost, and the same
  // checkbox undoes it. A short haptic tick on the action itself (not
  // hapticConfirm, there's no dialog to accept) gives the same tactile
  // "done" feedback as the confirm-and-save moments elsewhere.
  toggleTodoDoneC(id) {
    this.haptic(); this.app.toggleTodoDone(id); this.render();
  },
  deleteTodoC(id) {
    const td = (this.app.state.data.todos || []).find(x => x.id === id); if (!td) return;
    if (this.hapticConfirm(this.app.L("Delete ") + td.title + "?")) { this.app.deleteTodo(id); this.render(); }
  },
  setBudgetC() {
    const cat = document.getElementById("budgetCat").value;
    const amt = document.getElementById("budgetAmt").value;
    if (!cat || this.app.n(amt) <= 0) return;
    this.app.setBudget(cat, amt);
    this.render();
  },
  clearBudgetC(cat) { this.app.setBudget(cat, 0); this.render(); },
  setOverallBudgetC() {
    const amt = document.getElementById("overallBudgetAmt").value;
    if (this.app.n(amt) <= 0) return;
    this.app.setOverallBudget(amt);
    this.render();
  },
  clearOverallBudgetC() { this.app.setOverallBudget(0); this.render(); },
  addCategoryC(kind) {
    const input = document.getElementById(kind === "income" ? "newIncomeCat" : "newExpenseCat");
    const res = this.app.addCategory(kind, input.value);
    if (!res.ok) { alert(res.error); return; }
    this.render();
  },
  deleteCategoryC(kind, name) {
    if (this.hapticConfirm(this.app.L("Delete ") + name + "?")) { this.app.deleteCategory(kind, name); this.render(); }
  },
  postRecurringC(id) {
    const r = this.app.state.data.recurring.find(x => x.id === id); if (!r) return;
    this.app.postRecurring(r); this.render();
  },
  setHorizon(h) { this.app.state.horizon = Number(h); this.render(); },
  togglePlanRows(id) { this.app.state.openPlan = this.app.state.openPlan === id ? null : id; this.render(true); },
  // 53 (Installments Recut): a plan that's fully paid off stays in
  // state.data.plans forever (nothing ever archives it) -- this collapses
  // it out of the main list by default, the same "N settled" pattern
  // People's own list already established for the same reason.
  togglePlansCompleted() { this._plansCompletedExpanded = !this._plansCompletedExpanded; this.render(); },
  exportJson() {
    const d = this.app.state.data;
    this.app.download("personal-cfo-backup.json", JSON.stringify(d, null, 2), "application/json");
    // Records this as a real backup (see Engine.recordBackup) so the
    // Dashboard's "haven't backed up in a while" nudge clears right away
    // instead of still showing on the very next visit.
    this.app.recordBackup();
    this.render();
  },
  restoreJsonFile(input) {
    const file = input.files && input.files[0]; if (!file) return;
    if (!this.hapticConfirm(this.app.L("Restore from this backup? This replaces everything currently stored.", "الاستعادة من النسخة دي؟ هيستبدل كل البيانات المحفوظة حالياً."))) { input.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const res = this.app.restoreFromJson(String(reader.result));
      if (!res.ok) alert(res.error); else this.render();
      input.value = "";
    };
    reader.onerror = () => { alert(this.app.L("Couldn't read that file.", "معرفتش أقرأ الملف ده.")); input.value = ""; };
    reader.readAsText(file);
  },
  exportCsv() {
    const d = this.app.state.data;
    const rows = [["date", "type", "amount", "account", "person", "category", "desc"]].concat(
      d.tx.map(t => [t.date, t.type, t.amount, this.app.accName(t.accountId), this.app.personName(t.personId), t.category || "", (t.desc || "").replace(/"/g, "'")])
    );
    const csv = rows.map(r => r.map(c => '"' + String(c) + '"').join(",")).join("\n");
    this.app.download("personal-cfo-transactions.csv", csv, "text/csv");
  },
  reseed() { if (this.hapticConfirm(this.app.L("Reload demo data? This replaces everything currently stored.", "تحميل البيانات التجريبية؟ ده هيستبدل كل البيانات المحفوظة حالياً."))) { this.app.persist(this.app.seed(), "Demo data reloaded"); this.render(); } },
  wipe() {
    if (this.hapticConfirm(this.app.L("Erase all data? This cannot be undone.", "حذف كل البيانات؟ الإجراء ده لا يمكن التراجع عنه."))) {
      const empty = { accounts: [], people: [], tx: [], plans: [], groups: [], cardStatements: [], savingsGoals: [], investments: [], recurring: [], audit: [{ at: new Date().toISOString().slice(0, 16).replace("T", " "), what: "Wiped all data" }] };
      this.app.persist(empty, null); this.render();
    }
  },

  // ---- render: full pass, with focus-preservation for text inputs ------
  render(skipFocusRestore) {
    const active = document.activeElement;
    const savedId = active && active.id ? active.id : null;
    const savedSel = (savedId && active.selectionStart != null) ? [active.selectionStart, active.selectionEnd] : null;

    const root = document.getElementById("root");
    // A chart tap positions #chartTooltip against the bar's coordinates at
    // that instant; any render() past that point (a save, a tab switch, a
    // filter change) can move or remove that bar entirely, so the tooltip
    // must not survive it -- unlike #flashStack, which deliberately lives
    // outside render()'s reach so ITS content survives. Cancel the pending
    // auto-hide too so it can't later fire against a reused id.
    const tipEl = document.getElementById("chartTooltip");
    if (tipEl) tipEl.classList.remove("show");
    if (this._chartTooltipHideT) { clearTimeout(this._chartTooltipHideT); this._chartTooltipHideT = null; }
    const S = this.app.state, t = this.app.T[S.lang];
    const dir = S.lang === "ar" ? "rtl" : "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", S.lang);

    if (!S.data) { root.innerHTML = "<p>Loading…</p>"; return; }
    const D = this.app.derive();
    // attentionCount() re-scans the transaction list (month spend, 3-month
    // unusual-spending comparison) — too expensive to redo on every
    // render(), which fires on things with no bearing on it (a keystroke in
    // the transaction search, opening a modal, switching tabs). persist()
    // always hands state.data a new object, so caching against that
    // reference means this only recomputes when the data actually changed.
    if (this._badgeDataRef !== S.data) {
      this._badgeDataRef = S.data;
      this._badgeCount = this.app.attentionCount(D);
    }
    this.updateBadge(this._badgeCount);

    if (S.locked) {
      root.innerHTML = this.renderLockScreen(t);
      const el = document.getElementById("lockPin");
      if (el) el.focus();
      return;
    }

    // A page switch gets a light enter animation (see .page-enter in
    // app.css); every OTHER render() call (a keystroke in the transaction
    // search, a filter change, opening a modal...) must NOT replay it --
    // render() replaces this whole subtree with fresh DOM every single
    // time, so a class present unconditionally would restart the
    // animation on every one of those too, not just real navigation.
    // Comparing S.page against what the last render() actually painted is
    // what limits it to genuine page changes, whatever triggered them
    // (setPage(), viewPerson(), a modal closing back to the previous
    // page...) without needing to touch every one of those call sites.
    const pageChanged = this._lastRenderedPage !== S.page;
    this._lastRenderedPage = S.page;
    root.innerHTML =
      '<div class="shell">' +
        this.renderPrimaryNav(t) +
        '<div class="main-col">' +
          this.renderTopbar(D, t) +
          this.renderMetricsRow(D, t) +
          '<main class="page' + (pageChanged ? " page-enter" : "") + '">' + this.renderPage(D, t) + "</main>" +
        "</div>" +
      "</div>" +
      this.renderQuickAddFab(t) +
      this.renderMoreSheet(t) +
      this.renderQuickAddSheet(t) +
      this.renderTxActionSheet() +
      this.renderAcctActionSheet() +
      this.renderPersonActionSheet() +
      this.renderGroupActionSheet() +
      this.renderStmtActionSheet() +
      this.renderModal(t);
      // #flashStack is NOT rendered here on purpose -- see UI.flash()'s
      // comment: it lives outside #root in the static page shell so it
      // survives every render() call instead of being wiped by it.

    if (savedId && !skipFocusRestore) {
      const el = document.getElementById(savedId);
      if (el) { el.focus(); if (savedSel) { try { el.setSelectionRange(savedSel[0], savedSel[1]); } catch (e) {} } }
    } else if (savedId && skipFocusRestore) {
      const el = document.getElementById(savedId);
      if (el) { el.focus(); if (savedSel) { try { el.setSelectionRange(savedSel[0], savedSel[1]); } catch (e) {} } }
    }
  },

  // ---- chrome --------------------------------------------------------------
  renderTopbar(D, t) {
    const S = this.app.state;
    const langs = ["en", "ar"].map(c => '<label class="seg-opt"><input type="radio" name="lang" ' + (S.lang === c ? "checked" : "") + ' onchange="UI.setLang(\'' + c + '\')"><span>' + (c === "en" ? "EN" : "ع") + "</span></label>").join("");
    return '<header class="topbar">' +
      '<div class="brand"><span class="brand-mark">₤</span><div><div class="brand-name">' + esc(t.brand) + '</div><div class="brand-sub">' + esc(t.brandSub) + "</div></div></div>" +
      '<div class="topbar-tools">' +
        '<div class="seg">' + langs + "</div>" +
        '<button class="btn btn-ghost" aria-pressed="' + (S.privacy ? "true" : "false") + '" onclick="UI.togglePrivacy()">' + esc(S.privacy ? t.privacyOff : t.privacy) + "</button>" +
        '<button class="btn btn-primary" onclick="UI.openModal(\'expense\')">' + esc(t.aExpense) + "</button>" +
      "</div>" +
    "</header>";
  },
  renderMetricsRow(D, t) {
    const S = this.app.state;
    // Real request from the user: opening one specific account, card, or
    // category shouldn't keep showing the whole household's Available/Net
    // worth/... up top -- it should show that ONE thing's own numbers.
    // Scoped only on the Transactions page, and only once filtered down to
    // exactly one account or one category -- any other page, or an
    // unfiltered/"all" Transactions view, keeps the global row exactly as
    // before. If a account filter AND a category filter are somehow both
    // active at once (the two dropdowns are independent), the account
    // wins: narrowing an already-open account further by category is
    // still fundamentally "looking at that account".
    if (S.page === "transactions") {
      const F = S.filt;
      if (F.account !== "all") {
        const items = this.scopedAccountMetrics(F.account, D);
        if (items) return this.renderMetricTiles(items, true);
      } else if (F.category !== "all") {
        return this.renderMetricTiles(this.scopedCategoryMetrics(F.category, F.categoryKind), true);
      }
    }
    const items = [
      [t.available, this.app.fmt(D.available), "pos"],
      [t.netWorth, this.app.fmt(D.netWorth), "neu"],
      [t.receivables, this.app.fmt(D.recvTotal), "pos"],
      [t.payables, this.app.fmt(D.payTotal), "neg"],
      [t.investmentsShort, this.app.fmt(D.invValue), "neu"]
    ];
    return this.renderMetricTiles(items, false);
  },
  // scoped: true for the per-account/per-category row (2-4 tiles, sized to
  // fit exactly that many columns at every width -- see .metrics-row.scoped
  // in app.css for why this needs its own class rather than reusing the
  // global row's fixed-5-columns-with-2-hidden-on-mobile layout) versus the
  // always-5-tile global row (false).
  renderMetricTiles(items, scoped) {
    const cls = "metrics-row" + (scoped ? " scoped" : "");
    const style = scoped ? ' style="--n:' + items.length + '"' : "";
    return '<div class="' + cls + '"' + style + '>' + items.map(([l, v, tone]) =>
      '<div class="metric-tile"><div class="metric-label">' + esc(l) + '</div><div class="metric-value tone-' + tone + '">' + v + "</div></div>"
    ).join("") + "</div>";
  },
  // [label, formatted value, tone] tuples for one account's own scoped
  // metrics row. Credit cards get the same Outstanding/Available/Limit +
  // nearest statement the account tile itself shows (see renderAccounts()'s
  // own Outstanding/Available/Limit computation -- duplicated here rather
  // than shared, since the tile's version is woven into its card-face HTML
  // and not easily split out on its own); every other account type
  // (bank/wallet/cash/ecard/other) gets Balance + this month's in/out via
  // Engine.accountMonthFlow().
  scopedAccountMetrics(accountId, D) {
    const app = this.app;
    const a = (app.state.data.accounts || []).find(x => x.id === accountId);
    if (!a) return null;
    const bal = D.bal[accountId];
    if (a.type === "card") {
      const available = Math.max(0, (a.limit || 0) - Math.abs(Math.min(0, bal)));
      const nearestStmt = D.cardStatements.filter(s => s.accountId === accountId && s.status !== "paid").sort((x, y) => x.due < y.due ? -1 : 1)[0];
      const stmtVal = nearestStmt ? app.fmt(nearestStmt.remaining) + " · " + this.daysUntilText(nearestStmt.due) : app.L("None due", "لا يوجد");
      return [
        // Real bug caught in review: this used to hardcode "neg" -- wrong
        // for a card that's fully paid off or in credit (bal >= 0), where
        // showing the debt tone on a card that owes nothing misrepresents
        // it. Sign-driven like the plain-account Balance tile below.
        [app.L("Outstanding", "المديونية"), app.fmt(bal), bal < 0 ? "neg" : "pos"],
        [app.L("Available", "المتاح"), app.fmt(available), "pos"],
        [app.L("Limit", "الحد"), app.fmt(a.limit), "neu"],
        [app.L("Statement due", "كشف الحساب"), stmtVal, nearestStmt && nearestStmt.overdue ? "neg" : "neu"],
      ];
    }
    const flow = app.accountMonthFlow(accountId);
    return [
      [app.L("Balance", "الرصيد"), app.fmt(bal), bal >= 0 ? "pos" : "neg"],
      [app.L("In this month", "وارد الشهر"), app.fmt(flow.inflow), "pos"],
      [app.L("Out this month", "منصرف الشهر"), app.fmt(flow.outflow), "neg"],
    ];
  },
  // Same shape as scopedAccountMetrics, for one category name. Budget
  // remaining only shown when a budget is actually set for it (Settings ->
  // Budgets) and the filter isn't explicitly the income side -- budgets in
  // this app are an expense-only concept.
  scopedCategoryMetrics(category, categoryKind) {
    const app = this.app, d = app.state.data;
    const stats = app.categoryMonthStats(category, categoryKind);
    const tone = categoryKind === "income" ? "pos" : categoryKind === "expense" ? "neg" : "neu";
    const items = [
      [app.L("This month", "إجمالي الشهر"), app.fmt(stats.total), tone],
    ];
    const budget = (d.budgets || {})[category];
    if (budget && categoryKind !== "income") {
      const remaining = Math.round((budget - stats.total) * 100) / 100;
      items.push([app.L("Budget remaining", "الباقي من الميزانية"), app.fmt(remaining), remaining < 0 ? "neg" : "pos"]);
    }
    items.push([app.L("Transactions", "عدد المعاملات"), String(stats.count), "neu"]);
    return items;
  },
  renderPrimaryNav(t) {
    const S = this.app.state;
    // person_detail is reached only from the People tab (there's no nav
    // entry of its own) — it counts as "People" here so the nav doesn't
    // wrongly light up "More" while looking at one person's page.
    const effectivePage = S.page === "person_detail" ? "people" : S.page;
    const items = this.app.PRIMARY.map(id => {
      const path = this.app.NAV.find(n => n[0] === id)[1];
      const on = effectivePage === id;
      return '<button class="navbtn' + (on ? " on" : "") + '" aria-current="' + (on ? "page" : "false") + '" onclick="UI.setPage(\'' + id + '\')"><span class="nav-ico nav-ico-' + id + '">' + svgIcon(path, 20) + '</span><span>' + esc(t[id]) + "</span></button>";
    }).join("");
    const moreOn = !this.app.PRIMARY.includes(effectivePage);
    return '<nav class="primary-nav" aria-label="' + esc(t.primaryNav) + '">' + items +
      '<button class="navbtn' + (moreOn ? " on" : "") + '" aria-current="' + (moreOn ? "page" : "false") + '" aria-expanded="' + (S.moreOpen ? "true" : "false") + '" onclick="UI.toggleMore()"><span class="nav-ico nav-ico-more">' + svgIcon("M5 12h.01M12 12h.01M19 12h.01", 20) + '</span><span>' + esc(t.more) + "</span></button>" +
    "</nav>";
  },
  renderMoreSheet(t) {
    const S = this.app.state;
    if (!S.moreOpen) return "";
    const rest = this.app.NAV.filter(([id]) => !this.app.PRIMARY.includes(id));
    return '<div class="sheet-backdrop" onclick="UI.toggleMore()"></div>' +
      '<div class="sheet" role="dialog" aria-label="' + esc(t.more) + '">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-title">' + esc(t.more) + "</div>" +
        '<div class="sheet-grid">' + rest.map(([id, path]) =>
          '<button class="sheet-item' + (S.page === id ? " on" : "") + '" aria-current="' + (S.page === id ? "page" : "false") + '" onclick="UI.setPage(\'' + id + '\')"><span class="nav-ico nav-ico-' + id + '">' + svgIcon(path, 22) + '</span><span>' + esc(t[id]) + "</span></button>"
        ).join("") + "</div>" +
      "</div>";
  },
  // A persistent floating "+" reachable from every page, not just whichever
  // page happens to have its own "+ Expense"/"+ Income" button in its own
  // header -- the three most common day-to-day adds (same three the topbar
  // and Dashboard's own buttons already special-case), one tap away from
  // anywhere. Hidden on the lock screen for free (render() returns before
  // this is ever called there) and on desktop (see the CSS: the sticky
  // topbar's own "+ Expense" already covers this need there without a
  // second floating control competing for the same corner).
  renderQuickAddFab(t) {
    const S = this.app.state;
    return '<button class="fab" aria-haspopup="true" aria-expanded="' + (S.quickAddOpen ? "true" : "false") + '" aria-label="' + esc(t.quickAdd) + '" onclick="UI.toggleQuickAdd()">' + svgIcon("M12 5v14M5 12h14", 24) + "</button>";
  },
  renderQuickAddSheet(t) {
    const S = this.app.state;
    if (!S.quickAddOpen) return "";
    const items = [
      ["expense", "M12 5v14M19 12l-7 7-7-7", t.aExpense],
      ["income", "M12 19V5M5 12l7-7 7 7", t.aIncome],
      ["transfer", "M7.5 21 3 16.5 7.5 12M3 16.5h18M16.5 3 21 7.5 16.5 12M21 7.5H3", t.aTransfer]
    ];
    return '<div class="sheet-backdrop" onclick="UI.toggleQuickAdd()"></div>' +
      '<div class="sheet" role="dialog" aria-label="' + esc(t.quickAdd) + '">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-title">' + esc(t.quickAdd) + "</div>" +
        '<div class="sheet-grid">' + items.map(([kind, path, label]) =>
          '<button class="sheet-item" onclick="UI.openModal(\'' + kind + '\')"><span class="nav-ico nav-ico-' + kind + '">' + svgIcon(path, 22) + '</span><span>' + esc(label) + "</span></button>"
        ).join("") + "</div>" +
      "</div>";
  },

  renderPage(D, t) {
    const S = this.app.state;
    switch (S.page) {
      case "dashboard": return this.renderDashboard(D, t);
      case "accounts": return this.renderAccounts(D, t);
      case "transactions": return this.renderTransactions(D, t);
      case "people": return this.renderPeople(D, t);
      case "person_detail": return this.renderPersonDetail(D, t);
      case "installments": return this.renderInstallments(D, t);
      case "statements": return this.renderCardStatements(D, t);
      case "goals": return this.renderSavingsGoals(D, t);
      case "groups": return this.renderGroups(D, t);
      case "ledgers": return this.renderLedgers(D, t);
      case "investments": return this.renderInvestments(D, t);
      case "recurring": return this.renderRecurring(D, t);
      case "forecast": return this.renderForecast(D, t);
      case "reports": return this.renderReports(D, t);
      case "cashflow": return this.renderCashFlow(D, t);
      case "settings": return this.renderSettings(D, t);
      case "todos": return this.renderTodos(D, t);
      default: return "";
    }
  },

  // Shared empty-state card -- approved from the Shape Showcase preview.
  // A plain "<p class=muted>" reads the same weight whether it means
  // "nothing to worry about" (Needs Attention) or "you haven't set this
  // up yet" (no custom categories); this gives each its own icon and a
  // second line saying what to do next (or that there's nothing to do).
  // `icon` is one of the three reused shapes below, not a bespoke one per
  // call site -- CHECK for a genuinely good state (nothing to act on,
  // everything settled), PLUS for "add one to get started", SEARCH for
  // "your filter/search matched nothing". Kept to the sections that are
  // really their own empty moment, not every plain muted-text hint in
  // the app (an explanatory note isn't an empty state).
  emptyState(icon, title, body) {
    return '<div class="empty-state"><div class="empty-glyph">' + svgIcon(icon, 20) + '</div>' +
      '<div class="empty-title">' + esc(title) + "</div>" +
      (body ? '<div class="empty-body">' + esc(body) + "</div>" : "") +
    "</div>";
  },

  // Soft, hashed tint for free-form tags -- unlike categories, tags aren't
  // a fixed list, so they don't get a "slot" from the validated palette
  // (app.categoryColor); a low-saturation tint derived from the tag's own
  // text is enough to tell tags apart at a glance without ever reading as
  // a category color. Only the hue is computed here -- lightness/saturation
  // live in the .tag-chip CSS rule (app.css) so a dark-mode override can
  // step them down the same way every other chip/status color in this app
  // already does, instead of a fixed pastel chip fighting the dark palette.
  tagStyle(tag) {
    // A simple "multiply-then-mod" rolling hash (h = h*31+c, modded on every
    // step) clusters short lowercase words hard: common tags like "trip",
    // "food", "gift", "travel", "car" all landed within a ~90deg band and
    // rendered as the same shade of pink. DJB2-with-XOR, modding only once
    // at the end, spreads the same words across the full hue circle.
    let h = 5381;
    for (let i = 0; i < tag.length; i++) h = ((h * 33) ^ tag.charCodeAt(i)) >>> 0;
    return "--tag-h:" + (h % 360);
  },

  // "in 3d" / "today" / "5d overdue" -- a due date on its own (used for
  // card statements) needs this at-a-glance countdown, not just the raw
  // date, to actually answer "how long do I have."
  daysUntilText(due) {
    const app = this.app;
    if (!due) return "";
    const days = Math.round((new Date(due) - new Date(app.today())) / 86400000);
    if (days < 0) return app.L(Math.abs(days) + "d overdue", "متأخر " + Math.abs(days) + " يوم");
    if (days === 0) return app.L("due today", "مستحق النهارده");
    return app.L("in " + days + "d", "خلال " + days + " يوم");
  },
  // 35 (Transactions Recut): the label for the plain date-section header
  // above the first card of each new calendar day in Transactions' mobile
  // list. A future-dated row (e.g. a recurring rule posted ahead of today)
  // falls straight through to the same short-date fallback every other
  // date past a week already gets; there's no real need for its own
  // "in Nd" phrasing here the way daysUntilText() above has for a due date
  // specifically.
  txDateGroupLabel(dateStr) {
    const app = this.app, today = app.today();
    if (dateStr === today) return app.L("Today", "اليوم");
    if (dateStr === app.iso(app.addDays(new Date(), -1))) return app.L("Yesterday", "إمبارح");
    const daysAgo = Math.round((new Date(today) - new Date(dateStr)) / 86400000);
    // timeZone:"UTC" is required here: dateStr is a date-only "YYYY-MM-DD"
    // string, which Date parses as UTC midnight -- without pinning the
    // formatter to UTC too, toLocaleDateString renders that instant in the
    // viewer's own local zone, rolling the displayed weekday back by one
    // for anyone west of UTC (real bug: caught for e.g. America/Los_Angeles).
    if (daysAgo > 0 && daysAgo < 7) return new Date(dateStr).toLocaleDateString(app.state.lang === "ar" ? "ar" : "en-GB", { weekday: "long", timeZone: "UTC" });
    return app.dshort(dateStr);
  },

  // Six-month net worth series, one derive(cutoff) per month-end -- shared
  // by Reports' own trend chart and Dashboard's expandable one (see
  // UI.toggleNwTrend()) so the two can never quietly compute this
  // differently from each other.
  nwTrendMonths() {
    const app = this.app;
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const end = app.addMonths(new Date(), -i); end.setDate(28);
      months.push({ label: end.toLocaleDateString(app.state.lang === "ar" ? "ar-EG" : "en-GB", { month: "short" }), value: app.derive(app.iso(end)).netWorth });
    }
    return months;
  },

  // Tiny inline trend line -- approved from the Next Wave preview, next to
  // Dashboard's Net worth hero-sub-value. `points` is oldest-first; a flat
  // series (every point equal, or fewer than 2 points) draws nothing
  // rather than a meaningless flat/zero-width line. Glow is a plain SVG
  // drop-shadow filter, not gated to dark mode -- same reasoning
  // barChart()'s glow already applies (a light-spill shadow, not neon).
  sparkline(points, color) {
    if (points.length < 2 || Math.max(...points) === Math.min(...points)) return "";
    const w = 56, h = 18, max = Math.max(...points), min = Math.min(...points), range = max - min;
    const step = w / (points.length - 1);
    const d = points.map((v, i) => (i === 0 ? "M" : "L") + (i * step).toFixed(1) + "," + (h - (v - min) / range * h).toFixed(1)).join(" ");
    return '<svg class="sparkline" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 2px ' + color + ')"/></svg>';
  },
  // A circular progress ring -- two concentric circles (a fixed track,
  // then a colored arc drawn via the standard stroke-dasharray/dashoffset
  // trick: the whole circumference as the dash length means one dash that
  // never repeats, and offsetting it by the "empty" fraction reveals only
  // the "full" fraction, starting from 12 o'clock via the -90deg rotate
  // rather than the default 3-o'clock start). `pct` past 100 (over
  // budget) still draws a full ring rather than however>100% would look
  // -- the exact number belongs in the text next to it, not bent into the
  // ring's own geometry. The percentage label lives in HTML overlaid on
  // top (ringPct(), where this is actually used), not baked in as SVG
  // <text> -- much simpler to keep it crisp and in the app's own font at
  // any size than hand-managing SVG text metrics.
  ringChart(pct, color, size) {
    size = size || 84;
    const r = 32, c = 2 * Math.PI * r;
    const dash = c * Math.max(0, Math.min(100, pct)) / 100;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 80 80" aria-hidden="true">' +
      '<circle cx="40" cy="40" r="' + r + '" fill="none" stroke="var(--c-surface-3)" stroke-width="8"></circle>' +
      '<circle cx="40" cy="40" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" ' +
        'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c - dash).toFixed(2) + '" transform="rotate(-90 40 40)"></circle>' +
    "</svg>";
  },

  // Shared bar-chart builder -- the .chart-cols/.chart-col/.chart-bar/
  // .chart-label markup, each bar scaled against the tallest in `items`.
  // `colorFn(item)` picks each bar's own color (up/down tone, paid/overdue
  // status, whatever the caller's data means) -- this only owns the shared
  // layout/scaling, used by Reports' net worth trend, Card statements'
  // per-card statement trend, and Cash Flow's operating trend.
  // Gradient + top-edge glow -- approved from the Next Wave preview (the
  // trend charts were the closest real match to that preview's "glowing
  // line" idea; this app has no actual line/SVG chart anywhere, every
  // chart is one of these bar components, see catBar() below for the
  // other one). color-mix() works the same whether colorFn returns a CSS
  // var reference (var(--c-pos), as every current caller does) or a
  // literal hex, so this needed no change to how any caller picks colors
  // -- just how the bar itself renders once picked. The glow isn't
  // gated to dark mode: it's a directional light-spill shadow reading as
  // "embossed," the same "shadow exists everywhere, neon halo is dark-
  // only" split the Holo Shine card bevel already draws.
  // Touch/click tooltip -- approved from the "same approach" list. Every
  // bar's exact value used to be visible only as its height, nothing
  // written down anywhere (unlike catBar()'s horizontal rows, which
  // already print the number as text right next to the bar -- no
  // tooltip needed there, it'd just repeat what's already on screen).
  // app.fmtPlain() -- the currency unit and Arabic-numeral toggle every
  // other amount in the app gets, minus fmt()'s <bdi> HTML wrap (this
  // needs a plain string, for the tooltip's textContent and to pass
  // through an onclick argument) -- and it already routes through
  // state.privacy itself, same as fmt()/fmtS(), so Hide Amounts hides a
  // tooltip exactly like it hides every other number, not a way around it.
  barChart(items, colorFn) {
    const app = this.app;
    const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
    return '<div class="chart-cols">' + items.map((i) => {
      const c = colorFn(i);
      // rawTip feeds two different contexts that need two different
      // escapes -- tipAttr (esc() alone, for the aria-label HTML
      // attribute) and tipJs (escJsArg(), for the onclick JS-string
      // argument inside that same kind of attribute) -- see escJsArg()'s
      // own comment for why plain esc() isn't enough there.
      const rawTip = i.label + ": " + app.fmtPlain(i.value);
      const tipAttr = esc(rawTip);
      const tipJs = escJsArg(rawTip);
      // role/tabindex/onkeydown -- a plain onclick div is mouse/touch-only;
      // this makes the tooltip (the bar's one and only way to expose its
      // exact value as text) reachable by keyboard too.
      return '<div class="chart-col"><div class="chart-bar" role="button" tabindex="0" aria-label="' + tipAttr + '" onclick="UI.showChartTooltip(event,\'' + tipJs + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();UI.showChartTooltip(event,\'' + tipJs + '\')}" style="height:' + Math.max(4, Math.abs(i.value) / max * 100) + '%;' +
        "background:linear-gradient(180deg,color-mix(in srgb," + c + " 70%,white 30%)," + c + ");" +
        "box-shadow:0 -6px 14px -4px color-mix(in srgb," + c + " 55%,transparent)" +
        '"></div><div class="chart-label">' + esc(i.label) + "</div></div>";
    }).join("") + "</div>";
  },

  // Category bar row -- shared by Dashboard ("This month") and Reports
  // (by-category, by-source) so the color logic can't drift between them
  // the way "this month"'s date bounds once did. Over-budget still reads
  // as a status (red ring + red value), not a color fight: the category
  // keeps its own identity color underneath instead of being overridden by
  // a solid "neg-fill" the way it used to.
  catBar(name, v, max, kind, over, suffix) {
    const app = this.app;
    const ring = over ? ";outline:2px solid var(--c-neg);outline-offset:1px" : "";
    // escJsArg(kind) too, not just name -- kind is only ever the literal
    // "expense"/"income" today, but this is exactly the class of bug the
    // shared helper exists to close structurally at every onclick-arg
    // site, not just the ones currently fed anything non-trivial.
    // 30 (Dashboard Recut): the same colored circular .cat-badge already
    // used for this exact category on a Transactions row, rather than a
    // flat muted-grey glyph here -- shared class (this being the one other
    // place a category gets an icon at all), not a second copy of the
    // color+icon pairing that could drift from Transactions' own.
    // margin-inline-end:0 overrides cat-badge's own spacing since
    // .bar-name's flex `gap` already places it, not this badge's margin.
    return '<button class="bar-row" onclick="UI.viewCategoryTx(\'' + escJsArg(name) + "','" + escJsArg(kind) + '\')"><span class="bar-name"><span class="cat-badge" style="background:' + app.categoryColor(name, kind) + ';margin-inline-end:0">' + svgIcon(categoryIcon(name), 12) + '</span><span class="bar-name-text">' + esc(name) + "</span></span>" +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(4, v / max * 100) + '%;background:' + app.categoryColor(name, kind) + ring + '"></div></div>' +
      '<span class="bar-val' + (over ? " tone-neg" : "") + '">' + app.fmt(v) + (suffix || "") + "</span></button>";
  },

  // ---- Dashboard (fix #5: single summary pass, Needs Attention promoted) --
  renderDashboard(D, t) {
    const app = this.app, S = app.state, d = app.state.data;
    // Hoisted above the Needs Attention alerts (which want to flag this
    // before it's over, same as a per-category budget) even though the
    // "This month" section further down is the only other place this is
    // used -- both need the exact same date-bounded total, so this is
    // computed once and shared rather than each recomputing its own copy
    // that could silently drift out of agreement with the other.
    const monthToday = app.today(), monthStart = monthToday.slice(0, 8) + "01";
    const monthExpense = D.live.filter(x => x.date >= monthStart && x.date <= monthToday && x.type === "expense").reduce((s, x) => s + x.amount, 0);
    const overallBudget = d.overallBudget || 0;
    const overallOver = overallBudget > 0 && monthExpense > overallBudget;
    const overallNear = overallBudget > 0 && !overallOver && monthExpense >= overallBudget * 0.9;
    // End-of-month projection -- straight-line from the daily average so
    // far (monthExpense / days elapsed * days in the month). String-sliced
    // out of the ISO date rather than a Date object, same convention
    // monthStart above already uses. Skipped before day 3: one early large
    // purchase can make a 1- or 2-day average wildly overstate the month,
    // and skipped once already over -- the "over" alert already says the
    // thing that matters more than a projection would.
    const dayNum = Number(monthToday.slice(8, 10));
    const daysInMonth = new Date(Number(monthToday.slice(0, 4)), Number(monthToday.slice(5, 7)), 0).getDate();
    const projectedMonthEnd = dayNum > 0 ? monthExpense / dayNum * daysInMonth : 0;
    const showProjection = overallBudget > 0 && !overallOver && dayNum >= 3;
    const projectionOver = showProjection && projectedMonthEnd > overallBudget;
    // "What do I have" (available) vs. "what can I actually spend" (safe to
    // spend, minus the coming week's obligations) — the second number is
    // the one that actually answers "can I afford this today" without
    // walking through Forecast by hand first.
    const safeToSpend = app.safeToSpend(D, 7);
    // The single plain answer to "can I afford this right now" -- Available
    // minus only what's due TODAY specifically, as its own tinted banner
    // (not a plain tone-pos/tone-neg text color) so it stays legible
    // regardless of theme, same technique as the credit-card tile's
    // .cc-stmt badge against its own always-dark background.
    const spendToday = app.spendableToday(D);
    const spendTodayBanner = '<div class="spend-today' + (spendToday < 0 ? " tight" : "") + '"><span class="spend-today-label">' + esc(app.L("You can spend today", "تقدر تصرف النهاردة")) + '</span><span class="spend-today-value">' + app.fmt(spendToday) + "</span></div>";
    // Net worth + available-balance sparklines -- same app.derive(cutoff)
    // technique Reports' 6-month trend already uses, just 5 points at a
    // weekly cadence instead of monthly (Dashboard renders far more often
    // than Reports, so this stays a noticeably smaller pass: 5 derive()
    // calls, each one one linear scan of the transaction list, negligible
    // next to everything else this render already computes from D). One
    // shared set of 5 derive() results feeds BOTH series below -- calling
    // derive() a second time with the same 5 cutoffs just to pull .available
    // instead of .netWorth would silently double this cost on every single
    // Dashboard render. Draws nothing (see sparkline()) if a series hasn't
    // moved across the window.
    const weeklyDerives = [4, 3, 2, 1, 0].map(w => app.derive(app.iso(app.addDays(new Date(), -7 * w))));
    const nwSpark = weeklyDerives.map(x => x.netWorth);
    // Tappable -- expands into the same real monthly trend Reports shows
    // (nwTrendMonths(), shared with renderReports() so the two can't drift
    // apart). The 6 extra derive() calls that trend needs are NOT run here
    // up front -- unlike the 5-point weekly sparkline above (cheap, always
    // shown), this is a whole second monthly series only some users will
    // ever open, so UI.toggleNwTrend() computes and injects it lazily on
    // first expand instead, via direct DOM (innerHTML on this one
    // container, no render()) -- same no-render() reasoning as flipCardC,
    // just building real markup instead of toggling a class.
    // No button at all when there's nothing to show -- sparkline() itself
    // already skips drawing a flat/too-short series rather than a
    // meaningless zero-width line; a tappable control with no visible
    // content would still sit in the tab order with nothing to see or
    // announce, so the trigger follows the same all-or-nothing rule.
    const sparkSvg = this.sparkline(nwSpark, "var(--c-accent)");
    // 29 (Dashboard Recut): the same weeklyDerives results above, just for
    // `available` -- the headline hero-value itself previously had no trend
    // indicator at all, only its smaller net-worth sub-value did. Purely
    // decorative (sparkline()'s own <svg aria-hidden="true">, no
    // .spark-trigger wrapper): unlike net worth, there's no existing
    // "available balance over time" monthly series (nwTrendMonths() is
    // net-worth-specific) to expand into, so this doesn't claim a tap
    // interaction it can't back up.
    const availSpark = this.sparkline(weeklyDerives.map(x => x.available), "var(--c-accent)");
    // aria-expanded="false" -- always false here since renderDashboard()
    // always starts the panel collapsed (see toggleNwTrend()'s own
    // comment on why a render() resets it); same open/close-toggle
    // convention as UI.toggleMore()'s nav button.
    const netWorthSparkline = sparkSvg ? '<button type="button" class="spark-trigger" aria-expanded="false" aria-label="' + esc(app.L("Show net worth trend", "اعرض تطور صافي الثروة")) + '" onclick="UI.toggleNwTrend(event)">' + sparkSvg + "</button>" : "";
    const nwTrendExpand = '<section class="dash-section nw-trend-expand" id="nwTrendExpand"></section>';
    const hero =
      '<div class="hero-card">' +
        '<div class="hero-label">' + esc(t.availableBalance) + "</div>" +
        '<div class="hero-value">' + app.fmt(D.available) + availSpark + "</div>" +
        '<div class="hero-note">' + esc(t.availableNote) + "</div>" +
        spendTodayBanner +
        '<div class="hero-sub-row">' +
          // Not tone-neg/tone-pos here on purpose: those colors are tuned
          // for a light surface and read at ~1.9:1 against this card's dark
          // background (var(--c-accent-900)) -- illegible, not a real
          // negative-amount cue. The other hero-sub-row values (net worth,
          // included below) already rely on the "−" sign alone for that,
          // not color, so this one does too.
          '<div><div class="hero-sub-label">' + esc(app.L("Safe to spend (7d)", "الآمن للصرف (٧ أيام)")) + '</div><div class="hero-sub-value">' + app.fmt(safeToSpend) + "</div></div>" +
          '<div><div class="hero-sub-label">' + esc(t.netWorth) + '</div><div class="hero-sub-value">' + app.fmt(D.netWorth) + netWorthSparkline + "</div></div>" +
          '<div><div class="hero-sub-label">' + esc(t.receivables) + '</div><div class="hero-sub-value tone-pos">' + app.fmt(D.recvTotal) + "</div></div>" +
          '<div><div class="hero-sub-label">' + esc(t.payables) + '</div><div class="hero-sub-value tone-neg">' + app.fmt(D.payTotal) + "</div></div>" +
        "</div>" +
      "</div>";

    // Needs attention — built the same way as the original (overdue plans,
    // largest open receivables, negative card balances) but rendered right
    // after the hero instead of ~3 screens down.
    // NOTE: app.fmt()/app.fmtS() return HTML (a <bdi> wrapper, for the RTL
    // sign-gluing fix) rather than plain text, so any free-text piece mixed
    // into `body` alongside a fmt() call must be escaped here at
    // construction time — the body is rendered raw below, not re-escaped,
    // or the <bdi> markup would show up as literal text instead of money.
    // Each alert now carries a sev ("neg" | "warn" | "info") the card below
    // renders as a border/glow tier -- approved from the Next Wave preview,
    // fixing the same "everything reads as the same red" gap the .cc-stmt
    // badge already avoided (gold/red split there predates this). neg =
    // already late/over; warn = a heads-up before it's late/over; info =
    // not an urgency signal at all (a notable balance, not a deadline).
    // Falls back to "info" (see .alert-card's base rule) if a future push
    // site forgets to set one, rather than defaulting to alarming red.
    const alerts = [];
    // A save/load failure is more urgent than any budget nudge below, so
    // it goes first -- and unlike a toast (see UI.flash()'s danger
    // variant, shown once at the moment of a failed save), this stays
    // visible on every Dashboard visit for as long as app.state.saveError/
    // loadError is actually true, so it can't be missed just because the
    // failure happened on some other page or the toast was dismissed
    // before it was read.
    if (app.state.saveError) alerts.push({
      title: app.L("Your last change wasn't saved", "آخر تعديل ماتحفظش"),
      body: app.L("Something is blocking this browser's storage (it may be full, or you're in private browsing). Export a backup now so nothing is lost.", "حاجة بتمنع تخزين المتصفح ده (ممكن يكون امتلأ، أو إنك في وضع تصفح خاص). صدّر نسخة احتياطية دلوقتي عشان مفيش حاجة تضيع."),
      cta: app.L("Export a backup", "تصدير نسخة احتياطية") + " →", act: "UI.exportJson()", sev: "neg"
    });
    if (app.state.loadError) alerts.push({
      title: app.L("Your saved data couldn't be read", "بياناتك المحفوظة معرفتش تتقرا"),
      body: app.L("What you're looking at now is fresh demo data, not your real history — the browser's copy may be corrupted. If you have an earlier JSON backup, restore it from Settings rather than saving anything here first.", "اللي شايفه دلوقتي بيانات تجريبية، مش تاريخك الحقيقي — نسخة المتصفح ممكن تكون تلفت. لو عندك نسخة JSON قديمة، استعيدها من الإعدادات قبل ما تحفظ أي حاجة هنا."),
      cta: t.dataBackup + " →", go: "settings", sev: "neg"
    });
    // A hygiene nudge, not an active failure -- everything here still
    // lives in this one browser (see Engine.needsBackupReminder), so
    // losing the device or clearing site data loses it all with no
    // warning unless a real export exists to fall back on. "warn", not
    // "neg": nothing is actually broken right now the way saveError/
    // loadError above mean, but ignoring it is how those two turn into a
    // genuine, unrecoverable loss instead of an inconvenience.
    if (app.needsBackupReminder()) alerts.push({
      title: app.L("Back up your data", "اعمل نسخة احتياطية من بياناتك"),
      body: app.L("Everything here lives only in this browser. Export a JSON backup so losing this device, or clearing its storage, doesn't lose your financial history with it.", "كل بياناتك هنا عايشة في المتصفح ده بس. صدّر نسخة JSON عشان لو ضاع الجهاز ده أو اتمسحت بياناته، تاريخك المالي مايضيعش معاه."),
      cta: app.L("Export a backup", "تصدير نسخة احتياطية") + " →", act: "UI.exportJson()", sev: "warn"
    });
    D.plans.filter(p => p.overdue > 0).forEach(p => alerts.push({
      title: app.L(p.direction === "in" ? "Overdue collection · " : "Overdue payment · ") + app.personName(p.personId),
      body: p.overdue + app.L(" installment(s) past due — ") + app.fmt(p.overdueAmt) + app.L(" on ") + esc(p.title),
      cta: t.installments + " →", go: "installments", sev: "neg"
    }));
    Object.entries(D.recv).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(([k, v]) => alerts.push({
      title: app.L("Largest open receivable"), body: esc(app.personName(k)) + app.L(" owes ") + app.fmt(v) + app.L(" outside any plan."),
      cta: t.collect + " →", act: "UI.openModal('receivable_payment',{personId:'" + k + "'})", sev: "info"
    }));
    // Plain loans past their due date — this is what makes the due date
    // typed in at "+ Debt"/"+ Receivable" actually surface somewhere,
    // instead of being captured and never looked at again.
    app.allLoanRows("payable").filter(r => r.status === "overdue").sort((a, b) => b.rem - a.rem).slice(0, 2).forEach(r => alerts.push({
      title: app.L("Overdue payment · ") + app.personName(r.personId),
      body: app.fmt(r.rem) + app.L(" was due ") + r.due,
      cta: t.pay + " →", act: "UI.openModal('debt_payment',{personId:'" + r.personId + "'})", sev: "neg"
    }));
    app.allLoanRows("receivable").filter(r => r.status === "overdue").sort((a, b) => b.rem - a.rem).slice(0, 2).forEach(r => alerts.push({
      title: app.L("Overdue collection · ") + app.personName(r.personId),
      body: app.fmt(r.rem) + app.L(" was due ") + r.due,
      cta: t.collect + " →", act: "UI.openModal('receivable_payment',{personId:'" + r.personId + "'})", sev: "neg"
    }));
    if (D.cards < 0) alerts.push({ title: app.L("Credit card balance"), body: app.fmt(Math.abs(D.cards)) + app.L(" outstanding — counted as a liability, not as available money."), cta: t.accounts + " →", go: "accounts", sev: "info" });
    // Card statements: overdue first, then a heads-up for anything due
    // within a week -- same "before it's actually late" nudge the budget
    // alert just below already uses.
    const stmtSoon = app.iso(app.addDays(new Date(), 7));
    D.cardStatements.filter(s => s.overdue).sort((a, b) => b.remaining - a.remaining).slice(0, 2).forEach(s => alerts.push({
      title: app.L("Overdue statement · ") + app.accName(s.accountId),
      body: app.fmt(s.remaining) + app.L(" was due ") + s.due,
      cta: t.pay + " →", act: "UI.openModal('statement_payment',{statementId:'" + s.id + "'})", sev: "neg"
    }));
    D.cardStatements.filter(s => s.status !== "paid" && !s.overdue && s.due <= stmtSoon).sort((a, b) => a.due < b.due ? -1 : 1).slice(0, 2).forEach(s => alerts.push({
      title: app.L("Statement due soon · ") + app.accName(s.accountId),
      body: app.fmt(s.remaining) + " · " + app.L("Due ") + s.due,
      cta: t.pay + " →", act: "UI.openModal('statement_payment',{statementId:'" + s.id + "'})", sev: "warn"
    }));
    // Savings goals whose target date has already passed without reaching
    // the target -- same "before it's actually late" spirit as the
    // statement alerts above, just with nothing to "pay": the nudge is to
    // either add money to the tracked account, or push the target date out.
    D.savingsGoals.filter(g => g.overdue).forEach(g => alerts.push({
      title: app.L("Savings goal behind — ") + g.name,
      body: app.fmt(g.remaining) + app.L(" still needed — target date ") + g.due + app.L(" has passed."),
      cta: t.goals + " →", go: "goals", sev: "neg"
    }));
    // Budgets set in Settings, 90%+ spent this month — a nudge before it's
    // actually over, not just an after-the-fact tally. Already over = neg
    // (it's a real problem now); still under but close = warn (the nudge
    // before it becomes one).
    const monthSpend = app.monthCategorySpend(), budgets = d.budgets || {};
    Object.keys(budgets).filter(cat => (monthSpend[cat] || 0) >= budgets[cat] * 0.9).sort((a, b) => (monthSpend[b] / budgets[b]) - (monthSpend[a] / budgets[a])).slice(0, 2).forEach(cat => {
      const spent = monthSpend[cat] || 0, over = spent > budgets[cat];
      alerts.push({
        // title is esc()'d as a whole at render time (see needsAttention
        // below) — unlike body, which is inserted raw, so it's escaped
        // here at construction instead (matching fmt()'s <bdi> HTML).
        title: app.L(over ? "Over budget — " : "Near budget — ") + cat,
        body: app.fmt(spent) + app.L(" of ") + app.fmt(budgets[cat]) + app.L(" spent this month."),
        // categoryKind: 'expense' -- monthCategorySpend() (what budgets()
        // are keyed against) is expense-only, so if this ever pointed at
        // an "Other" bucket (a deleted category's stale budget key), the
        // filter should scope the same way viewCategoryTx() would.
        cta: t.transactions + " →", act: "UI.setPage('transactions');UI.setFilters({categoryKind:'expense',category:'" + escJsArg(cat) + "'})", sev: over ? "neg" : "warn"
      });
    });
    // Overall monthly budget (Settings) -- same 90%-before-it's-over nudge
    // as a per-category budget, just across every expense at once instead
    // of one category. monthExpense/overallBudget/overallOver/overallNear
    // are computed at the top of renderDashboard (shared with the "This
    // month" progress bar below, so the two can't disagree).
    if (overallOver || overallNear) alerts.push({
      title: app.L(overallOver ? "Over your overall budget" : "Near your overall budget", overallOver ? "تجاوزت ميزانيتك الكلية" : "قربت من ميزانيتك الكلية"),
      body: app.fmt(monthExpense) + app.L(" of ") + app.fmt(overallBudget) + app.L(" spent this month across every expense."),
      cta: t.transactions + " →", go: "transactions", sev: overallOver ? "neg" : "warn"
    });
    // Categories running well above their own recent average — a
    // history-based nudge for whoever hasn't set a budget for that category.
    app.unusualSpending(monthSpend).slice(0, 2).forEach(u => alerts.push({
      title: app.L("Unusual spending — ") + u.category,
      body: app.fmt(u.current) + app.L(" this month so far — about ") + Math.round(u.pct * 100) + app.L("% above your recent average of ") + app.fmt(u.avg) + ".",
      // categoryKind: 'expense' -- unusualSpending() is built from
      // monthCategorySpend(), expense-only, so u.category === "Other" (a
      // real possibility -- see the "|| Other" fallback there) needs the
      // same scoping viewCategoryTx() gives a real bar tap.
      cta: t.transactions + " →", act: "UI.setPage('transactions');UI.setFilters({categoryKind:'expense',category:'" + escJsArg(u.category) + "'})", sev: "info"
    }));
    // Plain to-do reminders due within 3 days (including already-overdue
    // ones) -- app.dueSoonTodos() already sorts soonest-first, so slice(0,2)
    // matches every other alert type's own display cap here. No "act": a
    // to-do carries no financial fields to prefill a modal with, so the CTA
    // just goes to the To-do list page itself, like the plain "go" alerts
    // above (Credit card balance, Savings goal behind).
    app.dueSoonTodos().slice(0, 2).forEach(td => alerts.push({
      title: app.L("To-do due — ", "مهمة مستحقة — ") + td.title,
      // esc(td.due): body is inserted as raw HTML below (title isn't --
      // it's esc()'d as a whole at render time), and a to-do's due date can
      // arrive unvalidated via Settings -> Restore from JSON, same as any
      // other free-text field on a to-do.
      body: (td.overdue ? app.L("Was due ", "كان مستحق ") : app.L("Due ", "مستحق ")) + esc(td.due),
      cta: t.todos + " →", go: "todos", sev: td.overdue ? "neg" : "warn"
    }));

    // Collapsed to the first NEEDS_ATTENTION_COLLAPSED cards by default --
    // real bug this fixes: with everything an alert (overdue plans, largest
    // receivables, card balance, statements, savings goals, to-dos...) this
    // list routinely ran to 10+ cards, pushing every other Dashboard section
    // (Quick add, Where my money is, Forecast) several screens down. The
    // full list is one tap away (UI.toggleNeedsAttention()), never hidden
    // for good -- this only changes what's visible at rest.
    const NEEDS_ATTENTION_COLLAPSED = 3;
    const naExpanded = !!this._needsAttentionExpanded || alerts.length <= NEEDS_ATTENTION_COLLAPSED;
    const naShown = naExpanded ? alerts : alerts.slice(0, NEEDS_ATTENTION_COLLAPSED);
    // Reuses the same .btn.btn-secondary.block treatment Transactions'
    // own "Load more" button already established, rather than inventing a
    // second full-width-button style for what's the same interaction
    // (reveal more of an already-fetched list) in a different section.
    const naMoreBtn = !naExpanded ? '<button type="button" class="btn btn-secondary block small" aria-expanded="false" onclick="UI.toggleNeedsAttention()">' +
      esc(app.L("+ " + (alerts.length - NEEDS_ATTENTION_COLLAPSED) + " more — show all", "+ " + (alerts.length - NEEDS_ATTENTION_COLLAPSED) + " تنبيهات تانية — عرض الكل")) + "</button>" : "";
    const needsAttention = '<section class="dash-section">' +
      '<h2 class="section-title">' + esc(t.needsAttention) + "</h2>" +
      (alerts.length ? '<div class="alert-list">' + naShown.map(a =>
        '<div class="alert-card sev-' + (a.sev || "info") + '"><div class="alert-title">' + esc(a.title) + '</div><div class="alert-body">' + a.body + '</div>' +
        '<button class="alert-cta" onclick="' + (a.act || ("UI.setPage('" + a.go + "')")) + '">' + esc(a.cta) + "</button></div>"
      ).join("") + "</div>" + naMoreBtn : this.emptyState(ICON_CHECK, app.L("All clear", "كله تمام"), app.L("Nothing needs your attention right now.", "مفيش حاجة محتاجة انتباهك دلوقتي."))) +
    "</section>";

    // Repeat a common expense with one tap, pre-filled with its last
    // amount and category — only appears once a description has actually
    // repeated (count >= 2 in frequentExpenses), so a one-off entry never
    // clutters this row.
    const frequent = app.frequentExpenses(6);
    const quickAdd = frequent.length ? '<section class="dash-section">' +
      '<h2 class="section-title">' + esc(app.L("Quick add", "إضافة سريعة")) + "</h2>" +
      '<div class="pill-row">' + frequent.map(f => {
        const pre = JSON.stringify({ desc: f.desc, category: f.category || "", amount: f.amount }).replace(/"/g, "&quot;");
        return '<button class="pill" onclick="UI.openModal(\'expense\',' + pre + ')">' + esc(f.desc) + " · " + app.fmt(f.amount) + "</button>";
      }).join("") + "</div>" +
    "</section>" : "";

    // Savings goals — a compact teaser (top 3, by nearest target date, same
    // ordering as the goals page itself) so progress is visible without a
    // trip to More -> Savings goals; hidden entirely once there are none.
    const goalsTeaser = D.savingsGoals.length ? '<section class="dash-section">' +
      '<div class="section-head"><h2 class="section-title">' + esc(t.goals) + '</h2><button class="link-btn" onclick="UI.setPage(\'goals\')">' + esc(app.L("See all", "عرض الكل")) + " →</button></div>" +
      '<div class="card-list">' + D.savingsGoals.slice().sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1).slice(0, 3).map(g =>
        '<div class="card-row"><div class="card-row-top"><div class="card-row-title">' + esc(g.name) + '</div><div class="card-row-amt">' + g.pct + "%</div></div>" +
        '<div class="bar-track thin"><div class="bar-fill" style="width:' + Math.max(2, g.pct) + '%;background:' + (g.done ? "var(--c-pos)" : g.color) + '"></div></div></div>'
      ).join("") + "</div>" +
    "</section>" : "";

    // Where my money is — position breakdown, single instance only.
    // 28 (Dashboard Recut): the first 6 tiles are real money "buckets"
    // (a place value actually sits), so each gets its own icon + a matching
    // tint -- reusing paths already established elsewhere in this app
    // (Invested/Owed-to-me match Engine.NAV's own investments/people icons
    // exactly, rather than inventing new glyphs those pages don't share)
    // instead of the flat, undifferentiated grey every tile had before.
    // The last 3 (I owe, Total assets, Net worth) are DERIVED totals, not
    // a place money sits, so they deliberately keep the plain/alt tile
    // treatment -- an icon on a subtraction or a grand total would just be
    // decoration with nothing real to depict. ICON_CASH etc. are module-
    // scope constants (see near ICON_CHECK/ICON_PLUS/ICON_SEARCH above).
    const positionTiles = [
      [t.cash, D.cash, ICON_CASH, "var(--c-accent)"], [t.bank, D.bank, ICON_BANK_TILE, "var(--cat-1)"], [t.wallets, D.wallets, ICON_WALLET_TILE, "var(--cat-5)"],
      [t.other, D.cards, ICON_CARDS_TILE, "var(--c-neg)"], [t.investmentsShort, D.invValue, ICON_INVESTED_TILE, "var(--cat-4)"], [t.receivables, D.recvTotal, ICON_OWED_TILE, "var(--c-pos)"],
      [t.payables, -D.payTotal], [t.totalAssets, D.assets], [t.netWorth, D.netWorth]
    ];
    const whereMoney = '<section class="dash-section">' +
      '<h2 class="section-title">' + esc(t.whereMoney) + "</h2>" +
      '<div class="tile-grid">' + positionTiles.map(([l, v, icon, tint], i) =>
        '<div class="pos-tile' + (i > 6 ? " alt" : icon ? " tinted" : "") + '"' + (icon ? ' style="--tile-tint:color-mix(in srgb, ' + tint + ' 12%, var(--c-surface));--tile-ico-bg:color-mix(in srgb, ' + tint + ' 24%, transparent);--tile-ico-fg:' + tint + '"' : "") + '>' +
        // aria-hidden -- decorative next to .pos-label, which already
        // carries the real accessible name; same convention every other
        // icon-producing helper in this file follows (svgIcon(), sparkline(),
        // ringChart(), barChart()'s bars).
        (icon ? '<div class="tile-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + "</svg></div>" : "") +
        '<div class="pos-label">' + esc(l) + '</div><div class="pos-value">' + app.fmt(v) + "</div></div>"
      ).join("") + "</div>" +
    "</section>";

    // Next 30 days
    const fc = app.forecast(30, D);
    const upcoming = fc.events.slice(0, 7);
    const next30 = '<section class="dash-section">' +
      '<div class="section-head"><h2 class="section-title">' + esc(t.upcoming30) + '</h2><button class="link-btn" onclick="UI.setPage(\'forecast\')">' + esc(t.seeForecast) + "</button></div>" +
      (upcoming.length ? '<div class="event-list">' + upcoming.map(e =>
        '<div class="event-row"><span class="event-dot ' + (e.amount > 0 ? "pos" : "neg") + '"></span><span class="event-title">' + esc(e.title) + '</span><span class="event-when">' + app.dshort(e.date) + '</span><span class="event-amt ' + (e.amount > 0 ? "tone-pos" : "tone-neg") + '">' + app.fmtS(e.amount) + "</span></div>"
      ).join("") + "</div>" : '<p class="muted">—</p>') +
    "</section>";

    // Shared "up/down X% vs <period>" badge -- used by both This week and
    // This month below, so the arrow/color logic (which direction counts
    // as "good") can't drift between the two the way "this month"'s own
    // date bounds once did against the budget alerts.
    const periodBadge = (pct, goodIsDown, label) => {
      if (pct === null) return "";
      const up = pct >= 0;
      const good = goodIsDown ? !up : up;
      return ' <span class="' + (good ? "tone-pos" : "tone-neg") + '" style="font-size:11px">' + (up ? "▲" : "▼") + Math.abs(pct) + "% " + esc(label) + "</span>";
    };

    // This week — a rolling 7 days (see Engine.weekSummary), not a calendar
    // week: sidesteps picking which day a week "starts" on, and matches the
    // rolling-7-days convention Safe to spend and the Transactions "Last 7
    // days" preset already use.
    const ws = app.weekSummary();
    const thisWeek = '<section class="dash-section">' +
      '<h2 class="section-title">' + esc(app.L("This week", "الأسبوع ده")) + "</h2>" +
      '<div class="two-col">' +
        '<div class="stat-box"><div class="pos-label">' + esc(app.L("Spent this week", "المصروف الأسبوع ده")) + '</div><div class="pos-value tone-neg">' + app.fmt(ws.expense) + "</div>" + periodBadge(ws.pct, true, app.L("vs last week", "عن الأسبوع اللي فات")) + "</div>" +
        '<div class="stat-box"><div class="pos-label">' + esc(app.L("Top category", "أكبر بند")) + '</div><div class="pos-value">' + (ws.topCategory ? esc(ws.topCategory.name) + " · " + app.fmt(ws.topCategory.amount) : "—") + "</div></div>" +
      "</div>" +
    "</section>";

    // This month — bounded to today at both ends (not just from the 1st),
    // matching monthCategorySpend()/monthOverMonth() below: otherwise a
    // future-dated entry within the current month could show up in this
    // total while the "vs last month" badge next to it (which is bounded
    // to today) silently doesn't reflect it, making the two disagree.
    // monthExpense/monthToday/monthStart are hoisted above (see top of
    // renderDashboard) since the overall-budget Needs Attention alert
    // needs the same total.
    const monthTx = D.live.filter(x => x.date >= monthStart && x.date <= monthToday);
    const monthIncome = monthTx.filter(x => ["income", "refund", "investment_return"].includes(x.type)).reduce((s, x) => s + x.amount, 0);
    // vs. the same number of days into last month (see monthOverMonth) —
    // null when last month had nothing in that window to compare against.
    const mom = app.monthOverMonth();
    const momBadge = (pct, goodIsDown) => periodBadge(pct, goodIsDown, app.L("vs last month", "عن الشهر اللي فات"));
    // app.monthCategorySpend(), not a locally-filtered copy — it's also
    // what the budget/unusual-spending alerts above check against, so a
    // category can't show over-budget red here while staying silent there
    // (or vice versa) just because the two computed "this month" differently
    // (monthCategorySpend() bounds its range to today; D.live has no upper
    // bound, so a future-dated entry could otherwise only show up in one).
    const catMap = app.monthCategorySpend();
    const catArr = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const maxCat = Math.max(1, ...catArr.map(c => c[1]));
    // Overall monthly budget (Settings) -- one cap across every expense,
    // not per category. Only rendered once a budget is actually set (>0);
    // otherwise this section looks exactly as it always has.
    const overallPct = overallBudget > 0 ? monthExpense / overallBudget * 100 : 0;
    const overallRingColor = overallOver ? "var(--c-neg)" : overallNear ? "var(--c-warn)" : "var(--c-accent-fill)";
    const overallBudgetBar = overallBudget > 0 ? '<div class="overall-budget' + (overallOver ? " over" : overallNear ? " near" : "") + '">' +
      '<div class="overall-budget-main">' +
        '<div class="ring-wrap">' + this.ringChart(overallPct, overallRingColor) +
          // The ring itself can't visually exceed "full circle" (ringChart
          // already clamps its own geometry) -- but the label under it is
          // the one place the real number belongs, over 100% and all
          // ("134%" says something a ring stuck at "full" can't).
          '<div class="ring-label' + (overallOver ? " tone-neg" : "") + '">' + Math.round(overallPct) + "%</div>" +
        "</div>" +
        '<div class="overall-budget-info">' +
          '<div class="overall-budget-row"><span>' + esc(app.L("All expenses this month", "كل المصروفات الشهر ده")) + '</span><span class="overall-budget-amt">' + app.fmt(monthExpense) + " / " + app.fmt(overallBudget) + "</span></div>" +
          // No esc() around this whole line -- app.L()'s own text and
          // app.fmt()'s <bdi>-wrapped HTML mix directly, same convention the
          // Needs Attention alert bodies already use (esc() is for real
          // user-provided strings, e.g. a category name, not developer-
          // authored label text or fmt()'s own markup).
          (showProjection ? '<div class="overall-budget-proj' + (projectionOver ? " warn" : "") + '">' + (projectionOver ?
            app.L("At this pace, you'll reach ", "بمعدلك الحالي، هتوصل لـ ") + app.fmt(projectedMonthEnd) + app.L(" by month end — over budget.", " بنهاية الشهر — فوق الميزانية.") :
            app.L("At this pace, you'll end the month around ", "بمعدلك الحالي، هتقفل الشهر حوالي ") + app.fmt(projectedMonthEnd) + ".") + "</div>" : "") +
        "</div>" +
      "</div>" +
    "</div>" : "";
    const thisMonth = '<section class="dash-section">' +
      '<h2 class="section-title">' + esc(t.thisMonth) + "</h2>" +
      '<div class="two-col">' +
        '<div class="stat-box"><div class="pos-label">' + esc(t.income) + '</div><div class="pos-value tone-pos">' + app.fmt(monthIncome) + "</div>" + momBadge(mom.incomePct, false) + "</div>" +
        '<div class="stat-box"><div class="pos-label">' + esc(t.expenses) + '</div><div class="pos-value tone-neg">' + app.fmt(monthExpense) + "</div>" + momBadge(mom.expensePct, true) + "</div>" +
      "</div>" +
      overallBudgetBar +
      (catArr.length ? '<div class="bar-list">' + catArr.slice(0, 5).map(([name, v]) => {
        const budget = (d.budgets || {})[name];
        const over = budget && v > budget;
        return this.catBar(name, v, maxCat, "expense", over, budget ? " / " + app.fmt(budget) : "");
      }).join("") + "</div>" : "") +
    "</section>";

    return hero + nwTrendExpand + needsAttention + quickAdd + goalsTeaser + whereMoney + next30 + thisWeek + thisMonth;
  },

  // ---- Accounts -------------------------------------------------------------
  // Card face background -- pattern-driven (approved from the card
  // customizer preview). "diag1" is the long-standing default and needs
  // only the account's own color, auto-darkening a second stop the same
  // way it always has; the other three patterns use color2 explicitly,
  // falling back to that same auto-darkened shade if the user picked one
  // of them but never actually set a second color, so nothing renders
  // broken (a diagonal/radial/split against itself is still a valid,
  // if unexciting, gradient).
  cardBackground(a) {
    const c1 = a.color || "#7d7979";
    const dark = "color-mix(in srgb, " + c1 + " 62%, black)";
    const c2 = a.color2 || dark;
    switch (a.pattern) {
      case "diag2": return "linear-gradient(135deg, " + c1 + ", " + c2 + ")";
      case "radial": return "radial-gradient(130% 120% at 15% 0%, " + c1 + ", " + c2 + " 75%)";
      case "split": return "linear-gradient(102deg, " + c1 + " 0%, " + c1 + " 47%, " + c2 + " 53%, " + c2 + " 100%)";
      default: return "linear-gradient(135deg, " + c1 + ", " + dark + ")";
    }
  },
  // Text color -- "auto" (what every account made before this existed
  // effectively already had, hardcoded) picks white or dark from the
  // account's own primary color's perceived lightness (the standard YIQ-
  // weighted formula); "white"/"dark" pin it regardless of which color is
  // actually chosen, for a light card that would otherwise read as
  // low-contrast either way "auto" guesses.
  // For a two-color pattern (diag2/radial/split), text sits over BOTH
  // colors at once (e.g. split's stat row spans both halves), so "auto"
  // blends both colors' luminance rather than judging by the primary
  // color alone -- that alone can pick e.g. dark text for a near-white +
  // near-black split and render unreadable dark-on-near-black on the
  // second half. The blend is weighted per pattern to roughly match how
  // much of the card face each color actually covers (see cardBackground):
  // split/diag2 are close to an even 50/50 split of the visible area, but
  // radial's color2 only shows past 75% of an ellipse centered near the
  // top-left corner, so color1 dominates most of the face -- weighting it
  // evenly there would pick text for a card that's mostly still color1.
  // This still can't guarantee every combination is legible (no single
  // text color can be, for two very different halves) but it's a real
  // improvement over ignoring color2, or weighting it as if every pattern
  // split the face evenly.
  cardTextColor(a) {
    if (a.textColor === "white") return "#fff";
    if (a.textColor === "dark") return "#1c1b18";
    // Shared byte-parsing with Engine.darkenHex (see its comment) -- an
    // unparsable hex here just falls back to "treat as light" (255) so an
    // unexpected value still resolves to a safe dark-text default.
    const yiq = (hex) => {
      const rgb = this.app.hexToRgb(hex);
      if (!rgb) return 255;
      return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    };
    let lum = yiq(a.color || "#7d7979");
    if (a.pattern && a.pattern !== "diag1" && a.color2) {
      const w = a.pattern === "radial" ? 0.8 : 0.5; // c1's share of the visible face
      lum = w * lum + (1 - w) * yiq(a.color2);
    }
    return lum > 165 ? "#1c1b18" : "#fff";
  },

  renderAccounts(D, t) {
    const app = this.app, d = app.state.data;
    const typeLabel = { cash: app.L("Cash", "كاش"), bank: app.L("Bank", "بنك"), wallet: app.L("Smart wallet", "محفظة إلكترونية"), card: app.L("Credit card", "بطاقة ائتمان"), ecard: app.L("Electronic card", "كارت إلكتروني"), other: app.L("Other", "أخرى") };
    const accs = d.accounts.filter(a => a.active);
    const maxAbs = Math.max(1, ...accs.map(a => Math.abs(D.bal[a.id])));

    // Every account type renders as a card-shaped tile in its own color,
    // instead of the plain list row (no bank logos anywhere — trademarked;
    // just the gradient — same "pick a real color to match" as the credit
    // card). "card" is the debt variant (Outstanding/Limit, chip mark);
    // everything else — bank, wallet, cash, ecard — is the balance variant
    // (one number, a plain mark instead of a chip, since nothing here
    // claims to be a real EMV card). Only "other" stays a plain list row,
    // as the true catch-all with no obvious physical-object shape.
    // tileTypes() lives on Engine (not duplicated here) so moveAccount()
    // groups accounts the exact same way this render does.
    const tileTypes = app.tileTypes();
    const tileAccs = accs.filter(a => tileTypes.includes(a.type));
    const rowAccs = accs.filter(a => !tileTypes.includes(a.type));

    // 39 (Accounts Recut): the same 3 tile sub-groups (see Engine.
    // acctTileGroup()'s own comment for why moveAccount() has to scope a
    // move exactly this way too) as their own headed sections, instead of
    // one flat scrolling list of every tile type mixed together. Headings
    // only render at all once there's more than one non-empty group to
    // actually tell apart -- a ledger that's e.g. all bank accounts gets
    // no "Cash & bank" label sitting redundantly over literally everything.
    const tileGroupDefs = [
      ["cashbank", app.L("Cash & bank", "نقدي وبنوك")],
      ["wallet", app.L("Wallets & e-cards", "محافظ وكروت إلكترونية")],
      ["card", app.L("Credit cards", "كروت الائتمان")],
    ];
    const tileGroups = tileGroupDefs.map(([key, label]) => [key, label, tileAccs.filter(a => app.acctTileGroup(a.type) === key)]).filter(([, , arr]) => arr.length);
    const showGroupHeadings = tileGroups.length + (rowAccs.length ? 1 : 0) > 1;

    // Total credit-card exposure across every card at once — each tile
    // already shows its own Outstanding/Available/Limit, but "how much do I
    // owe in total, out of how much limit" needs adding them all up by hand
    // otherwise.
    const cardAccs = tileAccs.filter(a => a.type === "card");
    const ccSummary = !cardAccs.length ? "" : (() => {
      const totalOwed = cardAccs.reduce((s, a) => s + Math.abs(Math.min(0, D.bal[a.id])), 0);
      const totalLimit = cardAccs.reduce((s, a) => s + (a.limit || 0), 0);
      // Sum each card's own clamped Available (not Math.max(0, totalLimit -
      // totalOwed)) so this always agrees with what the individual tiles
      // below show -- clamping only the aggregate would let one card over
      // its own limit (e.g. fees) silently eat into another card's
      // headroom instead of just showing 0 for itself.
      const totalAvailable = cardAccs.reduce((s, a) => s + Math.max(0, (a.limit || 0) - Math.abs(Math.min(0, D.bal[a.id]))), 0);
      const pct = totalLimit > 0 ? Math.round(totalOwed / totalLimit * 100) : 0;
      return '<div class="tile-grid four" style="margin-bottom:10px">' +
        '<div class="pos-tile"><div class="pos-label">' + esc(app.L("Total card debt", "إجمالي مديونية الكروت")) + '</div><div class="pos-value tone-neg">' + app.fmt(totalOwed) + "</div></div>" +
        '<div class="pos-tile"><div class="pos-label">' + esc(app.L("Total available", "المتاح إجمالاً")) + '</div><div class="pos-value tone-pos">' + app.fmt(totalAvailable) + "</div></div>" +
        '<div class="pos-tile"><div class="pos-label">' + esc(app.L("Total limit", "إجمالي الليمت")) + '</div><div class="pos-value">' + app.fmt(totalLimit) + "</div></div>" +
        '<div class="pos-tile"><div class="pos-label">' + esc(app.L("Used", "المستخدم")) + '</div><div class="pos-value ' + (pct >= 70 ? "tone-neg" : "tone-neu") + '">' + pct + "%</div></div>" +
      "</div>";
    })();

    // 37 (Accounts Recut): a real per-type icon in the small corner mark on
    // a balance tile (cash/bank/wallet/ecard) instead of a blank circle
    // with no meaning of its own -- credit cards keep their existing gold
    // chip mark untouched (cc-chip), already a meaningful shape. Reuses the
    // exact same icon paths Dashboard's own "Where my money is" tiles
    // already established (see ICON_CASH etc. near ICON_CHECK/ICON_PLUS/
    // ICON_SEARCH up top) rather than inventing new ones for the same
    // account types.
    const typeIcon = { cash: ICON_CASH, bank: ICON_BANK_TILE, wallet: ICON_WALLET_TILE, ecard: ICON_CARDS_TILE };
    // 40 (Accounts Recut): a small balance-trend sparkline on every
    // balance-tile (not credit cards -- their 3-column Outstanding/
    // Available/Limit row is already tight on width, and the usage bar
    // they already have covers "how full" for them instead of a trend).
    // Same weeklyDerives pattern Dashboard's own hero-card sparklines use
    // (see renderDashboard()'s own comment on that) -- 5 weekly derive()
    // cutoffs, each one's own D.bal map read per account. Only actually
    // computed when there's at least one balance tile to spend it on.
    const hasBalanceTiles = tileAccs.some(a => a.type !== "card");
    const weeklyDerives = hasBalanceTiles ? [4, 3, 2, 1, 0].map(w => app.derive(app.iso(app.addDays(new Date(), -7 * w)))) : null;

    const tileHtml = (a) => {
      const bal = D.bal[a.id];
      const isDebt = a.type === "card";
      // Available = how much of the limit is left to spend -- the number a
      // card actually needs day to day, not just Outstanding/Limit on their
      // own (clamped at 0: a card somehow over its limit, e.g. fees, still
      // reads as "nothing left" rather than a confusing negative).
      const available = Math.max(0, (a.limit || 0) - Math.abs(Math.min(0, bal)));
      const spark = (!isDebt && weeklyDerives) ? this.sparkline(weeklyDerives.map(w => w.bal[a.id] || 0), "currentColor") : "";
      const face = isDebt ?
        '<div class="cc-row"><div><div class="cc-label">' + esc(app.L("Outstanding", "المديونية")) + '</div><div class="cc-amt">' + app.fmt(bal) + "</div></div>" +
        '<div><div class="cc-label">' + esc(app.L("Available", "المتاح")) + '</div><div class="cc-sub">' + app.fmt(available) + "</div></div>" +
        '<div><div class="cc-label">' + esc(app.L("Limit", "الحد")) + '</div><div class="cc-sub">' + app.fmt(a.limit) + "</div></div></div>" :
        '<div class="cc-row"><div><div class="cc-label">' + esc(app.L("Balance", "الرصيد")) + '</div><div class="cc-amt">' + app.fmt(bal) + spark + "</div></div></div>";
      // Nearest un-paid statement on this card, right on the tile -- the
      // full list (add/edit/pay every statement, on every card) lives on
      // its own page (More -> Card statements); this is just the
      // at-a-glance "how much, how soon" the tile itself promises.
      // Thin usage bar, credit cards only -- Outstanding/Limit is the one
      // account type here with an unambiguous, self-contained "how full is
      // this" percentage (matches the aggregate ccSummary tile's own "Used"
      // %, just per-card). A plain balance account has no natural ceiling
      // to measure against without a per-account budget this app doesn't
      // model (budgets are per-category), so deliberately skipped there
      // rather than inventing a shaky heuristic.
      const usagePct = isDebt && a.limit > 0 ? Math.max(0, Math.min(100, Math.round(Math.abs(Math.min(0, bal)) / a.limit * 100))) : null;
      const usageColor = usagePct === null ? "" : usagePct >= 90 ? "rgba(255,110,110,.9)" : usagePct >= 70 ? "rgba(233,211,138,.9)" : "rgba(255,255,255,.75)";
      const usageBar = usagePct === null ? "" : '<div class="cc-usage" role="img" aria-label="' + esc(usagePct + app.L("% of limit used", "% من الحد مستخدم")) + '"><div class="cc-usage-fill" style="width:' + usagePct + '%;background:' + usageColor + '"></div></div>';
      const nearestStmt = isDebt ? D.cardStatements.filter(s => s.accountId === a.id && s.status !== "paid").sort((x, y) => x.due < y.due ? -1 : 1)[0] : null;
      // Its own tinted badge, not another plain cc-row -- same white text
      // as Outstanding/Available/Limit made it blend straight into the
      // rest of the card face instead of standing out as something to act
      // on. Gold for "coming up" (matches the card's own chip color),
      // red for overdue -- both read against any base card color, not
      // just this account's own.
      const stmtLine = nearestStmt ? '<div class="cc-stmt' + (nearestStmt.overdue ? " overdue" : "") + '"><span class="cc-label">' + esc(app.L("Statement due", "كشف الحساب")) + '</span><span class="cc-stmt-amt">' + app.fmt(nearestStmt.remaining) + " · " + esc(this.daysUntilText(nearestStmt.due)) + "</span></div>" : "";
      // Flip -- tap the ⟳ corner button (not the card body itself, so it
      // can't collide with the existing tap-name-to-view-transactions
      // behavior) to see the last 3 transactions touching this account
      // without leaving the page. UI.flipCardC() toggles a class directly
      // on this specific tile's #ccflip-<id> via its own id, no render()
      // involved -- same reasoning setColorField/syncColor2Default etc.
      // already establish for state that doesn't need to survive a
      // re-render (a flip is a transient view, not data).
      const faceStyle = 'style="background:' + this.cardBackground(a) + ';color:' + this.cardTextColor(a) + '"';
      // Same button reused on both faces, but the announced action is the
      // opposite of the flip it's actually on: on the front it shows
      // recent activity, on the back it goes back to the card face.
      const flipBtn = (back) => '<button class="cc-flip-btn" aria-label="' + esc(back ? app.L("Back to card", "ارجع للكارت") : app.L("Show recent activity", "اعرض آخر النشاط")) + '" onclick="UI.flipCardC(\'' + a.id + '\')">⟳</button>';
      const markIcon = (!isDebt && typeIcon[a.type]) ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + typeIcon[a.type] + "</svg>" : "";
      // 36 (Accounts Recut): Edit/Statement/Move up/Move down/Delete all
      // moved off this always-visible row into one "..." trigger opening
      // UI.renderAcctActionSheet() -- same shared .sheet markup and
      // reasoning Transactions' own action sheet already established (see
      // renderTxActionSheet()), just for an account's actions instead of a
      // transaction's.
      // "Recent activity" is NOT computed here -- a D.live.filter() per
      // account, on every single render() (any save, tab switch, or edit),
      // whether or not a card is ever flipped, was real wasted O(accounts
      // x transactions) work. UI.flipCardC() builds and injects
      // .cc-back-list's content the first time a given tile actually
      // flips, same lazy-on-first-expand pattern as the Dashboard's
      // nwTrendExpand.
      return '<div class="credit-card-tile' + (isDebt ? "" : " balance-tile") + '"><div class="cc-flip" id="ccflip-' + a.id + '" data-acc-id="' + esc(a.id) + '">' +
        '<div class="cc-face cc-face-front" ' + faceStyle + '>' +
          '<div class="cc-top"><span class="cc-bank">' + esc(a.bank || typeLabel[a.type]) + '</span><span style="display:flex;align-items:center;gap:6px"><span class="' + (isDebt ? "cc-chip" : "cc-mark") + '">' + markIcon + '</span>' + flipBtn(false) + "</span></div>" +
          '<button class="link-btn cc-name" onclick="UI.viewAccountTx(\'' + a.id + '\')">' + esc(a.name) + "</button>" +
          face + usageBar + stmtLine +
          '<div class="btn-row" style="margin-top:12px">' +
          '<button type="button" class="link-btn small acct-more-btn" aria-haspopup="true" aria-label="' + esc(app.L("More actions", "إجراءات تانية")) + '" onclick="UI.openAcctActions(\'' + a.id + '\')">' + svgIcon("M12 6h.01M12 12h.01M12 18h.01", 18) + "</button>" +
          "</div>" +
        "</div>" +
        // inert: backface-visibility:hidden only hides the back face
        // visually -- its buttons stay in the tab order and the a11y tree
        // otherwise, so a keyboard/screen-reader user could land on
        // "Back to card" while the front is what's actually shown. Starts
        // inert since a tile always renders unflipped; UI.flipCardC()
        // toggles this on both faces to match .flipped.
        '<div class="cc-face cc-face-back" inert ' + faceStyle + '>' +
          '<div class="cc-top"><span class="cc-back-title">' + esc(app.L("Recent activity", "آخر نشاط")) + "</span>" + flipBtn(true) + "</div>" +
          '<div class="cc-back-list"></div>' +
        "</div>" +
      "</div></div>";
    };

    const rowHtml = (a) => {
      const bal = D.bal[a.id];
      const extra = a.bank ? '<div class="acc-sub">' + esc(a.bank) + "</div>" : "";
      return '<div class="card-row">' +
        '<div class="card-row-top"><span class="acc-swatch" style="background:' + a.color + '"></span><div><button class="link-btn card-row-title" onclick="UI.viewAccountTx(\'' + a.id + '\')">' + esc(a.name) + '</button><div class="card-row-sub">' + typeLabel[a.type] + "</div></div>" +
        '<div class="card-row-amt ' + (bal < 0 ? "tone-neg" : "tone-pos") + '">' + app.fmt(bal) + "</div></div>" +
        '<div class="bar-track thin"><div class="bar-fill" style="width:' + Math.max(2, Math.abs(bal) / maxAbs * 100) + '%;background:' + (bal < 0 ? "var(--c-neg)" : a.color) + '"></div></div>' +
        extra +
        '<div class="btn-row">' +
        '<button type="button" class="link-btn small acct-more-btn" aria-haspopup="true" aria-label="' + esc(app.L("More actions", "إجراءات تانية")) + '" onclick="UI.openAcctActions(\'' + a.id + '\')">' + svgIcon("M12 6h.01M12 12h.01M12 18h.01", 18) + "</button>" +
        "</div></div>";
    };

    const tileBlocks = tileGroups.map(([, label, groupAccs]) =>
      (showGroupHeadings ? '<h2 class="section-title">' + esc(label) + "</h2>" : "") +
      '<div class="card-list">' + groupAccs.map(tileHtml).join("") + "</div>"
    ).join("");
    const rowsBlock = rowAccs.length ?
      (showGroupHeadings ? '<h2 class="section-title">' + esc(typeLabel.other) + "</h2>" : "") +
      '<div class="card-list">' + rowAccs.map(rowHtml).join("") + "</div>" : "";

    return this.tabHeader(t.accounts, accs.length + app.L(" accounts · transfers never hit income or expense", " حساب · التحويلات لا تُحسب إيراداً ولا مصروفاً"),
      [[t.aAccount, "UI.openModal('account')"], [t.aCard, "UI.openModal('card')"], [t.transfer, "UI.openModal('transfer')"]]) +
      ccSummary + tileBlocks + rowsBlock;
  },
  // Opens the account-edit form pre-filled from the account itself -- same
  // shape (id/name/bank/opening/limit/color/color2/pattern/textColor) the
  // removed inline Edit button used to build, but as a plain JS object
  // handed straight to openModal() instead of one JSON-stringified and
  // HTML-escaped into an onclick attribute -- there's no HTML round-trip
  // to survive any more, called from the sheet via just an id, the same
  // way UI.openTxEdit() already works for a transaction.
  openAcctEdit(id) {
    this._acctActionRow = null;
    const a = this.app.state.data.accounts.find(x => x.id === id);
    if (!a) return;
    this.openModal("account_edit", { id: a.id, name: a.name, type: a.type, bank: a.bank || "", opening: a.type === "card" ? Math.abs(a.opening || 0) : (a.opening || 0), limit: a.limit || 0, color: a.color || "#7d7979", color2: a.color2 || "", pattern: a.pattern || "diag1", textColor: a.textColor || "auto", desc: a.desc || "" });
  },
  openAcctStatement(id) {
    this._acctActionRow = null;
    this.openModal("card_statement", { accountId: id });
  },
  // The sheet UI.openAcctActions() opens -- reuses the exact .sheet/
  // .sheet-backdrop/.sheet-actions markup Transactions' own action sheet
  // established (see renderTxActionSheet()), just for an account's Edit/
  // [+ Statement, credit cards only]/Move up/Move down/Delete instead of a
  // transaction's. Unlike that sheet, an inapplicable item here (Move up at
  // the top of its group, Delete on an account still in use) is left out
  // entirely rather than shown disabled -- matching what the row/tile
  // markup itself always did before this sheet existed, and there's no
  // "reversed"-style informative disabled state worth showing for any of
  // these the way there was there. this._acctActionRow holds which
  // account's sheet (if any) is open.
  renderAcctActionSheet() {
    const app = this.app, id = this._acctActionRow;
    if (!id) return "";
    const a = app.state.data.accounts.find(x => x.id === id);
    if (!a) return "";
    const isDebt = a.type === "card";
    const canDelete = app.accountCanDelete(a.id);
    // Same section (one of the 3 tile sub-groups, or the plain rows) and
    // ordering Engine.moveAccount() itself scopes a move to -- see
    // Engine.acctTileGroup()'s own comment for why these two have to agree,
    // or an enabled arrow here could silently do nothing (or jump across a
    // group boundary) once actually pressed.
    const key = app.acctTileGroup(a.type) || "row";
    const section = app.state.data.accounts.filter(x => x.active && (app.acctTileGroup(x.type) || "row") === key);
    const i = section.findIndex(x => x.id === a.id);
    const items = [
      ["M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z", app.L("Edit"), "UI.openAcctEdit('" + a.id + "')", false],
      isDebt ? ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2zM14 2v6h6M16 13H8M16 17H8", app.L("+ Statement", "+ كشف حساب"), "UI.openAcctStatement('" + a.id + "')", false] : null,
      i > 0 ? ["M12 19V5M5 12l7-7 7 7", app.L("Move up", "حرّك لفوق"), "UI.moveAccountC('" + a.id + "',-1)", false] : null,
      i < section.length - 1 ? ["M12 5v14M19 12l-7 7-7-7", app.L("Move down", "حرّك لتحت"), "UI.moveAccountC('" + a.id + "',1)", false] : null,
      canDelete ? ["M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6", app.L("Delete"), "UI.deleteAccountC('" + a.id + "')", true] : null,
    ].filter(Boolean);
    return '<div class="sheet-backdrop" onclick="UI.closeAcctActions()"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(a.name) + '">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-title">' + esc(a.name) + "</div>" +
        '<div class="sheet-actions">' + items.map(([ico, label, onclick, danger]) =>
          '<button type="button" class="sheet-action' + (danger ? " danger" : "") + '" onclick="' + onclick + '"><span class="sheet-action-ico">' + svgIcon(ico, 18) + "</span>" + esc(label) + "</button>"
        ).join("") + "</div>" +
      "</div>";
  },
  openAcctActions(id) { this._acctActionRow = id; this.render(); },
  closeAcctActions() { this._acctActionRow = null; this.render(); },

  // Shared English/Arabic type-label dict for a transaction row -- used by
  // both Transactions (every row) and Person Detail's History section
  // (this person's rows only), so the two can never show a different label
  // for the same stored type.
  txTypeLabels() {
    const app = this.app;
    return app.state.lang === "ar"
      ? { income: "إيراد", expense: "مصروف", transfer: "تحويل", receivable: "سلفة لي", receivable_payment: "تحصيل", payable: "دين عليّ", debt_payment: "سداد", investment_buy: "استثمار", investment_return: "عائد استثمار", installment_sale: "بيع بالتقسيط", installment_payment: "دفعة قسط", gam3ya_payment: "قسط جمعية", gam3ya_payout: "قبض جمعية", statement_payment: "سداد كشف حساب", refund: "مرتجع", adjustment: "تسوية", reversal_marker: "عكس قيد" }
      : { income: "Income", expense: "Expense", transfer: "Transfer", receivable: "Receivable", receivable_payment: "Collection", payable: "Debt", debt_payment: "Repayment", investment_buy: "Investment", investment_return: "Inv. return", installment_sale: "Inst. sale", installment_payment: "Inst. payment", gam3ya_payment: "Gam3ya in", gam3ya_payout: "Gam3ya payout", statement_payment: "Statement payment", refund: "Refund", adjustment: "Adjustment", reversal_marker: "Reversal" };
  },
  // Same shape as Engine's own accName(id) -- just the color instead of the
  // name -- so txSign() below can hand every row's account(s) real colors
  // for idea 34's dots without either caller reaching into state.data.accounts
  // itself.
  accColor(id) {
    const a = (this.app.state.data.accounts || []).find(x => x.id === id);
    return a ? a.color : null;
  },
  // Sign/amount-text/account-text/tone for one transaction row -- shared by
  // Transactions and Person Detail's History so a type added to outTypes/
  // inTypes, or the transfer-like carve-out, is automatically correct in
  // both places instead of only wherever someone remembered to update it.
  txSign(r) {
    const app = this.app;
    const outTypes = ["expense", "debt_payment", "receivable", "investment_buy", "gam3ya_payment"];
    const inTypes = ["income", "receivable_payment", "payable", "installment_payment", "investment_return", "refund", "gam3ya_payout"];
    // statement_payment moves money exactly like a transfer (fromId/toId,
    // no sign of its own) -- everywhere transfer gets special-cased below,
    // this does too, or it'd show as a plain negative with a blank account.
    const isTransferLike = r.type === "transfer" || r.type === "statement_payment";
    const isIn = inTypes.includes(r.type) && !(r.type === "installment_payment" && app.planDir(r.planId) === "out");
    const signed = (isTransferLike || r.type === "reversal_marker") ? 0 : (isIn ? r.amount : -r.amount);
    const amtTxt = r.type === "reversal_marker" ? "—" : (signed === 0 ? app.fmt(r.amount) : app.fmtS(signed));
    const acc = isTransferLike ? app.accName(r.fromId) + " → " + app.accName(r.toId) : (r.accountId ? app.accName(r.accountId) : "—");
    const tone = r.void ? "muted-amt" : (signed > 0 ? "tone-pos" : signed < 0 ? "tone-neg" : "");
    // 34 (Transactions Recut): 1 or 2 hex colors (transfer-like has both a
    // from- and a to-account) for the little dots next to the account name
    // -- .filter(Boolean) drops a deleted/missing account's null color
    // instead of rendering a broken/empty dot for it.
    const accColors = isTransferLike ? [this.accColor(r.fromId), this.accColor(r.toId)].filter(Boolean) : (r.accountId ? [this.accColor(r.accountId)].filter(Boolean) : []);
    return { isIn, isTransferLike, signed, amtTxt, acc, accColors, tone };
  },
  // Credit-card tile flip's "Recent activity" -- called lazily by
  // UI.flipCardC() the first time a given tile actually flips open, not
  // for every account tile on every render(). Fresh derive() each call
  // (cheap, one linear scan) so it's never stale against edits made since
  // the tile last rendered.
  ccBackRowsHtml(accountId) {
    const app = this.app, D = app.derive();
    // D.live is sorted oldest-first (see Engine.derive), so a plain
    // slice(0,3) would show the account's earliest transactions ever --
    // slice(-3).reverse() takes the last 3 in date order instead, newest
    // first, which is what "Recent activity" actually means.
    // D.live itself already excludes void:true rows entirely (see
    // Engine.derive) -- unlike Transactions' own table, which reads the
    // raw d.tx and needs its own strikethrough treatment for a voided row
    // still in the list, a voided transaction can never reach this list in
    // the first place, so there's nothing here to style for it.
    const recent = D.live.filter(x => x.accountId === accountId || x.fromId === accountId || x.toId === accountId).slice(-3).reverse();
    if (!recent.length) return '<div class="cc-back-empty">' + esc(app.L("No recent activity.", "مفيش نشاط حديث.")) + "</div>";
    return recent.map(r => {
      const { amtTxt, tone } = this.txSign(r);
      return '<div class="cc-back-row"><div><div>' + esc(r.desc || this.txTypeLabels()[r.type] || r.type) + '</div><div class="cc-back-row-sub">' + r.date + "</div></div><div class=\"" + tone + "\">" + amtTxt + "</div></div>";
    }).join("");
  },
  // Income/expense only carry tags (see FORMS()) — every other type's
  // `tags` is simply absent, so this renders nothing for them. Shared by
  // Transactions and Person Detail's History.
  txTagChips(r) {
    return (r.tags && r.tags.length) ? '<div class="pill-row" style="margin:4px 0 0">' + r.tags.map((tag) =>
      '<button class="pill tag-chip" style="' + this.tagStyle(tag) + '" onclick="UI.viewTagTx(\'' + escJsArg(tag) + '\')">#' + esc(tag) + "</button>"
    ).join("") + "</div>" : "";
  },
  // 31 (Transactions Recut): a single "..." trigger opening the shared
  // action sheet below, replacing what used to be up to 4 always-visible
  // inline links crowding every single row -- Reverse stays available on
  // every non-void row, for a formal audit-trail correction; Edit/Delete/
  // Duplicate only show for the plain entry types txEditable() recognizes
  // (a structural row like an installment sale or an investment purchase
  // is corrected through its own record instead). Shared by Transactions
  // and Person Detail's History.
  txRowActions(r) {
    const app = this.app;
    return '<div class="btn-row"><button type="button" class="link-btn small tx-more-btn" aria-haspopup="true" aria-label="' + esc(app.L("More actions", "إجراءات تانية")) + '" onclick="UI.openTxActions(\'' + r.id + '\')">' + svgIcon("M12 6h.01M12 12h.01M12 18h.01", 18) + "</button></div>";
  },
  // The sheet txRowActions() above opens -- reuses the exact .sheet/
  // .sheet-backdrop/.sheet-handle/.sheet-title markup (and its own desktop
  // popover treatment) renderMoreSheet()/renderQuickAddSheet() already
  // established, just with .sheet-actions' vertical icon+label list instead
  // of .sheet-grid's 3-across destination tiles -- this reads as "pick one
  // thing to do to the row you were just looking at", not "pick a place to
  // go". this._txActionRow holds which row's sheet (if any) is open.
  renderTxActionSheet() {
    const app = this.app, id = this._txActionRow;
    if (!id) return "";
    const r = app.state.data.tx.find(x => x.id === id);
    if (!r) return "";
    const editable = app.txEditable(r);
    const items = [
      ["M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z", app.L("Edit"), editable ? "UI.openTxEdit('" + r.id + "')" : null, false],
      ["M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10", r.void ? app.L("reversed") : app.L("reverse"), r.void ? null : "UI.reverseTx('" + r.id + "')", false],
      ["M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1", app.L("Duplicate", "كررها"), editable ? "UI.duplicateTxC('" + r.id + "')" : null, false],
      ["M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6", app.L("Delete"), editable ? "UI.deleteTxC('" + r.id + "')" : null, true],
    ];
    return '<div class="sheet-backdrop" onclick="UI.closeTxActions()"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(r.desc || app.L("Transaction")) + '">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-title">' + esc(r.desc || "—") + "</div>" +
        '<div class="sheet-actions">' + items.map(([ico, label, onclick, danger]) =>
          '<button type="button" class="sheet-action' + (danger ? " danger" : "") + '"' + (onclick ? ' onclick="' + onclick + '"' : " disabled") + "><span class=\"sheet-action-ico\">" + svgIcon(ico, 18) + "</span>" + esc(label) + "</button>"
        ).join("") + "</div>" +
      "</div>";
  },
  openTxActions(id) { this._txActionRow = id; this.render(); },
  closeTxActions() { this._txActionRow = null; this.render(); },

  // Shared by both the mobile card and desktop table row in
  // renderTransactions() below -- was written out twice inline, a real
  // maintenance risk caught in review (a future wording/icon change made
  // to one copy and not the other would silently drift).
  firstCatBadgeHtml(r, firstCatIds) {
    if (!r.category || !firstCatIds.has(r.id)) return "";
    return ' <span class="first-cat-badge">✦ ' + esc(this.app.L("First", "أول")) + " " + esc(r.category) + "</span>";
  },
  // One mobile transaction card's markup -- item is the same {r, isIn,
  // amtTxt, acc, tone} shape txSign() + the row itself already produce.
  // Extracted out of renderTransactions()'s cards builder unchanged (byte-
  // identical output to before) so txGroupRowHtml() below can render a
  // group's individual members with it too, instead of a second near-
  // duplicate copy of this markup.
  txCardRowHtml(item, firstCatIds, typeLabels, t) {
    const { r, isIn, amtTxt, acc, accColors, tone } = item;
    const app = this.app;
    const editable = app.txEditable(r);
    // 34 (Transactions Recut): a small color dot per real account behind
    // this row (2 for a transfer-like row) ahead of the account name --
    // Accounts' own tiles already carry each account's color, this just
    // gives Transactions the same visual link instead of a plain grey name
    // with no tie back to it.
    const accDots = (accColors || []).map(c => '<span class="tx-acc-dot" style="background:' + c + '"></span>').join("");
    const inner = '<div class="card-row-top"><div><div class="card-row-title">' + (r.category ? '<span class="cat-badge" style="background:' + app.categoryColor(r.category, r.type) + '">' + svgIcon(categoryIcon(r.category), 12) + "</span>" : "") + esc(r.desc || "—") + '</div><div class="card-row-sub">' + r.date + " · " + esc(typeLabels[r.type] || r.type) + "</div></div>" +
      '<div class="card-row-amt ' + tone + '">' + amtTxt + "</div></div>" +
      '<div class="card-row-meta">' +
        (r.personId ? '<span>' + esc(app.personName(r.personId)) + "</span>" : "") +
        '<span>' + accDots + esc(acc) + "</span>" +
        this.firstCatBadgeHtml(r, firstCatIds) +
      "</div>" +
      this.txTagChips(r) +
      this.txRowActions(r);
    const rowStyle = r.category ? ' style="border-inline-start:4px solid ' + app.categoryColor(r.category, r.type) + '"' : "";
    if (!editable) return '<div class="card-row' + (r.void ? " voided" : "") + '"' + rowStyle + ">" + inner + "</div>";
    return '<div class="card-row swipe-row' + (r.void ? " voided" : "") + '"' + rowStyle + ">" +
      '<div class="swipe-actions">' +
        '<button class="swipe-act swipe-edit" onclick="UI.openTxEdit(\'' + r.id + '\')">' + esc(t.edit) + "</button>" +
        '<button class="swipe-act swipe-delete" onclick="UI.deleteTxC(\'' + r.id + '\')">' + esc(t.delete) + "</button>" +
      "</div>" +
      '<div class="swipe-content">' + inner + "</div>" +
    "</div>";
  },
  // "Group similar": collapses transactions sharing the same type,
  // category, and (trimmed, case-insensitive) description -- a recurring
  // bill, a repeated merchant -- into one row, only among what's ALREADY
  // on screen (this page's `items`, already filtered and paginated the
  // normal way), not a second, wider pass over the whole ledger. Keeps
  // this purely a display transform layered on top of the existing
  // pagination/total-count logic rather than a second one that would need
  // to agree with it -- deliberately mobile-only (see toggleGroupTx()) so
  // there's only one grouping/pagination interaction to reason about, not
  // two independent ones for two different layouts. A description-less
  // row (transfers, statement payments, plain reversals -- desc can be
  // empty) never groups, even with another equally-blank one; blank
  // isn't a real repeated merchant.
  //
  // Real bugs caught in review, both fixed by being conservative about
  // what's even eligible to group:
  // - Only expense/income/refund/investment_return participate -- every
  //   other type either has no fixed sign of its own (installment_payment's
  //   sign depends on that specific plan's direction, not the type alone;
  //   two payments from economically OPPOSITE plans could otherwise net
  //   together into one misleading group total) or has no category to
  //   begin with, so grouping them by blank category + coincidentally
  //   similar desc text risked folding unrelated things together.
  // - A void/reversed row is excluded from grouping entirely -- it's
  //   already shown individually with its own muted/strikethrough
  //   treatment elsewhere in this same page; silently folding its amount
  //   into a live group's total (with no visual distinction once merged)
  //   would misstate that total.
  // JSON.stringify(...) for the key itself, not a hand-joined string with
  // "|" as a delimiter -- a category or description containing a literal
  // "|" could otherwise collide with a different category/desc split that
  // happens to produce the same joined string.
  groupTxItems(items) {
    const eligibleTypes = ["expense", "income", "refund", "investment_return"];
    const keyOf = (r) => (!r.void && eligibleTypes.includes(r.type) && r.desc && r.desc.trim())
      ? JSON.stringify([r.type, r.category || "", r.desc.trim().toLowerCase()]) : null;
    const groups = {};
    items.forEach(item => {
      const k = keyOf(item.r);
      if (k) (groups[k] = groups[k] || []).push(item);
    });
    const seen = new Set();
    const out = [];
    items.forEach(item => {
      const k = keyOf(item.r);
      if (!k) { out.push({ single: item }); return; }
      if (seen.has(k)) return;
      seen.add(k);
      const members = groups[k];
      out.push(members.length > 1 ? { group: members } : { single: item });
    });
    return out;
  },
  // A collapsible summary row for one "similar transactions" group --
  // total (signed sum, same convention txSign()'s own amtTxt uses),
  // occurrence count, tap/Enter to expand and reveal each real member
  // (rendered via cardRow, the exact same fully-editable/swipeable markup
  // an ungrouped row gets -- a group is just a folder around normal rows,
  // never a second, lesser representation of them). Content-based id (not
  // an array index) so which group is expanded survives a re-render
  // triggered by something else (a save, a filter tweak) instead of
  // silently pointing at whatever now sits at that same position.
  txGroupRowHtml(members, cardRow) {
    const app = this.app;
    const first = members[0].r;
    const signedSum = members.reduce((s, m) => s + m.signed, 0);
    // Same zero-suppression convention txSign()'s own amtTxt uses -- real
    // bug caught in review: app.fmtS() always prepends a +/- sign, which
    // for an exact-zero net (e.g. a group whose members happen to cancel
    // out) would show a misleading "+0.00" instead of the plain, sign-less
    // amount every other zero-value row in the app displays.
    const amtTxt = signedSum === 0 ? app.fmt(0) : app.fmtS(signedSum);
    const tone = signedSum > 0 ? "tone-pos" : signedSum < 0 ? "tone-neg" : "";
    // Content-based, NOT truncated -- real bug caught in review: an
    // earlier version capped the sanitized description at 40 characters,
    // so two distinct groups whose descriptions merely agreed on their
    // first 40 sanitized characters would collide on the same groupId and
    // share expand/collapse state. An HTML id has no meaningful length
    // limit, so there's no reason to cap it just for tidiness.
    const groupId = "grp-" + first.type + "-" + (first.category || "none").replace(/[^a-zA-Z0-9]/g, "_") + "-" + first.desc.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
    this._expandedTxGroups = this._expandedTxGroups || new Set();
    const expanded = this._expandedTxGroups.has(groupId);
    const rowStyle = first.category ? ' style="border-inline-start:4px solid ' + app.categoryColor(first.category, first.type) + '"' : "";
    const header = '<button class="card-row tx-group-head" type="button"' + rowStyle + ' aria-expanded="' + (expanded ? "true" : "false") + '" onclick="UI.toggleTxGroup(\'' + groupId + '\')">' +
      '<div class="card-row-top"><div><div class="card-row-title">' + (first.category ? '<span class="cat-badge" style="background:' + app.categoryColor(first.category, first.type) + '">' + svgIcon(categoryIcon(first.category), 12) + "</span>" : "") + esc(first.desc) + '</div><div class="card-row-sub">' + esc(app.L(members.length + " similar transactions", members.length + " حركة متشابهة")) + "</div></div>" +
        '<div class="card-row-amt ' + tone + '">' + amtTxt + "</div></div>" +
      '<div class="tx-group-toggle">' + (expanded ? "▲" : "▼") + "</div>" +
    "</button>";
    const memberRows = expanded ? '<div class="tx-group-members">' + members.map(cardRow).join("") + "</div>" : "";
    return '<div class="tx-group">' + header + memberRows + "</div>";
  },
  // A vertical timeline (colored dot per transaction, green in / red out)
  // for one account -- shown only while Transactions is scoped to exactly
  // that one account (same trigger as the scoped metrics row), giving a
  // fast visual read of the account's recent trend before scrolling the
  // full searchable/filterable list below it. `rows` is this page's own
  // already-filtered set (type/date/search too, so the timeline always
  // agrees with what's actually listed below it), newest first; capped to
  // the most recent 20 regardless of how many total match, since a
  // vertical dot-per-row timeline stops being a fast visual read well
  // before a long history would make it one giant scrolling column.
  renderAccountTimeline(rows, accountId) {
    const app = this.app;
    if (!rows.length) return "";
    const shown = rows.slice(0, 20);
    const items = shown.map(r => {
      const { signed, amtTxt, tone } = this.txSign(r);
      // Real bug caught in review: a reversed/voided row was still
      // rendered with a full-color pos/neg dot, unlike every other view
      // of a void row in the app (the Transactions table itself gives it
      // opacity+strikethrough) -- misrepresenting a reversed transaction
      // as a live, still-counting one in what's meant to be a fast visual
      // read.
      const dotColor = r.void ? "var(--c-text-faint)" : signed > 0 ? "var(--c-pos)" : signed < 0 ? "var(--c-neg)" : "var(--c-text-faint)";
      return '<li class="acc-timeline-item">' +
        '<span class="acc-timeline-dot" style="background:' + dotColor + '"></span>' +
        '<div class="acc-timeline-body">' +
          '<div class="acc-timeline-desc">' + esc(r.desc || this.txTypeLabels()[r.type] || r.type) + "</div>" +
          '<div class="acc-timeline-meta">' + r.date + '</div>' +
        "</div>" +
        '<div class="acc-timeline-amt ' + tone + '">' + amtTxt + "</div>" +
      "</li>";
    }).join("");
    const truncNote = rows.length > shown.length ? '<div class="acc-timeline-more">' + esc(app.L("+ " + (rows.length - shown.length) + " more below", "+ " + (rows.length - shown.length) + " تاني تحت")) + "</div>" : "";
    return '<section class="acc-timeline-wrap">' +
      '<h2 class="section-title">' + esc(app.L("Account Timeline", "الخط الزمني للحساب")) + "</h2>" +
      '<ul class="acc-timeline">' + items + "</ul>" + truncNote +
    "</section>";
  },
  // ---- Transactions (fix #2 cards, fix #4 pagination) -------------------
  renderTransactions(D, t) {
    const app = this.app, S = app.state, d = app.state.data;
    const typeLabels = this.txTypeLabels();
    const firstCatIds = app.firstCategoryUseIds();
    const presetStart = { today: 0, week: 7, month: 30, quarter: 90, year: 365 };
    let rows = d.tx.slice().sort((a, b) => a.date < b.date ? 1 : (a.date > b.date ? -1 : 0));
    const F = S.filt;
    if (F.type !== "all") rows = rows.filter(r => r.type === F.type);
    if (F.account !== "all") rows = rows.filter(r => r.accountId === F.account || r.fromId === F.account || r.toId === F.account);
    // 47 (People Recut): a real, exact match on r.personId -- see
    // UI.viewPersonTx()'s own comment for the real "Food"-shaped bug this
    // replaces (a person's name as free text, both over- and under-
    // matching real transactions).
    if (F.person !== "all") rows = rows.filter(r => r.personId === F.person);
    if (F.preset !== "all") { const from = app.iso(app.addDays(new Date(), -presetStart[F.preset])); rows = rows.filter(r => r.date >= from); }
    // Exact match, NOT folded into the free-text search below -- a real
    // bug, reported by a user: "Food" is both a category name AND
    // ordinary English text people type into descriptions ("Work food -
    // Talabat"), so the old text search used for "view this category's
    // transactions" (see UI.viewCategoryTx) matched any row whose
    // description merely CONTAINED the word, whatever its real category
    // field said -- a transaction re-categorized away from Food kept
    // showing up under Food regardless, looking like it was filed under
    // both at once.
    // "Other" is special: every category aggregation this app already has
    // (monthCategorySpend, unusualSpending, Reports' catMap/srcMap) buckets
    // a transaction with NO category set at all under "Other" too (via
    // `category || "Other"`), not just one literally categorized "Other" --
    // so its bar's total includes both, and this filter has to match both
    // to actually show what that bar counted, not silently drop the
    // uncategorized half. Scoped to the same types those aggregations
    // actually sum (expense, or income/refund/investment_return) -- every
    // OTHER type (transfer, receivable/payable, investment_buy, a gam3ya
    // installment, a reversal marker...) never carries a category at all
    // either, but was never counted into that bar's total, so a bare
    // `!r.category` on its own would sweep in unrelated transactions the
    // "Other" bar never claimed to represent.
    // Real bug, found by inspection: an uncategorized expense and an
    // uncategorized income both fall into "Other" (the same category ||
    // "Other" logic above applies to both catMap and srcMap), so without
    // knowing which side's bar was actually tapped, this used to show
    // both kinds mixed together -- more than that one bar's own total
    // ever counted. F.categoryKind (set by viewCategoryTx() -- see there)
    // narrows "Other" to just the side that was clicked; falls back to
    // matching both when it's unset (typing "Other" in by hand, or a
    // manual dropdown pick, has no specific bar to disambiguate from).
    const otherTypesByKind = { expense: ["expense"], income: ["income", "refund", "investment_return"] };
    // Single source of truth for "every type any bar's total ever sums" --
    // both the actual filter match below and the "does 'Other' even belong
    // in the dropdown" check further down derive from this instead of each
    // repeating the same type list (and risking the two drifting apart).
    const anyCatBucketType = otherTypesByKind.expense.concat(otherTypesByKind.income);
    const catBucketTypes = otherTypesByKind[F.categoryKind] || anyCatBucketType;
    if (F.category !== "all") rows = rows.filter(r => F.category === "Other" ? (catBucketTypes.includes(r.type) && !r.category) : r.category === F.category);
    if (F.q.trim()) { const q = F.q.toLowerCase(); rows = rows.filter(r => [r.desc, r.category, typeLabels[r.type], app.personName(r.personId), app.accName(r.accountId), app.accName(r.fromId), app.accName(r.toId), (r.tags || []).join(" ")].join(" ").toLowerCase().includes(q)); }
    const total = rows.length;
    const visible = rows.slice(0, S.txVisible);
    const items = visible.map(r => Object.assign({ r }, this.txSign(r)));
    const tagChips = (r) => this.txTagChips(r);
    const rowActions = (r) => this.txRowActions(r);

    const table = '<div class="table-wrap desktop-only"><table class="table"><thead><tr>' +
      "<th>" + esc(t.date) + "</th><th>" + esc(t.type) + "</th><th>" + esc(t.details) + "</th><th>" + esc(t.person) + "</th><th>" + esc(t.account) + "</th><th class=\"num\">" + esc(t.amount) + "</th><th></th>" +
      "</tr></thead><tbody>" + items.map(({ r, isIn, isTransferLike, amtTxt, acc, accColors, tone }) =>
        '<tr style="' + (r.void ? "opacity:.45;text-decoration:line-through" : "") + '">' +
          "<td>" + r.date + "</td>" +
          '<td><span class="tag ' + (isIn ? "tag-pos" : isTransferLike ? "tag-neu" : "tag-neg") + '">' + esc(typeLabels[r.type] || r.type) + "</span></td>" +
          "<td>" + esc(r.desc || "—") + this.firstCatBadgeHtml(r, firstCatIds) + tagChips(r) + "</td>" +
          "<td>" + esc(r.personId ? app.personName(r.personId) : "—") + "</td>" +
          "<td>" + (accColors || []).map(c => '<span class="tx-acc-dot" style="background:' + c + '"></span>').join("") + esc(acc) + "</td>" +
          '<td class="num ' + tone + '">' + amtTxt + "</td>" +
          "<td>" + rowActions(r) + "</td>" +
        "</tr>"
      ).join("") + "</tbody></table></div>";

    // A categorized row gets the same colored left accent the "avg spend by
    // category" summary card already uses elsewhere (categoryColor) --
    // uncategorized rows (transfers, statement payments, plain loans...)
    // stay plain rather than all getting a "neutral" bar that would imply
    // they're categorized-as-nothing instead of just not applicable.
    // Swipe-to-reveal (Edit/Delete) is additive, not a replacement for
    // rowActions() below it -- "reverse" and "Duplicate" have no swipe slot
    // of their own, and swipe itself is undiscoverable for anyone who
    // doesn't think to try it, so the full link row stays exactly as it
    // was. Only a row app.txEditable() actually allows editing/deleting
    // gets the swipe wrapper at all -- one that doesn't (already reversed,
    // or a kind with no edit form) would reveal actions that do nothing.
    // Extracted into its own method (real behavior preserved exactly, same
    // output) so txGroupRowHtml() below can render each member of an
    // expanded "similar transactions" group with the identical markup a
    // plain ungrouped row gets, instead of a second near-duplicate copy.
    const cardRow = (item) => this.txCardRowHtml(item, firstCatIds, typeLabels, t);
    // "Group similar" (mobile only -- see toggleGroupTx()'s own comment for
    // why): off by default, so the plain flat list below is completely
    // unchanged unless the user turns it on.
    const cardItems = S.groupTx ? this.groupTxItems(items) : items.map(item => ({ single: item }));
    // 35 (Transactions Recut): a plain date-section header before the
    // first card of each new calendar day, so a long scroll has an actual
    // sense of "where am I in time" instead of one unbroken chain of
    // cards. `items` (and so `cardItems` when S.groupTx is off) is already
    // sorted newest-first (this function's own initial sort above), so
    // this only has to watch for the date changing between consecutive
    // entries. Skipped entirely while S.groupTx is on -- every entry here
    // is `.single` only in the branch above that populates it that way, so
    // this never runs against a similarity-group, which can legitimately
    // span several different real dates (that's the whole point of the
    // toggle) and so has no single date left to head a section with.
    let lastTxDate = null;
    const cards = '<div class="card-list mobile-only">' + cardItems.map(entry => {
      const row = entry.single ? cardRow(entry.single) : this.txGroupRowHtml(entry.group, cardRow);
      // cardItems is only ever a mix of .single/.group entries when
      // S.groupTx is on (see the ternary above) -- when it's off every
      // entry is .single, so `!entry.single` alone would never fire there;
      // S.groupTx is the only real guard needed.
      if (S.groupTx) return row;
      const header = entry.single.r.date !== lastTxDate ? '<div class="tx-date-header">' + esc(this.txDateGroupLabel(entry.single.r.date)) + "</div>" : "";
      lastTxDate = entry.single.r.date;
      return header + row;
    }).join("") + "</div>";

    const loadMore = total > S.txVisible ? '<button class="btn btn-secondary block" onclick="UI.loadMoreTx()">' + esc(t.loadMore) + " (" + (total - S.txVisible) + ")</button>" : "";

    const typeOptions = ["all"].concat(Object.keys(typeLabels)).map(k => '<option value="' + k + '"' + (F.type === k ? " selected" : "") + ">" + (k === "all" ? esc(app.L("All types")) : esc(typeLabels[k])) + "</option>").join("");
    const accOptions = ["all"].concat(d.accounts.map(a => a.id)).map(id => '<option value="' + id + '"' + (F.account === id ? " selected" : "") + ">" + (id === "all" ? esc(app.L("All accounts")) : esc(app.accName(id))) + "</option>").join("");
    const presetOptions = [["all", app.L("All time")], ["today", app.L("Today")], ["week", app.L("Last 7 days")], ["month", app.L("Last 30 days")], ["quarter", app.L("Last 90 days")], ["year", app.L("Last 12 months")]]
      .map(([k, l]) => '<option value="' + k + '"' + (F.preset === k ? " selected" : "") + ">" + esc(l) + "</option>").join("");
    // Every distinct category actually in use, income and expense both
    // (this list is data-driven, not FORMS()' own built-in+custom lists,
    // so it never needs to know which kind a name belongs to and can't
    // drift out of sync with what's really in the ledger) -- plus F.category
    // itself, in case a transaction still carries a category that's since
    // been deleted from Settings (deleteCategory has no in-use guard), so
    // that filter doesn't silently vanish out from under an active view.
    const catSet = new Set(d.tx.map(x => x.category).filter(Boolean));
    // "Other" itself needs adding explicitly if it's only ever implicit --
    // a transaction with no category set at all is real and filterable
    // (see the F.category === "Other" special-case above), even when
    // nothing happens to carry the literal string "Other".
    // Unscoped by F.categoryKind on purpose -- whether "Other" belongs in
    // the dropdown at all shouldn't depend on which bar (if any) got the
    // user here; that narrowing only matters for the actual filter match
    // above, once "Other" is the thing being filtered on.
    if (d.tx.some(x => anyCatBucketType.includes(x.type) && !x.category)) catSet.add("Other");
    if (F.category !== "all") catSet.add(F.category);
    const catOptions = ["all"].concat([...catSet].sort((a, b) => a.localeCompare(b))).map(c => '<option value="' + esc(c) + '"' + (F.category === c ? " selected" : "") + ">" + (c === "all" ? esc(app.L("All categories", "كل الفئات")) : esc(c)) + "</option>").join("");
    // 47 (People Recut): a real dropdown for it, same as accOptions above
    // -- both what UI.viewPersonTx() sets when tapping a person's own
    // "Transactions" link, and a real, manually-pickable filter that never
    // existed here at all before. A person who can be deleted was never
    // party to any transaction to begin with (personHasRecords guards it),
    // so unlike F.category there's no "since-deleted person still on an
    // old row" case this dropdown needs to defend against.
    const personOptions = ["all"].concat(d.people.map(p => p.id)).map(id => '<option value="' + id + '"' + (F.person === id ? " selected" : "") + ">" + (id === "all" ? esc(app.L("All people", "كل الأشخاص")) : esc(app.personName(id))) + "</option>").join("");

    // 32 (Transactions Recut): search stays in its own always-visible row
    // -- the one filter reached for without first deciding to "go filter
    // something" -- while the 4 structural dropdowns collapse behind
    // .filters-toggle (mobile only; forced back open on desktop by that
    // class's own CSS regardless of `collapsed`, see app.css). Was FIRST
    // built collapsing all 5 filters together, including search, but that
    // broke every test (and, worse, every real use) that reaches straight
    // for search without first expanding anything -- redesigned to this
    // split instead of just patching the tests around the worse UX.
    // .filter-count badges how many of the 4 dropdowns are actually
    // narrowed from "all", so what's collapsed is never a total mystery.
    const activeFilterCount = ["type", "account", "preset", "category", "person"].filter(k => F[k] !== "all").length;
    const searchRow = '<div class="tx-search-row">' +
      '<input id="txSearch" class="input" type="search" placeholder="' + esc(t.search) + '" value="' + esc(F.q) + '" oninput="UI.setFilter(\'q\', this.value)">' +
      '<button type="button" class="btn btn-secondary filters-toggle mobile-only" aria-expanded="' + (this._txFiltersOpen ? "true" : "false") + '" onclick="UI.toggleTxFilters()">' + esc(app.L("Filters", "الفلاتر")) + (activeFilterCount ? '<span class="filter-count">' + activeFilterCount + "</span>" : "") + "</button>" +
    "</div>";
    const filters = '<div class="filter-row' + (this._txFiltersOpen ? "" : " collapsed") + '">' +
      '<select class="input" onchange="UI.setFilter(\'type\', this.value)">' + typeOptions + "</select>" +
      '<select class="input" onchange="UI.setFilter(\'account\', this.value)">' + accOptions + "</select>" +
      '<select class="input" onchange="UI.setFilter(\'preset\', this.value)">' + presetOptions + "</select>" +
      // categoryKind reset alongside it -- a manual pick from this
      // dropdown has no specific bar to disambiguate "Other" from, and
      // shouldn't silently inherit a stale kind left over from an earlier
      // bar tap (see viewCategoryTx()/the "Other" scoping above).
      '<select class="input" onchange="UI.setFilters({categoryKind:\'\',category:this.value})">' + catOptions + "</select>" +
      '<select class="input" style="grid-column:1/-1" onchange="UI.setFilter(\'person\', this.value)">' + personOptions + "</select>" +
    "</div>";
    // Mobile-only (see toggleGroupTx()'s own comment for why); this
    // checkbox doesn't touch `filt` at all, so it survives a filter change
    // that would otherwise reset an unrelated view option along with it.
    const groupToggle = '<label class="group-tx-toggle mobile-only"><input type="checkbox" ' + (S.groupTx ? "checked" : "") + ' onchange="UI.toggleGroupTx()"><span>' + esc(app.L("Group similar", "تجميع المتشابه")) + "</span></label>";
    // Same trigger as the scoped metrics row (UI.renderMetricsRow) --
    // filtered down to exactly one account. `rows` here (not `visible`) is
    // this page's own already-filtered set before pagination slicing, so
    // the timeline reflects every active filter (type/date/search), same
    // as the count in "N records match your filters" below.
    const timeline = F.account !== "all" ? this.renderAccountTimeline(rows, F.account) : "";

    return this.tabHeader(t.transactions, total + app.L(" records match your filters", " حركة مطابقة للفلاتر"),
      [[t.aIncome, "UI.openModal('income')"], [t.aTransfer, "UI.openModal('transfer')"]]) +
      timeline + searchRow + filters + groupToggle + (total ? table + cards + loadMore : this.emptyState(ICON_SEARCH, t.noMatches, app.L("Try a different search or clear a filter above.", "جرب بحث تاني أو امسح فلتر من فوق.")));
  },

  // ---- People ----------------------------------------------------------------
  // Relation/color, same idea as an account's color+card-face: a fallback
  // ("other" relation, its default color) covers every person saved before
  // this existed, so nobody's real data shows up broken -- just untagged
  // until they open Edit and pick one.
  personRelation(p) { return this.app.relationTypes().find(r => r.v === (p.relation || "other")) || this.app.relationTypes()[this.app.relationTypes().length - 1]; },
  personColor(p) { return p.color || this.personRelation(p).color; },
  // Same customizer the account cards already have -- cardBackground()/
  // cardTextColor() only ever read .color/.color2/.pattern/.textColor
  // generically, nothing account-specific, so they work unchanged on a
  // person too. personColor(p)'s own relation-default fallback still
  // applies for the primary color specifically (a person with no color2/
  // pattern set yet still renders exactly as before -- a plain circle in
  // their relation's color).
  personAvatar(p, size) {
    const initial = (p.name || "?").trim().charAt(0).toUpperCase() || "?";
    const norm = Object.assign({}, p, { color: this.personColor(p) });
    return '<span class="person-avatar' + (size ? " " + size : "") + '" style="background:' + this.cardBackground(norm) + ';color:' + this.cardTextColor(norm) + '">' + esc(initial) + "</span>";
  },
  personTag(p) {
    const rt = this.personRelation(p);
    return '<span class="person-tag">' + rt.icon + " " + esc(rt.l) + "</span>";
  },
  // 46 (People Recut): tel:/wa.me links next to a person's phone number,
  // wherever it's shown (People list, Person Detail) -- previously plain
  // text with no way to reach out from inside the app at all, on a page
  // whose whole point is tracking money owed to/by real people. No
  // WhatsApp logo (trademarked, same "no bank logos" reasoning
  // cardBackground() already gives for account tiles) -- a generic
  // message-circle icon plus the "Message" label makes the wa.me intent
  // clear without it.
  personPhoneLinks(phone) {
    const digits = (phone || "").replace(/\D/g, "");
    if (!digits) return "";
    // Egyptian mobile numbers are stored locally (e.g. "0100 111 2233") --
    // wa.me's deep link needs the international form (leading 0 dropped,
    // country code 20 prepended); tel: works fine with the local digits
    // exactly as stored, so only the WhatsApp link needs this adjustment.
    const intl = digits.replace(/^0/, "20");
    return '<a class="phone-link" href="tel:' + digits + '" aria-label="' + esc(this.app.L("Call", "اتصال")) + '">' + svgIcon("M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z", 15) + "</a>" +
      '<a class="phone-link" href="https://wa.me/' + intl + '" target="_blank" rel="noopener" aria-label="' + esc(this.app.L("Message", "مراسلة")) + '">' + svgIcon("M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z", 15) + "</a>";
  },
  // 44 (People Recut): "when did anything last actually happen with this
  // person" -- the exact same r.personId query Person Detail's own
  // historyTx already uses (see renderPersonDetail()'s comment on that),
  // just reduced to its single most recent date instead of the full list,
  // so the People list itself can surface which relationships are still
  // active at a glance without opening each one.
  personLastActivityText(personId) {
    const app = this.app;
    const tx = app.state.data.tx.filter(x => x.personId === personId);
    if (!tx.length) return "";
    const latest = tx.reduce((a, x) => (x.date > a ? x.date : a), tx[0].date);
    const daysAgo = Math.round((new Date(app.today()) - new Date(latest)) / 86400000);
    if (daysAgo <= 0) return app.L("Active today", "نشط النهاردة");
    if (daysAgo === 1) return app.L("Active yesterday", "نشط إمبارح");
    if (daysAgo < 30) return app.L(daysAgo + "d ago", "من " + daysAgo + " يوم");
    return app.L("Last active ", "آخر نشاط ") + app.dshort(latest);
  },
  renderPeople(D, t) {
    const app = this.app, S = app.state, d = app.state.data;
    const rows = d.people.map(p => {
      const planIn = D.plans.filter(x => x.personId === p.id && x.direction === "in").reduce((s, x) => s + x.remaining, 0);
      const planOut = D.plans.filter(x => x.personId === p.id && x.direction === "out").reduce((s, x) => s + x.remaining, 0);
      const r = Math.max(0, D.recv[p.id] || 0) + planIn, y = Math.max(0, D.pay[p.id] || 0) + planOut;
      return { p, r, y, net: r - y };
    }).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    // 42 (People Recut): name/phone/notes search -- its own S.peopleQ, not
    // Transactions' filt.q, so searching here never leaks into (or gets
    // clobbered by) an unrelated search left over on the Transactions page.
    const q = (S.peopleQ || "").trim().toLowerCase();
    const filteredRows = !q ? rows : rows.filter(row => (row.p.name + " " + (row.p.phone || "") + " " + (row.p.notes || "")).toLowerCase().includes(q));
    const searchRow = '<div class="tx-search-row"><input class="input" type="search" placeholder="' + esc(app.L("Search people…", "دور على شخص…")) + '" value="' + esc(S.peopleQ || "") + '" oninput="UI.setPeopleQuery(this.value)"></div>';

    // 43 (People Recut): counts, not amounts -- the total owed to/by me
    // already has a real home on Dashboard's own position tiles, so
    // repeating that same figure here would just be a duplicate. What
    // Dashboard *doesn't* answer is "how many relationships", which this
    // does at a glance without counting cards by hand. Counted from
    // filteredRows (real bug caught in review: counting from the
    // unfiltered `rows` instead left this tile silently disagreeing with
    // the actual list below it while a search was narrowing it down).
    const owingMeCount = filteredRows.filter(row => row.net > 0.001).length;
    const owedByMeCount = filteredRows.filter(row => row.net < -0.001).length;
    const settledCount = filteredRows.length - owingMeCount - owedByMeCount;
    const summaryTile = !filteredRows.length ? "" : '<div class="tile-grid" style="margin-bottom:10px">' +
      '<div class="pos-tile"><div class="pos-label">' + esc(app.L("People who owe me", "ناس ليّا عندهم")) + '</div><div class="pos-value tone-pos">' + owingMeCount + "</div></div>" +
      '<div class="pos-tile"><div class="pos-label">' + esc(app.L("People I owe", "ناس عليّا لهم")) + '</div><div class="pos-value tone-neg">' + owedByMeCount + "</div></div>" +
      '<div class="pos-tile"><div class="pos-label">' + esc(app.L("Settled", "متسددين")) + '</div><div class="pos-value">' + settledCount + "</div></div>" +
    "</div>";

    // 45 (People Recut): a fully-settled person (net effectively zero) is
    // permanently taking up the same visual space as one with real money
    // still on the line -- collapsed by default (mobile only, see #44's
    // own mobile-only scoping below for the same "this user's own usage is
    // 100% mobile" reasoning), same "+N more"/expand-on-demand pattern
    // Dashboard's own Needs Attention already established (idea 25). A
    // search in progress always shows them uncollapsed -- hiding a person
    // you just searched for by name because they happen to be settled
    // would be actively unhelpful, not tidy.
    const activeRows = filteredRows.filter(row => Math.abs(row.net) > 0.001);
    const settledRows = filteredRows.filter(row => Math.abs(row.net) <= 0.001);
    const settledCollapsed = !q && !this._peopleSettledExpanded && settledRows.length > 0;

    // "Add a balance for this person" — this is just the existing
    // receivable/payable form pre-filled with who it's for, reachable
    // directly from the person instead of only from Receivables & Payables.
    // Same form, same fields (amount, date, description) — nothing new to
    // learn, and it now leaves "due" blank by default, so an indefinite
    // opening position doesn't get flagged overdue tomorrow.
    // Real gap this closes: "Repay"/"Collect" used to only be reachable
    // through a Needs Attention alert — which (correctly, after the
    // due-date fix above) never fires for an open-ended balance with no due
    // date. That left no way at all to pay down something like a family
    // loan you deliberately never gave a due date. Now they're always here
    // whenever there's an actual balance to settle, regardless of due date.
    // 41 (People Recut): "+ Lend"/"+ Debt"/Edit/Delete moved off this
    // always-visible row into the shared "..." sheet (see
    // renderPersonActionSheet()) -- Pay/Collect are the one action common
    // enough to keep right here.
    const primaryAction = ({ p, r, y }) =>
      (y > 0 ? '<button class="btn btn-primary small" onclick="UI.openModal(\'debt_payment\',{personId:\'' + p.id + '\'})">' + esc(t.pay) + "</button>" : "") +
      (r > 0 ? '<button class="btn btn-primary small" onclick="UI.openModal(\'receivable_payment\',{personId:\'' + p.id + '\'})">' + esc(t.collect) + "</button>" : "") +
      '<button type="button" class="link-btn small person-more-btn" aria-haspopup="true" aria-label="' + esc(app.L("More actions", "إجراءات تانية")) + '" onclick="UI.openPersonActions(\'' + p.id + '\')">' + svgIcon("M12 6h.01M12 12h.01M12 18h.01", 18) + "</button>";

    const table = '<div class="table-wrap desktop-only"><table class="table"><thead><tr>' +
      "<th>" + esc(t.name) + "</th><th>" + esc(t.phone) + "</th><th class=\"num\">" + esc(t.owesMe) + "</th><th class=\"num\">" + esc(t.iOwe) + "</th><th class=\"num\">" + esc(t.net) + "</th><th></th>" +
      // Desktop table shows every matching person, settled included, no
      // collapse -- out of scope for now, this user's own usage is 100%
      // mobile (same call the Transactions Recut made for its own #33).
      "</tr></thead><tbody>" + filteredRows.map((row) => { const { p, r, y, net } = row;
        return "<tr><td><div class=\"person-id\">" + this.personAvatar(p, "sm") + "<button class=\"link-btn\" onclick=\"UI.viewPerson('" + p.id + "')\">" + esc(p.name) + "</button></div></td><td>" + esc(p.phone || "—") + '</td><td class="num tone-pos">' + app.fmt(r) + '</td><td class="num tone-neg">' + app.fmt(y) + '</td><td class="num ' + (net >= 0 ? "tone-pos" : "tone-neg") + '">' + app.fmt(net) + "</td>" +
        '<td><button class="link-btn small" onclick="UI.viewPersonTx(\'' + p.id + '\')">' + esc(t.viewTx) + "</button>" + primaryAction(row) + "</td></tr>";
      }).join("") + "</tbody></table></div>";

    const cardHtml = (row) => { const { p, r, y, net } = row;
      const lastActivity = this.personLastActivityText(p.id);
      return '<div class="card-row person-card" style="border-inline-start:4px solid ' + this.personColor(p) + '"><div class="card-row-top"><div class="person-id">' + this.personAvatar(p) + '<div><button class="link-btn card-row-title" onclick="UI.viewPerson(\'' + p.id + '\')">' + esc(p.name) + '</button><div class="card-row-sub">' + this.personTag(p) + (p.phone ? " · " + esc(p.phone) + this.personPhoneLinks(p.phone) : "") + "</div></div></div>" +
      '<div class="card-row-amt ' + (net >= 0 ? "tone-pos" : "tone-neg") + '">' + app.fmt(net) + "</div></div>" +
      '<div class="card-row-meta"><span>' + esc(t.owesMe) + ": " + app.fmt(r) + '</span><span>' + esc(t.iOwe) + ": " + app.fmt(y) + "</span>" + (lastActivity ? "<span>" + esc(lastActivity) + "</span>" : "") + "</div>" +
      '<div class="btn-row wrap"><button class="link-btn small" onclick="UI.viewPersonTx(\'' + p.id + '\')">' + esc(t.viewTx) + "</button>" + primaryAction(row) + "</div></div>";
    };
    const cards = '<div class="card-list mobile-only">' + activeRows.map(cardHtml).join("") + "</div>";
    const settledSection = !settledRows.length ? "" :
      (settledCollapsed
        ? '<button class="btn btn-secondary block mobile-only" onclick="UI.togglePeopleSettled()">' + esc(app.L(settledRows.length + " settled", settledRows.length + " متسدد")) + "</button>"
        : '<h2 class="section-title mobile-only">' + esc(app.L("Settled", "متسدد")) + '</h2><div class="card-list mobile-only">' + settledRows.map(cardHtml).join("") + "</div>");

    return this.tabHeader(t.people, d.people.length + app.L(" people · balances computed from the ledger", " شخص · الأرصدة محسوبة من السجل"), [[t.aPerson, "UI.openModal('person')"]]) +
      summaryTile + searchRow + table + cards + settledSection;
  },

  // ---- Person detail (everything tied to one person, in one place) --------
  // The gap this closes: a person can carry a plain loan *and* an
  // installment plan *and* money held in trust all at once (e.g. Dad: a
  // normal loan, an amanah with no due date, and a phone bought on
  // installments) — before this, seeing the whole picture meant checking
  // Receivables & Payables and Installments separately and adding it up by
  // hand. Gam3eya groups are deliberately not shown here: a group isn't
  // tied to a specific person in the data model (see FORMS().group) — it's
  // a circle you participate in, not a per-person balance.
  renderPersonDetail(D, t) {
    const app = this.app, S = app.state, d = app.state.data;
    const p = d.people.find(x => x.id === S.personDetailId);
    if (!p) { S.page = "people"; return this.renderPeople(D, t); }

    const planIn = D.plans.filter(x => x.personId === p.id && x.direction === "in");
    const planOut = D.plans.filter(x => x.personId === p.id && x.direction === "out");
    const r = Math.max(0, D.recv[p.id] || 0) + planIn.reduce((s, x) => s + x.remaining, 0);
    const y = Math.max(0, D.pay[p.id] || 0) + planOut.reduce((s, x) => s + x.remaining, 0);
    const net = r - y;

    // .hero-card.alt -- same page-level "headline number" treatment
    // Forecast/Cash Flow already give their own single most important
    // figure (not the fixed-dark .hero-card, that's reserved for the one
    // app-wide money hero on Dashboard). Net becomes the headline since
    // it's the one number that answers "where do things stand with this
    // person" at a glance; Owes me/I owe move into the sub-row underneath,
    // same layout Dashboard's own hero-sub-row already uses.
    const summary = '<div class="hero-card alt">' +
      '<div class="hero-label">' + esc(t.net) + '</div>' +
      '<div class="hero-value ' + (net >= 0 ? "tone-pos" : "tone-neg") + '">' + app.fmt(net) + "</div>" +
      '<div class="hero-sub-row">' +
        '<div><div class="hero-sub-label">' + esc(t.owesMe) + '</div><div class="hero-sub-value tone-pos">' + app.fmt(r) + "</div></div>" +
        '<div><div class="hero-sub-label">' + esc(t.iOwe) + '</div><div class="hero-sub-value tone-neg">' + app.fmt(y) + "</div></div>" +
      "</div>" +
    "</div>";

    // Every open plain loan/amanah row this person is party to, either
    // direction, oldest first (loanRows() is already FIFO-ordered) — each
    // with its own Edit/Delete via the Transactions tab if it was a mistake,
    // but settled right from here via Pay/Collect on the section below.
    const loanSection = (kind, label) => {
      const rows = app.loanRows(p.id, kind).filter(row => row.rem > 0.001);
      if (!rows.length) return "";
      const items = rows.map(row => {
        const dueTxt = !row.due ? "" : (row.status === "overdue" ? app.L("Overdue since ") + row.due : app.L("Due ") + row.due);
        return '<div class="card-row"><div class="card-row-top"><div><div class="card-row-title">' + esc(row.desc || "—") + '</div><div class="card-row-sub">' + row.date + (dueTxt ? " · " + esc(dueTxt) : "") + "</div></div>" +
          '<div class="card-row-amt ' + (row.status === "overdue" ? "tone-neg" : "") + '">' + app.fmt(row.rem) + "</div></div></div>";
      }).join("");
      return '<h2 class="section-title" style="margin-top:20px">' + esc(label) + '</h2><div class="card-list">' + items + "</div>";
    };

    const planSection = (plans, label) => {
      if (!plans.length) return "";
      // Same installment_payment modal handles both directions everywhere
      // else (Installments tab shows it unconditionally) — a plan someone
      // owes *me* on still needs a way to record their payment from here too.
      const items = plans.map(pl =>
        '<div class="card-row"><div class="card-row-top"><div><div class="card-row-title">' + esc(pl.title) + '</div><div class="card-row-sub">' + esc(t.remaining) + ": " + app.fmt(pl.remaining) + " / " + app.fmt(pl.total) + "</div></div>" +
        '<div class="card-row-amt">' + app.fmt(pl.remaining) + "</div></div>" +
        (pl.remaining > 0.001 ? '<button class="btn btn-secondary small" onclick="UI.openModal(\'installment_payment\',{planId:\'' + pl.id + '\'})">' + esc(t.recordPayment) + "</button>" : "") +
        "</div>"
      ).join("");
      return '<h2 class="section-title" style="margin-top:20px">' + esc(label) + '</h2><div class="card-list">' + items + "</div>";
    };

    // History -- every transaction actually carrying this person's id, most
    // recent first. The sections above only ever show what's still OPEN (an
    // unsettled loan row, a plan's remaining schedule) -- the collection/
    // repayment transaction itself, or a loan already fully settled, never
    // appeared anywhere on this page even though it's unmistakably this
    // person's. Real bug this closes: recording a collection correctly
    // updated the balance and showed up in the main Transactions tab, but
    // was invisible here on the one page that's supposed to be "everything
    // tied to this person." Same Edit/Delete/Duplicate/Reverse wiring
    // Transactions itself uses (see txRowActions), so a mistake can be
    // corrected right from here too.
    const typeLabels = this.txTypeLabels();
    const historyTx = d.tx.filter(x => x.personId === p.id).sort((a, b) => a.date < b.date ? 1 : (a.date > b.date ? -1 : 0));
    const historyRows = historyTx.map(x => {
      const s = this.txSign(x);
      // Same account-color dots Transactions' own rows get (idea 34) --
      // txSign() already computes accColors for every caller, this one just
      // wasn't reading it (real bug caught in review: History silently
      // never got the dots despite sharing the exact same helper).
      const accDots = (s.accColors || []).map(c => '<span class="tx-acc-dot" style="background:' + c + '"></span>').join("");
      return '<div class="card-row' + (x.void ? " voided" : "") + '">' +
        '<div class="card-row-top"><div><div class="card-row-title">' + esc(x.desc || "—") + '</div><div class="card-row-sub">' + x.date + " · " + esc(typeLabels[x.type] || x.type) + "</div></div>" +
        '<div class="card-row-amt ' + s.tone + '">' + s.amtTxt + "</div></div>" +
        '<div class="card-row-meta"><span>' + accDots + esc(s.acc) + "</span></div>" +
        this.txTagChips(x) +
        this.txRowActions(x) +
        "</div>";
    }).join("");
    const historySection = historyTx.length ? '<h2 class="section-title" style="margin-top:20px">' + esc(t.history) + '</h2><div class="card-list">' + historyRows + "</div>" : "";

    // 41 (People Recut): "+ Lend"/"+ Debt"/Edit/Delete moved off this
    // always-visible row into the shared "..." trigger opening
    // UI.renderPersonActionSheet() (same sheet the People list itself now
    // uses) -- Pay/Collect stay right here, same reasoning as there.
    const actions = '<div class="btn-row wrap">' +
      (y > 0 ? '<button class="btn btn-primary small" onclick="UI.openModal(\'debt_payment\',{personId:\'' + p.id + '\'})">' + esc(t.pay) + "</button>" : "") +
      (r > 0 ? '<button class="btn btn-primary small" onclick="UI.openModal(\'receivable_payment\',{personId:\'' + p.id + '\'})">' + esc(t.collect) + "</button>" : "") +
      '<button type="button" class="link-btn small person-more-btn" aria-haspopup="true" aria-label="' + esc(app.L("More actions", "إجراءات تانية")) + '" onclick="UI.openPersonActions(\'' + p.id + '\')">' + svgIcon("M12 6h.01M12 12h.01M12 18h.01", 18) + "</button>" +
    "</div>";

    const backBtn = '<button class="link-btn small" onclick="UI.setPage(\'people\')">← ' + esc(t.people) + "</button>";
    const sub = this.personTag(p) + " · " + (p.phone ? esc(p.phone) + this.personPhoneLinks(p.phone) : esc(app.L("No phone on file", "مفيش رقم متسجل"))) + (p.notes ? " · " + esc(p.notes) : "");
    // Same avatar as the People list, just bigger -- a colored header
    // instead of the plain "Hazem" / "Sameh Hassan" title every person used
    // to share the exact same look under.
    const header = '<div class="tab-head"><div class="person-id">' + this.personAvatar(p, "lg") +
      '<div><h1 class="tab-title">' + esc(p.name) + '</h1><div class="tab-sub">' + sub + "</div></div></div></div>";

    return backBtn + header + summary + actions +
      loanSection("receivable", app.L("Loans owed to me", "سلف ليّا")) +
      loanSection("payable", app.L("Loans I owe", "ديون عليّا")) +
      planSection(planIn, app.L("Installment plans owed to me", "أقساط ليّا")) +
      planSection(planOut, app.L("Installment plans I owe", "أقساط عليّا")) +
      historySection +
      (!r && !y && !planIn.length && !planOut.length && !historyTx.length ? '<div style="margin-top:16px">' + this.emptyState(ICON_PLUS, app.L("Nothing recorded yet", "لسه مفيش حاجة متسجلة"), app.L("A loan, an installment plan or a transaction with this person will show up here.", "أي دين أو خطة تقسيط أو حركة مع الشخص ده هتظهر هنا.")) + "</div>" : "");
  },

  // ---- Installments (P1 KPI quirk intentionally preserved) -----------------
  // Shared by Installments and Savings groups -- they draw the exact same
  // "Due this month" figure (see duesThisMonth()'s own "P1 KPI quirk"
  // comment), so fixing the breakdown on only one of them would just be a
  // second copy of the same bug (a real gap found while touching the
  // Groups page: its own banner was still missing the breakdown
  // Installments Recut #56 added). Whichever page this is called from
  // gets its own half as plain text and the *other* half as a link to
  // where it actually lives -- linking to the page you're already on
  // would be pointless.
  dueThisMonthBanner(D) {
    const app = this.app, S = app.state;
    const due = app.duesThisMonth(D);
    const instText = app.fmt(due.installments);
    const instPart = S.page === "installments" ? instText : '<button class="inline-link" onclick="UI.setPage(\'installments\')">' + instText + "</button>";
    const groupsText = app.fmt(due.groups);
    const groupsPart = S.page === "groups" ? groupsText : '<button class="inline-link" onclick="UI.setPage(\'groups\')">' + groupsText + "</button>";
    // Real bug caught in review: gating this on BOTH halves being nonzero
    // reintroduced the exact "mystery total" #56 was written to fix,
    // whenever the *other* page's share alone was the entire total (e.g.
    // 0 installments due, 3,000 gam3eya due -- Installments' own total
    // line would show "3,000" while its own plans list explains none of
    // it). The breakdown only needs the *other* page's share to be
    // nonzero -- if it's 0, this page's own number already IS the total.
    const otherAmt = S.page === "groups" ? due.installments : due.groups;
    const dueBreakdown = otherAmt > 0.001 ? '<div class="card-row-sub" style="margin-top:4px">' +
      esc(app.L("Installments: ", "أقساط: ")) + instPart + esc(app.L(" · Gam3eya: ", " · جمعيات: ")) + groupsPart + "</div>" : "";
    return '<div class="due-banner"><div class="pos-label">' + esc(app.L("Due this month (installments + gam3eya)", "المطلوب مني الشهر ده (أقساط + جمعيات)")) + '</div><div class="hero-sub-value tone-neg" style="font-size:22px">' + app.fmt(due.total) + "</div>" + dueBreakdown + "</div>";
  },
  renderInstallments(D, t) {
    const app = this.app;
    // P1 fix: the KPI strip used to only cover plans "owed to me" and quietly
    // dropped any "I owe" plan from every number, including Overdue — now
    // both directions get their own honestly-labeled row.
    const inPlans = D.plans.filter(p => p.direction === "in");
    const outPlans = D.plans.filter(p => p.direction === "out");
    const kpiGroup = (plans, totalTone, dueLabel) => {
      const kpis = [
        [app.L("Total"), app.fmt(plans.reduce((s, p) => s + p.total, 0)), "neu"],
        [dueLabel, app.fmt(plans.reduce((s, p) => s + p.collected, 0)), "pos"],
        [t.remaining, app.fmt(plans.reduce((s, p) => s + p.remaining, 0)), totalTone],
        [app.L("Overdue"), app.fmt(plans.reduce((s, p) => s + p.overdueAmt, 0)), "neg"]
      ];
      return '<div class="tile-grid four">' + kpis.map(([l, v, tone]) => '<div class="pos-tile"><div class="pos-label">' + esc(l) + '</div><div class="pos-value tone-' + tone + '">' + v + "</div></div>").join("") + "</div>";
    };
    const dueBanner = this.dueThisMonthBanner(D);
    // 49: a direction with no plans at all used to still show a full,
    // all-zero KPI section under its own header -- pure clutter, nothing
    // to act on.
    const groupSection = (plans, label, dueLabel) => !plans.length ? "" :
      '<h2 class="section-title">' + esc(label) + " · " + app.fmt(plans.reduce((s, p) => s + p.remaining, 0)) + "</h2>" + kpiGroup(plans, "neg", dueLabel);
    const kpiRow = dueBanner + groupSection(inPlans, t.receivables, t.collected) + groupSection(outPlans, t.payables, t.paid);

    // 55: most urgent first -- any plan carrying an overdue row, then by
    // its own next due date soonest-first, the same "surface what needs
    // attention first" convention Dashboard and People already apply.
    const byUrgency = (a, b) => (b.overdue > 0) - (a.overdue > 0) || (a.next ? a.next.due : "9999-99").localeCompare(b.next ? b.next.due : "9999-99");
    const sortedPlans = D.plans.slice().sort(byUrgency);
    // 53: a fully-paid-off plan stays in state.data.plans forever (nothing
    // ever archives it) -- collapsing it out of the way by default, the
    // same "N settled" pattern People's own list already established,
    // keeps the active list from filling up with years-old finished plans.
    const activePlans = sortedPlans.filter(p => p.remaining > 0.001);
    const completedPlans = sortedPlans.filter(p => p.remaining <= 0.001);
    const completedCollapsed = !this._plansCompletedExpanded && completedPlans.length > 0;

    const planCard = (p) => {
      const open = app.state.openPlan === p.id;
      const rowsHtml = p.rows.map(r => {
        // 57: an overdue row used to just say "Overdue" with no sense of
        // how overdue -- reusing the same day-counting daysUntilText()
        // already used for card statements/savings goals.
        const statusLabel = r.status === "paid" ? app.L("Fully settled") : r.status === "overdue" ? app.L("Overdue") + " · " + this.daysUntilText(r.due) : r.status === "partial" ? app.L("On schedule") : app.L("Open");
        return '<div class="sched-row status-' + r.status + '"><span>#' + r.no + " · " + r.due + '</span><span>' + app.fmt(r.amount) + '</span><span class="sched-status">' + esc(statusLabel) + "</span></div>";
      }).join("");
      // 51: "when's my next payment?" used to cost a tap into "Show
      // schedule" plus a scan down the rows -- surfaced right on the
      // closed card now, for every plan that still has one (a fully-paid
      // plan has no `next` row left at all).
      const nextLine = !p.next ? "" : '<span>' + esc(app.L("Next: ")) + "#" + p.next.no + " · " + p.next.due + " · " + esc(this.daysUntilText(p.next.due)) + "</span>";
      // 52: a slim collected/total progress bar, the same .bar-track/
      // .bar-fill language Savings goals and Accounts already draw
      // progress in -- the two raw numbers (Collected: X / Y) took an
      // actual subtraction to read as "almost done" vs "barely started".
      const pct = p.total > 0 ? Math.min(100, Math.round(p.collected / p.total * 100)) : 100;
      const barColor = p.remaining <= 0.001 ? "var(--c-pos)" : p.overdue > 0 ? "var(--c-neg)" : "var(--c-accent)";
      return '<div class="card-row">' +
        // 50: the person's name used to be plain text here, the one place
        // left in the app carrying a person's name that wasn't also a way
        // to jump to their own page (Transactions and People's own cards
        // already do, via UI.viewPerson()).
        '<div class="card-row-top"><div><div class="card-row-title">' + esc(p.title) + '</div><div class="card-row-sub"><button class="inline-link" onclick="UI.viewPerson(\'' + p.personId + '\')">' + esc(app.personName(p.personId)) + "</button> · " + esc(app.L(p.direction === "in" ? "Owed to me" : "I owe")) + "</div></div>" +
        '<div class="card-row-amt ' + (p.direction === "in" ? "tone-pos" : "tone-neg") + '">' + app.fmt(p.remaining) + "</div></div>" +
        '<div class="bar-track thin"><div class="bar-fill" style="width:' + Math.max(2, pct) + '%;background:' + barColor + '"></div></div>' +
        '<div class="card-row-meta"><span>' + esc(t.collected) + ": " + app.fmt(p.collected) + " / " + app.fmt(p.total) + '</span>' +
        (p.overdue > 0 ? '<span class="tone-neg">' + esc(app.L("Overdue: ")) + p.overdue + "</span>" : '<span>' + esc(app.L("No overdue")) + "</span>") +
        nextLine + "</div>" +
        // Real bug caught in review: this used app.L()'s generic ARW
        // lookup, which has no entry for either phrase and so silently
        // fell back to English under Arabic -- t.showSchedule/hideSchedule
        // already exist with a real Arabic translation, just never used.
        '<button class="link-btn small" onclick="UI.togglePlanRows(\'' + p.id + '\')">' + esc(open ? t.hideSchedule : t.showSchedule) + "</button>" +
        (open ? '<div class="sched-list">' + rowsHtml + "</div>" : "") +
        '<div class="btn-row wrap">' +
        // 48: a fully-settled plan (remaining 0) used to keep this button
        // regardless -- a guaranteed dead end, since submit()'s own cap
        // check refuses any amount against 0 remaining -- gone now, the
        // same condition Person Detail's own planSection already applies.
        (p.remaining > 0.001 ? '<button class="btn btn-secondary small" onclick="UI.openModal(\'installment_payment\',{planId:\'' + p.id + '\'})">' + esc(t.recordPayment) + "</button>" : "") +
        (app.planCanDelete(p.id) ? '<button class="link-btn small danger" onclick="UI.deletePlanC(\'' + p.id + '\')">' + esc(app.L("Delete plan")) + "</button>" : "") +
        "</div>" +
      "</div>";
    };

    const activeCards = activePlans.map(planCard).join("");
    const completedSection = !completedPlans.length ? "" : (completedCollapsed ?
      '<button class="btn btn-secondary block" onclick="UI.togglePlansCompleted()">' + esc(app.L(completedPlans.length + " completed", completedPlans.length + " متسدد")) + "</button>" :
      '<h2 class="section-title">' + esc(app.L("Completed", "متسدد")) + '</h2><div class="card-list">' + completedPlans.map(planCard).join("") + "</div>");

    // 58: with both KPI groups now hidden whenever their own direction is
    // empty (see groupSection above), a brand-new install with zero plans
    // would otherwise be just the due banner sitting over a blank list.
    const emptyPlans = D.plans.length ? "" : '<div style="margin-top:16px">' + this.emptyState(ICON_PLUS, app.L("No installment plans yet", "لسه مفيش خطط تقسيط"), app.L("A sale or purchase plan you add above will show up here, with its own payment schedule.", "أي خطة بيع أو شراء بالتقسيط تضيفها من فوق هتظهر هنا مع جدول دفعاتها الخاص.")) + "</div>";

    return this.tabHeader(t.installments, D.plans.length + app.L(" plans · allocation handles partial, early and balloon payments", " خطة · التوزيع يعالج الدفعات الجزئية والمبكرة والدفعة الأخيرة"),
      [[t.aSale, "UI.openModal('sale')"], [t.aPurchasePlan, "UI.openModal('purchase')"]]) + kpiRow + '<div class="card-list">' + activeCards + "</div>" + completedSection + emptyPlans;
  },

  // ---- Card statements -------------------------------------------------
  // A statement's `amount` is typed in by hand from the real bank
  // statement every month, deliberately separate from the card's own
  // transaction-derived Outstanding balance -- see Engine.statementState.
  // Paying one still moves real money (a normal account -> card transfer,
  // just tagged to a specific statement) and reduces both the card's
  // balance and that statement's own remaining at once.
  renderCardStatements(D, t) {
    const app = this.app, d = app.state.data;
    const list = D.cardStatements.slice().sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);
    const totalRemaining = D.cardStatements.reduce((s, x) => s + x.remaining, 0);
    const overdueAmt = D.cardStatements.filter(x => x.overdue).reduce((s, x) => s + x.remaining, 0);
    const kpiRow = '<div class="tile-grid three">' +
      '<div class="pos-tile"><div class="pos-label">' + esc(app.L("Statements", "كشوف الحساب")) + '</div><div class="pos-value">' + D.cardStatements.length + "</div></div>" +
      '<div class="pos-tile"><div class="pos-label">' + esc(t.remaining) + '</div><div class="pos-value">' + app.fmt(totalRemaining) + "</div></div>" +
      '<div class="pos-tile"><div class="pos-label">' + esc(app.L("Overdue", "متأخر")) + '</div><div class="pos-value ' + (overdueAmt > 0 ? "tone-neg" : "tone-neu") + '">' + app.fmt(overdueAmt) + "</div></div>" +
    "</div>";

    // Per-card trend -- how a card's own statement amount has moved from one
    // period to the next, at a glance. Reuses Reports' own chart-cols/
    // chart-bar/chart-label pattern (see renderReports' nwChart) rather than
    // inventing a new chart style; only cards that actually have a statement
    // get a chart, and each one's bars are its own statements ordered by due
    // date, colored by that statement's own status (paid/overdue/open) so
    // the trend reads as more than just a bar-height comparison.
    const byCard = {};
    list.forEach(s => { (byCard[s.accountId] = byCard[s.accountId] || []).push(s); });
    const trendSection = Object.keys(byCard).map(accId => {
      const stmts = byCard[accId].slice().sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);
      if (stmts.length < 2) return ""; // nothing to trend with just one statement
      const items = stmts.map(s => ({ label: s.period || app.dshort(s.due), value: s.amount, status: s.status, overdue: s.overdue }));
      const chart = this.barChart(items, (i) => i.status === "paid" ? "var(--c-pos)" : i.overdue ? "var(--c-neg)" : "var(--cat-1)");
      return '<h2 class="section-title">' + esc(app.accName(accId)) + " · " + esc(app.L("statement trend", "اتجاه كشف الحساب")) + "</h2>" + chart;
    }).join("");

    const statusLabel = { paid: app.L("Fully paid", "متسدد بالكامل"), overdue: app.L("Overdue", "متأخر"), partial: app.L("Partially paid", "متسدد جزئيًا"), open: app.L("Open", "مفتوح") };
    const cards = list.map(s => {
      return '<div class="card-row">' +
        // Days-until only makes sense while something is still owed --
        // "31d overdue" next to a statement that's already Fully paid reads
        // like a live problem when it's actually settled history.
        '<div class="card-row-top"><div><div class="card-row-title">' + esc(app.accName(s.accountId)) + '</div><div class="card-row-sub">' + esc(s.period || "—") + (s.due ? " · " + esc(t.dueDate) + " " + s.due + (s.remaining > 0.001 ? " · " + esc(this.daysUntilText(s.due)) : "") : "") + "</div></div>" +
        '<div class="card-row-amt ' + (s.overdue ? "tone-neg" : "") + '">' + app.fmt(s.remaining) + "</div></div>" +
        '<div class="card-row-meta"><span>' + esc(t.paid) + ": " + app.fmt(s.paid) + " / " + app.fmt(s.amount) + '</span><span>' + esc(statusLabel[s.status]) + "</span></div>" +
        '<div class="btn-row wrap">' +
        (s.remaining > 0.001 ? '<button class="btn btn-secondary small" onclick="UI.openModal(\'statement_payment\',{statementId:\'' + s.id + '\'})">' + esc(t.pay) + "</button>" : "") +
        // Real gap fix: Edit/Delete were their own always-visible buttons
        // here, the one remaining list-with-actions screen that hadn't
        // moved its secondary actions off the row -- same "..." trigger
        // pattern as every other list (Pay stays the one always-visible
        // primary action, matching Installments' own Record payment).
        '<button type="button" class="link-btn small stmt-more-btn" aria-haspopup="true" aria-label="' + esc(app.L("More actions", "إجراءات تانية")) + '" onclick="UI.openStmtActions(\'' + s.id + '\')">' + svgIcon("M12 6h.01M12 12h.01M12 18h.01", 18) + "</button>" +
        "</div></div>";
    }).join("");

    return this.tabHeader(t.statements, D.cardStatements.length + app.L(" statements · amounts are typed in by hand each month, from the real bank statement", " كشف · المبالغ بتتكتب بإيدك كل شهر، من كشف حساب البنك الحقيقي"),
      [[t.aStatement, "UI.openModal('card_statement')"]]) + kpiRow + trendSection +
      (list.length ? '<div class="card-list" style="margin-top:14px">' + cards + "</div>" : '<div style="margin-top:14px">' + this.emptyState(ICON_PLUS, app.L("No statements yet", "لسه مفيش كشوف حساب"), app.L("A statement appears once one is generated for a card account.", "الكشف بيظهر لما يتولد كشف لحساب كارت.")) + "</div>");
  },
  // The sheet UI.openStmtActions() opens -- same shared .sheet markup
  // every other action sheet in the app already uses.
  renderStmtActionSheet() {
    const app = this.app, id = this._stmtActionRow;
    if (!id) return "";
    const s = (app.state.data.cardStatements || []).find(x => x.id === id);
    if (!s) return "";
    const canDelete = app.cardStatementCanDelete(s.id);
    const items = [
      ["M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z", app.L("Edit"), "UI.openStmtEdit('" + s.id + "')", false],
      canDelete ? ["M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6", app.L("Delete"), "UI.deleteCardStatementC('" + s.id + "')", true] : null,
    ].filter(Boolean);
    return '<div class="sheet-backdrop" onclick="UI.closeStmtActions()"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(app.accName(s.accountId)) + '">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-title">' + esc(app.accName(s.accountId)) + (s.period ? " · " + esc(s.period) : "") + "</div>" +
        '<div class="sheet-actions">' + items.map(([ico, label, onclick, danger]) =>
          '<button type="button" class="sheet-action' + (danger ? " danger" : "") + '" onclick="' + onclick + '"><span class="sheet-action-ico">' + svgIcon(ico, 18) + "</span>" + esc(label) + "</button>"
        ).join("") + "</div>" +
      "</div>";
  },
  openStmtActions(id) { this._stmtActionRow = id; this.render(); },
  closeStmtActions() { this._stmtActionRow = null; this.render(); },
  openStmtEdit(id) {
    this._stmtActionRow = null;
    const s = (this.app.state.data.cardStatements || []).find(x => x.id === id);
    if (!s) return;
    this.openModal("card_statement_edit", { id: s.id, period: s.period || "", amount: s.amount, due: s.due || "", desc: s.desc || "" });
  },

  // ---- Savings goals -------------------------------------------------------
  // A goal doesn't get its own ledger -- it just watches one existing
  // account's balance grow from wherever it stood the moment the goal was
  // created (see Engine.goalState). Adding money to that account (income, a
  // transfer in) moves every goal watching it forward automatically; taking
  // money out moves it back just as honestly -- there's nothing extra to log.
  renderSavingsGoals(D, t) {
    const app = this.app;
    const goals = D.savingsGoals.slice().sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);
    const cards = goals.map(g => {
      const editArgs = JSON.stringify({ id: g.id, name: g.name, target: g.target, due: g.due || "", color: g.color }).replace(/"/g, "&quot;");
      return '<div class="card-row">' +
        '<div class="card-row-top"><div><div class="card-row-title">' + esc(g.name) + '</div><div class="card-row-sub">' + esc(app.accName(g.accountId)) + (g.due ? " · " + esc(t.dueDate) + " " + g.due + (!g.done ? " · " + esc(this.daysUntilText(g.due)) : "") : "") + "</div></div>" +
        '<div class="card-row-amt ' + (g.done ? "tone-pos" : "") + '">' + app.fmt(g.saved) + " / " + app.fmt(g.target) + "</div></div>" +
        '<div class="bar-track thin"><div class="bar-fill" style="width:' + Math.max(2, g.pct) + '%;background:' + (g.done ? "var(--c-pos)" : g.color) + '"></div></div>' +
        '<div class="card-row-meta"><span>' + g.pct + "%</span>" +
        (g.done ? '<span class="tone-pos">' + esc(app.L("Goal reached!", "الهدف اتحقق! 🎉")) + "</span>" :
          g.overdue ? '<span class="tone-neg">' + esc(app.L("Past target date", "فات التاريخ المستهدف")) + "</span>" :
          '<span>' + esc(app.L("Still needed: ", "لسه محتاج: ")) + app.fmt(g.remaining) + "</span>") +
        "</div>" +
        '<div class="btn-row wrap">' +
        '<button class="link-btn small" onclick="UI.openModal(\'goal_edit\',' + editArgs + ')">' + esc(app.L("Edit")) + "</button>" +
        '<button class="link-btn small danger" onclick="UI.deleteSavingsGoalC(\'' + g.id + '\')">' + esc(app.L("Delete")) + "</button>" +
        "</div></div>";
    }).join("");
    return this.tabHeader(t.goals, goals.length + app.L(" goal(s) · progress follows the linked account's own balance since the goal was set", " هدف · التقدم بيتابع رصيد الحساب المرتبط من وقت ما اتحدد الهدف"),
      [[t.aGoal, "UI.openModal('goal')"]]) +
      (goals.length ? '<div class="card-list" style="margin-top:14px">' + cards + "</div>" : '<div style="margin-top:14px">' + this.emptyState(ICON_PLUS, app.L("No savings goals yet", "لسه مفيش أهداف ادخار"), app.L("Add one above to start tracking progress toward it.", "ضيف هدف من فوق تبدأ تتابع تقدمك فيه.")) + "</div>");
  },

  // ---- To-do list (plain reminders -- zero financial effect) ------------
  // Reads straight from d.todos, never from D (the derived financial
  // snapshot) -- see Engine.submit()'s "todo"/"todo_edit" branches, which
  // deliberately never call push(): a to-do can never appear in derive()
  // output because nothing here ever asks it to. Not-done items first
  // (soonest due date first among those, no-due-date last), done items at
  // the bottom -- so a finished to-do doesn't crowd out what's still open.
  renderTodos(D, t) {
    const app = this.app, d = app.state.data;
    const todos = (d.todos || []).slice().sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      if (!!a.due !== !!b.due) return a.due ? -1 : 1;
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return 0;
    });
    const rows = todos.map(td => {
      const editArgs = JSON.stringify({ id: td.id, title: td.title, due: td.due || "", notes: td.notes || "" }).replace(/"/g, "&quot;");
      // app.isTodoOverdue(), not a re-derived local check -- same shared
      // definition dueSoonTodos() (Dashboard reminder + attentionCount
      // badge) uses, so this page can never disagree with those about
      // which row counts as overdue.
      const overdue = app.isTodoOverdue(td);
      return '<div class="card-row todo-row' + (td.done ? " todo-done" : "") + '">' +
        '<div class="card-row-top">' +
          '<label class="todo-check"><input type="checkbox"' + (td.done ? " checked" : "") + ' onchange="UI.toggleTodoDoneC(\'' + td.id + '\')" aria-label="' + esc(app.L("Mark done", "علّم كمنتهية")) + '"><span class="card-row-title">' + esc(td.title) + "</span></label>" +
          // esc(td.due): a to-do's due date normally only ever comes from
          // a <input type=date>, but a restored JSON backup (Settings ->
          // Restore from JSON) writes this field back verbatim with no
          // format check -- same treatment title/notes already get.
          (td.due ? '<div class="card-row-amt' + (overdue ? " tone-neg" : "") + '">' + esc(t.dueDate) + " " + esc(td.due) + "</div>" : "") +
        "</div>" +
        (td.notes ? '<div class="card-row-sub">' + esc(td.notes) + "</div>" : "") +
        (overdue ? '<div class="card-row-meta"><span class="tone-neg">' + esc(app.L("Overdue", "متأخر")) + "</span></div>" : "") +
        '<div class="btn-row wrap">' +
          '<button class="link-btn small" onclick="UI.openModal(\'todo_edit\',' + editArgs + ')">' + esc(app.L("Edit")) + "</button>" +
          '<button class="link-btn small danger" onclick="UI.deleteTodoC(\'' + td.id + '\')">' + esc(app.L("Delete")) + "</button>" +
        "</div></div>";
    }).join("");
    const openCount = todos.filter(td => !td.done).length;
    return this.tabHeader(t.todos, openCount + app.L(" open · a reminder only, no financial effect", " مفتوحة · للتذكير بس، من غير أي أثر مالي"), [[app.L("+ To-do", "+ مهمة"), "UI.openModal('todo')"]]) +
      (todos.length ? '<div class="card-list" style="margin-top:14px">' + rows + "</div>" : '<div style="margin-top:14px">' + this.emptyState(ICON_PLUS, app.L("No to-dos yet", "لسه مفيش مهام"), app.L("Add one above to get a reminder before its due date.", "ضيف مهمة من فوق وهتفكرك قبل ميعادها.")) + "</div>");
  },

  // ---- Savings groups (gam3eya) -----------------------------------------
  // Savings Groups Recut: mirrors Installments Recut (its direct sibling --
  // same openPlan/togglePlanRows, same duesThisMonth banner) on every idea
  // that actually applied here: action-sheet consolidation (4 always-visible
  // buttons per card down to 2 + a "..." trigger), a progress bar, a
  // surfaced next-due line, urgency sort, a real empty state, and a
  // completed-group collapse. #56's due-banner breakdown now lives in the
  // shared dueThisMonthBanner() above instead of being copy-pasted, so this
  // page gets it too instead of staying a second copy of the same gap.
  renderGroups(D, t) {
    const app = this.app;
    const byUrgency = (a, b) => (b.overdue > 0) - (a.overdue > 0) || (a.next ? a.next.due : "9999-99").localeCompare(b.next ? b.next.due : "9999-99");
    const sorted = D.groups.slice().sort(byUrgency);
    // Real bug caught in review: gating this on remainingPay alone moved a
    // fully-paid-in group into the collapsed section even when its own
    // payout hasn't been collected yet -- "Payout not collected yet" and
    // the Collect button are still a live, outstanding action, not
    // finished history, so g.taken has to hold too before it's really done.
    const isDone = g => g.remainingPay <= 0.001 && g.taken;
    const activeGroups = sorted.filter(g => !isDone(g));
    const completedGroups = sorted.filter(isDone);
    const completedCollapsed = !this._groupsCompletedExpanded && completedGroups.length > 0;

    const groupCard = (g) => {
      const open = app.state.openPlan === g.id;
      const rowsHtml = g.rows.map(r => '<div class="sched-row status-' + r.status + (r.mine ? " mine" : "") + '"><span>#' + r.no + " · " + r.due + (r.mine ? " · " + esc(app.L("My turn")) : "") + '</span><span>' + app.fmt(r.amount) + '</span></div>').join("");
      const nextLine = !g.next ? "" : '<span>' + esc(app.L("Next: ")) + "#" + g.next.no + " · " + g.next.due + " · " + esc(this.daysUntilText(g.next.due)) + "</span>";
      const pct = g.payout > 0 ? Math.min(100, Math.round(g.paidTotal / g.payout * 100)) : 100;
      const barColor = g.remainingPay <= 0.001 ? "var(--c-pos)" : g.overdue > 0 ? "var(--c-neg)" : "var(--c-accent)";
      return '<div class="card-row">' +
        '<div class="card-row-top"><div><div class="card-row-title">' + esc(g.name) + '</div><div class="card-row-sub">' + esc(app.L("Turn ") + g.group.myTurn + app.L(" of ") + g.periods) + "</div></div>" +
        '<div class="card-row-amt ' + (g.net >= 0 ? "tone-pos" : "tone-neg") + '">' + app.fmt(g.net) + "</div></div>" +
        '<div class="bar-track thin"><div class="bar-fill" style="width:' + Math.max(2, pct) + '%;background:' + barColor + '"></div></div>' +
        '<div class="card-row-meta"><span>' + esc(t.paidIn) + ": " + app.fmt(g.paidTotal) + '</span><span>' + esc(app.L("My payout")) + ": " + app.fmt(g.payout) + "</span></div>" +
        '<div class="card-row-meta"><span>' + esc(g.taken ? app.L("Payout collected") : app.L("Payout not collected yet")) + '</span>' + (g.overdue > 0 ? '<span class="tone-neg">' + esc(app.L("Overdue: ")) + g.overdue + "</span>" : "") + nextLine + "</div>" +
        // Real bug fix: t.showSchedule/hideSchedule already carry a real
        // Arabic translation, unlike the ARW-lookup app.L() call this
        // replaces (same fix as Installments' own card).
        '<button class="link-btn small" onclick="UI.togglePlanRows(\'' + g.id + '\')">' + esc(open ? t.hideSchedule : t.showSchedule) + "</button>" +
        (open ? '<div class="sched-list">' + rowsHtml + "</div>" : "") +
        '<div class="btn-row wrap">' +
        // Real bug fix (same shape as Installments #48): submit()'s own
        // cap check on group_payment refuses any amount once remainingPay
        // is 0 -- this button used to stay regardless, a guaranteed dead
        // end on a fully-paid-in group.
        (g.remainingPay > 0.001 ? '<button class="btn btn-secondary small" onclick="UI.openModal(\'group_payment\',{groupId:\'' + g.id + '\'})">' + esc(t.gContribute) + "</button>" : "") +
        '<button class="btn btn-secondary small" onclick="UI.openModal(\'group_payout\',{groupId:\'' + g.id + '\'})">' + esc(t.gCollect) + "</button>" +
        '<button type="button" class="link-btn small group-more-btn" aria-haspopup="true" aria-label="' + esc(app.L("More actions", "إجراءات تانية")) + '" onclick="UI.openGroupActions(\'' + g.id + '\')">' + svgIcon("M12 6h.01M12 12h.01M12 18h.01", 18) + "</button>" +
        "</div>" +
      "</div>";
    };

    const activeCards = activeGroups.map(groupCard).join("");
    const completedSection = !completedGroups.length ? "" : (completedCollapsed ?
      '<button class="btn btn-secondary block" onclick="UI.toggleGroupsCompleted()">' + esc(app.L(completedGroups.length + " completed", completedGroups.length + " متسدد")) + "</button>" :
      '<h2 class="section-title">' + esc(app.L("Completed", "متسدد")) + '</h2><div class="card-list">' + completedGroups.map(groupCard).join("") + "</div>");
    const emptyGroups = D.groups.length ? "" : '<div style="margin-top:16px">' + this.emptyState(ICON_PLUS, app.L("No savings groups yet", "لسه مفيش جمعيات"), app.L("A gam3ya you add above will show up here, with its own contribution schedule.", "أي جمعية تضيفها من فوق هتظهر هنا مع جدول أقساطها الخاص.")) + "</div>";

    return this.tabHeader(t.groups, app.L("Contributions out, one payout in at your turn", "أقساط تدفعها، ودفعة واحدة تقبضها في دورك"), [[t.aGroup, "UI.openModal('group')"]]) +
      this.dueThisMonthBanner(D) + '<div class="card-list">' + activeCards + "</div>" + completedSection + emptyGroups;
  },
  // The sheet UI.openGroupActions() opens -- reuses the exact .sheet/
  // .sheet-backdrop markup every other action sheet in the app already
  // established. Contribute/Payout stay their own always-visible primary
  // buttons (the two actual money-moving actions); only Edit/Delete move
  // in here, the same "primary stays put, secondary moves" split
  // Installments' own card (and People's Pay/Collect) already settled on.
  renderGroupActionSheet() {
    const app = this.app, id = this._groupActionRow;
    if (!id) return "";
    const g = (app.state.data.groups || []).find(x => x.id === id);
    if (!g) return "";
    const canDelete = app.groupCanDelete(g.id);
    const items = [
      ["M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z", app.L("Edit"), "UI.openGroupEdit('" + g.id + "')", false],
      canDelete ? ["M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6", app.L("Delete group"), "UI.deleteGroupC('" + g.id + "')", true] : null,
    ].filter(Boolean);
    return '<div class="sheet-backdrop" onclick="UI.closeGroupActions()"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(g.name) + '">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-title">' + esc(g.name) + "</div>" +
        '<div class="sheet-actions">' + items.map(([ico, label, onclick, danger]) =>
          '<button type="button" class="sheet-action' + (danger ? " danger" : "") + '" onclick="' + onclick + '"><span class="sheet-action-ico">' + svgIcon(ico, 18) + "</span>" + esc(label) + "</button>"
        ).join("") + "</div>" +
      "</div>";
  },
  openGroupActions(id) { this._groupActionRow = id; this.render(); },
  closeGroupActions() { this._groupActionRow = null; this.render(); },
  openGroupEdit(id) {
    this._groupActionRow = null;
    // The raw stored group, not a groupState() -- same distinction the
    // old inline editArgs (built from g.group.*, not g.*) already made,
    // just via app.state.data directly instead of a derived D.groups row.
    const g = this.app.state.data.groups.find(x => x.id === id);
    if (!g) return;
    this.openModal("group_edit", { id: g.id, name: g.name, amount: g.amount, periods: g.periods, myTurn: g.myTurn, freq: g.freq, first: g.first });
  },
  toggleGroupsCompleted() { this._groupsCompletedExpanded = !this._groupsCompletedExpanded; this.render(); },

  // ---- Receivables & Payables (ledger view over the same person data) ----
  renderLedgers(D, t) {
    const app = this.app, S = app.state, d = app.state.data;
    const withNet = d.people.map(p => {
      const planIn = D.plans.filter(x => x.personId === p.id && x.direction === "in").reduce((s, x) => s + x.remaining, 0);
      const planOut = D.plans.filter(x => x.personId === p.id && x.direction === "out").reduce((s, x) => s + x.remaining, 0);
      return { p, r: Math.max(0, D.recv[p.id] || 0) + planIn, y: Math.max(0, D.pay[p.id] || 0) + planOut };
    });
    const owedToMe = withNet.filter(x => x.r > 0).sort((a, b) => b.r - a.r);
    // Payoff order: "largest" (avalanche — clears the biggest debt/most
    // interest-bearing exposure first) is the long-standing default sort;
    // "smallest" (snowball — clears whole debts off the list fastest, for
    // momentum) is the alternative a lot of payoff advice recommends instead.
    // Doesn't touch owedToMe — this is a strategy for what *you* pay off,
    // not for chasing collections.
    const payoffOrder = S.payoffOrder || "largest";
    const iOwe = withNet.filter(x => x.y > 0).sort((a, b) => payoffOrder === "smallest" ? a.y - b.y : b.y - a.y);
    // Next open due date among this person's plain loans (not installment
    // plans, which already show their own due dates on the Installments
    // tab) — the earliest unpaid row, FIFO, per loanRows().
    const nextDue = (personId, kind) => app.loanRows(personId, kind).find(r => r.rem > 0);
    const dueMeta = (personId, kind) => {
      const r = nextDue(personId, kind);
      if (!r || !r.due) return "";
      const label = r.status === "overdue" ? app.L("Overdue since ") : app.L("Due ");
      return '<div class="card-row-meta"><span class="' + (r.status === "overdue" ? "tone-neg" : "") + '">' + esc(label) + r.due + "</span></div>";
    };
    // Real gap fix: this was the one remaining list in the app showing a
    // person's name as plain text -- People's own cards and Installments'
    // own plan cards already make it a link via UI.viewPerson().
    const list = (arr, key, tone, kind) => '<div class="card-list">' + (arr.length ? arr.map(x =>
      '<div class="card-row"><div class="card-row-top"><button class="link-btn card-row-title" onclick="UI.viewPerson(\'' + x.p.id + '\')">' + esc(x.p.name) + '</button><div class="card-row-amt tone-' + tone + '">' + app.fmt(x[key]) + "</div></div>" + dueMeta(x.p.id, kind) + "</div>"
    ).join("") : this.emptyState(ICON_CHECK, app.L("Fully settled", "متسدد بالكامل"))) + "</div>";
    const payoffToggle = iOwe.length > 1 ? '<div class="pill-row" style="margin-top:8px">' +
      '<button class="pill' + (payoffOrder === "largest" ? " on" : "") + '" onclick="UI.setPayoffOrder(\'largest\')">' + esc(app.L("Largest first", "الأكبر الأول")) + "</button>" +
      '<button class="pill' + (payoffOrder === "smallest" ? " on" : "") + '" onclick="UI.setPayoffOrder(\'smallest\')">' + esc(app.L("Smallest first", "الأصغر الأول")) + "</button>" +
    "</div>" : "";
    // Payoff calculator — a fixed monthly amount against the chosen
    // debt's current total, months = ceil(total / monthly). Deliberately
    // simple (no interest, no re-run if the balance changes) — a "how long
    // roughly" estimate, not a real amortization schedule.
    const calc = S.payoffCalc || { personId: "all", amount: "" };
    const calcTarget = calc.personId === "all" ? iOwe.reduce((s, x) => s + x.y, 0) : (iOwe.find(x => x.p.id === calc.personId) || { y: 0 }).y;
    const calcAmt = app.n(calc.amount);
    const months = calcAmt > 0 && calcTarget > 0 ? Math.ceil(calcTarget / calcAmt) : null;
    const calcSection = iOwe.length ? '<section class="dash-section" style="margin-top:20px"><h2 class="section-title">' + esc(app.L("Payoff calculator", "حاسبة سداد")) + "</h2>" +
      '<div class="field-grid">' +
        '<label class="field"><span class="field-label">' + esc(app.L("Which debt", "أنهي دين")) + '</span><select class="input" onchange="UI.setPayoffCalc(\'personId\', this.value)">' +
          '<option value="all"' + (calc.personId === "all" ? " selected" : "") + ">" + esc(app.L("All debts", "كل الديون")) + " (" + app.fmt(iOwe.reduce((s, x) => s + x.y, 0)) + ")</option>" +
          iOwe.map(x => '<option value="' + x.p.id + '"' + (calc.personId === x.p.id ? " selected" : "") + '>' + esc(x.p.name) + " (" + app.fmt(x.y) + ")</option>").join("") +
        "</select></label>" +
        // type="text" + inputmode="decimal", not type="number": a number
        // input's selectionStart is unreliable across browsers, and
        // render()'s cursor-restore logic (see render()'s savedSel) relies
        // on reading it — with a number input the cursor position doesn't
        // round-trip correctly on every keystroke's re-render, and new
        // digits end up inserted at the start instead of where typed
        // ("5000" typed one key at a time became "0005"). Same numeric
        // keyboard on mobile either way.
        '<label class="field"><span class="field-label">' + esc(app.L("Monthly amount you can pay", "المبلغ اللي تقدر تدفعه شهريًا")) + '</span><input class="input" id="payoffCalcAmt" type="text" inputmode="decimal" value="' + esc(calc.amount) + '" oninput="UI.setPayoffCalc(\'amount\', this.value)"></label>' +
      "</div>" +
      (months ? '<p class="pos-value" style="margin-top:8px">' + esc(app.L("About ", "حوالي ")) + months + " " + esc(app.L("months to clear it — around ", "شهر عشان تخلصه — تقريبًا ")) + app.dshort(app.addMonths(new Date(), months)) + "</p>" : "") +
    "</section>" : "";

    return this.tabHeader(t.ledgers, app.L("Open positions by person and by plan"), [[t.aReceivable, "UI.openModal('receivable')"], [t.aDebt, "UI.openModal('payable')"]]) +
      '<h2 class="section-title">' + esc(t.receivables) + " · " + app.fmt(D.recvTotal) + "</h2>" + list(owedToMe, "r", "pos", "receivable") +
      '<h2 class="section-title" style="margin-top:20px">' + esc(t.payables) + " · " + app.fmt(D.payTotal) + "</h2>" +
      (iOwe.length > 1 ? '<p class="muted small">' + esc(app.L("Which to pay off first: largest balance (least total interest/exposure) or smallest (clears whole debts off this list fastest).", "أنهي دين تسدده الأول: الأكبر (أقل فايدة أو تعرض إجمالي) ولا الأصغر (يخلص ديون كاملة من القايمة أسرع).")) + "</p>" + payoffToggle : "") +
      list(iOwe, "y", "neg", "payable") +
      calcSection;
  },

  // ---- Investments -----------------------------------------------------------
  renderInvestments(D, t) {
    const app = this.app, d = app.state.data;
    const cards = d.investments.map(v => {
      const pnl = v.value - v.invested;
      // Real gap fix: the P&L line showed a raw amount only -- +EGP 500
      // reads very differently on a EGP 5,000 position than a EGP 50,000
      // one, and telling which took reopening Edit to check the original
      // invested amount and doing the division by hand. v.invested can be
      // 0 for a position tracked with no cash movement -- no percentage
      // makes sense against a 0 base, so it's left out rather than shown
      // as a nonsensical +Infinity%.
      const pnlPct = v.invested > 0 ? Math.round(pnl / v.invested * 1000) / 10 : null;
      const pnlPctText = pnlPct === null ? "" : " (" + (pnlPct >= 0 ? "+" : "") + app.numStr(pnlPct) + "%)";
      const editArgs = JSON.stringify({ id: v.id, name: v.name, type: v.type, invested: v.invested }).replace(/"/g, "&quot;");
      const canDelete = app.investmentCanDelete(v.id);
      return '<div class="card-row"><div class="card-row-top"><div><div class="card-row-title">' + esc(v.name) + '</div><div class="card-row-sub">' + esc(v.type) + "</div></div>" +
        '<div class="card-row-amt">' + app.fmt(v.value) + "</div></div>" +
        '<div class="card-row-meta"><span>' + esc(t.invested) + ": " + app.fmt(v.invested) + '</span><span class="' + (pnl >= 0 ? "tone-pos" : "tone-neg") + '">' + esc(t.pnl) + ": " + app.fmtS(pnl) + esc(pnlPctText) + "</span></div>" +
        '<div class="btn-row wrap">' +
        '<button class="btn btn-secondary small" onclick="UI.openModal(\'invest_update\',{investmentId:\'' + v.id + '\'})">' + esc(t.updateValue) + "</button>" +
        '<button class="link-btn small" onclick="UI.openModal(\'investment_edit\',' + editArgs + ')">' + esc(app.L("Edit")) + "</button>" +
        (canDelete ? '<button class="link-btn small danger" onclick="UI.deleteInvestmentC(\'' + v.id + '\')">' + esc(app.L("Delete")) + "</button>" : "") +
        "</div></div>";
    }).join("");
    return this.tabHeader(t.investments, D.invValue.toFixed ? (app.fmt(D.invValue) + " · " + esc(t.pnl) + " " + app.fmtS(D.invValue - D.invCost)) : "", [[t.aInvest, "UI.openModal('investment')"]]) + '<div class="card-list">' + cards + "</div>";
  },

  // ---- Recurring ----------------------------------------------------------
  renderRecurring(D, t) {
    const app = this.app, d = app.state.data;
    const freqLabel = { daily: app.L("Daily"), weekly: app.L("Weekly"), monthly: app.L("Monthly"), quarterly: app.L("Quarterly"), yearly: app.L("Yearly") };
    const cards = d.recurring.map(r => {
      const next = app.nextOccurrence(r, new Date());
      const editArgs = JSON.stringify({ id: r.id, name: r.name, type: r.type, amount: r.amount, accountId: r.accountId, category: r.category, freq: r.freq, day: r.day }).replace(/"/g, "&quot;");
      const canDelete = app.recurringCanDelete(r.id);
      return '<div class="card-row"><div class="card-row-top"><div><div class="card-row-title">' + esc(r.name) + '</div><div class="card-row-sub">' + freqLabel[r.freq] + " · " + esc(t.nextDate) + " " + app.dshort(next) + "</div></div>" +
        '<div class="card-row-amt ' + (r.type === "income" ? "tone-pos" : "tone-neg") + '">' + app.fmtS(r.type === "income" ? r.amount : -r.amount) + "</div></div>" +
        // Real bug fix: the account and category a rule actually posts
        // against used to be invisible here, findable only by opening
        // Edit -- now a first-class part of the card, same as every
        // other list in the app shows its own account/category.
        '<div class="card-row-meta"><span>' + esc(app.accName(r.accountId)) + '</span><span>' + esc(r.category || "—") + "</span></div>" +
        '<div class="btn-row wrap">' +
        '<button class="btn btn-secondary small" onclick="UI.postRecurringC(\'' + r.id + '\')">' + esc(t.postNow) + "</button>" +
        // Real bug fix: a recurring rule had no Edit or Delete anywhere in
        // the app -- a typo'd amount/account, or a cancelled subscription,
        // was permanent. Same canDelete gate every other structural
        // record here already uses (blocked once it's actually posted a
        // real transaction).
        '<button class="link-btn small" onclick="UI.openModal(\'recurring_edit\',' + editArgs + ')">' + esc(app.L("Edit")) + "</button>" +
        (canDelete ? '<button class="link-btn small danger" onclick="UI.deleteRecurringC(\'' + r.id + '\')">' + esc(app.L("Delete")) + "</button>" : "") +
        "</div></div>";
    }).join("");
    const monthlyIncome = d.recurring.filter(r => r.type === "income" && r.freq === "monthly").reduce((s, r) => s + r.amount, 0);
    const monthlyExpense = d.recurring.filter(r => r.type === "expense" && r.freq === "monthly").reduce((s, r) => s + r.amount, 0);
    return this.tabHeader(t.recurring, app.L("Monthly rules: ") + app.fmt(monthlyIncome) + app.L(" in, ") + app.fmt(monthlyExpense) + app.L(" out"), [[t.aRecurring, "UI.openModal('recurring')"]]) +
      '<p class="muted small">' + esc(t.recurNote) + '</p><div class="card-list">' + cards + "</div>";
  },

  // ---- Forecast ------------------------------------------------------------
  renderForecast(D, t) {
    const app = this.app, S = app.state;
    // forecastWithWhatIf, not forecast() directly — merges in any active
    // "what if" scenarios below so this page's own numbers reflect them,
    // while every other caller of forecast() (Dashboard's next-30-days,
    // safeToSpend) stays untouched.
    const fc = app.forecastWithWhatIf(S.horizon, D);
    const horizons = ["7", "30", "90", "180", "365"];
    const pills = horizons.map(h => '<button class="pill' + (S.horizon == h ? " on" : "") + '" onclick="UI.setHorizon(' + h + ')">' + h + esc(app.L(" days", " يوم")) + "</button>").join("");
    const maxAbs = Math.max(Math.abs(D.available), Math.abs(fc.projected), 1);
    const track = '<div class="proj-bar"><div class="proj-fill" style="width:' + Math.min(100, Math.abs(fc.projected) / maxAbs * 100) + '%;background:' + (fc.projected >= 0 ? "var(--c-pos)" : "var(--c-neg)") + '"></div></div>';
    const events = fc.events.slice(0, 40).map(e => '<div class="event-row"><span class="event-dot ' + (e.amount > 0 ? "pos" : "neg") + '"></span><span class="event-title">' + esc(e.title) + '</span><span class="event-when">' + app.dshort(e.date) + '</span><span class="event-amt ' + (e.amount > 0 ? "tone-pos" : "tone-neg") + '">' + app.fmtS(e.amount) + "</span></div>").join("");

    // "What if" — a hypothetical, never-saved income/expense the user can
    // add to see its effect on the runway above. Lives in app.state.whatIf
    // (not app.state.data), so it resets on reload same as any other
    // scratch UI state.
    const whatIf = S.whatIf || [];
    const whatIfList = whatIf.length ? '<div class="pill-row">' + whatIf.map(w =>
      '<span class="pill">' + esc(w.title) + " " + app.fmtS(w.amount) + ' <button class="link-btn small" onclick="UI.removeWhatIf(\'' + w.id + '\')" aria-label="' + esc(app.L("Remove ") + w.title) + '">×</button></span>'
    ).join("") + "</div>" : "";
    const whatIfPanel = '<section class="dash-section"><h2 class="section-title">' + esc(app.L("What if?", "لو حصل...؟")) + "</h2>" +
      '<p class="muted small">' + esc(app.L("Add a hypothetical expense or income to see how it would change the runway above — nothing here is saved as a real transaction.", "ضيف مصروف أو إيراد افتراضي وشوف تأثيره على التوقعات فوق — مفيش حاجة هنا بتتسجل كحركة حقيقية.")) + "</p>" +
      '<div class="field-grid">' +
        '<label class="field wide"><span class="field-label">' + esc(app.L("What", "الوصف")) + '</span><input class="input" id="wiTitle" type="text" placeholder="' + esc(app.L("e.g. New car", "زي: عربية جديدة")) + '"></label>' +
        '<label class="field"><span class="field-label">' + esc(t.amount) + '</span><input class="input" id="wiAmount" type="number" min="0"></label>' +
        '<label class="field"><span class="field-label">' + esc(app.L("Type", "النوع")) + '</span><select class="input" id="wiKind"><option value="expense">' + esc(app.L("Expense")) + '</option><option value="income">' + esc(app.L("Income")) + '</option></select></label>' +
        '<label class="field"><span class="field-label">' + esc(t.date) + '</span><input class="input" id="wiDate" type="date" value="' + app.today() + '"></label>' +
      "</div>" +
      '<button class="btn btn-secondary" onclick="UI.addWhatIfC()">' + esc(app.L("Add scenario", "أضف سيناريو")) + "</button>" +
      whatIfList +
      (whatIf.length ? '<button class="link-btn small" onclick="UI.clearWhatIfC()">' + esc(app.L("Clear all", "امسح الكل")) + "</button>" : "") +
    "</section>";

    return this.tabHeader(t.forecast, app.L("If nothing changes, this is your runway"), []) +
      '<div class="pill-row">' + pills + "</div>" +
      '<div class="hero-card alt"><div class="hero-label">' + esc(t.timeline) + '</div><div class="hero-value">' + app.fmt(fc.projected) + "</div>" + track +
      '<div class="two-col" style="margin-top:14px"><div class="stat-box"><div class="pos-label">' + esc(app.L("Available today")) + '</div><div class="pos-value">' + app.fmt(D.available) + "</div></div>" +
      '<div class="stat-box"><div class="pos-label">' + esc(app.L("Expected inflows")) + '</div><div class="pos-value tone-pos">' + app.fmt(fc.inflow) + "</div></div></div></div>" +
      '<h2 class="section-title">' + esc(app.L("Expected outflows")) + " " + app.fmt(Math.abs(fc.outflow)) + '</h2><div class="event-list">' + (events || '<p class="muted">—</p>') + "</div>" +
      whatIfPanel;
  },

  // ---- Reports (uses derive(asOf) to build a real 6-month trend) --------
  renderReports(D, t) {
    const app = this.app;
    const nwChart = this.barChart(this.nwTrendMonths(), (i) => i.value >= 0 ? "var(--c-pos)" : "var(--c-neg)");

    const catMap = {}; D.live.filter(x => x.type === "expense").forEach(x => catMap[x.category || "Other"] = (catMap[x.category || "Other"] || 0) + x.amount);
    const catArr = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxCat = Math.max(1, ...catArr.map(c => c[1]));

    const srcMap = {}; D.live.filter(x => ["income", "refund", "investment_return"].includes(x.type)).forEach(x => srcMap[x.category || "Other"] = (srcMap[x.category || "Other"] || 0) + x.amount);
    const srcArr = Object.entries(srcMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxSrc = Math.max(1, ...srcArr.map(c => c[1]));

    const barList = (arr, max, kind) => '<div class="bar-list">' + arr.map(([name, v]) => this.catBar(name, v, max, kind, false)).join("") + "</div>";

    return this.tabHeader(t.reports, app.L("Six-month history plus aging and category analysis"), []) +
      '<h2 class="section-title">' + esc(t.netWorthTrend) + "</h2>" + nwChart +
      '<h2 class="section-title">' + esc(t.byCategory) + "</h2>" + (catArr.length ? barList(catArr, maxCat, "expense") : '<p class="muted">—</p>') +
      '<h2 class="section-title">' + esc(t.bySource) + "</h2>" + (srcArr.length ? barList(srcArr, maxSrc, "income") : '<p class="muted">—</p>');
  },

  // ---- Cash Flow Statement --------------------------------------------------
  // Operating / Investing / Financing, the standard three-bucket structure --
  // built straight off the ledger (Engine.cashFlowStatement), not a new data
  // model. A transfer between two of the user's own spendable accounts never
  // appears here at all (net zero to total spendable money); crossing into
  // or out of a card does -- paying one down is a real outflow, same as any
  // other debt repayment. See Engine.cashFlowBucket for the exact rule.
  renderCashFlow(D, t) {
    const app = this.app;
    const today = app.today(), mStart = today.slice(0, 8) + "01";
    const cur = app.cashFlowStatement(mStart, today);
    const rows = [
      [app.L("Operating", "التشغيلي"), cur.operating, app.L("Everyday income and spending.", "الإيرادات والمصروفات اليومية.")],
      [app.L("Investing", "الاستثماري"), cur.investing, app.L("Money placed into investments.", "أموال موجهة للاستثمار.")],
      [app.L("Financing", "التمويلي"), cur.financing, app.L("Loans, installments, gam3eya and card repayments.", "السلف والأقساط والجمعيات وسداد الكروت.")]
    ];
    const bucketCards = rows.map(([label, b, note]) =>
      '<div class="card-row"><div class="card-row-top"><div><div class="card-row-title">' + esc(label) + '</div><div class="card-row-sub">' + esc(note) + "</div></div>" +
      '<div class="card-row-amt ' + (b.net >= 0 ? "tone-pos" : "tone-neg") + '">' + app.fmtS(b.net) + "</div></div>" +
      '<div class="card-row-meta"><span class="tone-pos">' + esc(app.L("In: ", "داخل: ")) + app.fmt(b.in) + '</span><span class="tone-neg">' + esc(app.L("Out: ", "خارج: ")) + app.fmt(b.out) + "</span></div></div>"
    ).join("");

    // Six-month trend of operating net cash flow -- the same "how did I earn
    // vs. spend, month over month" view Reports gives net worth, but for the
    // number a cash flow statement actually centers on.
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d0 = app.addMonths(new Date(), -i);
      const mS = app.iso(new Date(d0.getFullYear(), d0.getMonth(), 1));
      const isCurrent = i === 0;
      const mE = isCurrent ? today : app.iso(new Date(d0.getFullYear(), d0.getMonth() + 1, 0));
      const cf = app.cashFlowStatement(mS, mE);
      months.push({ label: d0.toLocaleDateString(app.state.lang === "ar" ? "ar-EG" : "en-GB", { month: "short" }), net: cf.operating.net });
    }
    const trendChart = this.barChart(months.map(m => ({ label: m.label, value: m.net })), (i) => i.value >= 0 ? "var(--c-pos)" : "var(--c-neg)");

    return this.tabHeader(t.cashflow, app.L("Where cash actually came from and went, this month", "من فين جت الفلوس وراحت فين، الشهر ده"), []) +
      '<div class="hero-card alt"><div class="hero-label">' + esc(app.L("Net cash change this month", "صافي التغير النقدي الشهر ده")) + '</div><div class="hero-value">' + app.fmtS(cur.netChange) + "</div></div>" +
      '<div class="card-list" style="margin-top:14px">' + bucketCards + "</div>" +
      '<h2 class="section-title">' + esc(app.L("Operating cash flow — 6 months", "التدفق النقدي التشغيلي — 6 أشهر")) + "</h2>" + trendChart +
      '<p class="muted small">' + esc(app.L("Transfers between your own cash, bank and wallet accounts are excluded — they never change your total spendable money. Paying down a card does count, the same as any other debt repayment.", "التحويلات بين حساباتك الكاش والبنك والمحافظ مش محسوبة — هي مبتغيرش إجمالي فلوسك المتاحة. سداد كارت بيتحسب، زي أي سداد دين تاني.")) + "</p>";
  },

  // ---- Settings --------------------------------------------------------------
  renderSettings(D, t) {
    const app = this.app, d = app.state.data;
    const custom = d.customCategories || { income: [], expense: [] };
    const catChips = (kind, list) => list.length ?
      '<div class="btn-row wrap">' + list.map(c =>
        '<span class="pill">' + esc(c) + ' <button class="link-btn small danger" onclick="UI.deleteCategoryC(\'' + kind + '\',\'' + escJsArg(c) + '\')" aria-label="' + esc(app.L("Remove ") + c) + '">×</button></span>'
      ).join("") + "</div>" :
      // No body text -- the section intro right above already explains
      // what to do, so a second line here would just repeat it.
      this.emptyState(ICON_PLUS, app.L("No custom categories yet", "مفيش فئات مخصصة لسه"));
    const categoriesSection = '<section class="dash-section"><h2 class="section-title">' + esc(app.L("Categories")) + '</h2><p class="muted small">' + esc(app.L("Add your own income and expense categories — they show up in every entry form alongside the built-in ones.", "ضيف فئات دخل ومصروف خاصة بيك — هتظهر في كل نموذج إدخال جمب الفئات الجاهزة.")) + '</p>' +
      '<div class="field-grid">' +
        '<label class="field"><span class="field-label">' + esc(app.L("Add expense category")) + '</span><div class="btn-row"><input class="input" id="newExpenseCat" type="text" placeholder="' + esc(app.L("e.g. Gym")) + '"><button class="btn btn-secondary" onclick="UI.addCategoryC(\'expense\')">' + esc(app.L("Add")) + "</button></div></label>" +
        '<label class="field"><span class="field-label">' + esc(app.L("Add income category")) + '</span><div class="btn-row"><input class="input" id="newIncomeCat" type="text" placeholder="' + esc(app.L("e.g. Bonus")) + '"><button class="btn btn-secondary" onclick="UI.addCategoryC(\'income\')">' + esc(app.L("Add")) + "</button></div></label>" +
      "</div>" +
      '<div style="margin-top:12px"><div class="field-label" style="margin-bottom:6px">' + esc(t.expenses) + "</div>" + catChips("expense", custom.expense || []) + "</div>" +
      '<div style="margin-top:12px"><div class="field-label" style="margin-bottom:6px">' + esc(t.income) + "</div>" + catChips("income", custom.income || []) + "</div>" +
    "</section>";
    // Reuses the exact same expense-category list (built-in + custom) the
    // entry forms already build, rather than a second copy of the built-in
    // list that could drift out of sync with it.
    const catOptions = app.FORMS().expense.fields.find(f => f.k === "category").options;
    const budgets = d.budgets || {};
    // Same category color as its own bar on Dashboard/Reports -- a quick
    // "which budget is this" cue in a list that's otherwise just names.
    const budgetRows = Object.keys(budgets).length ? '<div class="card-list">' + Object.entries(budgets).sort((a, b) => b[1] - a[1]).map(([cat, amt]) =>
      '<div class="card-row" style="border-inline-start:4px solid ' + app.categoryColor(cat, "expense") + '"><div class="card-row-top"><div class="card-row-title">' + esc(cat) + '</div><div class="card-row-amt">' + app.fmt(amt) + "/" + esc(app.L("mo", "شهر")) + "</div></div>" +
      // Real bug, found while auditing every onclick arg for this same
      // class of bug: this one was missing esc() entirely (not just the
      // backslash-before-quote fix escJsArg() applies everywhere else) --
      // a budget category name containing '<', '>', '"' or '&' would have
      // reached the page as raw, unescaped HTML.
      '<button class="link-btn small" onclick="UI.clearBudgetC(\'' + escJsArg(cat) + '\')">' + esc(app.L("Remove")) + "</button></div>"
    ).join("") + "</div>" : this.emptyState(ICON_PLUS, app.L("No budgets set yet", "لسه مفيش ميزانيات متحددة"));
    const budgetsSection = '<section class="dash-section"><h2 class="section-title">' + esc(app.L("Budgets")) + '</h2><p class="muted small">' + esc(app.L("Set a monthly limit per expense category — the Dashboard flags it once you're near or over.", "حدد سقف شهري لكل فئة مصروف — الداشبورد هينبهك لما تقرب أو تتخطاه.")) + '</p>' +
      '<div class="field-grid">' +
        '<label class="field"><span class="field-label">' + esc(t.category) + '</span><select class="input" id="budgetCat">' + catOptions.map(o => '<option value="' + esc(o.v) + '">' + esc(o.l) + "</option>").join("") + "</select></label>" +
        '<label class="field"><span class="field-label">' + esc(app.L("Monthly limit")) + '</span><input class="input" id="budgetAmt" type="number" min="0"></label>' +
      "</div>" +
      '<button class="btn btn-secondary" onclick="UI.setBudgetC()">' + esc(app.L("Set budget", "حدد الميزانية")) + "</button>" +
      '<div style="margin-top:12px">' + budgetRows + "</div>" +
    "</section>";
    // One overall cap across every expense, separate from the per-category
    // list above (data.overallBudget, not a key inside data.budgets --
    // that map is keyed by real category names). Shows "All expenses this
    // month" on the Dashboard once set; see UI.renderDashboard.
    const overallSection = '<section class="dash-section"><h2 class="section-title">' + esc(app.L("Overall monthly budget", "الميزانية الشهرية الكلية")) + '</h2><p class="muted small">' + esc(app.L("One limit across every expense, on top of any per-category budgets below.", "سقف واحد لكل المصاريف مجتمعة، فوق أي ميزانيات لكل فئة تحت.")) + '</p>' +
      (d.overallBudget ? '<div class="card-row"><div class="card-row-top"><div class="card-row-title">' + esc(app.L("Current limit", "السقف الحالي")) + '</div><div class="card-row-amt">' + app.fmt(d.overallBudget) + "/" + esc(app.L("mo", "شهر")) + "</div></div>" +
        '<button class="link-btn small" onclick="UI.clearOverallBudgetC()">' + esc(app.L("Remove")) + "</button></div>" :
      '<div class="field-grid">' +
        '<label class="field wide"><span class="field-label">' + esc(app.L("Monthly limit")) + '</span><input class="input" id="overallBudgetAmt" type="number" min="0"></label>' +
      "</div>" +
      '<button class="btn btn-secondary" onclick="UI.setOverallBudgetC()">' + esc(app.L("Set overall budget", "حدد الميزانية الكلية")) + "</button>") +
    "</section>";
    const pinSet = app.hasPin();
    const appLockSection = '<section class="dash-section"><h2 class="section-title">' + esc(app.L("App lock")) + '</h2><p class="muted small">' + esc(app.L("A quick screen lock for this device — not encryption. It only gates the screen; the data underneath is still stored exactly as before, so anyone with direct access to this browser's storage can still see it. Locks each time the app is opened or reloaded.", "قفل سريع للشاشة على الجهاز ده — مش تشفير. بيقفل الشاشة بس؛ البيانات لسه متخزنة زي ما هي، فأي حد يقدر يوصل لتخزين المتصفح مباشرة يقدر يشوفها. بيقفل في كل مرة تفتح فيها الأبلكيشن أو تعمل ريلود.")) + "</p>" +
      (pinSet ?
        '<div class="field-grid">' +
          '<label class="field"><span class="field-label">' + esc(app.L("Current PIN")) + '</span><input class="input" id="pinCurrent" type="password" inputmode="numeric" maxlength="6"></label>' +
          '<label class="field"><span class="field-label">' + esc(app.L("New PIN (4–6 digits)", "رقم جديد (٤-٦ أرقام)")) + '</span><input class="input" id="pinNew" type="password" inputmode="numeric" maxlength="6"></label>' +
        "</div>" +
        '<div class="btn-row wrap"><button class="btn btn-secondary" onclick="UI.changePinC()">' + esc(app.L("Change PIN", "غيّر الرقم")) + '</button><button class="btn btn-danger" onclick="UI.removePinC()">' + esc(app.L("Remove PIN", "شيل الرقم")) + "</button></div>"
        :
        '<div class="field-grid"><label class="field"><span class="field-label">' + esc(app.L("Set a PIN (4–6 digits)", "حدد رقم (٤-٦ أرقام)")) + '</span><input class="input" id="pinNew" type="password" inputmode="numeric" maxlength="6"></label></div>' +
        '<button class="btn btn-secondary" onclick="UI.setPinC()">' + esc(app.L("Set PIN", "حدد الرقم")) + "</button>"
      ) +
      (app.state.pinMsg ? '<p class="muted small" role="status">' + esc(app.state.pinMsg) + "</p>" : "") +
    "</section>";
    const notifSection = '<section class="dash-section"><h2 class="section-title">' + esc(app.L("Notifications")) + '</h2><p class="muted small">' + esc(app.L("Only fires while the app is open in a tab — this is a browser page, not an installed app with background push, so nothing arrives while it's closed.", "بيشتغل بس والأبلكيشن مفتوح في تاب — دي صفحة متصفح مش أبلكيشن مثبت بإشعارات في الخلفية، فمفيش حاجة توصل وهو مقفول.")) + "</p>" +
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;min-height:44px"><input type="checkbox" id="notifToggle" ' + (app.notifEnabled() ? "checked" : "") + ' onchange="UI.toggleNotifC()"><span>' + esc(app.L("Notify me about overdue items when I open the app", "نبهني بالبنود المتأخرة لما أفتح الأبلكيشن")) + "</span></label>" +
    "</section>";
    // A true OS home-screen "widget" (a live glanceable block, not just an
    // icon) isn't something a web app can do without native wrapping -- out
    // of scope here. What a PWA *can* do, already wired since manifest.json
    // shipped its "shortcuts" (long-press the installed icon -> "+ مصروف" /
    // "+ إيراد"): Android/Chrome reads that manifest automatically once
    // installed. iOS Safari's "Add to Home Screen" doesn't read manifest
    // shortcuts at all, but it DOES create a standalone icon for whatever
    // URL you add it from -- these two links exist so adding *this specific
    // page* gives an iOS one-tap "+Expense"/"+Income" icon too, no install
    // required first. init() already opens the matching modal on load
    // whenever ?action= is present (see personal_cfo_app.html).
    const shortcutsSection = '<section class="dash-section"><h2 class="section-title">' + esc(app.L("Home screen shortcuts", "اختصارات الشاشة الرئيسية")) + '</h2><p class="muted small">' + esc(app.L("A real home-screen widget needs a native app, which this isn't — but a one-tap shortcut straight to + Expense or + Income is real and already works.", "الويدجت الحقيقي محتاج أبلكيشن أصلي، والتطبيق ده مش كده — لكن اختصار بلمسة واحدة لـ + مصروف أو + إيراد حقيقي وشغال بالفعل.")) + "</p>" +
      '<div class="field-grid">' +
        '<div class="field"><span class="field-label">' + esc(app.L("Installed on Android", "متثبت على أندرويد")) + '</span><span class="field-hint">' + esc(app.L("Long-press this app's home-screen icon — \"+ مصروف\" and \"+ إيراد\" show up automatically.", "اعمل ضغطة مطولة على أيقونة الأبلكيشن في الشاشة الرئيسية — \"+ مصروف\" و\"+ إيراد\" هيظهروا تلقائي.")) + "</span></div>" +
        '<div class="field"><span class="field-label">' + esc(app.L("iPhone, or without installing", "آيفون، أو من غير تثبيت")) + '</span><span class="field-hint">' + esc(app.L("Open one of these links, then Share → Add to Home Screen — it becomes its own one-tap icon.", "افتح واحد من الرابطين، بعدين مشاركة ← إضافة للشاشة الرئيسية — هيبقى أيقونة لوحده بلمسة واحدة.")) + "</span></div>" +
      "</div>" +
      '<div class="btn-row wrap">' +
        '<button class="btn btn-secondary small" onclick="location.href=\'?action=expense\'">' + esc(t.aExpense) + "</button>" +
        '<button class="btn btn-secondary small" onclick="location.href=\'?action=income\'">' + esc(t.aIncome) + "</button>" +
      "</div>" +
    "</section>";
    const rules = [
      { k: app.L("Receivables & assets"), v: app.L("Money owed to you counts as an asset toward net worth by default.") },
      { k: app.L("Installment allocation"), v: app.L("payments fill schedule rows oldest first; a short payment leaves the row partial, an overpayment rolls into the next rows.") },
      { k: app.L("Editing & deleting"), v: app.L("a plain entry — income, expense, transfer, a loan or a payment against one — can be edited or deleted any time from the Transactions tab.", "أي حركة عادية — إيراد، مصروف، تحويل، أو دين/سلفة أو سداد ليهم — تقدر تعدلها أو تمسحها في أي وقت من تبويب الحركات.") },
      { k: app.L("Reversals"), v: app.L("Reverse is the alternative to deleting: nothing is removed — a void flag plus a marker row keeps it visible in the record.", "Reverse هو البديل للمسح: مفيش حاجة بتتشال — بيتحط عليها علامة إلغاء وسطر توضيحي فيفضلوا ظاهرين في السجل.") },
      { k: app.L("Savings groups (gam3ya)"), v: app.L("contributions are cash out, the payout is cash in; your position is paid-in minus collected — an asset before your turn, a liability after it.") },
      { k: app.L("Opening positions"), v: app.L("receivables and debts carried in from before the system move no cash.") },
      { k: app.L("Forecast"), v: app.L("recurring rules plus unpaid installment rows, applied to today's available balance.") }
    ];
    // "Never" isn't scary phrasing here on purpose -- someone who just
    // started using the app genuinely hasn't needed to yet; the Dashboard
    // alert (see needsBackupReminder) is where urgency actually belongs,
    // once there's real data worth losing.
    const lastBackupText = d.lastBackupAt
      ? app.L("Last backup: ", "آخر نسخة احتياطية: ") + d.lastBackupAt
      : app.L("Last backup: never", "آخر نسخة احتياطية: لسه معملتش");
    return this.tabHeader(t.settings, app.L("Backup, restore and the calculation rules in force"), []) +
      '<section class="dash-section"><h2 class="section-title">' + esc(t.dataBackup) + '</h2><p class="muted small">' + esc(t.backupNote) + '</p>' +
      '<p class="muted small">' + esc(lastBackupText) + '</p>' +
      '<div class="btn-row wrap"><button class="btn btn-secondary" onclick="UI.exportJson()">' + esc(t.exportJson) + '</button><button class="btn btn-secondary" onclick="UI.exportCsv()">' + esc(t.exportCsv) + "</button>" +
      '<button class="btn btn-secondary" onclick="document.getElementById(\'restoreFile\').click()">' + esc(t.importJson) + "</button>" +
      '<input type="file" id="restoreFile" accept="application/json,.json" style="display:none" onchange="UI.restoreJsonFile(this)">' +
      "</div></section>" +
      appLockSection +
      notifSection +
      shortcutsSection +
      (app.state.lang === "ar" ?
        '<section class="dash-section"><h2 class="section-title">' + esc(app.L("Display")) + "</h2>" +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;min-height:44px">' +
          '<input type="checkbox" id="arabicNumToggle" ' + (app.state.arabicNumerals ? "checked" : "") + ' onchange="UI.toggleArabicNumerals()">' +
          "<span>" + esc(app.L("Use Arabic-Indic numerals (١٢٣) for amounts", "استخدم الأرقام العربية (١٢٣) في المبالغ")) + "</span>" +
        "</label></section>"
        : "") +
      categoriesSection +
      overallSection +
      budgetsSection +
      '<section class="dash-section"><h2 class="section-title">' + esc(t.rules) + '</h2><div class="rules-list">' + rules.map(r => '<div class="rule-row"><div class="rule-k">' + esc(r.k) + '</div><div class="rule-v">' + esc(r.v) + "</div></div>").join("") + "</div></section>" +
      '<section class="dash-section"><h2 class="section-title">' + esc(t.auditTrail) + '</h2><div class="audit-list">' + (d.audit || []).slice(0, 20).map(a => '<div class="audit-row"><span>' + esc(a.at) + '</span><span>' + esc(a.what) + "</span></div>").join("") + "</div></section>" +
      '<section class="dash-section"><h2 class="section-title tone-neg">' + esc(t.dangerZone) + '</h2><div class="btn-row wrap"><button class="btn btn-secondary" onclick="UI.reseed()">' + esc(t.reseed) + '</button><button class="btn btn-danger" onclick="UI.wipe()">' + esc(t.wipe) + "</button></div></section>";
  },

  // ---- shared bits -------------------------------------------------------
  // `sub` is trusted, pre-composed HTML — every call site builds it from
  // counts, app.L() static phrases, and/or app.fmt()/fmtS() (which return a
  // <bdi> wrapper, not plain text). None currently splice in raw free-text
  // user data; if a future call site does, esc() that piece before handing
  // it to tabHeader — escaping the whole `sub` here would turn Investments'
  // and Recurring's fmt()-based subtitles back into literal "<bdi>..." text.
  tabHeader(title, sub, actions) {
    return '<div class="tab-head"><div><h1 class="tab-title">' + esc(title) + '</h1><div class="tab-sub">' + sub + "</div></div>" +
      (actions && actions.length ? '<div class="btn-row wrap">' + actions.map(([l, act]) => '<button class="btn btn-secondary small" onclick="' + act + '">' + esc(l) + "</button>").join("") + "</div>" : "") +
    "</div>";
  },

  // ---- lock screen ----------------------------------------------------------
  renderLockScreen(t) {
    const app = this.app, S = app.state;
    return '<div class="lock-screen"><div class="lock-card">' +
      '<div class="lock-mark">₤</div>' +
      '<h1 class="lock-title">' + esc(t.brand) + "</h1>" +
      '<p class="muted">' + esc(app.L("Enter your PIN", "دخّل الرقم السري")) + "</p>" +
      (S.lockErr ? '<div class="dialog-err" role="alert" aria-live="assertive">' + esc(S.lockErr) + "</div>" : "") +
      '<input class="input lock-input" id="lockPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" onkeydown="if(event.key===\'Enter\')UI.unlockC()">' +
      '<button class="btn btn-primary block" style="margin-top:10px" onclick="UI.unlockC()">' + esc(app.L("Unlock", "افتح")) + "</button>" +
      '<button class="link-btn small" onclick="UI.forgotPinC()">' + esc(app.L("Forgot PIN?", "نسيت الرقم؟")) + "</button>" +
    "</div></div>";
  },
  async unlockC() {
    const app = this.app, pin = document.getElementById("lockPin").value;
    if (await app.checkPin(pin)) { app.state.locked = false; app.state.lockErr = ""; this.render(); this.maybeNotify(); }
    else { app.state.lockErr = app.L("Wrong PIN.", "الرقم غلط."); this.render(); }
  },
  forgotPinC() {
    const app = this.app;
    if (this.hapticConfirm(app.L("This only removes the screen lock — none of your financial data is affected. Continue?", "ده هيشيل قفل الشاشة بس — بياناتك المالية مش هتتأثر. تكمل؟"))) {
      app.removePin(); app.state.locked = false; app.state.lockErr = ""; this.render(); this.maybeNotify();
    }
  },
  async setPinC() {
    const app = this.app, pin = document.getElementById("pinNew").value;
    if (!/^\d{4,6}$/.test(pin)) { app.state.pinMsg = app.L("PIN must be 4–6 digits.", "الرقم لازم يكون من ٤ لـ ٦ أرقام."); this.render(); return; }
    const ok = await app.setPin(pin);
    app.state.pinMsg = ok ? app.L("PIN set.", "اتحدد الرقم.") : app.L("Couldn't set a PIN on this device — secure storage isn't available here.", "معرفناش نحدد رقم على الجهاز ده — التخزين الآمن مش متاح هنا.");
    this.render();
  },
  async changePinC() {
    const app = this.app, cur = document.getElementById("pinCurrent").value, next = document.getElementById("pinNew").value;
    if (!(await app.checkPin(cur))) { app.state.pinMsg = app.L("Current PIN is wrong.", "الرقم الحالي غلط."); this.render(); return; }
    if (!/^\d{4,6}$/.test(next)) { app.state.pinMsg = app.L("PIN must be 4–6 digits.", "الرقم لازم يكون من ٤ لـ ٦ أرقام."); this.render(); return; }
    const ok = await app.setPin(next);
    app.state.pinMsg = ok ? app.L("PIN changed.", "اتغير الرقم.") : app.L("Couldn't change the PIN on this device — secure storage isn't available here.", "معرفناش نغير الرقم على الجهاز ده — التخزين الآمن مش متاح هنا.");
    this.render();
  },
  async removePinC() {
    const app = this.app, cur = document.getElementById("pinCurrent").value;
    if (!(await app.checkPin(cur))) { app.state.pinMsg = app.L("Current PIN is wrong.", "الرقم الحالي غلط."); this.render(); return; }
    app.removePin();
    app.state.pinMsg = app.L("PIN removed.", "اتشال الرقم.");
    this.render();
  },
  async toggleNotifC() {
    const app = this.app, next = !app.notifEnabled();
    if (next) {
      if (!("Notification" in window)) { alert(app.L("Notifications aren't supported in this browser.", "الإشعارات مش متاحة في المتصفح ده.")); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { alert(app.L("Notification permission was not granted.", "مفيش إذن للإشعارات.")); return; }
    }
    app.setNotifEnabled(next);
    this.render();
  },
  // ---- modal ---------------------------------------------------------------
  renderModal(t) {
    const app = this.app, S = app.state;
    if (!S.modal) return "";
    const F = app.FORMS()[S.modal];
    if (!F) return "";
    const form = S.form;
    // These kinds double as their own edit form (openTxEdit reopens them
    // pre-filled with the original row's `id`) — while F.title always reads
    // "+ Income" etc, the header should say "Edit" whenever a real id is
    // riding along, i.e. this is a correction, not a new entry.
    const txKinds = ["income", "expense", "transfer", "receivable", "payable", "receivable_payment", "debt_payment", "installment_payment", "group_payment", "group_payout", "statement_payment"];
    const title = (form.id && txKinds.includes(S.modal)) ? app.L("Edit transaction", "تعديل الحركة") : F.title;
    const field = (f) => {
      const val = form[f.k] !== undefined ? form[f.k] : "";
      let input;
      if (f.k === "category" && (S.modal === "income" || S.modal === "expense")) {
        // Vivid pills in front of the plain category <select> -- same
        // "visual buttons drive the real control" shape as the color
        // swatches below, using each category's own categoryColor() so the
        // pills match the exact colors the category bars/charts already
        // use. Scoped to income/expense only (not the shared "recurring"
        // form, whose category list mixes both kinds -- categoryColor()
        // needs to know which one a name belongs to, and a single mixed
        // list can't say that unambiguously) -- that form keeps the plain
        // select. The select stays fully wired underneath (autocomplete
        // from the description field, typing, keyboard nav) -- a pill
        // click just sets its value directly, same no-render() reasoning
        // as UI.setColorField.
        const kind = S.modal === "income" ? "income" : "expense";
        const pills = f.options.map(o => '<button type="button" class="cat-pill" style="--pill-c:' + app.categoryColor(o.v, kind) + '" onclick="UI.setCategoryField(\'' + escJsArg(o.v) + '\')">' + esc(o.l) + "</button>").join("");
        // onchange="UI._categoryTouched=true" -- the user directly picking
        // one (dropdown or keyboard, not the pills, which set this
        // themselves in setCategoryField) is exactly the deliberate choice
        // suggestCategoryFromDesc must stop overwriting from here on.
        input = '<div class="cat-pill-row">' + pills + '</div><select class="input" id="f_' + f.k + '" name="' + f.k + '" onchange="UI._categoryTouched=true">' + f.options.map(o => '<option value="' + esc(o.v) + '"' + (String(val) === String(o.v) ? " selected" : "") + ">" + esc(o.l) + "</option>").join("") + "</select>";
      } else if (f.type === "select") {
        // Person forms only: picking a Relation also resets Color to that
        // type's default (see UI.setPersonRelation) -- nothing else uses a
        // select's onchange to touch another field.
        const relOnchange = f.k === "relation" && ["person", "person_edit"].includes(S.modal) ? ' onchange="UI.setPersonRelation(this.value)"' : "";
        input = '<select class="input" id="f_' + f.k + '" name="' + f.k + '"' + relOnchange + '>' + f.options.map(o => '<option value="' + esc(o.v) + '"' + (String(val) === String(o.v) ? " selected" : "") + ">" + esc(o.l) + "</option>").join("") + "</select>";
      } else if (f.type === "color") {
        // Preset swatches in front of the plain native color input -- see
        // COLOR_PALETTE/UI.setColorField up top. The swatches are plain
        // buttons, not form-associated, so they can't confuse FormData on
        // submit; clicking one just sets this same #f_<k> input's value,
        // same as picking from the native picker would.
        // The native input's own oninput mirrors setColorField's side
        // effects (live-sync color2 from the primary color; mark color2
        // touched once the user edits it directly) so dragging the native
        // picker behaves the same as clicking a swatch -- see
        // syncColor2Default.
        const liveSync = f.k === "color" ? ' oninput="UI.syncColor2Default(this.value)"' : (f.k === "color2" ? ' oninput="UI._color2Touched=true"' : "");
        const swatches = COLOR_PALETTE.map(hex => '<button type="button" class="swatch-btn" style="background:' + hex + '" onclick="UI.setColorField(\'' + f.k + '\',\'' + hex + '\')" aria-label="' + hex + '"></button>').join("");
        input = '<div class="swatch-row">' + swatches + '</div><input class="input" id="f_' + f.k + '" name="' + f.k + '" type="color" value="' + esc(val) + '"' + liveSync + '">';
      } else {
        // Description → category autocomplete, income/expense only: as the
        // user types, suggest whatever category their past entries with a
        // similar description used most. It only ever sets the <select>'s
        // value directly (see suggestCategoryFromDesc) — never touches
        // app.state directly, but it's the same DOM element submit() reads
        // via FormData, so it stops the instant _categoryTouched is set
        // (a real pick, or an edit's already-saved category) rather than
        // fighting it on every later keystroke.
        const auto = (f.k === "desc" && ["income", "expense"].includes(S.modal)) ? ' oninput="UI.suggestCategoryFromDesc(this.value)"' : "";
        input = '<input class="input" id="f_' + f.k + '" name="' + f.k + '" type="' + f.type + '" value="' + esc(val) + '"' + auto + '>';
      }
      return '<label class="field' + (f.wide ? " wide" : "") + '"><span class="field-label">' + esc(f.label) + "</span>" + input + (f.hint ? '<span class="field-hint">' + esc(f.hint) + "</span>" : "") + "</label>";
    };
    return '<div class="sheet-backdrop" onclick="UI.closeModal()"></div>' +
      '<div class="dialog" role="dialog" aria-label="' + esc(title) + '">' +
        '<div class="dialog-title">' + esc(title) + "</div>" +
        (S.err ? '<div class="dialog-err" role="alert" aria-live="assertive">' + esc(S.err) + "</div>" : "") +
        '<form id="modalForm" class="field-grid" onsubmit="event.preventDefault();UI.submitModal()">' + F.fields.map(field).join("") + "</form>" +
        '<div class="dialog-actions"><button class="btn btn-secondary" onclick="UI.closeModal()">' + esc(t.cancel) + '</button><button class="btn btn-primary" onclick="UI.submitModal()">' + esc(t.save) + "</button></div>" +
      "</div>";
  }
};
