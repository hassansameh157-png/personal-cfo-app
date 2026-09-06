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

  console.log("=== 1) Add an expense, confirm it lands in Transactions ===");
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "123");
  await page.fill("#f_desc", "EditMe expense");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);

  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  const rowBefore = page.locator(".card-row", { hasText: "EditMe expense" }).first();
  console.log("row present before edit:", await rowBefore.count() > 0);
  console.log("amount before edit:", await rowBefore.locator(".card-row-amt").innerText());

  console.log("\n=== 2) Edit it: change amount + description ===");
  // button.link-btn -- a transaction row now offers Edit two ways (swipe
  // panel + the always-visible rowActions link), both calling the same
  // openTxEdit(id); the swipe one only becomes clickable once the row is
  // actually swiped open, so target the always-visible one by class.
  await rowBefore.locator("button.link-btn:has-text('Edit')").click();
  await page.waitForTimeout(200);
  const dialogTitle = await page.locator(".dialog-title").innerText();
  console.log("edit dialog title (should say Edit, not '+ Expense'):", dialogTitle);
  await page.fill("#f_amount", "456");
  await page.fill("#f_desc", "EditMe expense (edited)");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);

  const rowGone = await page.locator(".card-row", { hasText: "EditMe expense" }).filter({ hasNotText: "edited" }).count();
  const rowAfter = page.locator(".card-row", { hasText: "EditMe expense (edited)" }).first();
  console.log("old description gone:", rowGone === 0);
  console.log("new row present:", await rowAfter.count() > 0);
  console.log("amount after edit:", await rowAfter.locator(".card-row-amt").innerText());

  console.log("\n=== 3) Delete it ===");
  page.once("dialog", (d) => d.accept());
  // button.link-btn -- same two-Delete-buttons situation as Edit above.
  await rowAfter.locator("button.link-btn:has-text('Delete')").click();
  await page.waitForTimeout(200);
  const rowDeleted = await page.locator(".card-row", { hasText: "EditMe expense" }).count();
  console.log("row removed after delete:", rowDeleted === 0);

  console.log("\n=== 4) Edit a loan (payable) amount and confirm the person's balance updates ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(150);
  await page.click("button:has-text('+ Person')"); await page.waitForTimeout(150);
  await page.fill("#f_name", "EditLoan Test");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const card = page.locator(".card-row", { hasText: "EditLoan Test" }).first();
  await card.locator("button:has-text('Debt I owe')").click();
  await page.waitForTimeout(150);
  await page.fill("#f_amount", "10000");
  await page.fill("#f_desc", "Loan v1");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const netBefore = await page.locator(".card-row", { hasText: "EditLoan Test" }).first().locator(".card-row-amt").innerText();
  console.log("net before edit (should be -EGP 10,000-ish):", netBefore);

  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "Loan v1" }).first().locator("button.link-btn:has-text('Edit')").click();
  await page.waitForTimeout(150);
  await page.fill("#f_amount", "7000");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);

  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(150);
  const netAfter = await page.locator(".card-row", { hasText: "EditLoan Test" }).first().locator(".card-row-amt").innerText();
  console.log("net after editing loan amount to 7000 (should be -EGP 7,000):", netAfter);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
