const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== Safe to spend now includes the Titanium statement due in 6d (5400 EGP) ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const safeToSpend = await page.locator(".hero-sub-value").first().innerText();
  console.log("Safe to spend (7d):", safeToSpend);

  console.log("\n=== Forecast page shows the statement as an outflow event ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Forecast')"); await page.waitForTimeout(200);
  const stmtEvent = page.locator(".event-row", { hasText: "Titanium" });
  console.log("Titanium statement event present:", await stmtEvent.count() > 0);
  if (await stmtEvent.count() > 0) console.log("event text:", await stmtEvent.first().innerText());

  console.log("\n=== stmtOptions labels a fully-paid statement ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "Titanium" }).first().locator("button:has-text('Pay')").count().then(async n => {
    if (n === 0) console.log("Titanium's fully-paid statement correctly has no Pay button");
  });
  await page.click("button:has-text('+ Statement')"); await page.waitForTimeout(200);
  const opts = await page.locator("#f_accountId option").allTextContents();
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);
  // Open a real Pay button to inspect the statement dropdown labels
  await page.locator(".card-row", { hasText: "Platinum" }).locator("button:has-text('Pay')").click();
  await page.waitForTimeout(200);
  const stmtOpts = await page.locator("#f_statementId option").allTextContents();
  console.log("statement dropdown options:", stmtOpts);
  console.log("field label (should be 'Statement', not 'Card statements'):", await page.locator("label:has(#f_statementId) .field-label").innerText());

  await browser.close();
})();
