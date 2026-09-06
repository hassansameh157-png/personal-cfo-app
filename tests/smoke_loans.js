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

  console.log("=== 1) Create a plain payable (I owe) with a PAST due date ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Receivables')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Debt I owe')");
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "3000");
  await page.selectOption("#f_personId", { index: 1 });
  const personName = await page.locator("#f_personId option:checked").innerText();
  await page.fill("#f_due", "2020-01-01"); // deliberately far in the past
  await page.fill("#f_desc", "Borrowed for test");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  console.log("borrowed from:", personName);

  console.log("\n=== 2) Ledgers tab shows overdue-since badge ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Receivables')"); await page.waitForTimeout(200);
  const ledgerRow = page.locator(".card-row", { hasText: personName }).last();
  const meta = await ledgerRow.locator(".card-row-meta").innerText().catch(() => "MISSING");
  console.log("ledger row due-date meta:", meta);

  console.log("\n=== 3) Needs Attention shows the overdue payable ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const alertTitle = await page.locator(".alert-title", { hasText: "Overdue payment" }).count();
  console.log("Overdue payment alert present:", alertTitle > 0);
  if (alertTitle > 0) {
    const alertBody = await page.locator(".alert-card", { has: page.locator(".alert-title", { hasText: "Overdue payment" }) }).first().locator(".alert-body").innerText();
    console.log("alert body:", alertBody);
  }

  console.log("\n=== 4) A plain receivable due WITHIN 30 days shows in Forecast ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Receivables')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Lend / owed to me')");
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "750");
  await page.selectOption("#f_personId", { index: 2 });
  const person2 = await page.locator("#f_personId option:checked").innerText();
  const future = new Date(); future.setDate(future.getDate() + 10);
  await page.fill("#f_due", future.toISOString().slice(0, 10));
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);

  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Forecast')"); await page.waitForTimeout(200);
  const forecastHasIt = await page.locator(".event-row", { hasText: person2 }).count();
  console.log("Forecast shows upcoming plain receivable for", person2, ":", forecastHasIt > 0);

  console.log("\n=== 5) Repaying it in full clears the overdue alert ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const payBtn = page.locator(".alert-card", { has: page.locator(".alert-title", { hasText: "Overdue payment · " + personName }) }).first().locator(".alert-cta");
  if (await payBtn.count()) {
    await payBtn.click();
    await page.waitForTimeout(200);
    await page.fill("#f_amount", "3000");
    await page.selectOption("#f_accountId", { index: 1 });
    await page.click("button:has-text('Save')");
    await page.waitForTimeout(200);
    const stillThere = await page.locator(".alert-title", { hasText: "Overdue payment · " + personName }).count();
    console.log("overdue alert cleared after full repayment:", stillThere === 0);
  }

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
