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

  console.log("=== 1) Existing seed accounts (with transactions) have NO Delete button ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  const seedRows = await page.locator(".card-list .card-row").count();
  const deleteButtonsBefore = await page.locator(".card-row button:has-text('Delete')").count();
  console.log("seed account rows:", seedRows, "| Delete buttons among them (should be 0):", deleteButtonsBefore);

  console.log("\n=== 2) New account with zero transactions has a Delete button ===");
  await page.click("button:has-text('+ Account')"); await page.waitForTimeout(200);
  // type "other" deliberately -- cash/wallet/card/ecard all render as
  // .credit-card-tile now, and this test wants the plain .card-row path.
  await page.selectOption("#f_type", "other");
  await page.fill("#f_name", "Fresh Wallet");
  await page.fill("#f_opening", "500");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const freshRow = page.locator(".card-row", { hasText: "Fresh Wallet" });
  console.log("new account balance shows opening amount:", await freshRow.locator(".card-row-amt").innerText());
  console.log("Delete button present on zero-tx account:", await freshRow.locator("button:has-text('Delete')").count() > 0);

  console.log("\n=== 3) After a transaction against it, Delete button disappears ===");
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "50");
  await page.selectOption("#f_accountId", { label: "Fresh Wallet" });
  await page.fill("#f_desc", "Test spend");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  console.log("Delete button gone after one transaction:", await freshRow.locator("button:has-text('Delete')").count() === 0);
  console.log("balance reflects the expense (500-50=450):", await freshRow.locator(".card-row-amt").innerText());

  console.log("\n=== 4) Edit Start amount on a non-card account ===");
  await freshRow.locator("button:has-text('Edit')").click(); await page.waitForTimeout(200);
  console.log("opening field label:", await page.locator("label:has(#f_opening) .field-label").innerText());
  console.log("opening pre-filled:", await page.locator("#f_opening").inputValue());
  await page.fill("#f_opening", "1000");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  console.log("balance updated (1000-50=950):", await freshRow.locator(".card-row-amt").innerText());

  console.log("\n=== 5) Edit 'Current outstanding' on a credit card ===");
  // Credit cards now render as .credit-card-tile (card-shaped visual), not
  // .card-row like every other account type -- but so do wallet/cash/ecard
  // now (as .balance-tile), so a real debt card needs the more specific
  // selector, not just "first tile in DOM order".
  const cardRow = page.locator(".credit-card-tile:not(.balance-tile)").first();
  const cardName = await cardRow.locator(".cc-name").innerText();
  await cardRow.locator("button:has-text('Edit')").click(); await page.waitForTimeout(200);
  console.log("card edit label:", await page.locator("label:has(#f_opening) .field-label").innerText());
  const cardOpeningBefore = await page.locator("#f_opening").inputValue();
  console.log("card opening pre-filled as POSITIVE value:", cardOpeningBefore);
  await page.fill("#f_opening", "3000");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  // Scoped by .cc-name specifically, not hasText on the whole tile: since
  // card flip shipped, a tile's back face can list OTHER accounts' names
  // right in its recent-activity descriptions (a transfer touching both),
  // so a plain hasText match on the tile can pick up more than one card.
  const cardRow2 = page.locator(".credit-card-tile").filter({ has: page.locator(".cc-name", { hasText: cardName }) });
  console.log("card balance now negative 3000-ish:", await cardRow2.locator(".cc-amt").innerText());

  console.log("\n=== 6) Tap account name -> jumps to its own transactions only ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  await page.locator(".card-row-title", { hasText: "Fresh Wallet" }).click();
  await page.waitForTimeout(200);
  console.log("navigated to Transactions:", await page.locator(".tab-title").innerText());
  const txRows = await page.locator(".card-list.mobile-only .card-row").allTextContents();
  console.log("all visible rows mention Fresh Wallet or are transfers touching it:", txRows.every(r => r.includes("Test spend") || r.length > 0));
  console.log("row count for Fresh Wallet (should be 1, just the expense):", txRows.length);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
