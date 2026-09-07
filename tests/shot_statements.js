const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Accounts tile shows statement line ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  await page.screenshot({ path: "shot_stmt_accounts.png", fullPage: true });

  console.log("=== 2) Card statements page ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(200);
  await page.screenshot({ path: "shot_stmt_page.png", fullPage: true });
  const cardRows = await page.locator(".card-row").count();
  console.log("statement rows:", cardRows);

  console.log("\n=== 3) Add a new statement ===");
  await page.click("button:has-text('+ Statement')"); await page.waitForTimeout(200);
  console.log("form fields present:", await page.locator("#f_accountId").count(), await page.locator("#f_period").count(), await page.locator("#f_amount").count(), await page.locator("#f_due").count());
  await page.selectOption("#f_accountId", { label: (await page.locator("#f_accountId option").first().textContent()) });
  await page.fill("#f_period", "September 2026");
  await page.fill("#f_amount", "5000");
  await page.fill("#f_due", "2026-09-15");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  console.log("statement rows after add:", await page.locator(".card-row").count());

  console.log("\n=== 4) Pay a statement (partial) ===");
  const firstPay = page.locator(".card-row", { hasText: "September 2026" }).locator("button:has-text('Pay')");
  await firstPay.click(); await page.waitForTimeout(200);
  console.log("dialog title:", await page.locator(".dialog-title").innerText());
  console.log("fromId field present (not accountId):", await page.locator("#f_fromId").count() > 0);
  await page.fill("#f_amount", "2000");
  const chosenFromLabel = await page.locator("#f_fromId option").nth(1).textContent();
  await page.selectOption("#f_fromId", { index: 1 });
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const sepRow = page.locator(".card-row", { hasText: "September 2026" });
  console.log("meta after partial payment:", await sepRow.locator(".card-row-meta").innerText());

  console.log("\n=== 4b) Edit that payment -- \"Paid from\" must round-trip, not reset to the first account ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Statement payment"); await page.waitForTimeout(200);
  // This is a transaction row (a statement_payment), which offers Edit
  // two ways: the swipe panel, and the "..." trigger opening the shared
  // action sheet (see UI.renderTxActionSheet()) -- use the sheet here.
  await page.locator(".card-row", { hasText: "2,000" }).first().locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
  await page.waitForTimeout(200);
  const editedFrom = await page.locator("#f_fromId").inputValue();
  const editedFromLabel = await page.locator("#f_fromId option[value='" + editedFrom + "']").textContent();
  console.log("expected fromId label:", chosenFromLabel, "| actual on edit:", editedFromLabel, "| match:", chosenFromLabel === editedFromLabel);
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);
  await page.fill("#txSearch", ""); await page.waitForTimeout(150);

  console.log("\n=== 4c) Transactions list shows the real account + a real type label ===");
  await page.fill("#txSearch", "Statement payment"); await page.waitForTimeout(200);
  const stmtTxRow = page.locator(".card-row", { hasText: "Statement payment" }).first();
  console.log("row text:", (await stmtTxRow.innerText()).replace(/\n/g, " | "));
  await page.fill("#txSearch", ""); await page.waitForTimeout(150);

  console.log("\n=== 5) Needs Attention shows overdue statement (Platinum seed) ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  // Dashboard Recut #25 collapses Needs Attention to its first 3 cards --
  // expand (if a "+N more" button is even there) before looking for one
  // that could easily sit past that cutoff, seeded alongside several other
  // overdue plans/receivables.
  const moreBtn = page.locator(".dash-section button.btn-secondary.block");
  if (await moreBtn.count()) { await moreBtn.click(); await page.waitForTimeout(150); }
  const overdueAlert = page.locator(".alert-card", { hasText: "Overdue statement" });
  console.log("overdue statement alert present:", await overdueAlert.count() > 0);
  if (await overdueAlert.count() > 0) console.log("alert text:", await overdueAlert.first().innerText());

  console.log("\n=== 6) Edit a statement ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "September 2026" }).locator("button:has-text('Edit')").click(); await page.waitForTimeout(200);
  console.log("edit dialog title:", await page.locator(".dialog-title").innerText());
  console.log("period pre-filled:", await page.locator("#f_period").inputValue());
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 7) Delete guard: statement with a payment has no Delete button ===");
  const sepDeleteBtn = page.locator(".card-row", { hasText: "September 2026" }).locator("button:has-text('Delete')");
  console.log("Delete button absent (has payment):", await sepDeleteBtn.count() === 0);

  console.log("\n=== 8) Edit dialog title says 'Edit transaction', not 'Pay statement' ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Titanium statement — partial"); await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "Titanium statement" }).first().locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
  await page.waitForTimeout(200);
  console.log("edit title:", await page.locator(".dialog-title").innerText());
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);
  await page.fill("#txSearch", ""); await page.waitForTimeout(150);

  console.log("\n=== 9) A brand-new account with an open statement can't be deleted ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Credit card')"); await page.waitForTimeout(200);
  await page.fill("#f_bank", "Test Bank");
  await page.fill("#f_name", "Zero Card");
  await page.fill("#f_limit", "10000");
  await page.fill("#f_opening", "0");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const zeroCardTile = page.locator(".credit-card-tile", { hasText: "Zero Card" });
  // Edit/+ Statement/Delete all live behind the tile's "..." trigger now
  // (see UI.renderAcctActionSheet()), not always-visible inline buttons.
  await zeroCardTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  console.log("new zero-balance card has a Delete action before any statement:", await page.locator(".sheet-action:has-text('Delete')").count() > 0);
  await page.click(".sheet-action:has-text('+ Statement')"); await page.waitForTimeout(200);
  await page.fill("#f_period", "Test period");
  await page.fill("#f_amount", "500");
  await page.fill("#f_due", "2026-10-01");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  await zeroCardTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  console.log("same card has NO Delete action once it has an (unpaid) statement:", await page.locator(".sheet-action:has-text('Delete')").count() === 0);
  await page.click(".sheet-backdrop", { force: true, position: { x: 5, y: 5 } }); await page.waitForTimeout(150);

  console.log("\n=== 10) 'Paid from' on Pay statement never offers a card ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "Test period" }).locator("button:has-text('Pay')").click();
  await page.waitForTimeout(200);
  const fromOptions = await page.locator("#f_fromId option").allTextContents();
  console.log("Paid-from options (should have no card names):", fromOptions);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
