const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Add a custom expense category, confirm it shows in the +Expense dropdown ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  await page.fill("#newExpenseCat", "Gym");
  await page.click("button:has-text('Add')"); // first Add button = expense
  await page.waitForTimeout(200);
  const chipVisible = await page.locator(".pill", { hasText: "Gym" }).count();
  console.log("custom category chip shown in Settings:", chipVisible > 0);

  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  const options = await page.locator("#f_category option").allTextContents();
  console.log("Gym appears in expense category dropdown:", options.includes("Gym"));
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 2) Add a custom income category ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  await page.fill("#newIncomeCat", "Bonus");
  const addButtons = page.locator("button:has-text('Add')");
  await addButtons.nth(1).click(); // second Add button = income
  await page.waitForTimeout(200);
  const incomeChip = await page.locator(".pill", { hasText: "Bonus" }).count();
  console.log("income category chip shown:", incomeChip > 0);

  console.log("\n=== 3) Delete a custom category ===");
  await page.once("dialog", (d) => d.accept());
  await page.locator(".pill", { hasText: "Gym" }).locator("button").click();
  await page.waitForTimeout(200);
  const gymGone = await page.locator(".pill", { hasText: "Gym" }).count();
  console.log("Gym category removed:", gymGone === 0);

  console.log("\n=== 4) Duplicate category name is rejected ===");
  page.once("dialog", (d) => { console.log("alert shown:", d.message()); d.accept(); });
  await page.fill("#newExpenseCat", "Food"); // already a built-in
  await addButtons.first().click();
  await page.waitForTimeout(200);

  console.log("\n=== 5) Quick-add balance directly from a person's card, with NO due date ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  const personCard = page.locator(".card-list.mobile-only .card-row").first();
  const personName = await personCard.locator(".card-row-title").innerText();
  console.log("person:", personName);
  await personCard.locator("button:has-text('Debt I owe')").click();
  await page.waitForTimeout(200);
  const personIdPrefilled = await page.locator("#f_personId option:checked").innerText();
  console.log("personId pre-filled to this exact person:", personIdPrefilled === personName);
  await page.fill("#f_amount", "55000");
  await page.fill("#f_desc", "Opening balance — money owed to " + personName);
  // deliberately leave #f_due blank
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);

  console.log("\n=== 6) Regression: an open balance with NO due date must NOT show as overdue ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const falseOverdueAlert = await page.locator(".alert-title", { hasText: "Overdue payment · " + personName }).count();
  console.log("no false overdue alert for the no-due-date balance:", falseOverdueAlert === 0);

  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Receivables')"); await page.waitForTimeout(200);
  const ledgerMeta = await page.locator(".card-row", { hasText: personName }).last().locator(".card-row-meta").count();
  console.log("ledger row for this open-ended balance shows NO due-date meta line (correct):", ledgerMeta === 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
