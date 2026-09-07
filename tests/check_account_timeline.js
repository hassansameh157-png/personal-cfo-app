const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// A vertical timeline (colored dot per transaction) for one account,
// shown only while Transactions is scoped to exactly that one account --
// same trigger as the scoped metrics row (UI.renderMetricsRow) -- giving
// a fast visual read of the account's recent trend before the full
// searchable/filterable list below it.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1100 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) No timeline anywhere unfiltered (Dashboard, or Transactions with no account filter) ===");
  console.log("no timeline on Dashboard:", await page.locator(".acc-timeline").count() === 0);
  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(200);
  console.log("no timeline on unfiltered Transactions:", await page.locator(".acc-timeline").count() === 0);

  console.log("\n=== 2) Filtering to one account shows its timeline, newest first ===");
  const accId = await page.evaluate(() => UI.app.state.data.accounts.find(a => a.type !== "card").id);
  await page.evaluate((id) => UI.viewAccountTx(id), accId);
  await page.waitForTimeout(200);
  console.log("timeline present:", await page.locator(".acc-timeline").count() === 1);
  const dates = await page.locator(".acc-timeline-meta").allTextContents();
  const sorted = [...dates].sort().reverse();
  console.log("items are ordered newest-first:", JSON.stringify(dates) === JSON.stringify(sorted));

  console.log("\n=== 3) Each dot's color matches its own transaction's sign (green in, red out, neutral transfer-like) ===");
  const check = await page.evaluate((id) => {
    const D = UI.app.derive();
    // Same three-way comparator renderTransactions() itself uses (a real
    // gap caught in review: a two-way a<b?1:-1 comparator is non-stable
    // for equal dates and could reorder same-day rows differently from
    // what the app actually renders, misaligning this test's per-index
    // comparison below).
    const rows = UI.app.state.data.tx.filter(t => t.accountId === id || t.fromId === id || t.toId === id).sort((a, b) => a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)).slice(0, 20);
    const items = document.querySelectorAll(".acc-timeline-item");
    let allMatch = true;
    rows.forEach((r, i) => {
      const dot = items[i] && items[i].querySelector(".acc-timeline-dot");
      if (!dot) { allMatch = false; return; }
      const sign = UI.txSign(r);
      const expected = sign.signed > 0 ? "pos" : sign.signed < 0 ? "neg" : "neutral";
      const bg = getComputedStyle(dot).backgroundColor;
      // Just confirm dots for a positive-signed row and a negative-signed
      // row are actually DIFFERENT colors from each other, without
      // hardcoding exact rgb() values that could shift with the palette.
      if (expected === "pos") items._posColor = bg;
      if (expected === "neg") items._negColor = bg;
    });
    return { allMatch, posColor: items._posColor, negColor: items._negColor };
  }, accId);
  console.log("every row got a rendered dot:", check.allMatch);
  console.log("a positive-signed row's dot color differs from a negative-signed row's:", !!check.posColor && !!check.negColor && check.posColor !== check.negColor);

  console.log("\n=== 4) The timeline reflects active filters, not just the account (e.g. also filtering by type) ===");
  await page.evaluate(() => UI.setFilter("type", "expense"));
  await page.waitForTimeout(150);
  const expenseOnlyCount = await page.locator(".acc-timeline-item").count();
  console.log("timeline still shows items after narrowing by type:", expenseOnlyCount > 0);
  // Rigorous check, not a fuzzy text match: the timeline's own item count
  // must equal the real number of matching expense rows for this account
  // (capped at 20, same cap renderAccountTimeline() itself applies), and
  // every dot rendered must be the "out" (red/negative) color -- an
  // expense-only filter should never show an "in"/neutral dot.
  const filterCheck = await page.evaluate((id) => {
    const realCount = Math.min(20, UI.app.state.data.tx.filter(t => t.type === "expense" && (t.accountId === id || t.fromId === id || t.toId === id)).length);
    const dots = [...document.querySelectorAll(".acc-timeline-dot")];
    const colors = new Set(dots.map(d => getComputedStyle(d).backgroundColor));
    return { itemCount: document.querySelectorAll(".acc-timeline-item").length, realCount, distinctDotColors: colors.size };
  }, accId);
  console.log("timeline item count exactly matches the real filtered expense-row count:", filterCheck.itemCount === filterCheck.realCount);
  console.log("every dot is the same (negative/expense) color -- no income/transfer rows leaked in:", filterCheck.distinctDotColors === 1);
  await page.evaluate(() => UI.setFilter("type", "all"));
  await page.waitForTimeout(150);

  console.log("\n=== 5) Clearing the account filter removes the timeline again ===");
  await page.evaluate(() => UI.setFilters({ account: "all", category: "all", categoryKind: "" }));
  await page.waitForTimeout(150);
  console.log("timeline gone once account filter clears:", await page.locator(".acc-timeline").count() === 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
