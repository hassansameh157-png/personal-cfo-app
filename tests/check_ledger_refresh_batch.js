// Real implementation of the 4 approved "Neon Aurora refresh" mockups
// (Dashboard/Accounts/People/Transactions), applied on top of the shared
// global search + notification bell (see check_global_search.js). Scope
// deliberately trimmed from the mockups in two places, both explained
// inline where the real gap turned out not to exist:
//   - Dashboard gets NO new KPI row/donut -- its own "This month" section
//     already shows income/expense (with a diverge bar) and a per-category
//     bar-list (with budget context a bare donut can't carry), so a
//     second, differently-styled copy at the top would be pure
//     duplication, not a genuine gap. Same "match the app's own real
//     structure" call this project has made before (Installments/Cash
//     Flow's own heroes were skipped the same way, same session).
//   - No new "Quick Actions" grid on any screen -- every one of the 4
//     already has equivalent actions (tabHeader's own header buttons,
//     the global quick-add FAB), so a second icon-grid would duplicate
//     them rather than add real capability.
// What IS real and new: Accounts gets functional type tabs (All/Cash &
// bank/Wallets/Credit cards) and an issuer-initials badge on every tile
// (a real logo can't be drawn -- trademarked -- so this is the same
// "letters in a colored badge" technique person avatars already use);
// People gets functional net-sign tabs (All/Owes me/I owe/Settled) and
// its summary tile gets icon badges (same arrow/check icons every
// existing delta-chip already draws); Transactions gets a KPI row
// (Income/Expense/Net/Records) for whatever's currently filtered -- a
// genuine gap, since renderMetricsRow only ever shows a total once
// scoped to a single account/category.
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Accounts: issuer-initials badge on every tile (real gap fixed -- no logo could be drawn) ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  console.log("at least one issuer badge renders:", await page.locator(".cc-issuer-badge").count() > 0);
  const cibBadge = await page.evaluate(() => UI.acctInitials({ bank: "CIB", name: "Titanium" }));
  const bmBadge = await page.evaluate(() => UI.acctInitials({ bank: "Banque Misr", name: "Platinum" }));
  const cashBadge = await page.evaluate(() => UI.acctInitials({ name: "Cash Wallet" }));
  console.log("a single-word bank stays as-is (CIB):", cibBadge === "CIB");
  console.log("a two-word bank becomes its own initials (Banque Misr -> BM):", bmBadge === "BM");
  console.log("no bank field at all still derives something real from the account's own name (Cash Wallet -> CW):", cashBadge === "CW");

  console.log("\n=== 2) Accounts: real functional type tabs, not just visual ===");
  console.log("tabs are present (this ledger has more than one tile group):", await page.locator(".pill-row .pill").count() >= 2);
  const beforeTab = await page.locator(".credit-card-tile").count();
  await page.click(".pill:has-text('Credit cards')");
  await page.waitForTimeout(200);
  const afterCardsTab = await page.locator(".credit-card-tile").count();
  console.log("tile count before (all groups):", beforeTab, "| after 'Credit cards' tab (narrowed):", afterCardsTab);
  console.log("the tab genuinely narrows the list, doesn't just relabel it:", afterCardsTab < beforeTab && afterCardsTab > 0);
  console.log("only card tiles show now (every visible tile carries a statement-style Outstanding row):", await page.locator(".credit-card-tile .cc-label:has-text('Outstanding')").count() === afterCardsTab);
  await page.click(".pill:has-text('All')"); await page.waitForTimeout(150);
  console.log("switching back to 'All' restores the full list:", await page.locator(".credit-card-tile").count() === beforeTab);

  console.log("\n=== 3) People: icon badges on the summary tile (same arrow/check icons every delta-chip already uses) ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  console.log("3 icon badges present (owe-me/i-owe/settled):", await page.locator(".pos-tile-icon").count() === 3);

  console.log("\n=== 4) People: real functional tabs over the list ===");
  const peopleBefore = await page.locator(".card-row.person-card").count();
  const owedMeCountShown = await page.locator(".pos-tile:has-text('who owe me') .pos-value").innerText();
  await page.click(".pill-row.mobile-only .pill:has-text('Owes me')");
  await page.waitForTimeout(200);
  const afterOweMe = await page.locator(".card-row.person-card").count();
  console.log("person-card count before (All):", peopleBefore, "| after 'Owes me' tab:", afterOweMe);
  console.log("narrowed to real net>0 people only, matching the summary tile's own count:", afterOweMe === parseInt(owedMeCountShown));
  console.log("no settled section bleeds into this tab:", await page.locator("h2:has-text('Settled')").count() === 0);
  console.log("the summary tile's own numbers stay put (global totals, not re-scoped by the tab):", (await page.locator(".pos-tile:has-text('who owe me') .pos-value").innerText()) === owedMeCountShown);
  await page.click(".pill-row.mobile-only .pill:has-text('Settled')");
  await page.waitForTimeout(200);
  // Real seed data has nobody at exactly net 0 -- so the honest check here
  // isn't "shows settled people" (there are none), it's "shows them
  // uncollapsed if there were any" -- i.e. no leftover collapse-toggle
  // button and no active-balance cards bleeding into this tab either.
  console.log("'Settled' tab shows nothing collapsed behind a toggle button (none exist in this real data, correctly so):", await page.locator("button.btn-secondary.block[onclick=\"UI.togglePeopleSettled()\"]").count() === 0);
  console.log("...and no active-balance people bleed into it either:", await page.locator(".card-row.person-card").count() === 0);
  await page.click(".pill-row.mobile-only .pill:has-text('All')"); await page.waitForTimeout(150);
  console.log("switching back to 'All' restores the original view:", await page.locator(".card-row.person-card").count() === peopleBefore);

  console.log("\n=== 5) Transactions: a real KPI row for whatever's currently filtered ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  console.log("KPI row present:", await page.locator(".kpi-grid .kpi-card").count() === 4);
  const kpiCheck = await page.evaluate(() => {
    const app = UI.app, D = app.derive();
    const rows = D.live; // unfiltered "All time" is the page's own default
    const income = rows.filter(r => app.isIncomeType(r.type)).reduce((s, r) => s + r.amount, 0);
    const expense = rows.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);
    return { income, expense, net: income - expense };
  });
  const shownIncome = await page.locator(".kpi-card").nth(0).locator(".kpi-value").innerText();
  console.log("shown Income KPI:", shownIncome, "| independently recomputed:", Math.round(kpiCheck.income));
  console.log("the KPI figure agrees with an independent recomputation:", Math.round(parseFloat(shownIncome.replace(/[^\d.]/g, ""))) === Math.round(kpiCheck.income));

  console.log("\n=== 6) Real behavior check: the KPI row actually reacts to a filter, it's not a static snapshot ===");
  // Scoped to .tx-type-pills specifically -- a bare "button:has-text('Income')"
  // also matches the page's own "+ Income" header action button (opens the
  // add-income modal instead of filtering), so this must stay scoped.
  await page.click(".tx-type-pills .pill:has-text('Income')");
  await page.waitForTimeout(200);
  const shownExpenseAfterFilter = await page.locator(".kpi-card").nth(1).locator(".kpi-value").innerText();
  console.log("filtered to Income-only: the Expense KPI card correctly reads 0:", parseFloat(shownExpenseAfterFilter.replace(/[^\d.]/g, "")) === 0);
  await page.click(".tx-type-pills .pill:has-text('All')"); await page.waitForTimeout(150);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
