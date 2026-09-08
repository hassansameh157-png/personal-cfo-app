const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Real bug reported directly by a user: tapping the "Other" bar in Reports'
// "By category"/"By source" (or Dashboard's own category bars) found zero
// transactions whenever the amount it showed came from rows genuinely
// categorized "Other" -- a completely ordinary, selectable category (the
// last entry in Engine.builtinCategories() for both income and expense) --
// rather than uncategorized ones. Every category aggregation in this app
// already buckets BOTH under the same "Other" key (via `category ||
// "Other"`), so a bar's own total always means both halves together --
// but the click-through filter only ever checked `!r.category`, missing
// the `r.category === "Other"` half entirely.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Record an income transaction genuinely categorized \"Other\" ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Income')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "1234");
  await page.selectOption("#f_category", "Other");
  await page.fill("#f_desc", "Explicit Other income test");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);

  console.log("\n=== 2) Reports' \"By source\" bar folds it into the same \"Other\" total as uncategorized income ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Reports')"); await page.waitForTimeout(200);
  await page.click("button:has-text('All time')"); await page.waitForTimeout(200);
  const srcSection = page.locator("h2:has-text('By source')").locator("xpath=following-sibling::div[1]");
  const otherBar = srcSection.locator("button.bar-row", { hasText: "Other" });
  console.log("an \"Other\" bar is shown under By source:", await otherBar.count() === 1);

  console.log("\n=== 3) Tapping it now actually finds the transaction (the bug this batch closes) ===");
  await otherBar.click(); await page.waitForTimeout(250);
  console.log("landed on Transactions:", await page.evaluate(() => UI.app.state.page) === "transactions");
  console.log("our explicit-\"Other\" income transaction is now found:", (await page.locator("body").innerText()).includes("Explicit Other income test"));

  console.log("\n=== 4) Regression: an uncategorized income transaction still shows up under the same \"Other\" bar too ===");
  // The income form's own category <select> has no blank option (only
  // personId's does) -- category:null is real (submit() stores `f.category
  // || null`, and older/migrated data can carry it), just not reachable
  // through this particular add-form's UI, so it's set directly here
  // rather than fighting a <select> that always keeps some real value
  // selected.
  await page.evaluate(() => {
    UI.app.persist(Object.assign({}, UI.app.state.data, { tx: UI.app.state.data.tx.concat([{ id: "t_uncat_test", type: "income", date: UI.app.today(), amount: 777, accountId: UI.app.state.data.accounts[0].id, category: null, personId: null, desc: "Uncategorized income test", void: false, created: new Date().toISOString(), tags: [] }]) }), null);
  });
  await page.waitForTimeout(150);
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Reports')"); await page.waitForTimeout(200);
  await page.click("button:has-text('All time')"); await page.waitForTimeout(200);
  const otherBar2 = page.locator("h2:has-text('By source')").locator("xpath=following-sibling::div[1]").locator("button.bar-row", { hasText: "Other" });
  const otherBarText = await otherBar2.innerText();
  console.log("\"Other\" bar's total now includes both (1234 + 777 = 2011):", otherBarText.includes("2,011"));
  await otherBar2.click(); await page.waitForTimeout(250);
  const bodyText = await page.locator("body").innerText();
  console.log("both the real-\"Other\" and the uncategorized transaction show up together:", bodyText.includes("Explicit Other income test") && bodyText.includes("Uncategorized income test"));

  console.log("\n=== 5) Regression: categoryKind correctly keeps the income-side and expense-side \"Other\" separate ===");
  await page.evaluate(() => { UI.app.state.filt.category = "all"; UI.app.state.filt.q = ""; UI.render(); });
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "55");
  await page.selectOption("#f_category", "Other");
  await page.fill("#f_desc", "Explicit Other expense test");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  // Same filter tapping the income "Other" bar sets (see viewCategoryTx) --
  // this expense row must stay excluded, exactly the mixing bug #45's own
  // comment (further up in renderTransactions) already guards against.
  await page.evaluate(() => { UI.app.state.filt.category = "Other"; UI.app.state.filt.categoryKind = "income"; UI.render(); });
  console.log("income-side \"Other\" filter does NOT sweep in the expense-side \"Other\" row:", !(await page.locator("body").innerText()).includes("Explicit Other expense test"));
  await page.evaluate(() => { UI.app.state.filt.categoryKind = "expense"; UI.render(); });
  console.log("expense-side \"Other\" filter DOES find it:", (await page.locator("body").innerText()).includes("Explicit Other expense test"));

  console.log("\n=== 6) Regression caught in code review: the scoped 'This month' stats tile now agrees with the list under it ===");
  // categoryMonthStats() (the tile just above the filtered list -- see
  // scopedCategoryMetrics()) is a separate engine-side count/total from
  // the list render -- it had the exact same !t.category-only bug,
  // fixed the same way, so this checks the two actually agree instead of
  // silently disagreeing for the same category filter.
  const statsAndList = await page.evaluate(() => {
    const stats = UI.app.categoryMonthStats("Other", "expense");
    const today = UI.app.today(), mStart = today.slice(0, 8) + "01";
    const listCount = UI.app.state.data.tx.filter(t => !t.void && t.type === "expense" && t.date >= mStart && t.date <= today &&
      (t.category === "Other" || !t.category)).length;
    return { statsCount: stats.count, listCount };
  });
  console.log("categoryMonthStats('Other','expense') count agrees with the real matching row count:", statsAndList.statsCount === statsAndList.listCount);
  console.log("(counted " + statsAndList.statsCount + " via categoryMonthStats, " + statsAndList.listCount + " directly)");

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
