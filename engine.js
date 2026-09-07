// Personal CFO — core ledger engine, ported faithfully from the original app's
// decoded source (seed/derive/planState/groupState/forecast/FORMS/submit).
// Logic is preserved as-is; only the class wrapper and I/O layer are new.

// 38 (Accounts Recut): a brand-new account/card no longer defaults to the
// same flat grey/navy every single time (see Engine.nextAccountAutoColor())
// -- a small, independent rotation, not the same list ui.js's own
// COLOR_PALETTE swatch picker offers (that one's ~24 entries and lives in
// the UI layer; this file stays free of any reference into it, same
// separation every other Engine method already keeps).
const ACCOUNT_AUTO_COLORS = ["#0088b0", "#7c3aed", "#16a34a", "#db2777", "#d97706", "#0ea5e9", "#65a30d", "#be185d"];

class Engine {
  constructor(props) {
    this.props = props || { defaultHorizon: "30", receivablesAreAssets: true, privacyDefault: false };
    this.state = { page: "dashboard", lang: "en", modal: null, form: {}, err: "", privacy: false,
      // categoryKind: not a real dropdown filter of its own -- set only by
      // UI.viewCategoryTx() to disambiguate an "Other" tap (see there),
      // and ignored for any real, named category.
      // person: "all", or a real personId -- set by UI.viewPersonTx() (People
      // Recut #47) for a precise match on r.personId, replacing what used to
      // be a same-text-as-the-name search (a real bug: over-matched any
      // transaction whose description happened to mention the name, and
      // under-matched a real transaction of theirs whose description didn't).
      horizon: 30, filt: { q: "", type: "all", account: "all", preset: "all", category: "all", categoryKind: "", person: "all" }, openPlan: null, saved: "",
      // "Group similar" toggle on Transactions (mobile only) -- see
      // UI.toggleGroupTx()'s own comment. Not part of `filt` above: it's a
      // display option, not a filter narrowing which rows match.
      groupTx: false,
      // People Recut #42: free-text search on the People list (name/phone/
      // notes) -- its own field, not folded into `filt` above, since that's
      // Transactions' own filter set and this never touches a transaction.
      peopleQ: "",
      // Set the instant a persist() actually fails to reach localStorage --
      // see persist() itself -- and cleared the instant one succeeds again.
      // Not persisted itself for the obvious reason: if storage is what's
      // broken, this can only ever live in memory for the current session.
      saveError: false,
      // Set once, at load(), if the stored data existed but couldn't be
      // read back (corrupted JSON, or localStorage itself throwing) --
      // never cleared automatically, since the demo data it fell back to
      // is not the user's real data and every save from here on would
      // otherwise silently start overwriting whatever's still recoverable
      // in that raw stored string.
      loadError: false,
      data: null, txVisible: 25, moreOpen: false, quickAddOpen: false, arabicNumerals: false, personDetailId: null, whatIf: [], payoffOrder: "largest",
      locked: false, lockErr: "", pinMsg: "", payoffCalc: { personId: "all", amount: "" } };
  }
  // ---- app lock (Settings -> App lock) -------------------------------
  // A screen lock, not encryption: the PIN gates only whether render()
  // draws the real UI or the lock screen (see UI.render()) — the
  // financial data underneath sits in localStorage exactly as it always
  // has, inspectable by anyone with direct access to this browser's
  // storage (dev tools, etc). It's meant to stop a shoulder-surf or a
  // quick look by whoever picks up the phone, not a real access-control
  // boundary — Settings says this explicitly so nobody mistakes it for
  // more than it is.
  // Stored under its own localStorage key, deliberately separate from
  // state.data, so Wipe/Reseed (which only ever touch state.data) can
  // never accidentally clear or lock someone out via the PIN, and the PIN
  // survives a data wipe the same way a device passcode would.
  hasPin() {
    try { return !!localStorage.getItem("pcfo.pinhash.v1"); } catch (e) { return false; }
  }
  // Returns null (rather than throwing) if Web Crypto isn't available —
  // e.g. the app served over plain, non-localhost HTTP, which isn't a
  // secure context. Every caller below treats null as "can't verify",
  // never as "matches" or "silently do nothing".
  async hashPin(pin) {
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) { return null; }
  }
  async setPin(pin) {
    const hash = await this.hashPin(pin);
    if (!hash) return false;
    try { localStorage.setItem("pcfo.pinhash.v1", hash); } catch (e) {}
    return true;
  }
  removePin() {
    try { localStorage.removeItem("pcfo.pinhash.v1"); } catch (e) {}
  }
  // No PIN stored → any input "checks out" (nothing to gate), matching
  // hasPin() === false meaning the lock screen never shows in the first
  // place. hashPin() failing (crypto unavailable) is treated as a wrong
  // PIN, not a pass — "Forgot PIN?" is still the way out.
  async checkPin(pin) {
    let stored;
    try { stored = localStorage.getItem("pcfo.pinhash.v1"); } catch (e) { return true; }
    if (!stored) return true;
    const hash = await this.hashPin(pin);
    return !!hash && hash === stored;
  }
  // ---- notifications (Settings -> Notifications) ----------------------
  // Foreground-only, by necessity: this is a browser tab, not an installed
  // app with a background push channel, so nothing can arrive while it's
  // closed — Settings says so. The preference lives in localStorage too
  // (not state.data), same reasoning as the PIN.
  notifEnabled() {
    try { return localStorage.getItem("pcfo.notif.v1") === "1"; } catch (e) { return false; }
  }
  setNotifEnabled(v) {
    try { localStorage.setItem("pcfo.notif.v1", v ? "1" : "0"); } catch (e) {}
  }
  // How many things currently need attention — the same conditions the
  // Dashboard's Needs Attention alerts check (overdue plans/loans, a
  // negative card balance, budgets at 90%+, unusual spending), but a plain
  // count rather than the built alert list (which also caps each category
  // at its top 2) — this feeds the app icon's badge and the one-shot
  // notification below, both of which want the real total, not a display cap.
  attentionCount(D) {
    let n = D.plans.filter((p) => p.overdue > 0).length;
    n += this.allLoanRows("payable").filter((r) => r.status === "overdue").length;
    n += this.allLoanRows("receivable").filter((r) => r.status === "overdue").length;
    // Matches the Dashboard's "Largest open receivable" alert, which fires
    // on any open receivable outside a plan — not only an overdue one.
    n += Object.values(D.recv).filter((v) => v > 0).length;
    if (D.cards < 0) n += 1;
    // Matches both conditions the Dashboard's Needs Attention alerts check
    // for card statements (overdue, or due within a week) -- counting only
    // "overdue" here would leave the badge/notification silent while a
    // real alert is showing on the Dashboard.
    const stmtSoon = this.iso(this.addDays(new Date(), 7));
    n += D.cardStatements.filter((s) => s.overdue || (s.status !== "paid" && s.due <= stmtSoon)).length;
    n += D.savingsGoals.filter((g) => g.overdue).length;
    const monthSpend = this.monthCategorySpend(), budgets = this.state.data.budgets || {};
    n += Object.keys(budgets).filter((cat) => (monthSpend[cat] || 0) >= budgets[cat] * 0.9).length;
    // Matches the Dashboard's own overall-budget alert (renderDashboard) --
    // one nudge across every expense, same 90%-before-it's-over threshold
    // as a per-category budget.
    const overallBudget = this.state.data.overallBudget || 0;
    if (overallBudget > 0) {
      const totalSpend = Object.values(monthSpend).reduce((s, v) => s + v, 0);
      if (totalSpend >= overallBudget * 0.9) n += 1;
    }
    n += this.unusualSpending(monthSpend).length;
    // Matches the Dashboard's own to-do reminder (renderDashboard) -- same
    // reasoning as every other alert type counted above: the badge must
    // never stay silent while a real Needs Attention card is showing.
    n += this.dueSoonTodos().length;
    return n;
  }

  // ---- bootstrap -----------------------------------------------------
  // The one place the localStorage key name is decided. Bump this the day
  // the stored data's shape changes in a way old code genuinely can't
  // read (not for every small addition -- new fields old code just
  // ignores are fine under the same key) -- and push the value it's
  // replacing onto the FRONT of legacyStorageKeys() below (newest first).
  // Without that second step, a version bump on its own is exactly the
  // bug load() used to have before loadError existed: every existing
  // user's real financial history sits under a key this build no longer
  // looks at, and silently looks like a fresh install with demo data --
  // now migrateOrLoad() finds it under the old key instead and carries it
  // forward, the first time this build runs for them.
  storageKey() { return "pcfo.v7"; }
  // e.g. return ["pcfo.v7"]; the day storageKey() above becomes "pcfo.v8".
  legacyStorageKeys() { return []; }
  // Real bug, found by inspection: a genuinely first-time user (nothing
  // stored yet -- raw is simply null) and someone whose real saved data
  // just failed to load (corrupted JSON, or localStorage itself throwing)
  // used to be treated identically -- both silently fell back to seed()'s
  // demo data, so an actual load failure looked exactly like a fresh
  // install, with no way to tell the difference and no chance to recover
  // the raw string before it's overwritten by the very next persist().
  // loadError now distinguishes them: renderDashboard's Needs Attention
  // surfaces it (same pattern as saveError) rather than silently handing
  // back someone's real financial history as if it never existed.
  // Reads one stored key and, if it parses, returns the data -- otherwise
  // records the failure (loadError, plus a best-effort raw backup under
  // its OWN key so a later, older legacy key's own corrupted-backup can
  // never collide with or overwrite this one) and returns null so the
  // caller can keep looking rather than stopping here.
  readStoredKey(key) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { this.state.loadError = true; return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) {
      this.state.loadError = true;
      // The very next persist() overwrites the current key with fresh
      // demo data plus whatever the user does next, permanently losing
      // any chance of recovering this raw string -- stash an untouched
      // copy first, best-effort, so real data corrupted by something
      // outside this app (a failed write mid-save, a browser bug) isn't
      // unrecoverable the moment the user does anything at all.
      try { localStorage.setItem(key + ".corrupted-backup", raw); } catch (e2) {}
      return null;
    }
  }
  load() {
    let d = this.readStoredKey(this.storageKey());
    // Nothing (or unreadable garbage) under the current key doesn't
    // necessarily mean a fresh install -- check every key storageKey()
    // has ever replaced before assuming that and handing back demo data
    // over someone's real history. Each legacy key that fails to parse
    // is skipped, not treated as the final answer -- an unrelated bit of
    // corruption sitting under a middle key must never block reaching a
    // perfectly good one further back, and readStoredKey() has already
    // recorded/backed up that failure on its own. Checked newest-first
    // (legacyStorageKeys()' own order), so the most recently superseded
    // key wins if more than one somehow still has real data.
    let migratedFrom = null;
    if (!d) {
      for (const oldKey of this.legacyStorageKeys()) {
        const legacyData = this.readStoredKey(oldKey);
        if (legacyData) { d = legacyData; migratedFrom = oldKey; break; }
      }
    }
    if (!d) d = this.seed();
    this.state.data = d;
    // A migration only actually counts once it's written under the
    // current key -- read-only isn't enough, or the NEXT version bump's
    // own load() would look for this one's legacy key (the one it just
    // read from) and still find nothing there, having never promoted the
    // data forward from the one before that. Only reached when d
    // genuinely came from a legacy key that parsed -- never for the
    // seed() fallback, which would otherwise (a real bug, caught before
    // shipping) call persist() successfully and silently clear the very
    // loadError that fallback exists to report. persist() with no note:
    // this alone isn't a change worth an audit-trail entry, just the
    // same data settling under its new key.
    if (migratedFrom) this.persist(d);
    this.state.horizon = Number(this.props.defaultHorizon || 30);
    this.state.privacy = !!this.props.privacyDefault;
  }
  // Real bug, found by inspection: localStorage.setItem's own failure (a
  // full quota -- very reachable after months of real use in a finance
  // app that keeps every transaction forever -- or Safari private
  // browsing, which blocks writes outright) used to be silently
  // swallowed here, then state.saved was set to "Saved ..." regardless,
  // so the UI told the user their change was safe when it never actually
  // reached disk. state.data is still updated in memory either way, so
  // the app stays usable for the rest of this session -- but
  // state.saveError now records the truth, and UI.flash()/the Dashboard
  // alert built on it (see renderDashboard) make sure that truth is
  // actually seen instead of silently reverting on the next reload with
  // no warning at all.
  persist(data, note) {
    const d = Object.assign({}, data);
    if (note) d.audit = [{ at: new Date().toISOString().slice(0, 16).replace("T", " "), what: note }].concat(d.audit || []).slice(0, 120);
    let ok = true;
    try { localStorage.setItem(this.storageKey(), JSON.stringify(d)); } catch (e) { ok = false; }
    this.state.data = d;
    if (ok) {
      this.state.saved = "Saved " + new Date().toLocaleTimeString();
      this.state.saveError = false;
      // Real bug, found by inspection: any successful persist() means
      // state.data is now exactly what's on disk, whatever caused an
      // earlier load() to fail (a corrupted read, or the user
      // deliberately reseeding/wiping/restoring over it) is moot from
      // here on -- but loadError, unlike saveError just above, was never
      // being reset anywhere. Left alone, restoreFromJson() successfully
      // loading a REAL backup still left the "your data couldn't be
      // read... this is demo data" alert stuck on screen for the rest of
      // the session, actively contradicting what just happened.
      this.state.loadError = false;
    } else {
      this.state.saved = "";
      this.state.saveError = true;
    }
    return ok;
  }
  // Real bug, found late: this was called by exportJson()/exportCsv() but
  // never actually defined, so both buttons threw "app.download is not a
  // function" and silently did nothing — neither export had ever worked.
  download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // ---- backup reminder ---------------------------------------------------
  // Everything lives in this one browser's storage -- clearing site data,
  // losing the device, or a browser bug is the difference between "fine"
  // and "every transaction ever entered is gone for good," and the app's
  // only real protection (Settings' Export JSON backup) is easy to forget
  // exists once the novelty wears off. Called by UI.exportJson() only --
  // exportCsv() is transactions-only and restoreFromJson() can't rebuild
  // accounts/people/plans from it, so it doesn't count as a real backup.
  recordBackup() {
    const data = JSON.parse(JSON.stringify(this.state.data));
    data.lastBackupAt = this.today();
    data.lastBackupTxCount = data.tx.length;
    this.persist(data);
  }
  // A nudge, not an alarm -- gated on there being real data worth losing
  // (a fresh install's demo/near-empty ledger doesn't need this), then
  // true once EITHER a real amount of time has passed since the last
  // export OR enough new transactions have piled up since then that the
  // last backup would leave a meaningful gap, whichever comes first.
  // Cleared the moment recordBackup() runs again, same as saveError/
  // loadError clear on their own resolving action.
  needsBackupReminder() {
    const d = this.state.data;
    if (!d.tx || d.tx.length < 10) return false;
    if (!d.lastBackupAt) return true;
    const daysSince = Math.round((new Date(this.today()) - new Date(d.lastBackupAt)) / 86400000);
    const newTxSince = d.tx.length - (d.lastBackupTxCount || 0);
    return daysSince >= 30 || newTxSince >= 20;
  }

  // ---- helpers ---------------------------------------------------------
  uid(p) { return p + "_" + Math.random().toString(36).slice(2, 9); }
  // Shared #rrggbb parser -- both this file's darkenHex() and UI's
  // cardTextColor() (its luminance check) need the same {r,g,b} bytes, and
  // used to each parse the hex string independently; a single source here
  // means a future format change (3-digit hex, alpha) only has to be
  // taught once. Callers decide their own fallback for an unparsable hex
  // (darkenHex wants a visible gray, cardTextColor wants "treat as light"),
  // so this only ever returns real bytes or null, never a guessed default.
  hexToRgb(hex) {
    const h = (hex || "").replace("#", "");
    if (h.length !== 6) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  // Same 62%-of-primary darkening UI.cardBackground() applies via CSS
  // color-mix() for the single-color card face, but as a real hex string --
  // needed to seed a sensible default into the "Secondary color" field
  // (see open() below): a native <input type="color"> can never hold/submit
  // an empty value, so leaving that field's default value "" makes the
  // browser normalize it to literal black on save, not "no color2 chosen".
  darkenHex(hex) {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return "#3a3a3a";
    const r = Math.round(rgb.r * 0.62), g = Math.round(rgb.g * 0.62), b = Math.round(rgb.b * 0.62);
    const hx = (n) => n.toString(16).padStart(2, "0");
    return "#" + hx(r) + hx(g) + hx(b);
  }
  iso(d) { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  today() { return this.iso(new Date()); }
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  addMonths(d, n) { const x = new Date(d); const day = x.getDate(); x.setMonth(x.getMonth() + n); if (x.getDate() < day) x.setDate(0); return x; }
  n(v) { const x = parseFloat(String(v).replace(/,/g, "")); return isFinite(x) ? Math.round(x * 100) / 100 : 0; }
  // P1 fix: glue the sign+currency+number into one LTR-ordered run so RTL
  // page context can't strand the sign away from the digits (was rendering
  // "−EGP 8,400" in English but "8,400 ج.م−" in Arabic for the same value).
  bidiWrap(s) { return '<bdi dir="ltr" class="amt-bidi">' + s + "</bdi>"; }
  // P2 fix: Arabic convention (Egypt) reads amount-then-currency ("8,400
  // ج.م"), not currency-then-amount ("ج.م 8,400") — the English-style order
  // was internally consistent but not the locally idiomatic one. English
  // keeps currency-first.
  moneyStr(sign, s, t) {
    return this.state.lang === "ar" ? sign + s + " " + t.cur : sign + t.cur + " " + s;
  }
  // Opt-in, Arabic mode only: render ١٢٣ instead of 123. A per-viewer
  // display preference, not app data — same as lang/privacy above, it isn't
  // persisted and just resets to off on a fresh load.
  arabicDigits(s) {
    const map = { "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤", "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩" };
    return String(s).replace(/[0-9]/g, (d) => map[d]);
  }
  numStr(s) {
    return (this.state.lang === "ar" && this.state.arabicNumerals) ? this.arabicDigits(s) : s;
  }
  fmt(v) {
    const t = this.T[this.state.lang];
    if (this.state.privacy) return "••••";
    const s = this.numStr(Math.round(Math.abs(v)).toLocaleString("en-US"));
    return this.bidiWrap(this.moneyStr(v < 0 ? "−" : "", s, t));
  }
  fmtS(v) {
    if (this.state.privacy) return "••••";
    const t = this.T[this.state.lang];
    const s = this.numStr(Math.round(Math.abs(v)).toLocaleString("en-US"));
    return this.bidiWrap(this.moneyStr(v < 0 ? "−" : "+", s, t));
  }
  // Same formatting as fmt() -- currency unit, sign, Arabic-numeral toggle,
  // Hide Amounts -- minus the <bdi> HTML wrap, for the few spots that need
  // a plain string rather than markup (a chart tooltip's textContent, an
  // onclick argument that can't carry HTML).
  fmtPlain(v) {
    if (this.state.privacy) return "••••";
    const t = this.T[this.state.lang];
    const s = this.numStr(Math.round(Math.abs(v)).toLocaleString("en-US"));
    return this.moneyStr(v < 0 ? "−" : "", s, t);
  }
  L(en, ar) { if (this.state.lang !== "ar") return en; return ar || this.ARW[en] || en; }
  dshort(d) { const x = new Date(d); return x.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
  personName(id) { const p = (this.state.data.people || []).find(x => x.id === id); return p ? p.name : "—"; }
  accName(id) { const a = (this.state.data.accounts || []).find(x => x.id === id); return a ? a.name : "—"; }
  planDir(planId) { const p = (this.state.data.plans || []).find(x => x.id === planId); return p ? p.direction : "in"; }

  // ---- translations ------------------------------------------------------
  T = {
    en: { brand: "Personal CFO", brandSub: "Financial control", dashboard: "Dashboard", accounts: "Accounts", transactions: "Transactions", people: "People", installments: "Installments", statements: "Card statements", goals: "Savings goals", ledgers: "Receivables & Payables", investments: "Investments", recurring: "Recurring", forecast: "Forecast", reports: "Reports", cashflow: "Cash flow", settings: "Settings", todos: "To-do list",
      availableBalance: "Available balance", availableNote: "Spendable right now — cash, bank and wallets. Receivables, investments and credit lines are excluded.", netWorth: "Net worth", receivables: "Owed to me", payables: "I owe", investmentsShort: "Invested", available: "Available",
      position: "Current financial position", whereMoney: "Where my money is", upcoming30: "Next 30 days", seeForecast: "Forecast →", thisMonth: "This month", income: "Income", expenses: "Expenses", topCategories: "Top spend categories", needsAttention: "Needs attention",
      cash: "Cash", bank: "Bank accounts", wallets: "Smart wallets", other: "Other / cards", totalAssets: "Total assets", liabilities: "Liabilities",
      aIncome: "+ Income", aExpense: "+ Expense", aTransfer: "Transfer", aReceivable: "+ Lend / owed to me", aDebt: "+ Debt I owe", aSale: "+ Installment sale", aPurchasePlan: "+ Installment purchase", aInvest: "+ Investment", aPerson: "+ Person", aAccount: "+ Account", aCollect: "Record collection", aRepay: "Record repayment", aRecurring: "+ Recurring rule", aStatement: "+ Statement", payStatement: "Pay statement", aGoal: "+ Savings goal", quickAdd: "Quick add",
      search: "Search", type: "Type", account: "Account", period: "Period", clear: "Clear", date: "Date", details: "Details", person: "Person", category: "Category", amount: "Amount", phone: "Phone", owesMe: "Owes me", iOwe: "I owe", net: "Net", plans: "Plans", history: "History",
      total: "Sale total", collected: "Collected", remaining: "Remaining", dueDate: "Due", paid: "Paid", status: "Status", recordPayment: "Record payment", showSchedule: "Show schedule", hideSchedule: "Hide schedule",
      source: "Source", collect: "Collect", pay: "Pay", name: "Name", invested: "Invested", currentValue: "Current value", pnl: "Profit / loss", updateValue: "Update value",
      frequency: "Frequency", nextDate: "Next", postNow: "Post now", timeline: "Projected balance", netWorthTrend: "Net worth trend", cashFlow: "Cash flow by month", month: "Month", byCategory: "Expenses by category", aging: "Aging", bucket: "Bucket", bySource: "Income by source",
      dataBackup: "Backup & export", backupNote: "Everything lives in this browser and saves after every change. Export a JSON snapshot to keep a real backup.", exportJson: "Export JSON backup", exportCsv: "Export transactions CSV", importJson: "Restore from JSON", dangerZone: "Reset", reseed: "Reload demo data", wipe: "Erase all data", rules: "Calculation rules", auditTrail: "Audit trail",
      cancel: "Cancel", save: "Save", privacy: "Hide amounts", privacyOff: "Show amounts", viewTx: "Transactions", transfer: "Transfer",
      ledgerNote: "Records are immutable — reversing a transaction posts a compensating entry instead of deleting history.", recurNote: "Forecast reads these rules directly; posting creates a real dated transaction.",
      groups: "Savings groups", aGroup: "+ Savings group", gContribute: "Record contribution", gCollect: "Record payout", myTurn: "My turn", payoutAmount: "Payout", paidIn: "Paid in so far",
      creditCards: "Credit cards", payCard: "Pay card", aCard: "+ Credit card", limitLabel: "Total limit", owedLabel: "Outstanding", availLabel: "Available to spend",
      edit: "Edit", delete: "Delete", loadMore: "Load more", noMatches: "No records match your filters.", more: "More", primaryNav: "Sections",
      cur: "EGP" },
    ar: { brand: "المدير المالي", brandSub: "تحكم مالي", dashboard: "الرئيسية", accounts: "الحسابات", transactions: "الحركات", people: "الأشخاص", installments: "الأقساط", statements: "كشوف حساب الكروت", goals: "أهداف الادخار", ledgers: "لي وعليّ", investments: "الاستثمارات", recurring: "المتكررة", forecast: "التوقعات", reports: "التقارير", cashflow: "التدفقات النقدية", settings: "الإعدادات", todos: "قائمة المهام",
      availableBalance: "الرصيد المتاح", availableNote: "المتاح للصرف الآن — كاش وبنك ومحافظ. لا يشمل المستحقات ولا الاستثمارات ولا حدود الكريدت.", netWorth: "صافي الثروة", receivables: "لي عند الناس", payables: "عليّ للناس", investmentsShort: "مستثمر", available: "المتاح",
      position: "الموقف المالي الحالي", whereMoney: "أين أموالي", upcoming30: "الـ 30 يوم القادمة", seeForecast: "التوقعات →", thisMonth: "هذا الشهر", income: "الإيرادات", expenses: "المصروفات", topCategories: "أكبر بنود الصرف", needsAttention: "يحتاج انتباه",
      cash: "كاش", bank: "حسابات بنكية", wallets: "محافظ إلكترونية", other: "أخرى / بطاقات", totalAssets: "إجمالي الأصول", liabilities: "الالتزامات",
      aIncome: "+ إيراد", aExpense: "+ مصروف", aTransfer: "تحويل", aReceivable: "+ سلفة / لي", aDebt: "+ دين عليّ", aSale: "+ بيع بالتقسيط", aPurchasePlan: "+ شراء بالتقسيط", aInvest: "+ استثمار", aPerson: "+ شخص", aAccount: "+ حساب", aCollect: "تسجيل تحصيل", aRepay: "تسجيل سداد", aRecurring: "+ قاعدة متكررة", aStatement: "+ كشف حساب", payStatement: "سداد كشف حساب", aGoal: "+ هدف ادخار", quickAdd: "إضافة سريعة",
      search: "بحث", type: "النوع", account: "الحساب", period: "الفترة", clear: "مسح", date: "التاريخ", details: "التفاصيل", person: "الشخص", category: "التصنيف", amount: "المبلغ", phone: "الهاتف", owesMe: "له عندي", iOwe: "عليّ", net: "الصافي", plans: "خطط", history: "السجل",
      total: "إجمالي البيع", collected: "المحصّل", remaining: "المتبقي", dueDate: "الاستحقاق", paid: "مدفوع", status: "الحالة", recordPayment: "تسجيل دفعة", showSchedule: "عرض الجدول", hideSchedule: "إخفاء الجدول",
      source: "المصدر", collect: "تحصيل", pay: "سداد", name: "الاسم", invested: "المستثمر", currentValue: "القيمة الحالية", pnl: "ربح / خسارة", updateValue: "تحديث القيمة",
      frequency: "التكرار", nextDate: "القادم", postNow: "تسجيل الآن", timeline: "الرصيد المتوقع", netWorthTrend: "تطور صافي الثروة", cashFlow: "التدفق النقدي شهرياً", month: "الشهر", byCategory: "المصروفات بالتصنيف", aging: "أعمار الأرصدة", bucket: "الفئة", bySource: "الإيراد بالمصدر",
      dataBackup: "النسخ والتصدير", backupNote: "كل البيانات محفوظة في هذا المتصفح بعد كل تعديل. صدّر نسخة JSON للاحتفاظ بنسخة حقيقية.", exportJson: "تصدير نسخة JSON", exportCsv: "تصدير الحركات CSV", importJson: "استعادة من JSON", dangerZone: "إعادة الضبط", reseed: "تحميل البيانات التجريبية", wipe: "حذف كل البيانات", rules: "قواعد الحساب", auditTrail: "سجل التغييرات",
      cancel: "إلغاء", save: "حفظ", privacy: "إخفاء المبالغ", privacyOff: "إظهار المبالغ", viewTx: "الحركات", transfer: "تحويل",
      ledgerNote: "السجلات غير قابلة للحذف — العكس يتم بقيد مقابل مع الاحتفاظ بالتاريخ.", recurNote: "التوقعات تقرأ هذه القواعد مباشرة؛ التسجيل ينشئ حركة حقيقية بتاريخها.",
      groups: "الجمعيات", aGroup: "+ جمعية", gContribute: "تسجيل قسط", gCollect: "تسجيل قبض الجمعية", myTurn: "دوري", payoutAmount: "المقبوض", paidIn: "المدفوع حتى الآن",
      creditCards: "بطاقات الائتمان", payCard: "سداد البطاقة", aCard: "+ بطاقة ائتمان", limitLabel: "إجمالي الحد", owedLabel: "المستحق", availLabel: "المتاح للصرف",
      edit: "تعديل", delete: "حذف", loadMore: "تحميل المزيد", noMatches: "لا توجد حركات مطابقة للفلاتر.", more: "المزيد", primaryNav: "الأقسام",
      cur: "ج.م" }
  };
  ARW = {
    "Everything the ledger knows, as of ": "كل ما يعرفه السجل، حتى ",
    " accounts · transfers never hit income or expense": " حساب · التحويلات لا تُحسب إيراداً ولا مصروفاً",
    " records match your filters": " حركة مطابقة للفلاتر",
    " people · balances computed from the ledger": " شخص · الأرصدة محسوبة من السجل",
    " plans · allocation handles partial, early and balloon payments": " خطة · التوزيع يعالج الدفعات الجزئية والمبكرة والدفعة الأخيرة",
    "Open positions by person and by plan": "الأرصدة المفتوحة بالشخص وبالخطة",
    "Contributions out, one payout in at your turn": "أقساط تدفعها، ودفعة واحدة تقبضها في دورك",
    " positions · excluded from available balance": " مركز · غير مدرجة في الرصيد المتاح",
    "Monthly rules: ": "قواعد شهرية: ", " in, ": " داخل، ", " out": " خارج",
    "If nothing changes, this is your runway": "لو لم يتغير شيء، هذا هو مسارك المالي",
    "Six-month history plus aging and category analysis": "تاريخ ستة أشهر مع أعمار الأرصدة وتحليل التصنيفات",
    "Backup, restore and the calculation rules in force": "النسخ والاستعادة وقواعد الحساب المعمول بها",
    "as of ": "حتى ", " item(s)": " عنصر", " transactions": " حركة",
    "Autosaves to this browser after every change": "يُحفظ تلقائياً في هذا المتصفح بعد كل تعديل",
    "Opening ": "رصيد افتتاحي ", " records": " حركة",
    "cash": "كاش", "bank": "بنك", "wallet": "محفظة", "card": "بطاقة", "other": "أخرى",
    "Overdue collection · ": "تحصيل متأخر · ", "Overdue payment · ": "سداد متأخر · ", " was due ": " كان مستحق ",
    "Overdue statement · ": "كشف حساب متأخر · ", "Statement due soon · ": "كشف حساب قرب ميعاده · ",
    "Savings goal behind — ": "هدف ادخار متأخر — ", " still needed — target date ": " لسه محتاج — تاريخ الهدف ", " has passed.": " فات.",
    "Overdue since ": "متأخر من ", "Due ": "مستحق في ",
    " installment(s) past due — ": " قسط متأخر — ", " on ": " على ",
    "Largest open receivable": "أكبر مستحق مفتوح", " owes ": " عليه ", " outside any plan.": " خارج أي خطة.",
    "Credit card balance": "رصيد بطاقة الائتمان", " outstanding — counted as a liability, not as available money.": " مستحق — يُحسب التزاماً وليس مالاً متاحاً.",
    "Total sales": "إجمالي المبيعات", "Paid / total": "مدفوع / الإجمالي", "Overdue": "متأخر",
    "Due this week": "مستحق هذا الأسبوع", "Due in 30 days": "مستحق خلال 30 يوم", "Next 30–60 days": "من 30 إلى 60 يوم",
    "Due ≤30d": "خلال 30 يوم", "Later": "لاحقاً", "No date": "بدون تاريخ", "On schedule": "في الموعد", "Open": "مفتوح",
    "Direct loan": "سلفة مباشرة", "Loan / debt": "دين / سلفة",
    "Owed to me": "لي", "I owe": "عليّ", " installments · created ": " قسط · أُنشئت ", " paid": " مدفوع",
    "Overdue: ": "متأخر: ", "No overdue": "لا توجد متأخرات", "Next: ": "القادم: ", "Fully settled": "مسدد بالكامل",
    "Projected balance · ": "الرصيد المتوقع · ", " days": " يوم", "Available today": "المتاح اليوم",
    "Expected inflows": "التدفقات الداخلة المتوقعة", "Expected outflows": "التدفقات الخارجة المتوقعة",
    "Projected balance": "الرصيد المتوقع", "Up ": "زيادة ", "Down ": "نقص ", " from today's ": " عن رصيد اليوم ",
    "Today": "اليوم", "12 months": "12 شهر", "6 months": "6 أشهر",
    "Collect · ": "تحصيل · ", "Pay · ": "سداد · ",
    "All types": "كل الأنواع", "All accounts": "كل الحسابات", "All time": "كل الفترات",
    "Last 7 days": "آخر 7 أيام", "Last 30 days": "آخر 30 يوم", "Last 90 days": "آخر 90 يوم", "Last 12 months": "آخر 12 شهر",
    "Daily": "يومي", "Weekly": "أسبوعي", "Monthly": "شهري", "Quarterly": "ربع سنوي", "Yearly": "سنوي", " · day ": " · يوم ",
    "Net worth today ": "صافي الثروة اليوم ", "up ": "زيادة ", "down ": "نقص ", " over 6 months": " خلال 6 أشهر",
    "Monthly commitments ": "التزامات شهرية ", " against recurring income ": " مقابل إيراد متكرر ",
    "reverse": "عكس", "reversed": "معكوسة",
    "Merchant / person": "التاجر / الشخص", "From": "من", "To": "إلى",
    "Transfers never touch income or expense totals.": "التحويلات لا تؤثر على إجمالي الإيرادات أو المصروفات.",
    "Paid out of": "مدفوعة من", "Received into": "مستلمة في", "Into account": "إلى الحساب", "Paid from": "مدفوعة من",
    "No cash movement (opening balance)": "بدون حركة نقدية (رصيد افتتاحي)", "No cash movement": "بدون حركة نقدية",
    "Due date": "تاريخ الاستحقاق", "Sale date": "تاريخ البيع", "Customer": "العميل", "Seller": "البائع",
    "What was sold": "ما تم بيعه", "What was bought": "ما تم شراؤه", "Sale total": "إجمالي البيع", "Total price": "السعر الإجمالي",
    "Down payment": "المقدم", "Down payment into": "المقدم إلى", "Down payment from": "المقدم من", "No down payment": "بدون مقدم",
    "Number of installments": "عدد الأقساط", "Frequency": "التكرار", "First due date": "أول تاريخ استحقاق",
    "Final balloon payment": "الدفعة الأخيرة الكبيرة", "Optional. Leave 0 for equal installments.": "اختياري. اتركه صفراً للأقساط المتساوية.",
    "Plan": "الخطة", "Partial, exact or several installments at once — allocation is automatic.": "جزئية أو كاملة أو عدة أقساط معاً — التوزيع تلقائي.",
    "Amount invested": "المبلغ المستثمر", "Current value": "القيمة الحالية", "Purchase date": "تاريخ الشراء", "Funded from": "مصدر التمويل",
    "Investment": "الاستثمار", "New current value": "القيمة الحالية الجديدة", "As of": "حتى تاريخ", "Notes": "ملاحظات",
    "Opening balance": "الرصيد الافتتاحي", "Reference / notes": "مرجع / ملاحظات", "Day of month": "يوم من الشهر",
    "Cash": "كاش", "Bank": "بنك", "Smart wallet": "محفظة إلكترونية", "Credit card": "بطاقة ائتمان", "Other": "أخرى",
    "Group name": "اسم الجمعية", "Contribution per period": "قيمة القسط", "Number of periods": "عدد الأشهر / الدورات",
    "My turn (position)": "دوري (الترتيب)", "First contribution date": "تاريخ أول قسط", "Group": "الجمعية",
    "+ Savings group (gam3ya)": "+ جمعية", "Record contribution": "تسجيل قسط", "Record payout received": "تسجيل قبض الجمعية",
    "Gam3ya · ": "جمعية · ", "Gam3ya payout · ": "قبض جمعية · ", "Turn ": "الدور ",
    " of ": " من ", " · contribution ": " · قسط ", "Payout collected": "تم القبض", "Payout not collected yet": "لم يتم القبض بعد",
    "Payout due ": "القبض في ", "Remaining to pay ": "باقي السداد ", "My payout": "دوري",
    "Bank / issuer": "البنك / جهة الإصدار", "Credit limit": "الحد الائتماني", "Card name": "اسم البطاقة",
    "Current outstanding": "المستحق حالياً", "Statement day": "يوم كشف الحساب", "No bank set": "بدون بنك",
    " used": " مستخدم", " left": " متاح", "Leave 0 for non-card accounts.": "اتركه صفراً للحسابات غير البطاقات.",
    "What you owe on the card today.": "ما عليك على البطاقة اليوم.",
    "Income": "إيراد", "Expense": "مصروف",
    "Stocks": "أسهم", "Gold": "ذهب", "Mutual fund": "صندوق", "Fixed deposit": "وديعة", "Certificate": "شهادة", "Crypto": "عملات رقمية", "Business": "مشروع",
    "Edit person": "تعديل شخص", "Edit account": "تعديل حساب", "Delete ": "حذف ", "Has ledger records": "له حركات مسجلة",
    "Edit": "تعديل", "Delete": "حذف", "Edit investment": "تعديل استثمار",
    "Has payments recorded — reverse the payments first, or leave the plan as-is.": "له دفعات مسجلة — اعكس الدفعات الأول، أو سيب الخطة زي ما هي.",
    "Has a purchase transaction recorded — reverse it first, or leave the investment as-is.": "له حركة شراء مسجلة — اعكسها الأول، أو سيب الاستثمار زي ما هو.",
    "Delete plan": "حذف الخطة", "Delete investment": "حذف الاستثمار",
    "Edit savings group": "تعديل جمعية", "Delete group": "حذف الجمعية",
    "Display": "العرض",
    "Categories": "الفئات", "Add expense category": "إضافة فئة مصروف", "e.g. Gym": "زي: جيم",
    "Add income category": "إضافة فئة دخل", "e.g. Bonus": "زي: مكافأة", "Add": "إضافة", "Remove ": "حذف ",
    "Restore from this backup? This replaces everything currently stored.": "الاستعادة من النسخة دي؟ هيستبدل كل البيانات المحفوظة حالياً.",
    "Couldn't read that file.": "معرفتش أقرأ الملف ده.",
    // P1 fix: expense/income categories used to be a hardcoded English list
    // with no Arabic translations, so the Arabic UI showed a mixed-language
    // dropdown ("Salary, Freelance, مشروع, Commission, ..."). FORMS() already
    // ran every option label through this dictionary — the categories were
    // just missing from it.
    "Food": "طعام", "Transportation": "مواصلات", "Rent": "إيجار", "Electricity": "كهرباء", "Water": "مياه",
    "Internet": "إنترنت", "Mobile": "موبايل", "Shopping": "تسوق", "Clothing": "ملابس", "Medical": "طبي",
    "Education": "تعليم", "Entertainment": "ترفيه", "Family": "أسرة", "Children": "أطفال", "Car": "سيارة",
    "Home": "منزل", "Subscriptions": "اشتراكات", "Loans": "قروض",
    "Salary": "راتب", "Freelance": "عمل حر", "Commission": "عمولة", "Rental": "إيجار (دخل)",
    "Interest": "فوائد", "Selling items": "بيع أغراض"
  };
  NAV = [
    ["dashboard", "M3 12h4l3 8 4-16 3 8h4"],
    ["accounts", "M3 7h18v12H3zM3 11h18"],
    ["transactions", "M4 7h13l-3-3M20 17H7l3 3"],
    ["people", "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6"],
    ["installments", "M4 5h16v15H4zM8 3v4M16 3v4M4 10h16M9 14h2M14 14h2"],
    ["statements", "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"],
    ["goals", "M5 21V3M5 4h13l-3 4 3 4H5"],
    ["groups", "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16M12 8v4l3 2"],
    ["ledgers", "M12 4v16M6 9l6-5 6 5"],
    ["investments", "M4 19V9M10 19V5M16 19v-7M22 19H2"],
    ["recurring", "M4 12a8 8 0 0 1 13-6M20 12a8 8 0 0 1-13 6M17 3v3h-3M7 21v-3h3"],
    ["forecast", "M3 17l5-6 4 3 5-8 4 5"],
    ["reports", "M6 20V10M12 20V4M18 20v-8"],
    ["cashflow", "M3 7h12l-3-3M21 17H9l3 3M3 12h18"],
    ["settings", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2-1-2-4-2 .6-2-1.2L14.6 4h-5.2L9 6.4 7 7.6 5 7 3 11l2 1-2 1 2 4 2-.6 2 1.2.4 2.4h5.2l.4-2.4 2-1.2 2 .6 2-4z"],
    ["todos", "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"]
  ];
  // primary tabs shown at all times; the rest live under "More"
  PRIMARY = ["dashboard", "transactions", "accounts", "people", "installments"];

  // ---- seed data (verbatim from the original app) -----------------------
  seed() {
    const T0 = new Date(), iso = (d) => this.iso(d), aM = (d, n) => this.addMonths(d, n), aD = (d, n) => this.addDays(d, n);
    const accounts = [
      { id: "cash", name: "Cash Wallet", type: "cash", opening: 7500, color: "#0088b0", active: true },
      { id: "cib", name: "CIB Current", type: "bank", opening: 118000, color: "#1186ac", active: true },
      { id: "sav", name: "CIB Savings", type: "bank", opening: 57700, color: "#62c5ee", active: true },
      { id: "vf", name: "Vodafone Cash", type: "wallet", opening: 4200, color: "#006786", active: true },
      { id: "ip", name: "Instapay", type: "wallet", opening: 12600, color: "#7d7979", active: true },
      { id: "card", name: "Titanium", type: "card", bank: "CIB", limit: 60000, opening: -8400, color: "#004961", active: true },
      { id: "card_bm", name: "Platinum", type: "card", bank: "Banque Misr", limit: 40000, opening: -14200, color: "#006786", active: true },
      { id: "card_nbe", name: "Visa Classic", type: "card", bank: "National Bank of Egypt", limit: 25000, opening: -3100, color: "#1186ac", active: true }
    ];
    accounts.find(a => a.id === "cib").bank = "CIB"; accounts.find(a => a.id === "sav").bank = "CIB";
    const P = (id, name, phone) => ({ id, name, phone });
    const people = [P("hazem", "Hazem", "0100 111 2233"), P("sameh", "Sameh Hassan", "0101 445 8890"), P("mhassan", "Mohamed Hassan", "0122 908 4411"), P("hussein", "Hussein Sameh", "0111 233 4455"), P("hussali", "Hussein Ali", "0114 776 3321"), P("hady", "Hady Sameh", "0106 552 8877"), P("stareq", "S-Tareq", "0128 331 9090"), P("amadel", "Am Adel", "0102 776 1234"), P("mama", "Home (Mama)", ""), P("borrow", "Misc Borrower", ""), P("ahmed", "Ahmed Fathy", "0109 887 6655")];
    const tx = []; const add = (o) => { tx.push(Object.assign({ id: this.uid("t"), created: iso(T0), void: false }, o)); };

    const open = [["hady", 12000], ["amadel", 3000], ["mama", 1750], ["stareq", 1020], ["mhassan", 52300], ["hussein", 28000], ["hussali", 11050], ["borrow", 2000], ["hazem", 77500], ["sameh", 10000]];
    open.forEach(([p, a]) => add({ date: iso(aM(T0, -7)), type: "receivable", amount: a, personId: p, accountId: null, desc: "Opening balance carried in", due: iso(aM(T0, 2)) }));
    add({ date: iso(aM(T0, -9)), type: "payable", amount: 20000, personId: "ahmed", accountId: null, desc: "Loan from Ahmed — opening balance", due: iso(aM(T0, 3)) });
    add({ date: iso(aM(T0, -4)), type: "debt_payment", amount: 5000, personId: "ahmed", accountId: "cib", desc: "Loan repayment 1" });
    add({ date: iso(aM(T0, -2)), type: "debt_payment", amount: 3000, personId: "ahmed", accountId: "cib", desc: "Loan repayment 2" });

    for (let i = 7; i >= 0; i--) { const d = aM(T0, -i); d.setDate(25); if (d <= T0) add({ date: iso(d), type: "income", amount: 30000, accountId: "cib", category: "Salary", desc: "Monthly salary", personId: null }); }
    for (let i = 7; i >= 0; i--) { const d = aM(T0, -i); d.setDate(10); if (d <= T0) add({ date: iso(d), type: "expense", amount: 500, accountId: "cib", category: "Internet", desc: "Home internet", personId: null }); }
    add({ date: iso(aM(T0, -5)), type: "income", amount: 9800, accountId: "ip", category: "Freelance", desc: "Freelance — reporting tool", personId: null });
    add({ date: iso(aM(T0, -3)), type: "income", amount: 11200, accountId: "ip", category: "Freelance", desc: "Freelance — brand site", personId: null });
    add({ date: iso(aM(T0, -1)), type: "income", amount: 14500, accountId: "ip", category: "Freelance", desc: "Freelance dashboard build", personId: null });
    add({ date: iso(aD(T0, -9)), type: "income", amount: 6200, accountId: "ip", category: "Freelance", desc: "Retainer — landing page", personId: null });
    add({ date: iso(aD(T0, -21)), type: "income", amount: 3100, accountId: "cash", category: "Selling items", desc: "Sold old monitor", personId: null });

    const cats = [["Food", 120, 900], ["Transportation", 60, 400], ["Shopping", 250, 2200], ["Mobile", 100, 300], ["Medical", 200, 1800], ["Entertainment", 90, 700], ["Family", 300, 2500], ["Car", 200, 1500], ["Subscriptions", 70, 300], ["Electricity", 250, 700]];
    const accIds = ["cash", "cash", "vf", "card", "card_bm", "card_nbe", "cib", "ip"];
    for (let i = 0; i < 215; i += 2) {
      const d = aD(T0, -i); const c = cats[Math.floor(Math.random() * cats.length)];
      const amt = Math.round((c[1] + Math.random() * (c[2] - c[1])) / 5) * 5;
      add({ date: iso(d), type: "expense", amount: amt, accountId: accIds[Math.floor(Math.random() * accIds.length)], category: c[0], desc: c[0] + " — day to day", personId: null });
    }
    for (let i = 7; i >= 0; i--) { const d = aM(T0, -i); d.setDate(3); if (d <= T0) add({ date: iso(d), type: "expense", amount: 9000, accountId: "cib", category: "Rent", desc: "Apartment rent", personId: null }); }
    add({ date: iso(aD(T0, -12)), type: "transfer", amount: 10000, fromId: "cib", toId: "cash", desc: "ATM withdrawal for cash wallet" });
    add({ date: iso(aD(T0, -5)), type: "transfer", amount: 2500, fromId: "cash", toId: "vf", desc: "Top up Vodafone Cash" });
    for (let i = 7; i >= 0; i--) {
      const w = aM(T0, -i); w.setDate(6); if (w <= T0) add({ date: iso(w), type: "transfer", amount: 2500, fromId: "cib", toId: "cash", desc: "ATM withdrawal" });
      const u = aM(T0, -i); u.setDate(12); if (u <= T0) add({ date: iso(u), type: "transfer", amount: 800, fromId: "cash", toId: "vf", desc: "Top up Vodafone Cash" });
      const c = aM(T0, -i); c.setDate(20); if (c <= T0) add({ date: iso(c), type: "transfer", amount: 2500, fromId: "cib", toId: "card", desc: "CIB Titanium repayment" });
      const c2 = aM(T0, -i); c2.setDate(22); if (c2 <= T0) add({ date: iso(c2), type: "transfer", amount: 3000, fromId: "cib", toId: "card_bm", desc: "Banque Misr Platinum repayment" });
      const c3 = aM(T0, -i); c3.setDate(24); if (c3 <= T0) add({ date: iso(c3), type: "transfer", amount: 1200, fromId: "cib", toId: "card_nbe", desc: "NBE Visa repayment" });
    }
    add({ date: iso(aD(T0, -30)), type: "receivable_payment", amount: 4000, personId: "mhassan", accountId: "ip", desc: "Partial collection from Mohamed" });
    add({ date: iso(aD(T0, -18)), type: "receivable_payment", amount: 2500, personId: "hussein", accountId: "cash", desc: "Collection from Hussein" });

    const investments = [{ id: "thndr", name: "Thndr portfolio", type: "Stocks", invested: 340000, value: 400000, date: iso(aM(T0, -10)), accountId: "cib" }];
    investments.forEach(v => add({ date: v.date, type: "investment_buy", amount: v.invested, accountId: null, category: v.type, desc: "Opening position — " + v.name, investmentId: v.id }));

    const p1First = aM(T0, -2); p1First.setDate(1);
    const plan1 = { id: "pl_hazem", personId: "hazem", direction: "in", title: "MacBook Pro sold to Hazem", total: 24000, down: 0, created: iso(aM(T0, -3)), schedule: Array.from({ length: 12 }, (_, i) => ({ no: i + 1, due: iso(aM(p1First, i)), amount: 2000 })) };
    const p2First = aM(T0, -1); p2First.setDate(5);
    const plan2 = { id: "pl_sameh", personId: "sameh", direction: "in", title: "Workshop equipment — Sameh", total: 50000, down: 10000, created: iso(aM(T0, -2)), schedule: [{ no: 1, due: iso(p2First), amount: 5000 }, { no: 2, due: iso(aM(p2First, 1)), amount: 5000 }, { no: 3, due: iso(aM(p2First, 2)), amount: 5000 }, { no: 4, due: iso(aM(p2First, 3)), amount: 5000 }, { no: 5, due: iso(aM(p2First, 4)), amount: 20000 }] };
    const p3First = aM(T0, -1); p3First.setDate(20);
    const plan3 = { id: "pl_phone", personId: "ahmed", direction: "out", title: "Phone bought in installments", total: 36000, down: 6000, created: iso(aM(T0, -2)), schedule: Array.from({ length: 6 }, (_, i) => ({ no: i + 1, due: iso(aM(p3First, i)), amount: 5000 })) };
    const plans = [plan1, plan2, plan3];
    add({ date: plan2.created, type: "installment_sale", amount: 10000, accountId: "cib", personId: "sameh", planId: "pl_sameh", desc: "Down payment — " + plan2.title });
    add({ date: plan1.created, type: "installment_sale", amount: 0, accountId: null, personId: "hazem", planId: "pl_hazem", desc: "Sale created — " + plan1.title });
    add({ date: plan3.created, type: "installment_sale", amount: 6000, accountId: "cib", personId: "ahmed", planId: "pl_phone", desc: "Down payment paid — " + plan3.title });
    add({ date: iso(plan1.schedule[0].due), type: "installment_payment", amount: 2000, accountId: "vf", personId: "hazem", planId: "pl_hazem", desc: "Installment 1" });
    add({ date: iso(plan1.schedule[1].due), type: "installment_payment", amount: 2000, accountId: "vf", personId: "hazem", planId: "pl_hazem", desc: "Installment 2" });
    add({ date: iso(aD(T0, -6)), type: "installment_payment", amount: 1200, accountId: "cash", personId: "hazem", planId: "pl_hazem", desc: "Partial payment on installment 3" });
    add({ date: iso(plan2.schedule[0].due), type: "installment_payment", amount: 5000, accountId: "ip", personId: "sameh", planId: "pl_sameh", desc: "Installment 1" });
    add({ date: iso(plan3.schedule[0].due), type: "installment_payment", amount: 5000, accountId: "cib", personId: "ahmed", planId: "pl_phone", desc: "Installment 1 paid" });

    const g1 = aM(T0, -2); g1.setDate(1);
    const g2 = aM(T0, -5); g2.setDate(1);
    const groups = [
      { id: "g5k", name: "Gam3ya 5k · 20 months", amount: 5000, periods: 20, myTurn: 5, freq: "monthly", first: iso(g1), accountId: "cib" },
      { id: "g10k", name: "Gam3ya 10k · Sameh's circle", amount: 10000, periods: 12, myTurn: 2, freq: "monthly", first: iso(g2), accountId: "cib" }
    ];
    for (let i = 0; i < 3; i++) { const dd = aM(g1, i); if (dd <= T0) add({ date: iso(dd), type: "gam3ya_payment", amount: 5000, accountId: "cib", groupId: "g5k", desc: "Gam3ya 5k — contribution " + (i + 1) }); }
    for (let i = 0; i < 6; i++) { const dd = aM(g2, i); if (dd <= T0) add({ date: iso(dd), type: "gam3ya_payment", amount: 10000, accountId: "cib", groupId: "g10k", desc: "Gam3ya 10k — contribution " + (i + 1) }); }
    add({ date: iso(aM(g2, 1)), type: "gam3ya_payout", amount: 120000, accountId: "cib", groupId: "g10k", desc: "Gam3ya 10k — my turn collected" });

    // Card statements demo: Titanium's last statement paid in full, this
    // month's already partially paid; Platinum's is overdue and untouched;
    // NBE Visa has none yet — shows what a card with no statement looks
    // like too.
    const cardStatements = [
      { id: "st1", accountId: "card", period: "Last month", amount: 6200, due: iso(aM(T0, -1)), desc: "" },
      { id: "st2", accountId: "card", period: "This month", amount: 8400, due: iso(aD(T0, 6)), desc: "" },
      { id: "st3", accountId: "card_bm", period: "Last month", amount: 5000, due: iso(aD(T0, -4)), desc: "" }
    ];
    add({ date: iso(aM(T0, -1)), type: "statement_payment", amount: 6200, statementId: "st1", fromId: "cib", toId: "card", desc: "Titanium statement — last month" });
    add({ date: iso(T0), type: "statement_payment", amount: 3000, statementId: "st2", fromId: "cash", toId: "card", desc: "Titanium statement — partial" });

    // Savings goals demo: Emergency fund tracks CIB Savings and is on
    // schedule (target date still ahead); New laptop tracks Instapay and its
    // target date has already passed — shows the overdue path (Needs
    // Attention, attentionCount) the same way Platinum's untouched statement
    // above does for statements.
    const savingsGoals = [
      { id: "sg_emergency", name: "Emergency fund", target: 80000, due: iso(aM(T0, 3)), accountId: "sav", baseline: 20000, color: "#2a9d8f", created: iso(aM(T0, -4)) },
      { id: "sg_laptop", name: "New laptop", target: 45000, due: iso(aM(T0, -1)), accountId: "ip", baseline: 0, color: "#4a6fa5", created: iso(aM(T0, -2)) }
    ];

    const targets = { cash: 7500, cib: 118000, sav: 57700, vf: 4200, ip: 12600, card: -8400, card_bm: -14200, card_nbe: -3100 };
    const eff = {}; accounts.forEach(a => eff[a.id] = 0);
    const EF = (id, v) => { if (id && eff[id] !== undefined) eff[id] = Math.round((eff[id] + v) * 100) / 100; };
    const dirOf = (pid) => { const p = plans.find(x => x.id === pid); return p ? p.direction : "in"; };
    tx.forEach(x => {
      const m = x.amount || 0; switch (x.type) {
        case "income": EF(x.accountId, m); break;
        case "expense": EF(x.accountId, -m); break;
        case "transfer": EF(x.fromId, -m); EF(x.toId, m); break;
        case "statement_payment": EF(x.fromId, -m); EF(x.toId, m); break;
        case "receivable": if (x.accountId) EF(x.accountId, -m); break;
        case "receivable_payment": EF(x.accountId, m); break;
        case "payable": if (x.accountId) EF(x.accountId, m); break;
        case "debt_payment": EF(x.accountId, -m); break;
        case "investment_buy": if (x.accountId) EF(x.accountId, -m); break;
        case "installment_sale": if (x.accountId) EF(x.accountId, dirOf(x.planId) === "out" ? -m : m); break;
        case "installment_payment": EF(x.accountId, dirOf(x.planId) === "out" ? -m : m); break;
        case "gam3ya_payment": EF(x.accountId, -m); break;
        case "gam3ya_payout": EF(x.accountId, m); break;
      }
    });
    accounts.forEach(a => {
      if (targets[a.id] === undefined) return;
      const need = Math.round((targets[a.id] - (a.opening + eff[a.id])) * 100) / 100;
      if (Math.abs(need) >= 1) tx.unshift({ id: this.uid("t"), date: iso(aM(T0, -8)), type: "adjustment", amount: need, accountId: a.id, category: null, personId: null, void: false, created: iso(T0), desc: "Opening reconciliation — " + a.name });
    });
    const recurring = [
      { id: "r1", name: "Salary", type: "income", amount: 30000, accountId: "cib", category: "Salary", freq: "monthly", day: 25 },
      { id: "r2", name: "Apartment rent", type: "expense", amount: 9000, accountId: "cib", category: "Rent", freq: "monthly", day: 3 },
      { id: "r3", name: "Home internet", type: "expense", amount: 500, accountId: "cib", category: "Internet", freq: "monthly", day: 10 },
      { id: "r4", name: "Mobile line", type: "expense", amount: 250, accountId: "vf", category: "Mobile", freq: "monthly", day: 15 },
      { id: "r5", name: "Streaming bundle", type: "expense", amount: 300, accountId: "card", category: "Subscriptions", freq: "yearly", day: 8 }
    ];
    return { accounts, people, tx, plans, groups, cardStatements, savingsGoals, investments, recurring, todos: [], customCategories: { income: [], expense: [] }, budgets: {}, audit: [{ at: new Date().toISOString().slice(0, 16).replace("T", " "), what: "Demo data seeded" }] };
  }

  // ---- engine: single source of truth ------------------------------------
  // One transaction's effect on account balances / receivable / payable
  // ledgers, factored out of derive() so accountMonthFlow() below (which
  // needs the exact same per-type polarity, just scoped to one account and
  // one month instead of every account up to a cutoff date) can reuse it
  // verbatim instead of re-deriving its own copy that could quietly drift
  // out of sync with this one. A/R/Y are the same three accumulator
  // closures derive() already built; a caller that only cares about
  // account balances (not the receivable/payable ledgers) can pass no-ops
  // for R and Y.
  applyTxToBalances(t, A, R, Y) {
    const m = t.amount || 0;
    switch (t.type) {
      case "income": case "investment_return": case "refund": A(t.accountId, m); break;
      case "expense": A(t.accountId, -m); break;
      case "transfer": A(t.fromId, -m); A(t.toId, m); break;
      // Paying a card statement moves money exactly like a transfer
      // (out of the funding account, into the card account, paying its
      // debt down) -- statementId along for the ride is what
      // statementState() below groups payments by, on top of that.
      case "statement_payment": A(t.fromId, -m); A(t.toId, m); break;
      case "receivable": R(t.personId, m); if (t.accountId) A(t.accountId, -m); break;
      case "receivable_payment": R(t.personId, -m); A(t.accountId, m); break;
      case "payable": Y(t.personId, m); if (t.accountId) A(t.accountId, m); break;
      case "debt_payment": Y(t.personId, -m); A(t.accountId, -m); break;
      case "investment_buy": if (t.accountId) A(t.accountId, -m); break;
      case "installment_sale": if (t.accountId) A(t.accountId, m * (this.planDir(t.planId) === "out" ? -1 : 1)); break;
      case "installment_payment": A(t.accountId, this.planDir(t.planId) === "out" ? -m : m); break;
      case "gam3ya_payment": A(t.accountId, -m); break;
      case "gam3ya_payout": A(t.accountId, m); break;
      case "adjustment": A(t.accountId, m); break;
    }
  }
  derive(asOf) {
    const d = this.state.data; const cut = asOf || "9999-12-31";
    const bal = {}, recv = {}, pay = {};
    d.accounts.forEach(a => bal[a.id] = a.opening);
    const A = (id, v) => { if (id && bal[id] !== undefined) bal[id] = Math.round((bal[id] + v) * 100) / 100; };
    const R = (p, v) => { if (p) recv[p] = Math.round(((recv[p] || 0) + v) * 100) / 100; };
    const Y = (p, v) => { if (p) pay[p] = Math.round(((pay[p] || 0) + v) * 100) / 100; };
    const live = d.tx.filter(t => !t.void && t.date <= cut).sort((a, b) => a.date < b.date ? -1 : 1);
    live.forEach(t => this.applyTxToBalances(t, A, R, Y));
    const plans = d.plans.map(p => this.planState(p, cut));
    const cardStatements = (d.cardStatements || []).map(s => this.statementState(s, cut));
    const savingsGoals = this.savingsGoalStates(bal);
    const groups = (d.groups || []).map(g => this.groupState(g, cut));
    const gRecv = groups.reduce((x, g) => x + Math.max(0, g.net), 0), gPay = groups.reduce((x, g) => x + Math.max(0, -g.net), 0);
    const planRecv = plans.filter(p => p.direction === "in").reduce((s, p) => s + p.remaining, 0);
    const planPay = plans.filter(p => p.direction === "out").reduce((s, p) => s + p.remaining, 0);
    const sum = (f) => d.accounts.filter(f).reduce((s, a) => s + bal[a.id], 0);
    const cash = sum(a => a.active && a.type === "cash"), bank = sum(a => a.active && a.type === "bank"), wallets = sum(a => a.active && a.type === "wallet"), cards = sum(a => a.active && a.type === "card");
    // Anything that isn't "card" (a liability line, handled separately via
    // `cards`/`liab`) is real spendable balance by default — "ecard" (a
    // prepaid/gift-card balance) and "other" both fall in here, so a type
    // added later doesn't silently vanish from available/net worth the way
    // "other" already did before this: it had never been added to any of
    // cash/bank/wallets either, so its balance was real on the account's
    // own row but invisible everywhere derived from these totals.
    const otherBalance = sum(a => a.active && !["cash", "bank", "wallet", "card"].includes(a.type));
    const invValue = d.investments.reduce((s, i) => s + i.value, 0), invCost = d.investments.reduce((s, i) => s + i.invested, 0);
    const recvTotal = Object.values(recv).reduce((s, v) => s + Math.max(0, v), 0) + planRecv + gRecv;
    const payTotal = Object.values(pay).reduce((s, v) => s + Math.max(0, v), 0) + planPay + gPay;
    const available = cash + bank + wallets + otherBalance;
    const countRecv = this.props.receivablesAreAssets !== false;
    const assets = available + invValue + (countRecv ? recvTotal : 0);
    const liab = payTotal + Math.abs(Math.min(0, cards));
    return { bal, recv, pay, plans, cardStatements, savingsGoals, groups, gRecv, gPay, cash, bank, wallets, cards, invValue, invCost, recvTotal, payTotal, planRecv, planPay, available, assets, liab, netWorth: assets - liab, live };
  }
  // A goal doesn't get its own ledger -- it just watches one existing
  // account's balance grow from wherever it stood the moment the goal was
  // created (g.baseline, captured once in submit()'s "goal" branch). Reusing
  // the tracked account's real balance (rather than inventing a separate
  // "money set aside" pool) means anything that already moves money into
  // that account -- salary, a transfer in -- pushes every goal watching it
  // forward automatically, and a withdrawal moves it back just as honestly;
  // no new transaction type, no separate envelope to keep in sync.
  //
  // Two or more goals CAN watch the same account -- nothing stops it, and
  // it's a reasonable thing to want (one savings account, several things
  // being saved for). If each goal simply computed bal[accountId] -
  // g.baseline on its own, a single real deposit made after both goals
  // exist would get counted as progress on *every* goal watching that
  // account at once, overstating how much has actually been saved. Instead,
  // goals sharing an account draw from one shared pool of real growth since
  // the EARLIEST goal's baseline, allocated FIFO -- oldest goal first, up
  // to its own target -- the same "shared pool" idiom this app already uses
  // for installment and gam3eya payments (see planState/groupState). With
  // only one goal on an account (the common case), this reduces to exactly
  // the simple bal-minus-baseline calculation.
  savingsGoalStates(bal) {
    const goals = this.state.data.savingsGoals || [];
    const byAcc = {};
    goals.forEach(g => { (byAcc[g.accountId] = byAcc[g.accountId] || []).push(g); });
    const out = {};
    Object.keys(byAcc).forEach(accId => {
      const siblings = byAcc[accId].slice().sort((a, b) => (a.created || "") < (b.created || "") ? -1 : (a.created || "") > (b.created || "") ? 1 : 0);
      const earliestBaseline = siblings[0].baseline;
      const cur = bal[accId] !== undefined ? bal[accId] : earliestBaseline;
      let pool = Math.max(0, Math.round((cur - earliestBaseline) * 100) / 100);
      siblings.forEach(sib => {
        const take = Math.min(sib.target, pool);
        pool = Math.round((pool - take) * 100) / 100;
        out[sib.id] = this.goalState(sib, take);
      });
    });
    return goals.map(g => out[g.id]);
  }
  goalState(g, saved) {
    const today = this.today();
    saved = Math.max(0, Math.round(saved * 100) / 100);
    const remaining = Math.max(0, Math.round((g.target - saved) * 100) / 100);
    const done = saved >= g.target - 0.001;
    // Capped at 99 when NOT done, not just at 100 overall: rounding
    // 897/900 (still 3 short, remaining > 0) up to Math.round(...) = 100
    // would show a full "100%" bar right alongside "Still needed: 3" --
    // done is the single source of truth for "finished", pct is only ever
    // allowed to agree with it, never contradict it.
    const pct = done ? 100 : (g.target > 0 ? Math.min(99, Math.round((saved / g.target) * 100)) : 0);
    const overdue = !done && !!g.due && g.due < today;
    return { id: g.id, name: g.name, target: g.target, due: g.due, accountId: g.accountId, color: g.color, baseline: g.baseline, saved, remaining, pct, done, overdue };
  }
  // A statement's own `amount` is typed in by hand from the real bank
  // statement -- it deliberately does NOT feed into the account's own
  // Outstanding balance above (that stays purely transaction-derived, same
  // as every other account). Paying a statement posts a real
  // statement_payment transaction, which *does* move the card's balance
  // (see the switch above) -- this only tracks how much of that specific
  // statement's own total has been paid off yet.
  statementState(s, cut) {
    const d = this.state.data, today = this.today(), lim = cut || "9999-12-31";
    const pays = d.tx.filter(t => !t.void && t.type === "statement_payment" && t.statementId === s.id && t.date <= lim);
    const paid = Math.round(pays.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
    const remaining = Math.max(0, Math.round((s.amount - paid) * 100) / 100);
    const overdue = remaining > 0.001 && !!s.due && s.due < today;
    const status = remaining <= 0.001 ? "paid" : overdue ? "overdue" : (paid > 0 ? "partial" : "open");
    return { id: s.id, accountId: s.accountId, period: s.period, amount: s.amount, due: s.due, desc: s.desc,
      paid, remaining, status, overdue };
  }
  planState(plan, cut) {
    const d = this.state.data, today = this.today();
    const pays = d.tx.filter(t => !t.void && t.planId === plan.id && t.type === "installment_payment" && t.date <= (cut || "9999-12-31"));
    let pool = pays.reduce((s, t) => s + t.amount, 0);
    const rows = plan.schedule.map(r => {
      const paid = Math.min(pool, r.amount); pool = Math.round((pool - paid) * 100) / 100;
      const rem = Math.round((r.amount - paid) * 100) / 100;
      let status = rem <= 0 ? "paid" : (paid > 0 ? (r.due < today ? "overdue" : "partial") : (r.due < today ? "overdue" : "pending"));
      return { no: r.no, due: r.due, amount: r.amount, paid: paid, rem: rem, status: status };
    });
    const collected = Math.round((plan.down + pays.reduce((s, t) => s + t.amount, 0)) * 100) / 100;
    const remaining = Math.max(0, Math.round((plan.total - collected) * 100) / 100);
    const next = rows.find(r => r.rem > 0);
    return { plan, id: plan.id, direction: plan.direction, personId: plan.personId, title: plan.title, total: plan.total, down: plan.down,
      collected, remaining, rows, credit: pool, paidCount: rows.filter(r => r.status === "paid").length, count: rows.length,
      overdue: rows.filter(r => r.status === "overdue").length, overdueAmt: rows.filter(r => r.status === "overdue").reduce((s, r) => s + r.rem, 0), next };
  }
  groupState(g, cut) {
    const d = this.state.data, today = this.today(), lim = cut || "9999-12-31";
    const pays = d.tx.filter(t => !t.void && t.groupId === g.id && t.type === "gam3ya_payment" && t.date <= lim);
    const outs = d.tx.filter(t => !t.void && t.groupId === g.id && t.type === "gam3ya_payout" && t.date <= lim);
    let pool = pays.reduce((s, t) => s + t.amount, 0);
    const rows = [];
    for (let i = 0; i < g.periods; i++) {
      const due = this.iso(g.freq === "weekly" ? this.addDays(new Date(g.first), 7 * i) : this.addMonths(new Date(g.first), i));
      const paid = Math.min(pool, g.amount); pool = Math.round((pool - paid) * 100) / 100;
      const rem = Math.round((g.amount - paid) * 100) / 100;
      rows.push({ no: i + 1, due, amount: g.amount, paid, rem, mine: i + 1 === g.myTurn, status: rem <= 0 ? "paid" : (paid > 0 ? (due < today ? "overdue" : "partial") : (due < today ? "overdue" : "pending")) });
    }
    const paidTotal = Math.round(pays.reduce((s, t) => s + t.amount, 0) * 100) / 100;
    const received = Math.round(outs.reduce((s, t) => s + t.amount, 0) * 100) / 100;
    const payout = Math.round(g.amount * g.periods * 100) / 100;
    const myRow = rows[Math.max(0, Math.min(rows.length - 1, g.myTurn - 1))];
    return { group: g, id: g.id, name: g.name, rows, paidTotal, received, payout,
      net: Math.round((paidTotal - received) * 100) / 100,
      payoutDue: myRow ? myRow.due : g.first, taken: received > 0,
      next: rows.find(r => r.rem > 0), paidCount: rows.filter(r => r.status === "paid").length, periods: g.periods,
      overdue: rows.filter(r => r.status === "overdue").length,
      overdueAmt: rows.filter(r => r.status === "overdue").reduce((s, r) => s + r.rem, 0),
      remainingPay: Math.max(0, Math.round((payout - paidTotal) * 100) / 100) };
  }
  // P1 fix: one honest answer to "what do I owe this month", combining
  // installment plans I owe (direction "out") and gam3eya contributions —
  // previously this required opening two tabs and summing "Next:" lines by
  // hand, and the nearest existing aggregate (Installments KPI) silently
  // excluded "I owe" plans entirely.
  duesThisMonth(D) {
    const today = this.today(), monthEnd = this.iso(this.addMonths(new Date(today.slice(0, 8) + "01"), 1));
    const fromInstallments = D.plans.filter(p => p.direction === "out")
      .reduce((s, p) => s + p.rows.filter(r => r.rem > 0 && r.due >= today.slice(0, 8) + "01" && r.due < monthEnd).reduce((s2, r) => s2 + r.rem, 0), 0);
    const fromGroups = (D.groups || [])
      .reduce((s, g) => s + g.rows.filter(r => r.rem > 0 && r.due >= today.slice(0, 8) + "01" && r.due < monthEnd).reduce((s2, r) => s2 + r.rem, 0), 0);
    return { installments: Math.round(fromInstallments * 100) / 100, groups: Math.round(fromGroups * 100) / 100, total: Math.round((fromInstallments + fromGroups) * 100) / 100 };
  }
  // Plain loans — "receivable" (money owed to me) / "payable" (money I owe),
  // entered as a one-off, not part of an installment plan. Each is its own
  // row with its own due date; repayments settle the OLDEST open one first
  // (FIFO), the same allocation rule installment plans already use. Before
  // this, the due date typed in at creation was captured and then never
  // looked at again — this is what makes it mean something afterward.
  loanRows(personId, kind) {
    const d = this.state.data, today = this.today();
    const settleType = kind === "receivable" ? "receivable_payment" : "debt_payment";
    const loans = d.tx.filter(t => !t.void && t.personId === personId && t.type === kind)
      .sort((a, b) => a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
    let pool = d.tx.filter(t => !t.void && t.personId === personId && t.type === settleType).reduce((s, t) => s + t.amount, 0);
    return loans.map(t => {
      const paid = Math.min(pool, t.amount); pool = Math.round((pool - paid) * 100) / 100;
      const rem = Math.round((t.amount - paid) * 100) / 100;
      // Real bug caught while building this: falling back to t.date (the
      // entry date) when no due date is set meant an indefinite-term loan
      // — an opening balance, money held for family with no fixed return
      // date — silently became "overdue" the very next day. No due date now
      // means no due date: never flagged, never forecast, just an open
      // balance, same as before this feature existed.
      const due = t.due || null;
      const status = rem <= 0 ? "paid" : !due ? "open" : (paid > 0 ? (due < today ? "overdue" : "partial") : (due < today ? "overdue" : "pending"));
      return { id: t.id, personId, date: t.date, due, amount: t.amount, paid, rem, status, desc: t.desc };
    });
  }
  // All people's still-open plain loans of one direction, for Needs
  // Attention (overdue) and Forecast (upcoming) — the two places installment
  // plans already surface their due dates.
  allLoanRows(kind) {
    const d = this.state.data;
    const ids = Array.from(new Set(d.tx.filter(t => !t.void && t.type === kind).map(t => t.personId)));
    const out = [];
    ids.forEach(pid => this.loanRows(pid, kind).filter(r => r.rem > 0).forEach(r => out.push(r)));
    return out;
  }
  nextOccurrence(r, from) {
    const base = new Date(from);
    if (r.freq === "weekly") { return this.addDays(base, 7); }
    if (r.freq === "daily") { return this.addDays(base, 1); }
    if (r.freq === "yearly") { const x = new Date(base.getFullYear(), 0, r.day || 1); x.setMonth(new Date(base).getMonth()); if (x < base) x.setFullYear(x.getFullYear() + 1); return x; }
    const step = r.freq === "quarterly" ? 3 : 1;
    let x = new Date(base.getFullYear(), base.getMonth(), Math.min(r.day || 1, 28));
    while (x < base) x = this.addMonths(x, step);
    return x;
  }
  forecast(days, D) {
    const start = new Date(), end = this.addDays(start, days), ev = [];
    (this.state.data.recurring || []).forEach(r => {
      let cur = this.nextOccurrence(r, start), guard = 0;
      while (cur <= end && guard++ < 80) {
        ev.push({ date: this.iso(cur), title: r.name, amount: r.type === "income" ? r.amount : -r.amount, kind: r.type });
        const step = r.freq === "weekly" ? 7 : r.freq === "daily" ? 1 : 0;
        cur = step ? this.addDays(cur, step) : this.addMonths(cur, r.freq === "quarterly" ? 3 : r.freq === "yearly" ? 12 : 1);
      }
    });
    D.plans.forEach(p => {
      p.rows.filter(r => r.rem > 0 && r.due <= this.iso(end)).forEach(r => {
        ev.push({ date: r.due < this.today() ? this.today() : r.due,
          title: this.L(p.direction === "in" ? "Collect · " : "Pay · ") + p.title + " #" + r.no,
          amount: p.direction === "in" ? r.rem : -r.rem, kind: p.direction === "in" ? "income" : "expense" });
      });
    });
    (D.groups || []).forEach(g => {
      g.rows.filter(r => r.rem > 0 && r.due <= this.iso(end)).forEach(r => ev.push({
        date: r.due < this.today() ? this.today() : r.due,
        title: this.L("Gam3ya · ") + g.name + " #" + r.no, amount: -r.rem, kind: "expense" }));
      if (!g.taken && g.payoutDue <= this.iso(end)) ev.push({
        date: g.payoutDue < this.today() ? this.today() : g.payoutDue,
        title: this.L("Gam3ya payout · ") + g.name, amount: g.payout, kind: "income" });
    });
    // Plain loans (not part of an installment plan) — same treatment as
    // plans/gam3eya: their due date now actually shows up somewhere.
    this.allLoanRows("payable").filter(r => r.due && r.due <= this.iso(end)).forEach(r => ev.push({
      date: r.due < this.today() ? this.today() : r.due,
      title: this.L("Pay · ") + this.personName(r.personId), amount: -r.rem, kind: "expense" }));
    this.allLoanRows("receivable").filter(r => r.due && r.due <= this.iso(end)).forEach(r => ev.push({
      date: r.due < this.today() ? this.today() : r.due,
      title: this.L("Collect · ") + this.personName(r.personId), amount: r.rem, kind: "income" }));
    // Card statements — same treatment as every obligation above: an
    // unpaid one due within the horizon is a real outflow. Without this,
    // Needs Attention could flag a statement due this week while Safe to
    // spend / the Forecast total silently ignored the same money (only
    // "income" side is missing on purpose — a statement is only ever
    // something owed, never something collected).
    D.cardStatements.filter(s => s.remaining > 0.001 && s.due <= this.iso(end)).forEach(s => ev.push({
      date: s.due < this.today() ? this.today() : s.due,
      title: this.L("Pay · ") + this.accName(s.accountId), amount: -s.remaining, kind: "expense" }));
    ev.sort((a, b) => a.date < b.date ? -1 : 1);
    let run = D.available; const pts = [[0, D.available]];
    ev.forEach(e => { run = Math.round((run + e.amount) * 100) / 100; e.running = run; pts.push([(new Date(e.date) - start) / (end - start), run]); });
    return { events: ev, points: pts, projected: run, inflow: ev.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0), outflow: ev.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0) };
  }

  // Expense descriptions that have come up at least twice, most-repeated
  // first — the "repeat this" shortcuts on the Dashboard. Each carries the
  // category and amount from its most recent occurrence, so the quick-add
  // chip below opens pre-filled with what was actually paid last time, not
  // an average or a guess.
  frequentExpenses(limit) {
    const byKey = {};
    this.state.data.tx.filter(t => !t.void && t.type === "expense" && t.desc && t.desc.trim()).forEach(t => {
      const key = t.desc.trim().toLowerCase();
      const cur = byKey[key];
      if (!cur) { byKey[key] = { desc: t.desc.trim(), category: t.category, amount: t.amount, count: 1, lastDate: t.date }; return; }
      cur.count++;
      if (t.date >= cur.lastDate) { cur.desc = t.desc.trim(); cur.category = t.category; cur.amount = t.amount; cur.lastDate = t.date; }
    });
    return Object.values(byKey).filter(x => x.count >= 2).sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : (a.lastDate > b.lastDate ? -1 : 0))).slice(0, limit || 5);
  }
  // "What if" scenarios on the Forecast tab — a hypothetical income/expense
  // the user is only considering, never recorded as a real transaction (it
  // lives in this.state, not this.state.data, so it's never persisted and
  // a page reload clears it same as a wiped scratchpad). addWhatIf/
  // removeWhatIf/clearWhatIf mutate this.state.whatIf directly, matching
  // the plain-field-toggle pattern used elsewhere (setFilter etc.) rather
  // than going through persist()/submit(), since nothing here is real data.
  addWhatIf(title, amount, date) {
    const a = this.n(amount);
    if (!a) return;
    this.state.whatIf = (this.state.whatIf || []).concat([{ id: this.uid("wi"), title: title || this.L("Scenario", "سيناريو"), amount: a, date: date || this.today() }]);
  }
  removeWhatIf(id) {
    this.state.whatIf = (this.state.whatIf || []).filter(w => w.id !== id);
  }
  // Same event list Forecast already shows, plus any active what-if
  // scenarios merged in and re-sorted — kept as a separate method rather
  // than a flag on forecast() itself so nothing else that calls forecast()
  // (the Dashboard's "next 30 days", safeToSpend) ever sees a hypothetical
  // number by accident.
  forecastWithWhatIf(days, D) {
    const base = this.forecast(days, D);
    const start = new Date(), end = this.addDays(start, days);
    // Bound both ends, as date *strings* (matching forecast()'s own
    // convention for real events, e.g. `r.due <= this.iso(end)`) rather
    // than comparing Date objects against `start` — `start` carries today's
    // current time-of-day, so a same-day scenario would otherwise compare
    // as "before start" and vanish. Unbounded below, a past-dated scenario
    // would pass "<= end" for every horizon forever and never leave.
    const today = this.today(), endStr = this.iso(end);
    const wi = (this.state.whatIf || []).filter(w => w.date >= today && w.date <= endStr);
    if (!wi.length) return base;
    const ev = base.events.concat(wi.map(w => ({ date: w.date, title: w.title + " " + this.L("(what if)", "(افتراضي)"), amount: w.amount, kind: w.amount >= 0 ? "income" : "expense", whatIf: true })));
    ev.sort((a, b) => a.date < b.date ? -1 : 1);
    let run = D.available; const pts = [[0, D.available]];
    ev.forEach(e => { run = Math.round((run + e.amount) * 100) / 100; e.running = run; pts.push([(new Date(e.date) - start) / (end - start), run]); });
    return { events: ev, points: pts, projected: run, inflow: ev.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0), outflow: ev.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0) };
  }
  // Month-to-date expense total per category — shared by the Dashboard's
  // "This month" bars, the budget check below, and unusualSpending(), so
  // all three always agree on what "this month" means.
  monthCategorySpend() {
    const today = this.today(), mStart = today.slice(0, 8) + "01";
    const map = {};
    this.state.data.tx.filter(t => !t.void && t.type === "expense" && t.date >= mStart && t.date <= today).forEach(t => {
      const c = t.category || "Other"; map[c] = (map[c] || 0) + t.amount;
    });
    return map;
  }
  // How much money moved into vs. out of ONE account this month --
  // reuses applyTxToBalances() (see its own comment) so the sign of every
  // transaction type here always agrees with what actually moved the
  // account's real balance, instead of a second hand-rolled "is this
  // in or out" guess that could drift from it. Powers the scoped metrics
  // bar (UI.renderMetricsRow) shown while Transactions is filtered to a
  // single non-card account.
  accountMonthFlow(accountId) {
    const d = this.state.data, today = this.today(), mStart = today.slice(0, 8) + "01";
    let inflow = 0, outflow = 0;
    const A = (id, v) => {
      if (id !== accountId) return;
      if (v >= 0) inflow += v; else outflow += -v;
    };
    const noop = () => {};
    d.tx.filter(t => !t.void && t.date >= mStart && t.date <= today).forEach(t => this.applyTxToBalances(t, A, noop, noop));
    return { inflow: Math.round(inflow * 100) / 100, outflow: Math.round(outflow * 100) / 100 };
  }
  // Month-to-date total + transaction count for ONE category name,
  // Matches UI.renderTransactions()'s own category filter exactly (see
  // that function's comment for the full story): a NAMED category matches
  // ANY transaction type carrying that literal string, kind-unrestricted
  // -- only the implicit "Other" bucket needs the kind-aware type list,
  // since "no category set" isn't itself type-specific. Real bug caught in
  // review: an earlier version restricted every category (not just
  // "Other") to the expense/income/refund/investment_return types, so a
  // category name that also landed on some other transaction type (an
  // investment buy, say) would show 0/0 here while the actual filtered
  // Transactions list right below it was non-empty.
  categoryMonthStats(category, kind) {
    const d = this.state.data, today = this.today(), mStart = today.slice(0, 8) + "01";
    const otherTypesByKind = { expense: ["expense"], income: ["income", "refund", "investment_return"] };
    const rows = d.tx.filter(t => !t.void && t.date >= mStart && t.date <= today &&
      (category === "Other"
        ? (otherTypesByKind[kind] || otherTypesByKind.expense.concat(otherTypesByKind.income)).includes(t.type) && !t.category
        : t.category === category));
    const total = Math.round(rows.reduce((s, t) => s + t.amount, 0) * 100) / 100;
    return { total, count: rows.length };
  }
  // A monthly limit per category (Settings → Budgets). amount <= 0 clears
  // the budget for that category rather than storing a zero one.
  setBudget(category, amount) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    data.budgets = data.budgets || {};
    const amt = this.n(amount);
    if (amt <= 0) delete data.budgets[category]; else data.budgets[category] = amt;
    this.persist(data, amt > 0 ? "Set budget for " + category + " to " + this.fmt(amt) : "Cleared budget for " + category);
  }
  // A single monthly cap across every expense, not per category (Settings →
  // Overall monthly budget) -- same amount<=0-clears convention as
  // setBudget(). A top-level field rather than a special key inside
  // `budgets` (that map is keyed by real category names, and this isn't one).
  setOverallBudget(amount) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    const amt = this.n(amount);
    if (amt <= 0) delete data.overallBudget; else data.overallBudget = amt;
    this.persist(data, amt > 0 ? "Set overall monthly budget to " + this.fmt(amt) : "Cleared overall monthly budget");
  }
  // Categories running hot this month vs. their own recent history — not a
  // fixed threshold, so it works without the user ever setting a budget.
  // Compares month-to-date spend against the same category's totals over
  // the same number of days in each of the last 3 months (a fair
  // comparison — day 5 of this month against a full prior month would
  // always look "low"). Needs at least 2 of those 3 months to have any
  // spend in the category before it says anything, so a category used for
  // the first time this month never gets flagged.
  // curMap: pass the caller's own monthCategorySpend() result when it
  // already has one (the Dashboard does, for the budget check) so this
  // doesn't re-scan the same month's transactions a second time.
  unusualSpending(curMap) {
    const d = this.state.data, today = new Date(), dayOfMonth = today.getDate();
    const catTotals = (from, to) => {
      const m = {};
      d.tx.filter(t => !t.void && t.type === "expense" && t.date >= from && t.date <= to).forEach(t => { const c = t.category || "Other"; m[c] = (m[c] || 0) + t.amount; });
      return m;
    };
    curMap = curMap || this.monthCategorySpend();
    const priorMaps = [];
    for (let i = 1; i <= 3; i++) {
      const mStart = this.addMonths(new Date(today.getFullYear(), today.getMonth(), 1), -i);
      const lastDay = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0).getDate();
      const mEnd = new Date(mStart.getFullYear(), mStart.getMonth(), Math.min(dayOfMonth, lastDay));
      priorMaps.push(catTotals(this.iso(mStart), this.iso(mEnd)));
    }
    const results = [];
    Object.keys(curMap).forEach(cat => {
      const priorVals = priorMaps.map(m => m[cat] || 0).filter(v => v > 0);
      if (priorVals.length < 2) return;
      const avg = priorVals.reduce((s, v) => s + v, 0) / priorVals.length;
      if (avg <= 0) return;
      const pct = (curMap[cat] - avg) / avg;
      // 40%+ over average AND at least 100 (currency units) of real
      // difference — the percentage alone would flag a 50-vs-35 category as
      // loudly as a 5,000-vs-3,500 one.
      if (pct >= 0.4 && (curMap[cat] - avg) >= 100) results.push({ category: cat, current: curMap[cat], avg, pct });
    });
    return results.sort((a, b) => b.pct - a.pct);
  }
  // This month (so far) vs. the same number of days into last month — not
  // full-month-vs-full-month, which would always make an early-month
  // comparison look artificially low.
  monthOverMonth() {
    const d = this.state.data, today = new Date(), dayOfMonth = today.getDate();
    const sum = (from, to, types) => d.tx.filter(t => !t.void && t.date >= from && t.date <= to && types.includes(t.type)).reduce((s, t) => s + t.amount, 0);
    const incomeTypes = ["income", "refund", "investment_return"];
    const curStart = this.iso(new Date(today.getFullYear(), today.getMonth(), 1)), curEnd = this.today();
    const curIncome = sum(curStart, curEnd, incomeTypes), curExpense = sum(curStart, curEnd, ["expense"]);
    const prevMonthStart = this.addMonths(new Date(today.getFullYear(), today.getMonth(), 1), -1);
    const prevLastDay = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0).getDate();
    const prevStart = this.iso(prevMonthStart), prevEnd = this.iso(new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), Math.min(dayOfMonth, prevLastDay)));
    const prevIncome = sum(prevStart, prevEnd, incomeTypes), prevExpense = sum(prevStart, prevEnd, ["expense"]);
    const pct = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
    return { curIncome, curExpense, prevIncome, prevExpense, incomePct: pct(curIncome, prevIncome), expensePct: pct(curExpense, prevExpense) };
  }
  // "Available today" answers "what do I have"; this answers the more
  // useful daily question — "what can I actually spend without setting up
  // trouble" — by subtracting whatever's due in the next `days` (default a
  // week) from it. Reuses forecast()'s own event list so it can never
  // disagree with what Forecast itself shows.
  safeToSpend(D, days) {
    const fc = this.forecast(days || 7, D);
    const outflow = fc.events.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);
    return Math.round((D.available + outflow) * 100) / 100;
  }
  // "How much can I spend today" -- one plain answer, not two numbers
  // (Available balance, Safe to spend) the user has to reconcile in their
  // head. Available minus only what's actually due TODAY specifically (a
  // statement/loan/installment/recurring rule dated today) -- forecast()'s
  // own event list already clamps anything overdue to today's date, so
  // this reads directly off it instead of re-deriving due dates a second
  // way. Deliberately narrower than safeToSpend(7) (still shown on
  // Forecast, unchanged): that one is the cautious "don't get caught out
  // this week" runway view; this one only ever shrinks for something
  // actually leaving the account today.
  spendableToday(D) {
    const fc = this.forecast(1, D);
    const today = this.today();
    const outflow = fc.events.filter(e => e.date === today && e.amount < 0).reduce((s, e) => s + e.amount, 0);
    return Math.round((D.available + outflow) * 100) / 100;
  }
  // Rolling 7-day window vs. the 7 days before that -- same "compare like
  // for like" idea as monthOverMonth(), just weekly, and a rolling window
  // rather than a calendar week (sidesteps picking which day a week
  // "starts" on -- the app already uses a rolling 7 days elsewhere: Safe to
  // spend, the Transactions "Last 7 days" preset).
  weekSummary() {
    const d = this.state.data, today = this.today();
    const start = this.iso(this.addDays(new Date(), -6)); // 7 days total, today included
    const prevEnd = this.iso(this.addDays(new Date(), -7));
    const prevStart = this.iso(this.addDays(new Date(), -13));
    const sum = (from, to, types) => d.tx.filter(x => !x.void && x.date >= from && x.date <= to && types.includes(x.type)).reduce((s, x) => s + x.amount, 0);
    const expense = sum(start, today, ["expense"]);
    const prevExpense = sum(prevStart, prevEnd, ["expense"]);
    const catMap = {};
    d.tx.filter(x => !x.void && x.type === "expense" && x.date >= start && x.date <= today).forEach(x => { const c = x.category || "Other"; catMap[c] = (catMap[c] || 0) + x.amount; });
    const topEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0] || null;
    const pct = prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : null;
    return { start, end: today, expense, prevExpense, pct, topCategory: topEntry ? { name: topEntry[0], amount: topEntry[1] } : null };
  }
  // ---- Cash Flow Statement -------------------------------------------------
  // Classic three-bucket view (Operating / Investing / Financing), built
  // straight off the ledger -- no new data model, everything here is
  // derived from tx already recorded elsewhere. A transfer between two of
  // the user's own spendable accounts (cash, bank, wallet, ecard, other) is
  // excluded entirely: it's genuinely net-zero to total spendable money.
  // The one exception is anything that crosses into or out of a *card*
  // account -- a plain "transfer" targeting a card (how this app's own seed
  // data paid cards down before the statement_payment feature existed) or
  // statement_payment itself: a card's balance isn't part of "available"
  // money, so that crossing is a real cash outflow (or, paid the other way,
  // inflow), bucketed as Financing same as any other debt repayment.
  cashFlowBucket(t) {
    const acc = (id) => (this.state.data.accounts || []).find(a => a.id === id);
    switch (t.type) {
      case "income": case "refund": case "investment_return": return { bucket: "operating", amt: t.amount };
      case "expense": return { bucket: "operating", amt: -t.amount };
      case "investment_buy": return t.accountId ? { bucket: "investing", amt: -t.amount } : null;
      case "receivable": return t.accountId ? { bucket: "financing", amt: -t.amount } : null;
      case "receivable_payment": return { bucket: "financing", amt: t.amount };
      case "payable": return t.accountId ? { bucket: "financing", amt: t.amount } : null;
      case "debt_payment": return { bucket: "financing", amt: -t.amount };
      case "installment_sale": return t.accountId ? { bucket: "financing", amt: this.planDir(t.planId) === "out" ? -t.amount : t.amount } : null;
      case "installment_payment": return { bucket: "financing", amt: this.planDir(t.planId) === "out" ? -t.amount : t.amount };
      case "gam3ya_payment": return { bucket: "financing", amt: -t.amount };
      case "gam3ya_payout": return { bucket: "financing", amt: t.amount };
      case "statement_payment": return { bucket: "financing", amt: -t.amount };
      case "transfer": {
        const from = acc(t.fromId), to = acc(t.toId);
        const fromCard = !!(from && from.type === "card"), toCard = !!(to && to.type === "card");
        if (fromCard === toCard) return null; // both cards or neither -- internal, net zero
        return { bucket: "financing", amt: toCard ? -t.amount : t.amount };
      }
      default: return null;
    }
  }
  cashFlowStatement(from, to) {
    const tx = this.state.data.tx.filter(t => !t.void && t.date >= from && t.date <= to);
    const totals = { operating: { in: 0, out: 0 }, investing: { in: 0, out: 0 }, financing: { in: 0, out: 0 } };
    tx.forEach(t => {
      const r = this.cashFlowBucket(t);
      if (!r) return;
      const b = totals[r.bucket];
      if (r.amt >= 0) b.in = Math.round((b.in + r.amt) * 100) / 100; else b.out = Math.round((b.out + Math.abs(r.amt)) * 100) / 100;
    });
    const withNet = (b) => Object.assign({}, b, { net: Math.round((b.in - b.out) * 100) / 100 });
    const operating = withNet(totals.operating), investing = withNet(totals.investing), financing = withNet(totals.financing);
    return { operating, investing, financing, netChange: Math.round((operating.net + investing.net + financing.net) * 100) / 100 };
  }
  // ---- forms --------------------------------------------------------------
  FORMS() {
    const d = this.state.data, t = this.T[this.state.lang];
    const accs = d.accounts.filter(a => a.active).map(a => ({ v: a.id, l: a.name }));
    const ppl = d.people.map(p => ({ v: p.id, l: p.name }));
    const cardAccs = d.accounts.filter(a => a.active && a.type === "card").map(a => ({ v: a.id, l: a.name }));
    // "Paid from" on a statement payment excludes cards entirely, not just
    // the one being paid: a credit card isn't really a funding source
    // (paying one card's statement "from" another doesn't move real
    // money), and it means the field's default (the first option, before
    // any pre-fill) can never coincidentally land on the very card being
    // paid, whatever order the user's accounts happen to be in.
    const fundingAccs = d.accounts.filter(a => a.active && a.type !== "card").map(a => ({ v: a.id, l: a.name }));
    // Plain title only (no computed remaining) -- same convention as the
    // installment_payment plan picker just below: FORMS() builds off raw
    // stored data, not a fresh derive() call, so this list can't drift from
    // whichever statement a "Pay" button on the statement's own row already
    // pre-filled (the common path in here). Already-settled statements stay
    // in the list rather than being filtered out -- editing an existing
    // payment against one has to still find its own statement here -- but
    // get a "(paid)" suffix so picking one isn't a silent dead end (the cap
    // check in submit() still refuses any amount against it, at 0
    // remaining).
    const stmtOptions = (d.cardStatements || []).map(s => {
      const acc = d.accounts.find(a => a.id === s.accountId);
      const paidSoFar = d.tx.filter(x => !x.void && x.type === "statement_payment" && x.statementId === s.id).reduce((sum, x) => sum + x.amount, 0);
      const isPaid = paidSoFar >= s.amount - 0.001;
      return { v: s.id, l: (acc ? acc.name : "?") + " — " + (s.period || s.due || "") + (isPaid ? " " + this.L("(paid)", "(متسدد)") : "") };
    });
    // 54 (Installments Recut): same convention as stmtOptions just above --
    // a bare title gave no sense of direction or how much was even left,
    // and a fully-settled plan stayed pickable with no hint that any
    // amount against it would be refused. Labelling with direction +
    // remaining (or a "(paid)" suffix) instead of filtering settled plans
    // out entirely keeps editing an existing payment against one able to
    // still find its own plan here.
    const planOptions = d.plans.map(p => {
      const st = this.planState(p);
      const isPaid = st.remaining <= 0.001;
      const dir = this.L(p.direction === "in" ? "Owed to me" : "I owe");
      // fmtPlain, not fmt: this label is an <option>'s text, which can't
      // carry fmt()'s own <bdi> HTML wrap (see fmtPlain's own comment).
      return { v: p.id, l: p.title + " — " + dir + (isPaid ? " " + this.L("(paid)", "(متسدد)") : " — " + this.fmtPlain(st.remaining)) };
    });
    // Custom categories the user added in Settings — no ARW translation
    // exists for these (they're free text the user typed), so the language
    // pass below just leaves them as-is via its `|| o.l` fallback.
    const custom = d.customCategories || { income: [], expense: [] };
    const cats = ["Food", "Transportation", "Rent", "Electricity", "Water", "Internet", "Mobile", "Shopping", "Clothing", "Medical", "Education", "Entertainment", "Family", "Children", "Car", "Home", "Subscriptions", "Loans", "Other"].concat(custom.expense || []).map(c => ({ v: c, l: c }));
    const inc = ["Salary", "Freelance", "Business", "Commission", "Rental", "Interest", "Selling items", "Other"].concat(custom.income || []).map(c => ({ v: c, l: c }));
    const D = (k, l, type, extra) => Object.assign({ k, label: l, type: type || "text" }, extra || {});
    // Card-face styling fields -- shared by account/account_edit/card so
    // the three don't drift (approved from the card customizer preview:
    // Holo Shine's depth/bevel is CSS-only and applies to every tile
    // automatically, these three are what the user actually picks).
    // color2 only matters for the three non-default patterns -- diag1 (the
    // long-standing look, still the default) keeps auto-darkening `color`
    // alone the same way it always has (see UI.cardBackground).
    const cardStyleFields = () => [
      D("color2", this.L("Secondary color (optional)", "لون تاني (اختياري)"), "color", { hint: this.L("Only used by the two-color patterns below.", "بيتستخدم بس مع الأنماط اللي بلونين.") }),
      D("pattern", this.L("Pattern", "النمط"), "select", { options: [
        { v: "diag1", l: this.L("Diagonal (1 color)", "قطري (لون واحد)") },
        { v: "diag2", l: this.L("Diagonal (2 colors)", "قطري (لونين)") },
        { v: "radial", l: this.L("Radial burst", "انفجار دائري") },
        { v: "split", l: this.L("Split block", "تقسيمة حادة") }
      ] }),
      D("textColor", this.L("Text color", "لون الخط"), "select", { options: [
        { v: "auto", l: this.L("Auto", "تلقائي") },
        { v: "white", l: this.L("White", "أبيض") },
        { v: "dark", l: this.L("Dark", "غامق") }
      ], hint: this.L("Auto picks white or dark based on the color above.", "تلقائي بيختار أبيض أو غامق حسب اللون فوق.") })
    ];
    // Split-expense fields (below) only make sense when adding a new
    // expense, not editing one — they aren't stored on the transaction
    // itself (nothing links the two rows together, see submit()), so
    // showing them on an edit would silently do nothing if filled in.
    const isEditingExpense = this.state.modal === "expense" && this.state.form && this.state.form.id;
    const F = {
      income: { title: t.aIncome, fields: [D("date", t.date, "date"), D("amount", t.amount, "number"), D("accountId", t.account, "select", { options: accs }), D("category", t.category, "select", { options: inc, wide: true }), D("personId", t.person + this.L(" (optional)", " (اختياري)"), "select", { options: [{ v: "", l: "—" }].concat(ppl) }), D("desc", t.details, "text", { wide: true }), D("tags", this.L("Tags (optional)", "تاجات (اختياري)"), "text", { wide: true, hint: this.L("Comma separated — a way to slice spending across categories, e.g. \"trip, work\".", "افصل بينهم بفاصلة — طريقة لتجميع مصاريف من فئات مختلفة، زي \"رحلة، شغل\".") })] },
      expense: { title: t.aExpense, fields: [D("date", t.date, "date"), D("amount", t.amount, "number"), D("accountId", t.account, "select", { options: accs }), D("category", t.category, "select", { options: cats, wide: true }), D("personId", "Merchant / person", "select", { options: [{ v: "", l: "—" }].concat(ppl) }), D("desc", t.details, "text", { wide: true }), D("tags", this.L("Tags (optional)", "تاجات (اختياري)"), "text", { wide: true, hint: this.L("Comma separated — a way to slice spending across categories, e.g. \"trip, work\".", "افصل بينهم بفاصلة — طريقة لتجميع مصاريف من فئات مختلفة، زي \"رحلة، شغل\".") })].concat(isEditingExpense ? [] : [
        D("splitPersonId", this.L("Split with (optional)", "قسمها مع (اختياري)"), "select", { options: [{ v: "", l: "—" }].concat(ppl) }),
        D("splitAmount", this.L("Their share", "حصتهم"), "number", { hint: this.L("Optional — also records this amount as owed to you by that person.", "اختياري — بيسجل المبلغ ده كمان كمبلغ مستحق ليك من الشخص ده.") })
      ]) },
      transfer: { title: t.aTransfer, fields: [D("date", t.date, "date"), D("amount", t.amount, "number"), D("fromId", "From", "select", { options: accs }), D("toId", "To", "select", { options: accs }), D("desc", t.details, "text", { wide: true, hint: "Transfers never touch income or expense totals." })] },
      // P1 fix: these four forms used to default personId to the first
      // person in the list (effectively always "Hazem") since a bare select
      // with no placeholder auto-selects its first option — silently risking
      // a transaction posted against the wrong person on a fast entry. Each
      // now opens on a blank placeholder and submit() already requires a
      // real choice ("Pick a person.").
      receivable: { title: t.aReceivable, fields: [D("date", t.date, "date"), D("amount", t.amount, "number"), D("personId", t.person, "select", { options: [{ v: "", l: "—" }].concat(ppl) }), D("accountId", "Paid out of", "select", { options: [{ v: "", l: "No cash movement (opening balance)" }].concat(accs) }), D("due", "Due date", "date"), D("desc", t.details, "text", { wide: true })] },
      payable: { title: t.aDebt, fields: [D("date", t.date, "date"), D("amount", t.amount, "number"), D("personId", t.person, "select", { options: [{ v: "", l: "—" }].concat(ppl) }), D("accountId", "Received into", "select", { options: [{ v: "", l: "No cash movement (opening balance)" }].concat(accs) }), D("due", "Due date", "date"), D("desc", t.details, "text", { wide: true })] },
      receivable_payment: { title: t.aCollect, fields: [D("date", t.date, "date"), D("amount", t.amount, "number"), D("personId", t.person, "select", { options: [{ v: "", l: "—" }].concat(ppl) }), D("accountId", "Into account", "select", { options: accs }), D("desc", t.details, "text", { wide: true })] },
      debt_payment: { title: t.aRepay, fields: [D("date", t.date, "date"), D("amount", t.amount, "number"), D("personId", t.person, "select", { options: [{ v: "", l: "—" }].concat(ppl) }), D("accountId", "Paid from", "select", { options: accs }), D("desc", t.details, "text", { wide: true })] },
      sale: { title: t.aSale, fields: [D("date", "Sale date", "date"), D("personId", "Customer", "select", { options: ppl }), D("title", "What was sold", "text", { wide: true }), D("total", "Sale total", "number"), D("down", "Down payment", "number"), D("accountId", "Down payment into", "select", { options: [{ v: "", l: "No down payment" }].concat(accs) }), D("count", "Number of installments", "number"), D("freq", "Frequency", "select", { options: [{ v: "monthly", l: "Monthly" }, { v: "weekly", l: "Weekly" }, { v: "quarterly", l: "Quarterly" }] }), D("first", "First due date", "date"), D("balloon", "Final balloon payment", "number", { hint: "Optional. Leave 0 for equal installments." })] },
      purchase: { title: t.aPurchasePlan, fields: [D("date", "Purchase date", "date"), D("personId", "Seller", "select", { options: ppl }), D("title", "What was bought", "text", { wide: true }), D("total", "Total price", "number"), D("down", "Down payment", "number"), D("accountId", "Down payment from", "select", { options: [{ v: "", l: "No down payment" }].concat(accs) }), D("count", "Number of installments", "number"), D("freq", "Frequency", "select", { options: [{ v: "monthly", l: "Monthly" }, { v: "weekly", l: "Weekly" }, { v: "quarterly", l: "Quarterly" }] }), D("first", "First due date", "date"), D("balloon", "Final balloon payment", "number")] },
      installment_payment: { title: t.recordPayment, fields: [D("date", t.date, "date"), D("planId", "Plan", "select", { options: planOptions }), D("amount", t.amount, "number", { hint: "Partial, exact or several installments at once — allocation is automatic." }), D("accountId", "Account", "select", { options: accs }), D("desc", t.details, "text", { wide: true })] },
      investment: { title: t.aInvest, fields: [D("name", t.name, "text"), D("type", t.type, "select", { options: ["Stocks", "Gold", "Mutual fund", "Fixed deposit", "Certificate", "Crypto", "Business", "Other"].map(v => ({ v, l: v })) }), D("invested", "Amount invested", "number"), D("value", "Current value", "number"), D("date", "Purchase date", "date"), D("accountId", "Funded from", "select", { options: [{ v: "", l: "No cash movement" }].concat(accs) })] },
      // A statement's amount is typed by hand from the real bank statement
      // -- it never touches the card's own transaction-derived Outstanding
      // balance (see Engine.statementState). Card can't be changed once
      // created (card_statement_edit omits it) -- a statement_payment
      // already made against it stores the card's account id directly, so
      // switching cards after the fact would orphan that history.
      card_statement: { title: t.aStatement, fields: [D("accountId", this.L("Card", "الكارت"), "select", { options: cardAccs }),
        D("period", this.L("Period", "الفترة"), "text", { hint: this.L("However you want to identify this statement, e.g. \"August 2026\".", "بأي طريقة تحب تتعرف بيها على الكشف ده، زي \"أغسطس 2026\".") }),
        D("amount", this.L("Statement amount", "مبلغ الكشف"), "number", { hint: this.L("The total due, from the real bank statement.", "الإجمالي المطلوب، من كشف حساب البنك الحقيقي.") }),
        D("due", t.dueDate, "date"), D("desc", "Notes", "text", { wide: true })] },
      card_statement_edit: { title: this.L("Edit statement", "تعديل كشف الحساب"), fields: [
        D("period", this.L("Period", "الفترة"), "text"),
        D("amount", this.L("Statement amount", "مبلغ الكشف"), "number", { hint: this.L("The total due, from the real bank statement.", "الإجمالي المطلوب، من كشف حساب البنك الحقيقي.") }),
        D("due", t.dueDate, "date"), D("desc", "Notes", "text", { wide: true })] },
      // Posts exactly like a transfer (money out of "Paid from", into the
      // card) -- see the statement_payment case in derive() -- plus a
      // statementId so statementState() can tell how much of *this*
      // statement specifically has been paid off.
      // Field is named "fromId", not "accountId" -- it has to match the
      // transaction's own stored property (see the statement_payment push
      // below) so editing an existing payment (openTxEdit does
      // Object.assign({}, t) straight onto the form) actually pre-fills
      // the account it was really paid from, instead of silently falling
      // back to the first account in the list.
      statement_payment: { title: t.payStatement, fields: [D("date", t.date, "date"), D("statementId", this.L("Statement", "كشف الحساب"), "select", { options: stmtOptions }),
        D("amount", t.amount, "number", { hint: this.L("Partial payments are fine.", "السداد الجزئي مقبول.") }),
        D("fromId", this.L("Paid from", "اتسدد من"), "select", { options: fundingAccs }), D("desc", t.details, "text", { wide: true })] },
      // A goal is watched against one existing account -- not editable after
      // creation (goal_edit omits it), same reasoning as a card statement's
      // card: switching accounts mid-goal would strand the baseline against
      // an account nobody's tracking progress on anymore.
      goal: { title: this.L("+ Savings goal", "+ هدف ادخار"), fields: [
        D("name", this.L("Goal name", "اسم الهدف"), "text", { wide: true }),
        D("target", this.L("Target amount", "المبلغ المستهدف"), "number"),
        // Cards excluded, same as statement_payment's fundingAccs -- a
        // card's balance is debt, not savings; paying it down would read as
        // "progress" and a new purchase on it as the goal going backward.
        D("accountId", this.L("Track using account", "تتبّع باستخدام حساب"), "select", { options: fundingAccs, hint: this.L("Progress = how much this account's balance has grown since you set the goal.", "التقدم = قد إيه زاد رصيد الحساب ده من وقت ما حددت الهدف.") }),
        D("due", this.L("Target date (optional)", "تاريخ مستهدف (اختياري)"), "date"),
        D("color", this.L("Color", "اللون"), "color")] },
      goal_edit: { title: this.L("Edit goal", "تعديل الهدف"), fields: [
        D("name", this.L("Goal name", "اسم الهدف"), "text", { wide: true }),
        D("target", this.L("Target amount", "المبلغ المستهدف"), "number"),
        D("due", this.L("Target date (optional)", "تاريخ مستهدف (اختياري)"), "date"),
        D("color", this.L("Color", "اللون"), "color")] },
      invest_update: { title: t.updateValue, fields: [D("investmentId", "Investment", "select", { options: d.investments.map(i => ({ v: i.id, l: i.name })) }), D("value", "New current value", "number"), D("date", "As of", "date")] },
      investment_edit: { title: this.L("Edit investment"), fields: [D("name", t.name, "text"), D("type", t.type, "select", { options: ["Stocks", "Gold", "Mutual fund", "Fixed deposit", "Certificate", "Crypto", "Business", "Other"].map(v => ({ v, l: v })) }), D("invested", "Amount invested", "number")] },
      // Relation picks a default avatar color (relationTypes()) so a fresh
      // person isn't just another grey row — same "pick a default, override
      // if you want" pattern as the account color field. Selecting a
      // relation resets Color to that type's default (UI.setPersonRelation);
      // the hint says so rather than leaving it a silent surprise.
      // cardStyleFields() (color2/pattern/textColor) is the exact same
      // customizer the account cards already have -- a person's avatar
      // renders through UI.cardBackground()/cardTextColor() too now (see
      // personAvatar()), so it can look as distinct as an account card.
      person: { title: t.aPerson, fields: [D("name", t.name, "text"), D("phone", t.phone, "text"),
        D("relation", this.L("Relation", "العلاقة"), "select", { options: this.relationTypes().map(r => ({ v: r.v, l: r.icon + " " + r.l })) }),
        D("color", this.L("Color", "اللون"), "color", { hint: this.L("This person's avatar color — picking a Relation resets it to that type's default; recolor after if you'd like.", "لون أفاتار الشخص ده — اختيار العلاقة بيرجّعه للون الافتراضي بتاعها؛ غيّره تاني بعد كده لو حابب.") })]
        .concat(cardStyleFields()).concat([D("notes", "Notes", "text", { wide: true })]) },
      person_edit: { title: this.L("Edit person"), fields: [D("name", t.name, "text"), D("phone", t.phone, "text"),
        D("relation", this.L("Relation", "العلاقة"), "select", { options: this.relationTypes().map(r => ({ v: r.v, l: r.icon + " " + r.l })) }),
        D("color", this.L("Color", "اللون"), "color", { hint: this.L("This person's avatar color — picking a Relation resets it to that type's default; recolor after if you'd like.", "لون أفاتار الشخص ده — اختيار العلاقة بيرجّعه للون الافتراضي بتاعها؛ غيّره تاني بعد كده لو حابب.") })]
        .concat(cardStyleFields()).concat([D("notes", "Notes", "text", { wide: true })]) },
      // "Electronic card" (ecard) — a prepaid/gift-card-style balance, e.g.
      // an Amazon or store gift card: holds a real balance like cash or a
      // wallet (no limit/debt concept), just rendered as its own card tile.
      account: { title: t.aAccount, fields: [D("name", t.name, "text"), D("type", t.type, "select", { options: [{ v: "cash", l: "Cash" }, { v: "bank", l: "Bank" }, { v: "wallet", l: "Smart wallet" }, { v: "card", l: "Credit card" }, { v: "ecard", l: "Electronic card" }, { v: "other", l: "Other" }] }), D("bank", "Bank / issuer", "text"), D("opening", "Opening balance", "number"), D("limit", "Credit limit", "number", { hint: "Leave 0 for non-card accounts." }), D("color", this.L("Color", "اللون"), "color", { hint: this.L("Every account type but \"Other\" renders as a card face in this color — pick a real one to match.", "كل أنواع الحسابات غير \"أخرى\" بتتعرض بشكل كارت باللون ده — اختار لون حقيقي عشان يشبهه.") })].concat(cardStyleFields()).concat([D("desc", "Reference / notes", "text", { wide: true })]) },
      // Start amount / current outstanding is editable here too, same as
      // any other opening position (see the "Opening positions" rule in
      // Settings) — it's just the baseline the balance is computed from,
      // so changing it after transactions already exist doesn't break
      // anything retroactively, unlike deleting the account itself.
      account_edit: { title: this.L("Edit account"), fields: [D("name", t.name, "text"), D("bank", "Bank / issuer", "text"),
        D("opening", this.state.form && this.state.form.type === "card" ? this.L("Current outstanding") : this.L("Start amount", "الرصيد الافتتاحي"), "number", this.state.form && this.state.form.type === "card" ? { hint: this.L("What you owe on the card today.") } : {}),
        D("limit", "Credit limit", "number", { hint: "Leave 0 for non-card accounts." }),
        D("color", this.L("Color", "اللون"), "color", { hint: this.L("Renders as a card face in this color — pick a real one to match.", "بيتعرض بشكل كارت باللون ده — اختار لون حقيقي عشان يشبهه.") })
      ].concat(cardStyleFields()).concat([D("desc", "Reference / notes", "text", { wide: true })]) },
      card: { title: t.aCard, fields: [D("bank", "Bank / issuer", "text"), D("name", "Card name", "text"), D("limit", "Credit limit", "number"), D("opening", "Current outstanding", "number", { hint: "What you owe on the card today." }), D("color", this.L("Color", "اللون"), "color", { hint: this.L("Renders the card face — pick your bank's color to match.", "بيحدد شكل الكارت — اختار لون بنكك عشان يشبهه.") })].concat(cardStyleFields()).concat([D("desc", "Reference / notes", "text", { wide: true })]) },
      group: { title: this.L("+ Savings group (gam3ya)"), fields: [D("name", "Group name", "text", { wide: true }), D("amount", "Contribution per period", "number"), D("periods", "Number of periods", "number"), D("myTurn", "My turn (position)", "number"), D("freq", "Frequency", "select", { options: [{ v: "monthly", l: "Monthly" }, { v: "weekly", l: "Weekly" }] }), D("first", "First contribution date", "date"), D("accountId", "Paid from", "select", { options: accs })] },
      group_edit: { title: this.L("Edit savings group"), fields: [D("name", "Group name", "text", { wide: true }), D("amount", "Contribution per period", "number"), D("periods", "Number of periods", "number"), D("myTurn", "My turn (position)", "number"), D("freq", "Frequency", "select", { options: [{ v: "monthly", l: "Monthly" }, { v: "weekly", l: "Weekly" }] }), D("first", "First contribution date", "date")] },
      group_payment: { title: this.L("Record contribution"), fields: [D("date", t.date, "date"), D("groupId", "Group", "select", { options: (d.groups || []).map(g => ({ v: g.id, l: g.name })) }), D("amount", t.amount, "number"), D("accountId", "Paid from", "select", { options: accs })] },
      group_payout: { title: this.L("Record payout received"), fields: [D("date", t.date, "date"), D("groupId", "Group", "select", { options: (d.groups || []).map(g => ({ v: g.id, l: g.name })) }), D("amount", t.amount, "number"), D("accountId", "Into account", "select", { options: accs })] },
      recurring: { title: t.aRecurring, fields: [D("name", t.name, "text"), D("type", t.type, "select", { options: [{ v: "income", l: "Income" }, { v: "expense", l: "Expense" }] }), D("amount", t.amount, "number"), D("accountId", t.account, "select", { options: accs }), D("category", t.category, "select", { options: inc.concat(cats) }), D("freq", t.frequency, "select", { options: [{ v: "daily", l: "Daily" }, { v: "weekly", l: "Weekly" }, { v: "monthly", l: "Monthly" }, { v: "quarterly", l: "Quarterly" }, { v: "yearly", l: "Yearly" }] }), D("day", "Day of month", "number")] },
      // Plain reminders -- no amount, no account, on purpose: see
      // submit()'s "todo"/"todo_edit" branches, which never call push(),
      // so this can never touch a balance or show up in derive() output.
      todo: { title: this.L("+ To-do", "+ مهمة"), fields: [
        D("title", this.L("Task", "المهمة"), "text", { wide: true }),
        D("due", this.L("Due date (optional)", "تاريخ الاستحقاق (اختياري)"), "date"),
        D("notes", this.L("Notes (optional)", "ملاحظات (اختياري)"), "text", { wide: true })] },
      todo_edit: { title: this.L("Edit to-do", "تعديل المهمة"), fields: [
        D("title", this.L("Task", "المهمة"), "text", { wide: true }),
        D("due", this.L("Due date (optional)", "تاريخ الاستحقاق (اختياري)"), "date"),
        D("notes", this.L("Notes (optional)", "ملاحظات (اختياري)"), "text", { wide: true })] }
    };
    if (this.state.lang === "ar") {
      Object.keys(F).forEach(k => {
        const g = F[k]; g.title = this.ARW[g.title] || g.title;
        g.fields = g.fields.map(fd => {
          const c = Object.assign({}, fd); c.label = this.ARW[c.label] || c.label;
          if (c.hint) c.hint = this.ARW[c.hint] || c.hint;
          if (c.options) c.options = c.options.map(o => ({ v: o.v, l: this.ARW[o.l] || o.l }));
          return c;
        });
      });
    }
    return F;
  }
  open(kind, pre) {
    const F = this.FORMS()[kind]; if (!F) return;
    // NOTE: unlike the original, the "record collection" quick action does NOT
    // pre-fill a real person by default — this is one of the agreed P1 items,
    // left as a documented follow-up rather than silently changed here.
    const form = { date: this.today(), freq: "monthly", count: 12, down: 0, balloon: 0, type: kind === "recurring" ? "expense" : undefined, day: 1,
      relation: kind === "person" ? "other" : undefined,
      // 38 (Accounts Recut): "account"/"card" get a rotating auto-pick
      // (see nextAccountAutoColor()) instead of the same flat grey/navy
      // every time -- a real explicit pick (this form's own color swatch,
      // or an edit's pre.color) still wins, via Object.assign(form, pre)
      // below, which runs after this default is set.
      color: (kind === "card" || kind === "account") ? this.nextAccountAutoColor() : (kind === "person" ? this.relationTypes().find(r => r.v === "other").color : (kind === "goal" ? "#2a9d8f" : "#7d7979")) };
    F.fields.forEach(f => { if (form[f.k] === undefined) form[f.k] = f.type === "select" ? (f.options[0] ? f.options[0].v : "") : (f.type === "number" ? "" : ""); });
    form.date = this.today();
    this.state.modal = kind; this.state.form = Object.assign(form, pre || {}); this.state.err = "";
    // A blank "color2" (never set, or a legacy account from before this
    // field existed) would otherwise show the native color input as pure
    // black -- see darkenHex() -- so seed it with the same auto-darkened
    // shade the card face falls back to when no secondary color is chosen,
    // computed from whatever primary color the form ends up with. A real
    // saved color2 (from pre) is left untouched. _color2Seeded records
    // which case this was so UI.openModal can decide whether it's safe to
    // keep this placeholder tracking the primary Color field live as the
    // user edits it (only ever true for a value we invented here, never
    // for a real customization someone already chose).
    if (F.fields.some(f => f.k === "color2")) {
      this.state.form._color2Seeded = !this.state.form.color2;
      if (!this.state.form.color2) this.state.form.color2 = this.darkenHex(this.state.form.color);
    }
  }
  submit() {
    const k = this.state.modal, f = this.state.form, d = this.state.data, N = (x) => this.n(f[x]);
    // What to actually persist for color2: if it's still exactly the
    // auto-darkened shade of the submitted primary color -- true whether
    // the user never touched it at all, or let UI.syncColor2Default keep
    // tracking Color live without ever picking their own secondary --
    // save "" instead of that computed hex. Rendering is identical either
    // way (cardBackground()'s own fallback computes the same shade), but
    // storing "" is what lets the NEXT edit re-seed and re-enable live
    // tracking; storing the real hex would freeze it and (per
    // _color2Seeded in open()) permanently look like a deliberate choice,
    // even after the primary color changes again on some future edit.
    const resolveColor2 = () => {
      const c2 = f.color2 || "";
      return c2 && c2.toLowerCase() !== this.darkenHex(f.color).toLowerCase() ? c2 : "";
    };
    const data = JSON.parse(JSON.stringify(d));
    const push = (o) => data.tx.push(Object.assign({ id: this.uid("t"), created: new Date().toISOString(), void: false }, o));
    const need = (cond, msg) => { if (!cond) { this.state.err = msg; return false; } return true; };
    let note = "";
    if (["income", "expense", "receivable", "payable", "receivable_payment", "debt_payment"].includes(k)) {
      if (!need(N("amount") > 0, "Amount must be greater than zero.")) return false;
      if (["receivable", "payable", "receivable_payment", "debt_payment"].includes(k) && !need(f.personId, "Pick a person.")) return false;
      // Split expense: validated up front, alongside everything else, so a
      // bad split blocks the whole submission rather than leaving the
      // expense posted with no matching receivable. Both fields are marked
      // "(optional)" independently in the form, so filling only one (e.g.
      // an amount with no person picked) has to be caught here explicitly
      // — silently doing nothing would look, to the user, exactly like a
      // split that succeeded.
      const hasSplitPerson = k === "expense" && !f.id && !!f.splitPersonId;
      const hasSplitAmount = k === "expense" && !f.id && this.n(f.splitAmount) > 0;
      if ((hasSplitPerson || hasSplitAmount) && !need(hasSplitPerson && hasSplitAmount, "Pick who to split with, and enter their share — or leave both blank.")) return false;
      const splitting = hasSplitPerson && hasSplitAmount;
      if (splitting && !need(this.n(f.splitAmount) <= N("amount"), "Their share can't be more than the total expense.")) return false;
      const fields = { date: f.date, amount: N("amount"), accountId: f.accountId || null, fromId: null, toId: null, category: f.category || null, personId: f.personId || null, desc: f.desc || this.FORMS()[k].title, due: f.due || null };
      // Tags only exist on income/expense (see FORMS() above); for every
      // other kind here f.tags is simply undefined and this line is a
      // harmless no-op — nothing needs a type check to skip it.
      if (["income", "expense"].includes(k)) fields.tags = (f.tags || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (f.id) {
        const ex = data.tx.find(x => x.id === f.id);
        if (!need(ex, "That transaction no longer exists.")) return false;
        Object.assign(ex, fields);
        note = "Updated " + this.FORMS()[k].title.toLowerCase() + " " + this.fmt(N("amount"));
      } else {
        push(Object.assign({ type: k }, fields));
        // Posted as an independent receivable, same as one added from
        // Receivables & Payables directly — nothing in the data model
        // links it back to this expense (only plan/group ids get that
        // treatment), so editing or deleting either one later never
        // touches the other.
        if (splitting) {
          push({ type: "receivable", date: f.date, amount: this.n(f.splitAmount), accountId: null, fromId: null, toId: null, category: null, personId: f.splitPersonId, due: null, desc: this.L("Share of: ", "حصة من: ") + fields.desc });
        }
        note = this.FORMS()[k].title + " " + this.fmt(N("amount"));
      }
    } else if (k === "transfer") {
      if (!need(N("amount") > 0, "Amount must be greater than zero.")) return false;
      if (!need(f.fromId !== f.toId, "Pick two different accounts.")) return false;
      if (f.id) {
        const ex = data.tx.find(x => x.id === f.id);
        if (!need(ex, "That transaction no longer exists.")) return false;
        Object.assign(ex, { date: f.date, amount: N("amount"), fromId: f.fromId, toId: f.toId, desc: f.desc || "Transfer" });
        note = "Updated transfer " + this.fmt(N("amount"));
      } else {
        push({ date: f.date, type: "transfer", amount: N("amount"), fromId: f.fromId, toId: f.toId, desc: f.desc || "Transfer" });
        note = "Transfer " + this.fmt(N("amount"));
      }
    } else if (k === "sale" || k === "purchase") {
      const total = N("total"), down = N("down"), count = Math.max(1, Math.round(N("count"))), balloon = N("balloon");
      if (!need(total > 0, "Total must be greater than zero.")) return false;
      if (!need(down <= total, "Down payment cannot exceed the total.")) return false;
      const financed = Math.round((total - down) * 100) / 100;
      if (!need(balloon < financed, "Balloon payment must be smaller than the financed amount.")) return false;
      const per = Math.round(((financed - balloon) / count) * 100) / 100;
      const first = new Date(f.first || f.date); const step = f.freq;
      const sched = []; for (let i = 0; i < count; i++) {
        const due = step === "weekly" ? this.addDays(first, 7 * i) : this.addMonths(first, (step === "quarterly" ? 3 : 1) * i);
        sched.push({ no: i + 1, due: this.iso(due), amount: per });
      }
      if (balloon > 0) { const last = sched[sched.length - 1]; const due = step === "weekly" ? this.addDays(new Date(last.due), 7) : this.addMonths(new Date(last.due), step === "quarterly" ? 3 : 1); sched.push({ no: count + 1, due: this.iso(due), amount: balloon }); }
      const drift = Math.round((financed - sched.reduce((s, r) => s + r.amount, 0)) * 100) / 100;
      if (drift) sched[sched.length - 1].amount = Math.round((sched[sched.length - 1].amount + drift) * 100) / 100;
      const id = this.uid("pl");
      data.plans.push({ id, personId: f.personId, direction: k === "sale" ? "in" : "out", title: f.title || (k === "sale" ? "Installment sale" : "Installment purchase"), total, down, created: f.date, schedule: sched });
      push({ date: f.date, type: "installment_sale", amount: down, accountId: down > 0 ? (f.accountId || null) : null, personId: f.personId, planId: id, desc: (down > 0 ? "Down payment — " : "Plan created — ") + (f.title || "") });
      note = (k === "sale" ? "Installment sale " : "Installment purchase ") + this.fmt(total);
    } else if (k === "installment_payment") {
      if (!need(N("amount") > 0, "Amount must be greater than zero.")) return false;
      const plan = data.plans.find(p => p.id === f.planId);
      if (!need(plan, "Pick a plan.")) return false;
      const existing = f.id ? data.tx.find(x => x.id === f.id) : null;
      const st = this.planState(plan);
      // Editing a payment already counted in st.remaining for this same plan
      // — add it back before capping, so shrinking or growing it validates
      // against the schedule's real remaining balance, not remaining-minus-
      // itself. Moving a payment onto a *different* plan (rare, but the plan
      // picker allows it) gets no such allowance: it has to fit that plan's
      // remaining as-is.
      const cap = (existing && existing.planId === plan.id) ? st.remaining + existing.amount : st.remaining;
      if (!need(N("amount") <= cap + 0.001, "That is more than the " + this.fmt(cap) + " still outstanding on this plan.")) return false;
      if (existing) {
        Object.assign(existing, { date: f.date, amount: N("amount"), accountId: f.accountId, personId: plan.personId, planId: plan.id, desc: f.desc || "Installment payment" });
        note = "Updated installment payment " + this.fmt(N("amount")) + " · " + plan.title;
      } else {
        push({ date: f.date, type: "installment_payment", amount: N("amount"), accountId: f.accountId, personId: plan.personId, planId: plan.id, desc: f.desc || "Installment payment" });
        note = "Installment payment " + this.fmt(N("amount")) + " · " + plan.title;
      }
    } else if (k === "card_statement") {
      if (!need(f.accountId, "Pick a card.")) return false;
      if (!need(N("amount") > 0, "Amount must be greater than zero.")) return false;
      if (!need(f.due, "Pick a due date.")) return false;
      data.cardStatements = (data.cardStatements || []).concat([{ id: this.uid("st"), accountId: f.accountId, period: f.period || "", amount: N("amount"), due: f.due, desc: f.desc || "" }]);
      note = "Added statement " + (f.period || "") + " " + this.fmt(N("amount"));
    } else if (k === "card_statement_edit") {
      const s = (data.cardStatements || []).find(x => x.id === f.id);
      if (!need(s, "Pick a statement.")) return false;
      if (!need(N("amount") > 0, "Amount must be greater than zero.")) return false;
      if (!need(f.due, "Pick a due date.")) return false;
      s.period = f.period || ""; s.amount = N("amount"); s.due = f.due; s.desc = f.desc || "";
      note = "Updated statement " + (s.period || "");
    } else if (k === "statement_payment") {
      if (!need(N("amount") > 0, "Amount must be greater than zero.")) return false;
      const stmt = (data.cardStatements || []).find(s => s.id === f.statementId);
      if (!need(stmt, "Pick a statement.")) return false;
      // Covers the edge case where every active account is a card (the
      // "Paid from" list excludes all of them, on purpose -- see
      // fundingAccs above): the select renders with no options and
      // f.fromId defaults to "", which would otherwise pass the
      // not-equal-to-the-card check below vacuously and post a payment
      // debited from no account at all.
      if (!need(f.fromId, "Pick an account to pay from.")) return false;
      if (!need(f.fromId !== stmt.accountId, "Pick an account other than the card itself.")) return false;
      const existing = f.id ? data.tx.find(x => x.id === f.id) : null;
      const st = this.statementState(stmt);
      // Same allowance as installment_payment above: editing a payment
      // already counted in st.remaining for this same statement gets it
      // added back before capping, so shrinking/growing it validates
      // against the statement's real remaining, not remaining-minus-itself.
      const cap = (existing && existing.statementId === stmt.id) ? st.remaining + existing.amount : st.remaining;
      if (!need(N("amount") <= cap + 0.001, "That is more than the " + this.fmt(cap) + " still outstanding on this statement.")) return false;
      if (existing) {
        Object.assign(existing, { date: f.date, amount: N("amount"), statementId: stmt.id, fromId: f.fromId, toId: stmt.accountId, desc: f.desc || "Statement payment" });
        note = "Updated statement payment " + this.fmt(N("amount"));
      } else {
        push({ date: f.date, type: "statement_payment", amount: N("amount"), statementId: stmt.id, fromId: f.fromId, toId: stmt.accountId, desc: f.desc || "Statement payment" });
        note = "Statement payment " + this.fmt(N("amount"));
      }
    } else if (k === "goal") {
      if (!need(f.name, "Give the goal a name.")) return false;
      if (!need(N("target") > 0, "Target must be greater than zero.")) return false;
      if (!need(f.accountId, "Pick an account to track.")) return false;
      // Belt and suspenders, same as statement_payment's fromId check below:
      // the form's own options already exclude cards (see FORMS()'s "goal"
      // entry), this just refuses to trust that a pre-filled accountId
      // (nothing does this today, but nothing has to stay that way) can't
      // sneak a card in.
      const trackedAcc = data.accounts.find(a => a.id === f.accountId);
      if (!need(trackedAcc && trackedAcc.type !== "card", "Pick a real spendable account, not a credit card.")) return false;
      // Baseline = that account's real balance right now, before this goal
      // exists -- everything the account already held is "already there",
      // not part of this goal's own progress (see Engine.goalState). Uses
      // the same plain derive() (no cutoff) that every later read of this
      // account's balance uses (Dashboard, the goals page, savingsGoalStates
      // itself) -- passing today() as a cutoff here would exclude any
      // future-dated transaction from the baseline while later reads of the
      // SAME account still include it, inflating "saved" by that future
      // amount the moment it's entered.
      const D0 = this.derive();
      const baseline = D0.bal[f.accountId] !== undefined ? D0.bal[f.accountId] : 0;
      data.savingsGoals = (data.savingsGoals || []).concat([{ id: this.uid("gl"), name: f.name, target: N("target"), due: f.due || null, accountId: f.accountId, baseline, color: f.color || "#2a9d8f", created: this.today() }]);
      note = "Savings goal " + f.name + " · " + this.fmt(N("target"));
    } else if (k === "goal_edit") {
      const g = (data.savingsGoals || []).find(x => x.id === f.id);
      if (!need(g, "Pick a goal.")) return false;
      if (!need(f.name, "Give the goal a name.")) return false;
      if (!need(N("target") > 0, "Target must be greater than zero.")) return false;
      g.name = f.name; g.target = N("target"); g.due = f.due || null; g.color = f.color || g.color;
      note = "Updated goal " + g.name;
    } else if (k === "investment") {
      if (!need(f.name, "Give the investment a name.")) return false;
      const id = this.uid("iv");
      data.investments.push({ id, name: f.name, type: f.type, invested: N("invested"), value: N("value") || N("invested"), date: f.date, accountId: f.accountId || null });
      push({ date: f.date, type: "investment_buy", amount: N("invested"), accountId: f.accountId || null, category: f.type, desc: "Invested — " + f.name, investmentId: id });
      note = "Investment " + f.name;
    } else if (k === "invest_update") {
      const iv = data.investments.find(i => i.id === f.investmentId);
      if (!need(iv, "Pick an investment.")) return false;
      iv.value = N("value"); note = "Revalued " + iv.name + " to " + this.fmt(iv.value);
    } else if (k === "investment_edit") {
      if (!need(f.name, "Give the investment a name.")) return false;
      const iv = data.investments.find(i => i.id === f.id);
      if (!need(iv, "Pick an investment.")) return false;
      iv.name = f.name; iv.type = f.type; iv.invested = N("invested");
      note = "Updated investment " + iv.name;
    } else if (k === "person") {
      if (!need(f.name, "Name is required.")) return false;
      const rel = f.relation || "other";
      data.people.push({ id: this.uid("p"), name: f.name, phone: f.phone || "", notes: f.notes || "", relation: rel, color: f.color || this.relationTypes().find(r => r.v === rel).color, color2: resolveColor2(), pattern: f.pattern || "diag1", textColor: f.textColor || "auto" });
      note = "Added person " + f.name;
    } else if (k === "person_edit") {
      if (!need(f.name, "Name is required.")) return false;
      const p = data.people.find(x => x.id === f.id);
      if (!need(p, "Pick a person.")) return false;
      p.name = f.name; p.phone = f.phone || ""; p.notes = f.notes || ""; p.relation = f.relation || p.relation || "other"; p.color = f.color || p.color;
      p.color2 = resolveColor2(); p.pattern = f.pattern || "diag1"; p.textColor = f.textColor || "auto";
      note = "Updated person " + f.name;
    } else if (k === "account") {
      if (!need(f.name, "Name is required.")) return false;
      // The generic "+ Account" form's own type picker also offers "Credit
      // card" (separately from the dedicated "card" quick-add below, which
      // is the normal way in) — whichever door it comes through, debt has
      // to land negative, or balance/net-worth would count it as an asset.
      const openingVal = f.type === "card" ? -Math.abs(N("opening")) : N("opening");
      data.accounts.push({ id: this.uid("a"), name: f.name, type: f.type, bank: f.bank || "", limit: N("limit"), opening: openingVal, color: f.color || (f.type === "card" ? "#004961" : "#7d7979"), color2: resolveColor2(), pattern: f.pattern || "diag1", textColor: f.textColor || "auto", active: true, desc: f.desc || "" });
      note = "Added account " + f.name;
    } else if (k === "account_edit") {
      if (!need(f.name, "Name is required.")) return false;
      const a = data.accounts.find(x => x.id === f.id);
      if (!need(a, "Pick an account.")) return false;
      if (a.type === "card" && !need(N("opening") <= N("limit"), "Outstanding cannot exceed the credit limit.")) return false;
      a.name = f.name; a.bank = f.bank || ""; if (a.type === "card") a.limit = N("limit"); a.desc = f.desc || ""; a.color = f.color || a.color;
      a.color2 = resolveColor2(); a.pattern = f.pattern || "diag1"; a.textColor = f.textColor || "auto";
      // Card debt is stored negative (see the "card" quick-add above); the
      // field shows the positive "current outstanding" the user actually
      // types, same convention as creating one.
      a.opening = a.type === "card" ? -Math.abs(N("opening")) : N("opening");
      note = "Updated account " + f.name;
    } else if (k === "card") {
      if (!need(f.bank || f.name, "Give the card a bank or a name.")) return false;
      if (!need(N("limit") > 0, "A credit card needs a limit.")) return false;
      if (!need(N("opening") <= N("limit"), "Outstanding cannot exceed the credit limit.")) return false;
      data.accounts.push({ id: this.uid("card"), name: f.name || "Credit card", type: "card", bank: f.bank || "", limit: N("limit"), opening: -Math.abs(N("opening")), color: f.color || "#004961", color2: resolveColor2(), pattern: f.pattern || "diag1", textColor: f.textColor || "auto", active: true, desc: f.desc || "" });
      note = "Added credit card " + (f.bank ? f.bank + " " : "") + (f.name || "");
    } else if (k === "group") {
      const amt = N("amount"), per = Math.round(N("periods")), turn = Math.round(N("myTurn"));
      if (!need(amt > 0, "Contribution must be greater than zero.")) return false;
      if (!need(per >= 2, "A group needs at least two periods.")) return false;
      if (!need(turn >= 1 && turn <= per, "Your turn must be between 1 and " + per + ".")) return false;
      data.groups = (data.groups || []).concat([{ id: this.uid("g"), name: f.name || "Savings group", amount: amt, periods: per, myTurn: turn, freq: f.freq || "monthly", first: f.first || f.date, accountId: f.accountId }]);
      note = "Savings group " + (f.name || "") + " · " + this.fmt(amt) + " × " + per;
    } else if (k === "group_edit") {
      const amt = N("amount"), per = Math.round(N("periods")), turn = Math.round(N("myTurn"));
      if (!need(amt > 0, "Contribution must be greater than zero.")) return false;
      if (!need(per >= 2, "A group needs at least two periods.")) return false;
      if (!need(turn >= 1 && turn <= per, "Your turn must be between 1 and " + per + ".")) return false;
      const g = (data.groups || []).find(x => x.id === f.id);
      if (!need(g, "Pick a group.")) return false;
      g.name = f.name || g.name; g.amount = amt; g.periods = per; g.myTurn = turn; g.freq = f.freq || g.freq; g.first = f.first || g.first;
      note = "Updated savings group " + g.name;
    } else if (k === "group_payment" || k === "group_payout") {
      if (!need(N("amount") > 0, "Amount must be greater than zero.")) return false;
      const g = (data.groups || []).find(x => x.id === f.groupId);
      if (!need(g, "Pick a group.")) return false;
      const existing = f.id ? data.tx.find(x => x.id === f.id) : null;
      if (k === "group_payment") {
        const st = this.groupState(g);
        const cap = (existing && existing.groupId === g.id) ? st.remainingPay + existing.amount : st.remainingPay;
        if (!need(N("amount") <= cap + 0.001, "That is more than the " + this.fmt(cap) + " left to pay into this group.")) return false;
      }
      const type = k === "group_payment" ? "gam3ya_payment" : "gam3ya_payout";
      const desc = f.desc || (k === "group_payment" ? "Contribution — " : "Payout collected — ") + g.name;
      if (existing) {
        Object.assign(existing, { date: f.date, amount: N("amount"), accountId: f.accountId, groupId: g.id, desc });
        note = "Updated " + (k === "group_payment" ? "gam3ya contribution " : "gam3ya payout ") + this.fmt(N("amount")) + " · " + g.name;
      } else {
        push({ date: f.date, type, amount: N("amount"), accountId: f.accountId, groupId: g.id, desc });
        note = (k === "group_payment" ? "Gam3ya contribution " : "Gam3ya payout ") + this.fmt(N("amount")) + " · " + g.name;
      }
    } else if (k === "recurring") {
      if (!need(f.name && this.n(f.amount) > 0, "Name and amount are required.")) return false;
      data.recurring.push({ id: this.uid("r"), name: f.name, type: f.type, amount: N("amount"), accountId: f.accountId, category: f.category, freq: f.freq, day: Math.max(1, Math.min(28, Math.round(N("day")) || 1)) });
      note = "Recurring rule " + f.name;
    } else if (k === "todo") {
      // Deliberately never calls push() (unlike almost every other kind in
      // this function) -- a to-do is a plain reminder, not a transaction,
      // and must have zero financial effect: no account touched, no
      // balance/net-worth impact, nothing derive() ever sees.
      if (!need(f.title && f.title.trim(), this.L("Give the to-do a title.", "اكتب اسم للمهمة."))) return false;
      data.todos = (data.todos || []).concat([{ id: this.uid("td"), title: f.title.trim(), due: f.due || null, notes: (f.notes || "").trim(), done: false, created: this.today() }]);
      note = this.L("To-do added", "اتضافت المهمة") + ": " + f.title.trim();
    } else if (k === "todo_edit") {
      const td = (data.todos || []).find(x => x.id === f.id);
      if (!need(td, this.L("Pick a to-do.", "اختار مهمة."))) return false;
      if (!need(f.title && f.title.trim(), this.L("Give the to-do a title.", "اكتب اسم للمهمة."))) return false;
      td.title = f.title.trim(); td.due = f.due || null; td.notes = (f.notes || "").trim();
      note = this.L("Updated to-do", "اتعدلت المهمة") + " " + td.title;
    }
    this.state.modal = null; this.state.err = "";
    this.persist(data, note);
    return true;
  }
  // Same idea as an account's color+card-face: a person is more than a name
  // in a list. Relation picks a sensible default avatar color/icon (still
  // fully overridable via the Color field) so People reads at a glance
  // instead of every row looking the same.
  relationTypes() {
    return [
      { v: "family", l: this.L("Family", "عيلة"), color: "#e8734a", icon: "👪" },
      { v: "friend", l: this.L("Friend", "صحاب"), color: "#2a9d8f", icon: "🧑‍🤝‍🧑" },
      { v: "work", l: this.L("Work", "شغل"), color: "#4a6fa5", icon: "💼" },
      { v: "business", l: this.L("Business", "تجاري"), color: "#8e5cd9", icon: "🤝" },
      { v: "other", l: this.L("Other", "غير كده"), color: "#c15b6b", icon: "👤" }
    ];
  }
  // Fixed category -> color-slot order (kept OUT of amount/rank -- a
  // category's color never changes just because it moved up or down a
  // list this month vs last, or because Reports slices to its top 8 by
  // spend). Picked for which categories people most want to tell apart at
  // a glance, not by declaration order in FORMS(). Capped at 8 slots on
  // purpose: --cat-1..--cat-8 (app.css) are a validated categorical
  // palette (colorblind-safe adjacent-pair spacing, checked against both
  // this app's light and dark surfaces) -- adding a 9th slot or reordering
  // these 8 would need re-validating from scratch, so anything past slot 8
  // (or a custom category) falls back to --cat-neutral instead.
  CATEGORY_COLOR_ORDER = {
    expense: ["Food", "Rent", "Transportation", "Shopping", "Medical", "Entertainment", "Family", "Car"],
    income: ["Salary", "Freelance", "Business", "Commission", "Rental", "Interest", "Selling items", "Other"]
  };
  categoryColor(name, kind) {
    const order = this.CATEGORY_COLOR_ORDER[kind === "income" ? "income" : "expense"];
    const i = order.indexOf(name);
    return i >= 0 ? "var(--cat-" + (i + 1) + ")" : "var(--cat-neutral)";
  }
  personHasRecords(id) {
    const d = this.state.data;
    return d.tx.some(t => !t.void && t.personId === id) || (d.plans || []).some(p => p.personId === id);
  }
  deletePerson(id) {
    if (this.personHasRecords(id)) return;
    const data = JSON.parse(JSON.stringify(this.state.data));
    const p = data.people.find(x => x.id === id); if (!p) return;
    data.people = data.people.filter(x => x.id !== id);
    this.persist(data, "Deleted person " + p.name);
  }
  // A plan can be removed only before any payment is recorded against it —
  // once an actual installment payment has been recorded, it stays in the
  // ledger like everything else and gets corrected the same way
  // transactions do (Reverse), not deleted. A real bug lived here: checking
  // planState().collected (which also folds in the plan's down payment,
  // since that's cash that already moved too) blocked deletion for any
  // plan created with a down payment, even with zero actual payments made
  // against the schedule — deletePlan() already removes the down-payment
  // transaction along with the plan, so it's the schedule that must be
  // untouched, not the down payment.
  planCanDelete(id) {
    return !this.state.data.tx.some(t => !t.void && t.planId === id && t.type === "installment_payment");
  }
  deletePlan(id) {
    if (!this.planCanDelete(id)) return;
    const data = JSON.parse(JSON.stringify(this.state.data));
    const plan = data.plans.find(p => p.id === id); if (!plan) return;
    data.plans = data.plans.filter(p => p.id !== id);
    // also remove the "plan created" transaction it posted (down payment, if any)
    data.tx = data.tx.filter(t => t.planId !== id);
    this.persist(data, "Deleted plan " + plan.title);
  }
  // An account/card can be removed only once nothing at all is posted
  // against it — as a fromId/toId (transfer) or accountId (everything
  // else) — matching the same "zero real transactions" bar every other
  // deletable record uses. A recurring rule still pointing at it blocks
  // deletion too: it hasn't posted anything yet, but it's about to, and
  // deleting the account out from under it would just break that rule
  // silently the next time it fires. Same for a card statement with no tx
  // against it yet: it doesn't show up in the tx scan above, but deleting
  // the card out from under it would orphan it — pay it later and
  // derive()'s A(t.toId, m) silently no-ops (bal has no entry for a
  // deleted account id), so the money would vanish from every total
  // instead of landing anywhere.
  accountCanDelete(id) {
    const d = this.state.data;
    const used = d.tx.some(t => !t.void && (t.accountId === id || t.fromId === id || t.toId === id));
    const scheduled = (d.recurring || []).some(r => r.accountId === id);
    const hasStatement = (d.cardStatements || []).some(s => s.accountId === id);
    // A savings goal watches this account's own balance directly (see
    // goalState) -- deleting the account out from under it would leave the
    // goal pointing at nothing, same reasoning as hasStatement above.
    const hasGoal = (d.savingsGoals || []).some(g => g.accountId === id);
    return !used && !scheduled && !hasStatement && !hasGoal;
  }
  deleteAccount(id) {
    if (!this.accountCanDelete(id)) return;
    const data = JSON.parse(JSON.stringify(this.state.data));
    const a = data.accounts.find(x => x.id === id); if (!a) return;
    data.accounts = data.accounts.filter(x => x.id !== id);
    this.persist(data, "Deleted account " + a.name);
  }
  // Which account types render as a card-shaped tile in Accounts vs a plain
  // list row — shared with ui.js's renderAccounts (not duplicated there) so
  // moveAccount() below groups accounts the exact same way the display
  // does; only "other" stays a plain row.
  tileTypes() { return ["card", "bank", "wallet", "cash", "ecard"]; }
  // 39 (Accounts Recut): which of the 3 tile sub-groups renderAccounts()
  // now displays under their own headings ("Cash & bank"/"Wallets &
  // cards"/"Credit cards") an account's type belongs to -- null for
  // anything outside tileTypes() (the plain-row "other" accounts, which
  // stay their own single un-grouped section, same as before this existed).
  // Shared with moveAccount() below for the exact same reason tileTypes()
  // already is: an up/down arrow that's enabled because a tile isn't first/
  // last within its ON-SCREEN group has to actually move within that same
  // group, or the arrow would look broken right next to a group boundary.
  acctTileGroup(type) {
    if (type === "card") return "card";
    if (type === "wallet" || type === "ecard") return "wallet";
    if (type === "cash" || type === "bank") return "cashbank";
    return null;
  }
  // A rotating default for a brand-new account/card's color (see open()
  // above), instead of every one landing on the same flat grey/navy unless
  // the user thinks to open the color swatch and pick one themselves --
  // skips anything already in use by an existing active account, so two
  // accounts created back to back don't just get handed the same auto-pick
  // straight through Object.assign(form, pre) either way.
  nextAccountAutoColor() {
    const accounts = this.state.data.accounts || [];
    const used = new Set(accounts.filter(a => a.active).map(a => a.color));
    const start = accounts.length % ACCOUNT_AUTO_COLORS.length;
    for (let i = 0; i < ACCOUNT_AUTO_COLORS.length; i++) {
      const c = ACCOUNT_AUTO_COLORS[(start + i) % ACCOUNT_AUTO_COLORS.length];
      if (!used.has(c)) return c;
    }
    return ACCOUNT_AUTO_COLORS[start]; // every rotation color already in use somehow -- still better than a flat literal
  }
  // Reorder accounts one step at a time. Swaps with the nearest account in
  // the SAME visual section (each tile sub-group, or the plain rows) rather
  // than the plain adjacent array slot — swapping past an item that renders
  // in a different section wouldn't move anything the user can see, which
  // would make the ↑/↓ buttons look broken right next to a section boundary.
  moveAccount(id, dir) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    const list = data.accounts;
    const acc = list.find(a => a.id === id);
    if (!acc) return;
    const key = this.acctTileGroup(acc.type) || "row";
    const sectionIdx = [];
    list.forEach((a, i) => { if ((this.acctTileGroup(a.type) || "row") === key) sectionIdx.push(i); });
    const pos = sectionIdx.indexOf(list.indexOf(acc));
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= sectionIdx.length) return;
    const i1 = sectionIdx[pos], i2 = sectionIdx[targetPos];
    const tmp = list[i1]; list[i1] = list[i2]; list[i2] = tmp;
    this.persist(data, "Reordered accounts");
  }
  investmentCanDelete(id) {
    return !this.state.data.tx.some(t => !t.void && t.investmentId === id);
  }
  deleteInvestment(id) {
    if (!this.investmentCanDelete(id)) return;
    const data = JSON.parse(JSON.stringify(this.state.data));
    const iv = data.investments.find(i => i.id === id); if (!iv) return;
    data.investments = data.investments.filter(i => i.id !== id);
    this.persist(data, "Deleted investment " + iv.name);
  }
  cardStatementCanDelete(id) {
    return !this.state.data.tx.some(t => !t.void && t.type === "statement_payment" && t.statementId === id);
  }
  deleteCardStatement(id) {
    if (!this.cardStatementCanDelete(id)) return;
    const data = JSON.parse(JSON.stringify(this.state.data));
    const s = (data.cardStatements || []).find(x => x.id === id); if (!s) return;
    data.cardStatements = data.cardStatements.filter(x => x.id !== id);
    this.persist(data, "Deleted statement " + (s.period || s.due || ""));
  }
  // No dependent records ever point at a goal (it isn't referenced by any
  // tx, unlike a plan/investment/statement) -- always deletable, no
  // CanDelete gate needed.
  deleteSavingsGoal(id) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    const g = (data.savingsGoals || []).find(x => x.id === id); if (!g) return;
    data.savingsGoals = data.savingsGoals.filter(x => x.id !== id);
    this.persist(data, "Deleted goal " + g.name);
  }
  // Same no-dependent-records reasoning as deleteSavingsGoal above -- a
  // to-do is never referenced by anything else, always deletable.
  deleteTodo(id) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    const td = (data.todos || []).find(x => x.id === id); if (!td) return;
    data.todos = data.todos.filter(x => x.id !== id);
    this.persist(data, this.L("Deleted to-do ", "اتمسحت المهمة ") + td.title);
  }
  toggleTodoDone(id) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    const td = (data.todos || []).find(x => x.id === id); if (!td) return;
    td.done = !td.done;
    this.persist(data, (td.done ? this.L("Checked off ", "اتعلّمت خلاص ") : this.L("Reopened ", "اترجعت ")) + td.title);
  }
  // One definition of "is this to-do overdue", shared by dueSoonTodos()
  // below (Dashboard reminder + attentionCount badge) AND UI.renderTodos()
  // (the To-do list page itself) -- a real duplication-drift bug class this
  // codebase's tests/README already calls out repeatedly (e.g. the
  // first-category-badge fix consolidating two copies that could disagree):
  // without this, the list page and the Dashboard could each grow their own
  // "overdue" definition and quietly stop agreeing on the same row.
  isTodoOverdue(td) {
    return !td.done && !!td.due && td.due < this.today();
  }
  // Not-done to-dos due within the next 3 days (including already-overdue
  // ones), soonest first -- what UI.renderDashboard's Needs Attention
  // section actually shows. 3 days, not "due today only": a reminder that
  // only ever appears the morning it's due is easy to miss entirely if
  // that happens to be a day the app isn't opened.
  dueSoonTodos() {
    const horizon = this.iso(this.addDays(new Date(), 3));
    return (this.state.data.todos || [])
      .filter(td => !td.done && td.due && td.due <= horizon)
      .sort((a, b) => a.due < b.due ? -1 : (a.due > b.due ? 1 : 0))
      .map(td => Object.assign({ overdue: this.isTodoOverdue(td) }, td));
  }
  // Custom income/expense categories — added from Settings, then show up
  // in every category dropdown (FORMS()) right alongside the built-in ones.
  addCategory(kind, name) {
    const clean = (name || "").trim();
    if (!clean) return { ok: false, error: this.L("Give the category a name.", "اكتب اسم للفئة.") };
    const data = JSON.parse(JSON.stringify(this.state.data));
    data.customCategories = data.customCategories || { income: [], expense: [] };
    const list = data.customCategories[kind] || (data.customCategories[kind] = []);
    const builtin = kind === "income"
      ? ["Salary", "Freelance", "Business", "Commission", "Rental", "Interest", "Selling items", "Other"]
      : ["Food", "Transportation", "Rent", "Electricity", "Water", "Internet", "Mobile", "Shopping", "Clothing", "Medical", "Education", "Entertainment", "Family", "Children", "Car", "Home", "Subscriptions", "Loans", "Other"];
    if (builtin.concat(list).some(c => c.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: this.L("That category already exists.", "الفئة دي موجودة بالفعل.") };
    }
    list.push(clean);
    this.persist(data, "Added category " + clean);
    return { ok: true };
  }
  // A light autocomplete, not a rule engine: whenever the description
  // typed into "+ Expense" / "+ Income" contains (or is contained in) an
  // earlier entry's description, suggest whichever category that earlier
  // entry used most often. No matches, or a description too short to be
  // meaningful, and it simply suggests nothing.
  suggestCategory(desc, kind) {
    const q = (desc || "").trim().toLowerCase();
    if (q.length < 2 || !["income", "expense"].includes(kind)) return null;
    const matches = this.state.data.tx.filter(t => !t.void && t.type === kind && t.category &&
      t.desc && (t.desc.toLowerCase().includes(q) || q.includes(t.desc.toLowerCase())));
    if (!matches.length) return null;
    const counts = {};
    matches.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }
  // Which transaction is the FIRST-ever use of its own category (earliest
  // by date, tied-broken by `created` for two on the same date) -- one id
  // per distinct kind|category, among live categorized transactions.
  // Powers a small "first time" badge on that one row in Transactions
  // (UI.renderTransactions()), a light way to notice a spending/income
  // habit actually starting, not recomputed per row -- one pass over the
  // ledger, same idiom as monthCategorySpend(). By design, the badge sits
  // on whichever transaction is truly earliest, which for an
  // account/category with real history usually falls outside the default
  // 25-most-recent page (Transactions sorts newest-first) -- browsing that
  // category specifically (a bar tap, the category filter) or paging back
  // through history is how it's meant to be found, the same way a photo
  // app's "on this day" only shows up once you look; it's not meant to be
  // an always-visible indicator on the default view. "income" here folds in
  // refund/investment_return too -- real bug caught in review: an earlier
  // version only recognized the literal "income" type, so a
  // refund/investment_return that happened to be the true first use of a
  // category was invisible to this, and a later plain "income" row could
  // wrongly claim the badge instead. Matches the same income-side bucket
  // categoryMonthStats()/monthCategorySpend()'s callers already treat as
  // one kind everywhere else in the app.
  firstCategoryUseIds() {
    const byKey = {};
    const incomeTypes = ["income", "refund", "investment_return"];
    for (const t of this.state.data.tx) {
      if (t.void || !t.category) continue;
      const kind = t.type === "expense" ? "expense" : incomeTypes.includes(t.type) ? "income" : null;
      if (!kind) continue;
      const key = kind + "|" + t.category;
      const cur = byKey[key];
      if (!cur || t.date < cur.date || (t.date === cur.date && (t.created || "") < (cur.created || ""))) byKey[key] = t;
    }
    return new Set(Object.values(byKey).map(t => t.id));
  }
  deleteCategory(kind, name) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    data.customCategories = data.customCategories || { income: [], expense: [] };
    data.customCategories[kind] = (data.customCategories[kind] || []).filter(c => c !== name);
    this.persist(data, "Removed category " + name);
  }
  groupCanDelete(id) {
    return !this.state.data.tx.some(t => !t.void && t.groupId === id);
  }
  deleteGroup(id) {
    if (!this.groupCanDelete(id)) return;
    const data = JSON.parse(JSON.stringify(this.state.data));
    const g = (data.groups || []).find(x => x.id === id); if (!g) return;
    data.groups = (data.groups || []).filter(x => x.id !== id);
    this.persist(data, "Deleted savings group " + g.name);
  }
  // Settings → Restore from JSON. Only accepts a snapshot this app itself
  // produced (exportJson) — validated by shape, not just "is it JSON" — and
  // replaces everything currently stored, same as reseed()/wipe().
  restoreFromJson(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: this.L("That file isn't valid JSON.", "الملف ده مش JSON صحيح.") }; }
    const required = ["accounts", "people", "tx", "plans"];
    if (!parsed || typeof parsed !== "object" || required.some(k => !Array.isArray(parsed[k]))) {
      return { ok: false, error: this.L("That doesn't look like a Personal CFO backup file.", "الملف ده مش نسخة احتياطية من Personal CFO.") };
    }
    this.persist(parsed, this.L("Restored from backup", "تم الاستعادة من نسخة احتياطية"));
    return { ok: true };
  }
  reverse(id) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    const t = data.tx.find(x => x.id === id); if (!t) return;
    if (t.void) { return; }
    t.void = true;
    data.tx.push(Object.assign({}, t, { id: this.uid("t"), void: false, reversalOf: id, type: "reversal_marker", amount: 0, desc: "Reversed: " + (t.desc || t.type), created: new Date().toISOString() }));
    this.persist(data, "Reversed " + (t.desc || t.type) + " " + this.fmt(t.amount || 0));
  }
  // Plain money-movement entries — income, expense, transfer, a loan
  // (receivable/payable) and a payment against one, or a single installment
  // / gam3ya installment — can now be corrected in place or removed outright,
  // same as accounts/people/investments/plans/groups already can be.
  // This is deliberately different from reverse(): reverse() keeps the
  // original row (voided) plus a marker, for a formal paper trail; edit/
  // delete here actually change or remove the row, for when the entry was
  // simply a mistake and shouldn't linger in the ledger at all.
  // Excluded on purpose: installment_sale and investment_buy (the opening
  // transaction of a plan/investment — corrected via that record's own Edit,
  // or removed by deleting the plan/investment itself while nothing has been
  // paid against it), investment_return/refund/adjustment (not yet exposed
  // through an entry form of their own), and reversal_marker (a zero-amount
  // marker row, nothing to edit). A voided (already-reversed) row is also
  // excluded — it's already inactive, and its reversal marker points at it
  // by id.
  txEditableTypes() {
    return ["income", "expense", "transfer", "receivable", "payable", "receivable_payment", "debt_payment", "installment_payment", "gam3ya_payment", "gam3ya_payout", "statement_payment"];
  }
  txEditable(t) {
    return !!t && !t.void && this.txEditableTypes().includes(t.type);
  }
  // The modal "kind" used to add a transaction isn't always its stored
  // tx.type (gam3ya contributions/payouts are added via the group_payment /
  // group_payout forms but stored as gam3ya_payment / gam3ya_payout) — this
  // maps a tx back to the form that can edit it.
  txEditKind(t) {
    const map = { gam3ya_payment: "group_payment", gam3ya_payout: "group_payout" };
    return map[t.type] || t.type;
  }
  deleteTx(id) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    const t = data.tx.find(x => x.id === id);
    if (!this.txEditable(t)) return;
    data.tx = data.tx.filter(x => x.id !== id);
    this.persist(data, "Deleted " + (t.desc || t.type) + " " + this.fmt(t.amount || 0));
  }
  postRecurring(r) {
    const data = JSON.parse(JSON.stringify(this.state.data));
    data.tx.push({ id: this.uid("t"), date: this.today(), type: r.type, amount: r.amount, accountId: r.accountId, category: r.category, personId: null, desc: r.name + " (recurring)", void: false, created: new Date().toISOString(), recurringId: r.id });
    this.persist(data, "Posted recurring " + r.name);
  }
}

if (typeof module !== "undefined") module.exports = { Engine };
