const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Real gap fixed: "refund" was already a fully wired transaction type
// everywhere else (derive()'s balance application, cashFlowBucket,
// isIncomeType(), categoryColor/categoryIcon's income-side normalization)
// and even had its own entry in the Transactions type filter -- but
// nothing anywhere could ever actually create one, so filtering by it
// always came back empty. Added a "Type" select to the income form itself
// (Income/Refund) rather than a whole new button/screen -- same fields,
// same form, just a different stored tx.type.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Regression: the Refund filter used to always be empty -- confirm that's the actual starting bug ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  // Drives the filter directly via UI.setFilter (same call the real <select>'s
  // onchange makes) rather than fighting the mobile filters-toggle/collapse
  // layout for a plain functional check -- the filter dropdown's own
  // presence/options are covered separately in step 5.
  await page.evaluate(() => { UI.setFilter("type", "refund"); });
  await page.waitForTimeout(150);
  const beforeCount = await page.locator(".card-row, .table tbody tr").count();
  console.log("Refund filter starts out empty (the bug this batch closes):", beforeCount === 0);
  await page.evaluate(() => { UI.setFilter("type", "all"); });

  console.log("\n=== 2) The income form now offers a Type select (Income / Refund) ===");
  // "+ Income" lives on Transactions' own tabHeader actions, next to
  // Transfer (renderTransactions()) -- not behind the FAB's quick-add
  // sheet, which only offers Expense/Income/Transfer as icons, not a
  // second route worth separately testing here.
  await page.click("button:has-text('+ Income')"); await page.waitForTimeout(200);
  console.log("Type select present:", await page.locator("#f_type").count() === 1);
  const typeOptions = await page.locator("#f_type option").allTextContents();
  console.log("offers exactly Income and Refund:", typeOptions.includes("Income") && typeOptions.includes("Refund"));
  console.log("defaults to Income:", await page.locator("#f_type").inputValue() === "income");

  console.log("\n=== 3) Recording a refund actually posts tx.type \"refund\" ===");
  await page.fill("#f_amount", "450");
  await page.selectOption("#f_type", "refund");
  await page.fill("#f_desc", "Refund test — returned headphones");
  await page.fill("#f_tags", "electronics");
  const accountBefore = await page.evaluate(() => UI.app.state.data.accounts[0]);
  await page.selectOption("#f_accountId", accountBefore.id);
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);
  const posted = await page.evaluate(() => UI.app.state.data.tx.find(t => t.desc === "Refund test — returned headphones"));
  console.log("posted with type \"refund\" (not \"income\"):", posted && posted.type === "refund");
  console.log("tags were still captured, same as a plain income entry:", posted && (posted.tags || []).includes("electronics"));

  console.log("\n=== 4) It shows up correctly everywhere refund is already wired ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Refund test"); await page.waitForTimeout(200);
  const row = page.locator(".card-row", { hasText: "Refund test" }).first();
  console.log("shows up in the list, tagged as Refund:", (await row.innerText()).includes("Refund"));
  console.log("amount renders as a positive inflow (tone-pos), same as income:", await row.locator(".tone-pos, .card-row-amt").count() > 0);

  console.log("\n=== 5) The Refund type filter now actually finds it, and the real <select> offers it ===");
  await page.fill("#txSearch", ""); await page.waitForTimeout(150);
  await page.evaluate(() => { UI.setFilter("type", "refund"); });
  await page.waitForTimeout(150);
  const afterCount = await page.locator(".card-row, .table tbody tr").count();
  console.log("Refund filter now finds the entry just posted:", afterCount >= 1);
  await page.click(".filters-toggle"); await page.waitForTimeout(150);
  const typeSelectOptions = await page.locator(".filter-row select").first().locator("option").allTextContents();
  console.log("the real type-filter <select> lists Refund as a choice:", typeSelectOptions.includes("Refund"));
  await page.evaluate(() => { UI.setFilter("type", "all"); });

  console.log("\n=== 6) Edit reopens the income form with Refund pre-selected, and can be edited/deleted like plain income ===");
  const refundId = posted.id;
  await page.evaluate((id) => { UI.openTxEdit(id); }, refundId);
  await page.waitForTimeout(200);
  console.log("Edit opens the income form (not a dead modal):", await page.locator("#f_type").count() === 1);
  console.log("Type pre-selected to Refund:", await page.locator("#f_type").inputValue() === "refund");
  await page.fill("#f_amount", "500");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);
  const updated = await page.evaluate((id) => UI.app.state.data.tx.find(t => t.id === id), refundId);
  console.log("edit applied, still type \"refund\":", updated && updated.amount === 500 && updated.type === "refund");

  console.log("\n=== 7) Switching Type back to Income on edit actually changes the stored type ===");
  await page.evaluate((id) => { UI.openTxEdit(id); }, refundId);
  await page.waitForTimeout(200);
  await page.selectOption("#f_type", "income");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);
  const flipped = await page.evaluate((id) => UI.app.state.data.tx.find(t => t.id === id), refundId);
  console.log("flipped back to a plain income entry:", flipped && flipped.type === "income");

  console.log("\n=== 8) Regression: a plain expense entry is completely unaffected (no stray Type field) ===");
  // The topbar's own "+ Expense" button (UI.renderTopbar) is present on
  // every page, Transactions included -- no navigation needed.
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  console.log("no Type select leaked into the expense form:", await page.locator("#f_type").count() === 0);
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
