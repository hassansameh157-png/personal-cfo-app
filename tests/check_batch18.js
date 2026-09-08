const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Two things reported directly by a user in the same conversation:
//
// 1) A real gap: paying a card's own statement used to mean leaving
//    Accounts entirely for Card statements just to find the same Pay
//    button already shown right on the tile's own "Statement due" line.
//    Added "Pay statement" to the account's own "..." sheet, opening
//    statement_payment pre-filled with the same nearest-unpaid-statement
//    the tile itself already computes and shows.
//
// 2) A real bug this surfaced: a screenshot showed "Outstanding EGP 1"
//    on a card whose "Available" already showed the full credit limit --
//    self-contradictory, since 1 outstanding should mean limit-1
//    available. The card's true balance was actually a small POSITIVE
//    credit (a few piastres of rounding overpay, e.g. from batch17's own
//    fix), and the tile showed that raw signed balance under
//    "Outstanding" with no sign -- a credit isn't debt. Fixed to the same
//    debt-only convention the aggregate "Total card debt" tile already
//    used (Math.abs(Math.min(0, bal))), so a credit reads as 0
//    outstanding, consistent with Available already showing the full
//    limit.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Set up a card with an unpaid statement matching its real carried debt ===");
  // Card statements are their own manual record, independent of the
  // account's own transaction-derived balance (see Engine.statementState
  // vs. D.bal) -- opening is set to match the statement amount below so
  // the account actually carries real debt to pay off, the same as a
  // real user's card would.
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Credit card')"); await page.waitForTimeout(200);
  await page.fill("#f_bank", "Test Bank");
  await page.fill("#f_name", "Test Card");
  await page.fill("#f_limit", "20000");
  await page.fill("#f_opening", "5000.60");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  const card = await page.evaluate(() => UI.app.state.data.accounts.find(a => a.name === "Test Card"));

  const cardTile = page.locator(".credit-card-tile", { hasText: "Test Card" });
  await cardTile.locator(".acct-more-btn").click(); await page.waitForTimeout(200);
  console.log("no \"Pay statement\" item when there's no statement yet:", await page.locator(".sheet-action", { hasText: "Pay statement" }).count() === 0);
  await page.click(".sheet-action:has-text('+ Statement')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "5000.60");
  await page.fill("#f_due", "2026-12-01");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);

  console.log("\n=== 2) \"Pay statement\" now shows right on the account's own \"...\" sheet ===");
  await cardTile.locator(".acct-more-btn").click(); await page.waitForTimeout(200);
  const payItem = page.locator(".sheet-action", { hasText: "Pay statement" });
  console.log("\"Pay statement\" item present:", await payItem.count() === 1);
  console.log("shows the outstanding amount inline:", (await payItem.innerText()).includes("5,001") || (await payItem.innerText()).includes("5,000"));

  console.log("\n=== 3) Tapping it opens the real payment form, pre-filled -- no need to go into Card statements ===");
  await payItem.click(); await page.waitForTimeout(200);
  console.log("opened the payment form directly:", await page.locator("#f_statementId").count() === 1);
  const preselected = await page.locator("#f_statementId option:checked").innerText();
  console.log("pre-selected the right statement:", preselected.length > 0);

  console.log("\n=== 4) Paying the rounded-up amount (batch17) leaves a tiny credit -- Outstanding now correctly reads 0, not a stray positive amount ===");
  await page.fill("#f_amount", "5001"); // rounds up from the true 5000.60 remaining
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);
  console.log("payment accepted, no error:", await page.locator(".dialog-err").count() === 0);
  const bal = await page.evaluate((id) => UI.app.derive().bal[id], card.id);
  console.log("card balance is now a small positive credit (the exact scenario from the bug report):", bal > 0 && bal < 1);
  const outstandingText = await cardTile.locator(".cc-label", { hasText: "Outstanding" }).locator("xpath=following-sibling::div[1]").innerText();
  console.log("Outstanding tile reads EGP 0, not a stray positive credit amount:", outstandingText.trim() === "EGP 0");
  const availableText = await cardTile.locator(".cc-label", { hasText: "Available" }).locator("xpath=following-sibling::div[1]").innerText();
  console.log("Available still correctly shows the full limit:", availableText.includes("20,000"));
  console.log("no more \"Pay statement\" item once it's settled:", await cardTile.locator(".acct-more-btn").click().then(() => page.waitForTimeout(200)).then(() => page.locator(".sheet-action", { hasText: "Pay statement" }).count()) === 0);

  console.log("\n=== 5) Regression: a card with genuine, real debt still shows it correctly (with no false credit framing) ===");
  await page.click(".sheet-backdrop").catch(() => {});
  await page.click("button:has-text('+ Credit card')"); await page.waitForTimeout(200);
  await page.fill("#f_bank", "Debt Bank");
  await page.fill("#f_name", "Debt Card");
  await page.fill("#f_limit", "10000");
  await page.fill("#f_opening", "3000");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  const debtTile = page.locator(".credit-card-tile", { hasText: "Debt Card" });
  const debtOutstanding = await debtTile.locator(".cc-label", { hasText: "Outstanding" }).locator("xpath=following-sibling::div[1]").innerText();
  console.log("real debt still shows the correct positive magnitude (EGP 3,000):", debtOutstanding.includes("3,000"));
  const debtAvailable = await debtTile.locator(".cc-label", { hasText: "Available" }).locator("xpath=following-sibling::div[1]").innerText();
  console.log("Available correctly reduced by the real debt (EGP 7,000):", debtAvailable.includes("7,000"));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
