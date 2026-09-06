const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Split expense ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(150);
  const firstPerson = await page.locator(".card-list.mobile-only .card-row-title").first().innerText();
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(150);
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "300");
  await page.fill("#f_desc", "Shared taxi");
  await page.selectOption("#f_splitPersonId", { label: firstPerson });
  await page.fill("#f_splitAmount", "150");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);

  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  const expenseRow = await page.locator(".card-row", { hasText: "Shared taxi" }).count();
  const receivableRow = await page.locator(".card-row", { hasText: "Share of: Shared taxi" }).count();
  console.log("expense row posted:", expenseRow > 0);
  console.log("matching receivable row posted:", receivableRow > 0);

  console.log("\n=== 2) Editing an existing expense hides split fields ===");
  await page.locator(".card-row", { hasText: "Shared taxi" }).first().locator("button:has-text('Edit')").click();
  await page.waitForTimeout(200);
  console.log("splitPersonId field absent while editing:", await page.locator("#f_splitPersonId").count() === 0);
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 3) Split amount cannot exceed total ===");
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "100");
  await page.fill("#f_desc", "Bad split test");
  await page.selectOption("#f_splitPersonId", { label: firstPerson });
  await page.fill("#f_splitAmount", "500");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  console.log("error shown:", await page.locator(".dialog-err").innerText().catch(() => "NONE"));
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 4) Debt payoff order toggle ===");
  // Seed data only has one person I owe money to -- add a second, smaller
  // one so the toggle (which only shows with 2+) actually appears.
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Receivables')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Debt I owe')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "500");
  await page.selectOption("#f_personId", { label: firstPerson });
  await page.fill("#f_desc", "Small debt for toggle test");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);

  const beforeOrder = await page.locator(".card-list").last().locator(".card-row-title").allTextContents();
  console.log("payables order (largest first, default):", beforeOrder);
  console.log("toggle visible with 2+ payables:", await page.locator("button:has-text('Smallest first')").count() > 0);
  await page.click("button:has-text('Smallest first')");
  await page.waitForTimeout(200);
  const afterOrder = await page.locator(".card-list").last().locator(".card-row-title").allTextContents();
  console.log("payables order (smallest first):", afterOrder);
  console.log("order actually changed:", JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder));

  console.log("\n=== 5) Budgets ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  await page.selectOption("#budgetCat", "Food");
  await page.fill("#budgetAmt", "10");
  await page.click("button:has-text('Set budget')");
  await page.waitForTimeout(200);
  console.log("budget row shown:", await page.locator(".card-row", { hasText: "Food" }).count() > 0);

  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const overBudgetAlert = await page.locator(".alert-title", { hasText: "budget" }).count();
  console.log("over/near-budget alert appears on Dashboard (Food likely already spent > 10 this month in seed data):", overBudgetAlert > 0);
  const thisMonthFoodRow = await page.locator(".bar-row", { hasText: "Food" }).innerText().catch(() => "NONE");
  console.log("This month bar shows budget context for Food:", thisMonthFoodRow);

  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "Food" }).locator("button:has-text('Remove')").click();
  await page.waitForTimeout(200);
  console.log("budget removed:", await page.locator(".card-row", { hasText: "Food" }).count() === 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
