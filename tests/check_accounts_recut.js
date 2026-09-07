const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Accounts Recut (#36-40): five mobile-focused changes to the Accounts
// screen. Also regression-guards two real bugs caught during
// implementation, not by ad-hoc checking: deleteAccountC() leaving a
// stale, click-blocking action-sheet backdrop behind when its confirm() is
// cancelled or the account isn't found, and openAcctEdit()/
// openAcctStatement() never clearing _acctActionRow before handing off to
// openModal() -- leaving the sheet's own markup still in the DOM
// underneath the modal, ready to reappear once the modal closed.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  await page.click(".navbtn:has-text('Accounts')");
  await page.waitForTimeout(300);

  console.log("=== 36) Edit/Statement/Move/Delete all live behind one shared '...' action sheet ===");
  console.log("no always-visible inline Edit/Delete links on a tile:", await page.locator(".credit-card-tile .link-btn:has-text('Edit')").count() === 0);
  const firstTile = page.locator(".credit-card-tile").first();
  await firstTile.locator(".acct-more-btn").click();
  await page.waitForTimeout(150);
  console.log("sheet opens with the account's own name as its title:", (await page.locator(".sheet-title").innerText()) === (await firstTile.locator(".cc-name").innerText()));
  console.log("Edit action present:", await page.locator(".sheet-action:has-text('Edit')").count() > 0);
  console.log("first tile in its group has no Move up action:", await page.locator(".sheet-action:has-text('Move up')").count() === 0);
  await page.click(".sheet-backdrop", { force: true, position: { x: 5, y: 5 } });
  await page.waitForTimeout(150);
  console.log("clicking the backdrop closes it, sheet gone:", await page.locator(".sheet-actions").count() === 0);

  console.log("\n=== 36b) Real bug regression: Edit must close the sheet before opening the modal, not leave it stuck underneath ===");
  await firstTile.locator(".acct-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
  await page.waitForTimeout(200);
  // .sheet-backdrop itself is shared with the plain modal's own dismiss
  // backdrop (a real, legitimate one exists here now) -- .sheet-actions is
  // unique to the account/transaction action sheets, so that's the real
  // signal for "is MY sheet specifically still around".
  console.log("the account sheet itself is actually gone once the edit modal is open (not just covered by it):", await page.locator(".sheet-actions").count() === 0);
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);
  console.log("no leftover sheet reappears once the modal closes:", await page.locator(".sheet-actions").count() === 0);

  console.log("\n=== 36c) Real bug regression: cancelling a delete confirm() must not strand a click-blocking backdrop ===");
  await page.click("button:has-text('+ Account')"); await page.waitForTimeout(200);
  await page.selectOption("#f_type", "other");
  await page.fill("#f_name", "Removable Test Acct");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const cancelRow = page.locator(".card-row", { hasText: "Removable Test Acct" });
  await cancelRow.locator(".acct-more-btn").click();
  await page.waitForTimeout(150);
  page.once("dialog", (d) => d.dismiss());
  await page.click(".sheet-action:has-text('Delete')");
  await page.waitForTimeout(150);
  console.log("sheet actually closed after a CANCELLED delete (previously stayed stuck in the DOM):", await page.locator(".sheet-backdrop").count() === 0);
  await page.click("button:has-text('+ Expense')");
  await page.waitForTimeout(200);
  console.log("a click right after that cancel still reaches its real target:", await page.locator(".dialog-title").count() === 1);
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);

  console.log("\n=== 37) A real per-type icon sits in the corner mark on a balance tile ===");
  console.log("a balance tile's .cc-mark holds an svg icon, not an empty circle:", await page.locator(".credit-card-tile.balance-tile .cc-mark svg").first().count() > 0);
  console.log("a credit card keeps its existing gold chip mark, untouched:", await page.locator(".credit-card-tile:not(.balance-tile) .cc-chip").first().count() > 0);

  console.log("\n=== 38) A brand-new account no longer defaults to the same flat color every time ===");
  // Through the real form flow -- never touching the color swatch -- not
  // by reaching into Engine.nextAccountAutoColor() directly, so this
  // actually exercises the same path a real user hits.
  await page.click("button:has-text('+ Account')"); await page.waitForTimeout(200);
  await page.selectOption("#f_type", "other");
  await page.fill("#f_name", "AutoColor One");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Account')"); await page.waitForTimeout(200);
  await page.selectOption("#f_type", "other");
  await page.fill("#f_name", "AutoColor Two");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const autoColors = await page.evaluate(() => {
    const d = UI.app.state.data;
    return { c1: d.accounts.find(a => a.name === "AutoColor One").color, c2: d.accounts.find(a => a.name === "AutoColor Two").color };
  });
  console.log("auto-picked colors:", autoColors.c1, autoColors.c2);
  console.log("first auto-picked account isn't the old flat grey default:", autoColors.c1 !== "#7d7979");
  console.log("two accounts created back to back get two different auto-picked colors:", autoColors.c1 !== autoColors.c2);

  console.log("\n=== 39) Tile sub-groups render under their own headings, each move scoped to its own group ===");
  console.log("'Cash & bank' heading present:", await page.locator(".section-title", { hasText: "Cash & bank" }).count() > 0);
  console.log("'Wallets & e-cards' heading present:", await page.locator(".section-title", { hasText: "Wallets & e-cards" }).count() > 0);
  console.log("'Credit cards' heading present:", await page.locator(".section-title", { hasText: "Credit cards" }).count() > 0);
  // Move a wallet up and confirm it only reorders within the Wallets
  // group, never crossing into Cash & bank or Credit cards.
  const walletHeading = page.locator(".section-title", { hasText: "Wallets & e-cards" });
  const walletGroup = walletHeading.locator("xpath=following-sibling::div[1]");
  const walletNamesBefore = await walletGroup.locator(".cc-name").allTextContents();
  if (walletNamesBefore.length > 1) {
    await walletGroup.locator(".credit-card-tile").nth(1).locator(".acct-more-btn").click();
    await page.waitForTimeout(150);
    await page.click(".sheet-action:has-text('Move up')");
    await page.waitForTimeout(200);
    const walletNamesAfter = await walletGroup.locator(".cc-name").allTextContents();
    console.log("moving the 2nd wallet up swapped the first two within its own group:", walletNamesAfter[0] === walletNamesBefore[1] && walletNamesAfter[1] === walletNamesBefore[0]);
    console.log("Cash & bank group is completely unaffected by a Wallets-group move:", (await page.locator(".section-title", { hasText: "Cash & bank" }).locator("xpath=following-sibling::div[1]").locator(".cc-name").allTextContents()).join(",") === "Cash Wallet,CIB Current,CIB Savings");
  } else {
    console.log("(skipped -- seed data has fewer than 2 wallet/e-card accounts to test reordering with)");
    console.log("skip-not-a-failure: true");
  }

  console.log("\n=== 40) A balance-trend sparkline sits on every balance tile, never on a credit card ===");
  console.log("at least one balance tile shows a sparkline:", await page.locator(".credit-card-tile.balance-tile .sparkline").count() > 0);
  console.log("no credit card tile shows one (3-column row already tight, has its own usage bar instead):", await page.locator(".credit-card-tile:not(.balance-tile) .sparkline").count() === 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
