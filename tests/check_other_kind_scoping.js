const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== Setup: an uncategorized expense AND an uncategorized income ===");
  await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    d.tx.push({ id: "uncat-exp", type: "expense", amount: 50, date: UI.app.today(), category: null, desc: "Uncategorized EXPENSE", void: false, accountId: d.accounts[0].id });
    d.tx.push({ id: "uncat-inc", type: "income", amount: 60, date: UI.app.today(), category: null, desc: "Uncategorized INCOME", void: false, accountId: d.accounts[0].id });
    UI.app.persist(d, "test seed");
    UI.render();
  });

  console.log("\n=== Tap the expense-side 'Other' bar via viewCategoryTx('Other','expense') ===");
  await page.evaluate(() => UI.viewCategoryTx("Other", "expense"));
  await page.waitForTimeout(200);
  console.log("shows the uncategorized EXPENSE:", await page.locator(".card-row", { hasText: "Uncategorized EXPENSE" }).count() > 0);
  console.log("does NOT show the uncategorized INCOME:", await page.locator(".card-row", { hasText: "Uncategorized INCOME" }).count() === 0);

  console.log("\n=== Tap the income-side 'Other' bar via viewCategoryTx('Other','income') ===");
  await page.evaluate(() => UI.viewCategoryTx("Other", "income"));
  await page.waitForTimeout(200);
  console.log("shows the uncategorized INCOME:", await page.locator(".card-row", { hasText: "Uncategorized INCOME" }).count() > 0);
  console.log("does NOT show the uncategorized EXPENSE:", await page.locator(".card-row", { hasText: "Uncategorized EXPENSE" }).count() === 0);

  console.log("\n=== Manually picking 'Other' from the dropdown (no kind context) shows BOTH ===");
  await page.evaluate(() => { UI.app.state.filt.category = "all"; UI.app.state.filt.categoryKind = ""; UI.render(); });
  // The 4 structural dropdowns collapse behind "Filters" by default (see
  // UI.toggleTxFilters()) -- expand before reaching one directly.
  await page.click(".filters-toggle"); await page.waitForTimeout(150);
  const catSelect = page.locator(".filter-row select").nth(3);
  await catSelect.selectOption("Other"); await page.waitForTimeout(200);
  console.log("shows uncategorized EXPENSE:", await page.locator(".card-row", { hasText: "Uncategorized EXPENSE" }).count() > 0);
  console.log("shows uncategorized INCOME:", await page.locator(".card-row", { hasText: "Uncategorized INCOME" }).count() > 0);

  console.log("\n=== A stale categoryKind from an earlier bar tap doesn't leak into a fresh manual pick ===");
  await page.evaluate(() => UI.viewCategoryTx("Other", "expense")); // sets categoryKind='expense'
  await page.waitForTimeout(150);
  // viewCategoryTx() navigates via setPage(), which resets the filters
  // toggle back to collapsed -- re-expand before the next dropdown pick.
  await page.click(".filters-toggle"); await page.waitForTimeout(150);
  await catSelect.selectOption("all"); await page.waitForTimeout(150);
  await catSelect.selectOption("Other"); await page.waitForTimeout(200); // manual re-pick
  console.log("categoryKind reset by the manual pick:", await page.evaluate(() => UI.app.state.filt.categoryKind) === "");
  console.log("manual re-pick shows BOTH again (not still scoped to expense):", (await page.locator(".card-row", { hasText: "Uncategorized INCOME" }).count() > 0) && (await page.locator(".card-row", { hasText: "Uncategorized EXPENSE" }).count() > 0));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
