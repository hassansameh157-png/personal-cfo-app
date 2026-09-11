// New features (#36 + notification bell), part of the "نفذ ال٤ شاشات"
// implementation batch: a unified search bar in the topbar (every page,
// not just Transactions' own filter) finds transactions, accounts,
// people, recurring rules, savings goals and savings groups by name/
// description in one place -- Engine.globalSearch(). The notification
// bell next to it is not a new alert system of its own: it reads
// UI._badgeCount, the exact same attentionCount(D) already computed for
// the PWA app-icon badge and the one-shot Notification permission
// summary, so all three can never disagree about how many things need a
// look.
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) The search bar and the notification bell are on every page's topbar, not just Dashboard ===");
  console.log("search bar present on Dashboard:", await page.locator(".search-bar").count() === 1);
  console.log("bell present on Dashboard:", await page.locator(".bell-btn").count() === 1);
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  console.log("search bar still present on Transactions:", await page.locator(".search-bar").count() === 1);
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(150);

  console.log("\n=== 2) Real behavior check: the bell's own badge count agrees with Engine.attentionCount(), not a second count ===");
  const counts = await page.evaluate(() => {
    const app = UI.app, D = app.derive();
    return { attentionCount: app.attentionCount(D), badgeCount: UI._badgeCount };
  });
  console.log("attentionCount():", counts.attentionCount, "| UI._badgeCount (what the bell reads):", counts.badgeCount);
  console.log("the two agree -- same single source of truth:", counts.attentionCount === counts.badgeCount);
  const bellBadgeShown = counts.attentionCount > 0;
  console.log("a real bell badge renders in the DOM whenever that count is > 0:", (await page.locator(".bell-badge").count() === 1) === bellBadgeShown);
  if (bellBadgeShown) {
    const badgeText = await page.locator(".bell-badge").innerText();
    console.log("the badge's own number matches:", parseInt(badgeText) === counts.attentionCount || (counts.attentionCount > 99 && badgeText === "99+"));
  }

  console.log("\n=== 3) Tapping the bell goes to Dashboard's own Needs Attention section (no second alert list invented) ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  await page.click(".bell-btn");
  await page.waitForTimeout(200);
  console.log("landed on Dashboard:", await page.evaluate(() => UI.app.state.page) === "dashboard");

  console.log("\n=== 4) Opening the search bar shows a real input, autofocused ===");
  await page.click(".search-bar");
  await page.waitForTimeout(200);
  console.log("search sheet open:", await page.locator(".search-sheet").count() === 1);
  console.log("a real text input is there:", await page.locator("#globalSearchInput").count() === 1);
  console.log("under 2 characters shows the hint, not a scan of the whole ledger:", (await page.locator(".search-hint").innerText()).length > 0);

  console.log("\n=== 5) Real end-to-end search: a known transaction description finds it across sections ===");
  // Seed data's own "Apartment rent" recurring rule name doubles as a real
  // transaction description it posts under -- searching it should surface
  // BOTH a transaction row and the recurring-rule row, proving this
  // genuinely spans more than one entity type, not just Transactions.
  await page.fill("#globalSearchInput", "Rent");
  await page.waitForTimeout(250);
  const searchState = await page.evaluate(() => {
    const app = UI.app;
    const r = app.globalSearch("Rent");
    return { tx: r.tx.length, recurring: r.recurring.length };
  });
  console.log("Engine.globalSearch('Rent') finds real transactions:", searchState.tx > 0);
  console.log("...and the real recurring rule sharing that name:", searchState.recurring > 0);
  console.log("the DOM actually shows a Transactions section:", await page.locator(".search-section:has-text('Transactions')").count() >= 1);
  console.log("...and a Recurring rules section:", await page.locator(".search-section:has-text('Recurring rules')").count() >= 1);

  console.log("\n=== 6) Real behavior check: tapping a transaction result opens it for editing, not a dead link ===");
  const firstTxRow = page.locator(".search-section:has-text('Transactions') .search-row").first();
  const txTitle = await firstTxRow.locator(".search-row-title").innerText();
  await firstTxRow.click();
  await page.waitForTimeout(200);
  console.log("search sheet closed:", await page.locator(".search-sheet").count() === 0);
  console.log("landed on Transactions with the real edit modal open, pre-filled with the same row:", await page.locator(".dialog-title:has-text('Edit transaction')").count() === 1);
  const openedDesc = await page.locator("#f_desc").inputValue().catch(() => "");
  console.log("the modal's own description matches what was tapped:", openedDesc === txTitle);

  console.log("\n=== 7) A query under 2 characters never scans the ledger (real bug this guard prevents: matching almost everything) ===");
  const shortQuery = await page.evaluate(() => UI.app.globalSearch("a"));
  console.log("a single-character query returns nothing, deliberately:", Object.values(shortQuery).every(arr => arr.length === 0));

  console.log("\n=== 8) An account-name match jumps straight to its own filtered Transactions view ===");
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150); // close the edit modal step 6 opened
  await page.click(".search-bar"); await page.waitForTimeout(150);
  await page.fill("#globalSearchInput", "CIB Current");
  await page.waitForTimeout(250);
  const accRow = page.locator(".search-section:has-text('Accounts') .search-row").first();
  console.log("a real account result shows up:", await accRow.count() === 1);
  await accRow.click();
  await page.waitForTimeout(200);
  console.log("landed on Transactions, filtered to that one account:", await page.evaluate(() => UI.app.state.page) === "transactions" && await page.evaluate(() => UI.app.state.filt.account) === "cib");

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
