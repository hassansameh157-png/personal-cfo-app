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

  // Anchor Food transaction that's never touched again, so step 2's Dashboard
  // check has a guaranteed reason to show a Food bar regardless of whether
  // the app's own randomly-generated demo data (engine.js's seed uses
  // Math.random() to assign categories) happens to include any Food that
  // day -- without this, the test's own only Food transaction is the one
  // recategorized away two steps down, and whether Food still shows on
  // Dashboard afterwards would depend entirely on that random seed's luck.
  // Dashboard only shows the top 5 categories by this-month spend
  // (ui.js's `catArr.slice(0, 5)`), so a small anchor amount isn't enough
  // on its own -- this one is deliberately far larger than anything the
  // random seed data plausibly puts in a single category this month
  // (its per-transaction amounts top out around 2,500), to guarantee Food
  // lands at #1 regardless of how that randomness rolls.
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_desc", "Anchor food expense");
  await page.selectOption("#f_category", "Food");
  await page.fill("#f_amount", "500000");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);

  console.log("=== 1) Reproduce the exact user scenario: description mentions 'Food', category changed away ===");
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_desc", "Work food -Talabat");
  await page.selectOption("#f_category", "Food");
  await page.fill("#f_amount", "263");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);

  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Work food -Talabat"); await page.waitForTimeout(200);
  // A transaction row offers Edit two ways: the swipe panel, and the
  // "..." trigger opening the shared action sheet (see
  // UI.renderTxActionSheet()) -- the swipe one only becomes clickable
  // once the row is actually swiped open, so use the sheet here.
  await page.locator(".card-row", { hasText: "Work food -Talabat" }).first().locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
  await page.waitForTimeout(200);
  console.log("category before re-categorizing:", await page.locator("#f_category").inputValue());
  await page.selectOption("#f_category", "Shopping"); // this app's built-in list has no literal "Personal Expense" -- Shopping is the closest stand-in for "not Food"
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);

  console.log("\n=== 2) Tap the 'Food' category bar on Dashboard -- must NOT show the re-categorized row ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const foodBar = page.locator(".bar-row", { hasText: "Food" }).first();
  const foodBarCount = await foodBar.count();
  console.log("Food bar present:", foodBarCount > 0);
  if (foodBarCount) {
    await foodBar.click(); await page.waitForTimeout(200);
    console.log("landed on Transactions:", await page.locator(".tab-title").innerText());
    console.log("category filter now set to:", await page.locator(".filter-row select").nth(3).inputValue());
    const stillShowsIt = await page.locator(".card-row", { hasText: "Work food -Talabat" }).count();
    console.log("re-categorized 'Work food -Talabat' row count still under Food filter (informational):", stillShowsIt);
    console.log("re-categorized row correctly absent from Food filter:", stillShowsIt === 0);
  }

  console.log("\n=== 3) Category filter dropdown: picking 'Shopping' shows the row; 'Food' does not ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", ""); await page.waitForTimeout(150);
  // The 4 structural dropdowns collapse behind "Filters" by default (see
  // UI.toggleTxFilters()) -- expand before reaching one directly.
  await page.click(".filters-toggle"); await page.waitForTimeout(150);
  const catSelect = page.locator(".filter-row select").nth(3);
  await catSelect.selectOption("Shopping"); await page.waitForTimeout(200);
  console.log("under Shopping filter, row present:", await page.locator(".card-row", { hasText: "Work food -Talabat" }).count() > 0);
  await catSelect.selectOption("Food"); await page.waitForTimeout(200);
  console.log("under Food filter, row correctly absent:", await page.locator(".card-row", { hasText: "Work food -Talabat" }).count() === 0);
  await catSelect.selectOption("all"); await page.waitForTimeout(200);

  console.log("\n=== 4) Tag chips still do a free-text search (unchanged behavior) ===");
  await page.fill("#txSearch", ""); await page.waitForTimeout(150);
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "77");
  await page.fill("#f_desc", "Tag test");
  await page.fill("#f_tags", "sample");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Tag test"); await page.waitForTimeout(200);
  const tagRow = page.locator(".card-row", { hasText: "Tag test" }).first();
  await tagRow.locator(".pill-row button", { hasText: "sample" }).click();
  await page.waitForTimeout(200);
  console.log("tag click still fills free-text search:", await page.locator("#txSearch").inputValue());

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
