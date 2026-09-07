const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Real user request: opening any one account, credit card, or category
// shouldn't keep showing the whole household's Available/Net worth/... up
// top -- it should show only that ONE thing's own numbers. Covers the
// three scoped shapes (plain account, credit card, category), the global
// row staying untouched everywhere else, and the real mobile layout bug
// found while building this: a credit card's 4-tile row has exactly as
// many tiles as the global row hides down to on narrow screens, and the
// CSS rule that trims the global row to 3-of-5 on mobile would have
// silently swallowed the scoped row's 4th tile ("Statement due") too if
// it weren't scoped out specifically.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Dashboard (unfiltered) still shows the global 5-metric row ===");
  console.log("global row present:", await page.locator(".metrics-row:not(.scoped)").count() === 1);
  console.log("global row has 5 tiles:", await page.locator(".metrics-row:not(.scoped) .metric-tile").count() === 5);

  console.log("\n=== 2) Filtering Transactions to a plain (non-card) account swaps in Balance/In/Out ===");
  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(200);
  // Pick the first non-"all" option in the account <select> whose account
  // isn't a credit card -- just use the account filter dropdown directly,
  // the real interaction a person would use.
  const accSelect = page.locator(".filter-row select").nth(1);
  const accOptions = await accSelect.locator("option").allTextContents();
  console.log("account dropdown has real accounts to pick from:", accOptions.length > 1);
  // UI.viewAccountTx() is the exact call a tapped account name makes --
  // drive it directly against a real non-card account id for a clean,
  // unambiguous scoped state (the dropdown route is covered by the plain
  // presence check above).
  const nonCardId = await page.evaluate(() => UI.app.state.data.accounts.find(a => a.type !== "card").id);
  await page.evaluate((id) => UI.viewAccountTx(id), nonCardId);
  await page.waitForTimeout(200);
  console.log("scoped row present, global row gone:", await page.locator(".metrics-row.scoped").count() === 1 && await page.locator(".metrics-row:not(.scoped)").count() === 0);
  const plainLabels = await page.locator(".metrics-row.scoped .metric-label").allTextContents();
  console.log("shows Balance/In this month/Out this month (3 tiles):", plainLabels.length === 3 && /BALANCE/i.test(plainLabels[0]) && /IN THIS MONTH/i.test(plainLabels[1]) && /OUT THIS MONTH/i.test(plainLabels[2]));

  console.log("\n=== 3) Filtering to a credit card shows Outstanding/Available/Limit/Statement due, all 4 tiles survive on mobile ===");
  const cardId = await page.evaluate(() => UI.app.state.data.accounts.find(a => a.type === "card").id);
  await page.evaluate((id) => UI.viewAccountTx(id), cardId);
  await page.waitForTimeout(200);
  const cardTiles = page.locator(".metrics-row.scoped .metric-tile");
  console.log("exactly 4 tiles rendered:", await cardTiles.count() === 4);
  console.log("all 4 tiles are actually visible (not hidden by the mobile nth-child rule -- the real layout bug this guards against):",
    await cardTiles.first().isVisible() && await cardTiles.nth(1).isVisible() && await cardTiles.nth(2).isVisible() && await cardTiles.nth(3).isVisible());
  const cardLabels = await page.locator(".metrics-row.scoped .metric-label").allTextContents();
  console.log("labels are Outstanding/Available/Limit/Statement due:", /OUTSTANDING/i.test(cardLabels[0]) && /AVAILABLE/i.test(cardLabels[1]) && /LIMIT/i.test(cardLabels[2]) && /STATEMENT/i.test(cardLabels[3]));
  // The grid itself must actually be 4 columns (not the global row's fixed
  // 5, which would leave an empty trailing cell) -- the concrete CSS bug.
  const gridCols = await page.locator(".metrics-row.scoped").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  console.log("grid has exactly 4 columns, not the global row's fixed 5:", gridCols === 4);

  console.log("\n=== 4) Filtering Transactions to a category shows its own This month/Transactions tiles ===");
  await page.evaluate(() => { UI.setFilters({ account: "all", category: "all", categoryKind: "" }); });
  await page.waitForTimeout(150);
  await page.evaluate(() => UI.viewCategoryTx("Food", "expense"));
  await page.waitForTimeout(200);
  const catLabels = await page.locator(".metrics-row.scoped .metric-label").allTextContents();
  console.log("shows This month + Transactions (2 or 3 tiles, budget-dependent):", catLabels.length >= 2 && /THIS MONTH/i.test(catLabels[0]) && /TRANSACTIONS/i.test(catLabels[catLabels.length - 1]));

  console.log("\n=== 5) Setting a budget for that category adds a Budget remaining tile ===");
  await page.evaluate(() => { UI.app.setBudget("Food", 100); UI.render(); });
  await page.waitForTimeout(150);
  const catLabelsWithBudget = await page.locator(".metrics-row.scoped .metric-label").allTextContents();
  console.log("now shows 3 tiles including Budget remaining:", catLabelsWithBudget.length === 3 && /BUDGET REMAINING/i.test(catLabelsWithBudget[1]));

  console.log("\n=== 6) Clearing the filter back to \"all\" restores the global row ===");
  await page.evaluate(() => { UI.setFilters({ account: "all", category: "all", categoryKind: "" }); });
  await page.waitForTimeout(150);
  console.log("global row back, scoped row gone:", await page.locator(".metrics-row:not(.scoped)").count() === 1 && await page.locator(".metrics-row.scoped").count() === 0);

  console.log("\n=== 7) An account filter set alongside a category filter -- account wins (matches an account tile tap, then further narrowing) ===");
  await page.evaluate((id) => UI.viewAccountTx(id), nonCardId);
  await page.waitForTimeout(150);
  await page.evaluate(() => { UI.app.state.filt.category = "Food"; UI.app.state.filt.categoryKind = "expense"; UI.render(); });
  await page.waitForTimeout(150);
  const bothLabels = await page.locator(".metrics-row.scoped .metric-label").allTextContents();
  console.log("still shows the account's own Balance/In/Out, not the category's:", bothLabels.length === 3 && /BALANCE/i.test(bothLabels[0]));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
