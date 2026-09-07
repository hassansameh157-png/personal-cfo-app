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
  // A transaction row offers Edit two ways: the swipe panel, and the
  // "..." trigger opening the shared action sheet (see
  // UI.renderTxActionSheet()) -- the swipe one only becomes clickable
  // once the row is actually swiped open, so use the sheet here.
  await rowBefore.locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
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
  // Same shared action sheet as Edit above.
  await rowAfter.locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Delete')");
  await page.waitForTimeout(200);
  const rowDeleted = await page.locator(".card-row", { hasText: "EditMe expense" }).count();
  console.log("row removed after delete:", rowDeleted === 0);

  console.log("\n=== 4) Edit a loan (payable) amount and confirm the person's balance updates ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(150);
  await page.click("button:has-text('+ Person')"); await page.waitForTimeout(150);
  await page.fill("#f_name", "EditLoan Test");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  // A brand-new person has no balance yet, so People Recut #45 collapses
  // them into the "settled" section by default -- expand it first, or the
  // card isn't in the DOM at all to find. "+ Debt I owe" itself now lives
  // behind the person's "..." trigger (see UI.renderPersonActionSheet()),
  // not an always-visible inline button.
  const settledToggle = page.locator("button", { hasText: "settled" });
  if (await settledToggle.count()) { await settledToggle.click(); await page.waitForTimeout(150); }
  const card = page.locator(".card-row", { hasText: "EditLoan Test" }).first();
  await card.locator(".person-more-btn").click(); await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('+ Debt I owe')");
  await page.waitForTimeout(150);
  await page.fill("#f_amount", "10000");
  await page.fill("#f_desc", "Loan v1");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const netBefore = await page.locator(".card-row", { hasText: "EditLoan Test" }).first().locator(".card-row-amt").innerText();
  console.log("net before edit (should be -EGP 10,000-ish):", netBefore);

  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  // Edit lives behind the "..." trigger's shared action sheet now (see
  // UI.renderTxActionSheet()), not an always-visible inline link.
  await page.locator(".card-row", { hasText: "Loan v1" }).first().locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
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
