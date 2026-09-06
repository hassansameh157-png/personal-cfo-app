const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== Visual: statement badge on the tile ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  await page.screenshot({ path: "shot_badge_accounts.png", fullPage: true });
  const badgeBg = await page.locator(".cc-stmt").first().evaluate(el => getComputedStyle(el).backgroundColor);
  console.log("gold badge background (should not be white/transparent):", badgeBg);
  const overdueBg = await page.locator(".cc-stmt.overdue").first().evaluate(el => getComputedStyle(el).backgroundColor).catch(() => "none found");
  console.log("overdue badge background:", overdueBg);

  console.log("\n=== Net worth, income, expense BEFORE paying a statement ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const netWorthBefore = await page.locator(".hero-sub-value").nth(1).innerText();
  const incomeBefore = await page.locator(".stat-box .pos-value").first().innerText();
  const expenseBefore = await page.locator(".stat-box .pos-value").nth(1).innerText();
  console.log("Net worth before:", netWorthBefore, "| Income (this month):", incomeBefore, "| Expense (this month):", expenseBefore);

  console.log("\n=== Pay the Platinum statement (5000, overdue) from CIB Current ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "Platinum" }).locator("button:has-text('Pay')").click();
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "5000");
  await page.selectOption("#f_fromId", { label: "CIB Current" });
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);

  console.log("\n=== Net worth, income, expense AFTER paying the statement ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const netWorthAfter = await page.locator(".hero-sub-value").nth(1).innerText();
  const incomeAfter = await page.locator(".stat-box .pos-value").first().innerText();
  const expenseAfter = await page.locator(".stat-box .pos-value").nth(1).innerText();
  console.log("Net worth after:", netWorthAfter, "| Income (this month):", incomeAfter, "| Expense (this month):", expenseAfter);
  console.log("\nNet worth UNCHANGED:", netWorthBefore === netWorthAfter);
  console.log("Income UNCHANGED (payment not counted as income):", incomeBefore === incomeAfter);
  console.log("Expense UNCHANGED (payment not counted as expense):", expenseBefore === expenseAfter);

  console.log("\n=== Transactions list: this payment shows as an internal-style move (account -> account), not income/expense ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Statement payment"); await page.waitForTimeout(200);
  const row = page.locator(".card-row", { hasText: "Statement payment" }).first();
  console.log("row:", (await row.innerText()).replace(/\n/g, " | "));

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
