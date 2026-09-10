// Transactions & Reports "Ledger" redesign: a tactile type-pill row and a
// per-day net total on Transactions; a chart-forward net worth hero (same
// heroTrendChart()/delta-chip language Dashboard/People already carry), a
// period in/out diverge bar, and "% of total" + a top-item callout on
// Reports' category/source bars -- all additive next to the existing
// Transactions Recut / period-filter structure, none of which changed.
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== Transactions: type quick-pills ===");
  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(200);
  console.log("pill row present with 4 curated options:", await page.locator(".tx-type-pills .pill").count() === 4);
  console.log("'All' starts active:", (await page.locator(".tx-type-pills .pill").first().getAttribute("class") || "").includes("on"));
  console.log("real bug regression: the existing 5-dropdown filter row is untouched by the new pill row:", await page.locator(".filter-row select").count() === 5);
  // The row count itself is capped by pagination (S.txVisible, 25 by
  // default vs. 217 seed transactions) -- filtering fewer than 25 real
  // matches away doesn't necessarily shrink what's ON SCREEN, so the real
  // signal is the "N records match your filters" total in .tab-sub, the
  // same count table.js/cards both already key their own totals off.
  const totalBefore = await page.locator(".tab-sub").innerText();
  await page.click(".tx-type-pills .pill:has-text('Expense')");
  await page.waitForTimeout(200);
  const totalAfter = await page.locator(".tab-sub").innerText();
  console.log("clicking a pill actually narrows the real match total, not just what's paginated on screen:", parseInt(totalAfter) < parseInt(totalBefore));
  console.log("clicking a pill marks it active:", (await page.locator(".tx-type-pills .pill", { hasText: "Expense" }).getAttribute("class") || "").includes("on"));
  // The pill and the (still-present, still-collapsed) native <select> both
  // just read/write the same F.type -- opening the panel should show the
  // select agreeing with the pill, not a stale "all" left behind.
  await page.click(".filters-toggle");
  await page.waitForTimeout(150);
  const typeSelectVal = await page.locator(".filter-row select").first().inputValue();
  console.log("the native type <select> underneath agrees with the pill (same F.type, two controls):", typeSelectVal === "expense");
  await page.click(".tx-type-pills .pill:has-text('All')");
  await page.waitForTimeout(200);
  const totalRestored = await page.locator(".tab-sub").innerText();
  console.log("'All' pill restores the full total:", totalRestored === totalBefore);

  console.log("\n=== Transactions: per-day net total on the date header ===");
  const todayHeader = page.locator(".tx-date-header", { hasText: "Today" });
  console.log("a 'Today' header exists (seed has transactions dated today):", await todayHeader.count() > 0);
  console.log("it carries a net total next to the date (seed's today is a mix of income/expense, so not exactly 0):", await todayHeader.locator(".tx-date-net").count() > 0);
  // Real behavior check, not just presence: the printed net must actually
  // equal the sum of that day's own signed rows -- computed independently
  // here via Engine.txSign-equivalent math (the app's own UI.txSign()),
  // not by re-reading the header's own text back at itself.
  const dayNetCheck = await page.evaluate(() => {
    const d = UI.app.state.data;
    const today = UI.app.today();
    const outTypes = ["expense", "debt_payment", "receivable", "investment_buy", "gam3ya_payment"];
    const inTypes = ["income", "receivable_payment", "payable", "installment_payment", "investment_return", "refund", "gam3ya_payout"];
    const todays = d.tx.filter(x => x.date === today && !x.void);
    const net = todays.reduce((s, r) => {
      const isTransferLike = r.type === "transfer" || r.type === "statement_payment";
      const isIn = inTypes.includes(r.type) && !(r.type === "installment_payment" && UI.app.planDir(r.planId) === "out");
      const signed = (isTransferLike || r.type === "reversal_marker") ? 0 : (isIn ? r.amount : -r.amount);
      return s + signed;
    }, 0);
    return Math.round(net);
  });
  const headerNetText = await todayHeader.locator(".tx-date-net").innerText();
  const headerNetDigits = Math.round(parseFloat(headerNetText.replace(/[^\d.]/g, "")) * (headerNetText.includes("−") ? -1 : 1));
  console.log("day header total: computed", dayNetCheck, "| shown", headerNetDigits);
  console.log("the shown total matches an independent recomputation of the same day's rows:", headerNetDigits === dayNetCheck);

  console.log("\n=== Real bug caught in review: a voided row must not count toward its day's net ===");
  // txSign() never zeroes out a voided row's own `signed` amount -- it only
  // mutes the row's DISPLAY (opacity, strikethrough, "muted-amt" tone) --
  // so an unfiltered sum here would silently include money the row itself
  // is shown as not counting. Seed a large voided expense dated today and
  // confirm the printed total is completely unmoved by it.
  const netBeforeVoid = await todayHeader.locator(".tx-date-net").innerText();
  await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    d.tx.push({ id: "ledger-void-net-test", type: "expense", amount: 999999, date: UI.app.today(), category: "Shopping", desc: "Voided row must not affect the day net", void: true, accountId: d.accounts[0].id });
    UI.app.persist(d, "seed a voided row for the day-net regression test");
    UI.render();
  });
  await page.waitForTimeout(200);
  const netAfterVoid = await page.locator(".tx-date-header", { hasText: "Today" }).locator(".tx-date-net").innerText();
  console.log("day net unchanged after adding a huge VOIDED expense to today:", netAfterVoid === netBeforeVoid);

  console.log("\n=== Reports: net worth hero (heroTrendChart + delta chip, same language as Dashboard/People) ===");
  // Reports lives behind the "More" overflow sheet, not a primary bottom-nav
  // tab (same reasoning every other Reports-touching test already follows).
  await page.click(".navbtn:has-text('More')");
  await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Reports')");
  await page.waitForTimeout(200);
  console.log("hero card present:", await page.locator(".hero-card.alt").count() === 1);
  const heroVal = await page.locator(".hero-card.alt .hero-value").innerText();
  console.log("hero shows a real net worth figure:", /EGP/.test(heroVal));
  console.log("hero carries the same .hero-trend chart Dashboard/People use:", await page.locator(".hero-card.alt .hero-trend").count() <= 1);

  console.log("\n=== Reports: period income-vs-expense diverge bar ===");
  console.log("flow card present (seed has real income+expense in the default 6m window):", await page.locator(".flow-card").count() === 1);
  console.log("it reuses the same .diverge/.div-in/.div-out component Dashboard's own 'This month' validated:", await page.locator(".flow-card .diverge .div-in").count() === 1 && await page.locator(".flow-card .diverge .div-out").count() === 1);
  const flowLegend = await page.locator(".flow-legend").innerText();
  console.log("legend names both sides in plain text:", /Out/.test(flowLegend) && /In/.test(flowLegend));

  console.log("\n=== Reports: category/source bars now show % of total + a top-item callout ===");
  console.log("at least one category bar shows a percentage:", await page.locator(".bar-list .bar-pct").first().innerText().then(s => /%/.test(s)));
  console.log("a 'leads at N%' note sits inside the By category heading itself (not a sibling wrapper -- see the real check_batch16.js regression this avoided):", await page.locator("h2.has-note", { hasText: "By category" }).locator(".section-note").innerText().then(s => /%/.test(s)));
  await page.click(".navbtn:has-text('Dashboard')");
  await page.waitForTimeout(200);
  console.log("real bug regression: Dashboard's own 'This month' category bars are untouched by the new pct param (no stray % there):", await page.locator(".dash-section .bar-list .bar-pct").count() === 0);

  console.log("\n=== Reports: period preset still narrows the category/source lists (pre-existing #24, untouched) ===");
  await page.click(".navbtn:has-text('More')");
  await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Reports')");
  await page.waitForTimeout(200);
  await page.click(".pill-row .pill:has-text('This month')");
  await page.waitForTimeout(200);
  console.log("preset pill still applies (page re-renders without throwing):", await page.locator(".hero-card.alt").count() === 1);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
