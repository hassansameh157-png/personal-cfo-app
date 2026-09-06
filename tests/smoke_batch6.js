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

  console.log("=== 1) Wallet, Cash and Bank accounts now render as balance tiles ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  const tileCount = await page.locator(".credit-card-tile").count();
  console.log("total tiles (3 cards + Cash Wallet + 2 CIB banks + Vodafone Cash + Instapay = 8):", tileCount);
  const balanceTileCount = await page.locator(".credit-card-tile.balance-tile").count();
  console.log("balance-style tiles (should be 5 -- cash + 2 banks + 2 wallets):", balanceTileCount);
  const firstBalanceTile = page.locator(".credit-card-tile.balance-tile").first();
  console.log("shows single Balance label, not Outstanding/Limit:", await firstBalanceTile.locator(".cc-label").allTextContents());

  console.log("\n=== 2) CIB Current (bank) now also a balance tile, not a plain row ===");
  const bankTile = page.locator(".credit-card-tile.balance-tile", { hasText: "CIB Current" });
  console.log("CIB Current rendered as a balance tile:", await bankTile.count() > 0);
  console.log("no longer a .card-row:", await page.locator(".card-row-title", { hasText: "CIB Current" }).count() === 0);

  console.log("\n=== 3) New 'Electronic card' type is selectable and renders as a tile ===");
  await page.click("button:has-text('+ Account')"); await page.waitForTimeout(200);
  const typeOptions = await page.locator("#f_type option").allTextContents();
  console.log("type options include Electronic card:", typeOptions);
  await page.selectOption("#f_type", "ecard");
  await page.fill("#f_name", "Amazon Gift Card");
  await page.fill("#f_opening", "1500");
  await page.evaluate(() => { document.getElementById("f_color").value = "#ff9900"; });
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const ecardTile = page.locator(".credit-card-tile", { hasText: "Amazon Gift Card" });
  console.log("ecard tile present:", await ecardTile.count() > 0);
  console.log("ecard tile is balance-style (no Limit):", (await ecardTile.locator(".cc-label").allTextContents()).join(",") === "Balance" || (await ecardTile.locator(".cc-label").allTextContents()).length === 1);
  console.log("ecard balance shows opening amount:", await ecardTile.locator(".cc-amt").innerText());
  // Background/color moved from .credit-card-tile itself to .cc-face-front
  // (front/back flip faces) when the card-flip feature shipped -- same fix
  // as smoke_batch5.js's account-color check.
  const ecardStyle = await ecardTile.locator(".cc-face-front").getAttribute("style");
  console.log("ecard tile uses chosen color:", ecardStyle.includes("ff9900"));

  console.log("\n=== 4) Ecard behaves like a normal balance account (no debt logic) ===");
  await ecardTile.locator("button:has-text('Edit')").click(); await page.waitForTimeout(200);
  console.log("edit label is 'Start amount' not 'Current outstanding':", await page.locator("label:has(#f_opening) .field-label").innerText());
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 5) Tap a wallet tile -> filters its own transactions ===");
  // Scoped by .cc-name specifically, not hasText on the whole tile -- same
  // fix as smoke_accounts.js: another tile's back face (card flip) can
  // legitimately mention "Vodafone Cash" in its own recent-activity rows
  // (a transfer touching both accounts), which a plain hasText match on
  // .credit-card-tile can pick up as a second, unwanted match.
  const walletTile = page.locator(".credit-card-tile.balance-tile").filter({ has: page.locator(".cc-name", { hasText: "Vodafone Cash" }) });
  await walletTile.locator(".cc-name").click(); await page.waitForTimeout(200);
  console.log("navigated to Transactions:", await page.locator(".tab-title").innerText());

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
