const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// A thin Outstanding/Limit usage bar on each credit-card tile in the
// Accounts list -- credit cards only (see renderAccounts()'s own comment
// for why a plain balance account is deliberately skipped: no natural
// ceiling to measure against without a per-account budget this app
// doesn't model).

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  await page.click(".navbtn:has-text('Accounts')");
  await page.waitForTimeout(200);

  console.log("=== 1) Every credit-card tile gets a usage bar, matching Outstanding/Limit ===");
  const cardTile = page.locator(".credit-card-tile:not(.balance-tile)").first();
  console.log("card tile has a .cc-usage bar:", await cardTile.locator(".cc-usage").count() === 1);
  const info = await cardTile.evaluate((el) => {
    const outstandingText = el.querySelector(".cc-amt").textContent;
    const limitText = el.querySelector(".cc-sub:last-of-type") ? el.querySelectorAll(".cc-sub")[1].textContent : "";
    const fill = el.querySelector(".cc-usage-fill");
    return { width: fill.style.width, ariaLabel: el.querySelector(".cc-usage").getAttribute("aria-label") };
  });
  console.log("fill width is a real percentage (0-100%):", /^\d+(\.\d+)?%$/.test(info.width) && parseFloat(info.width) >= 0 && parseFloat(info.width) <= 100);
  console.log("has an accessible aria-label with the percentage:", /\d+% of limit used/.test(info.ariaLabel));

  console.log("\n=== 2) A plain balance account (wallet/bank/cash) gets NO usage bar ===");
  const balanceTile = page.locator(".credit-card-tile.balance-tile").first();
  console.log("balance tile present:", await balanceTile.count() === 1);
  console.log("balance tile has no .cc-usage bar:", await balanceTile.locator(".cc-usage").count() === 0);

  console.log("\n=== 3) The fill percentage actually matches Outstanding/Limit (not some other number) ===");
  const accId = await cardTile.locator(".cc-flip").getAttribute("data-acc-id");
  const computed = await cardTile.evaluate((el, id) => {
    const D = UI.app.derive();
    const a = UI.app.state.data.accounts.find(x => x.id === id);
    const bal = D.bal[a.id];
    const expectedPct = a.limit > 0 ? Math.max(0, Math.min(100, Math.round(Math.abs(Math.min(0, bal)) / a.limit * 100))) : 0;
    const actualWidth = parseFloat(el.querySelector(".cc-usage-fill").style.width);
    return { expectedPct, actualWidth };
  }, accId);
  console.log("usage bar width matches the real Outstanding/Limit percentage:", computed.expectedPct === computed.actualWidth);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
