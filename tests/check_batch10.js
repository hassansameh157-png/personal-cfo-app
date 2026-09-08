const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Real bug reported by a user: this is a pure in-memory SPA -- every
// navigation (setPage, viewPerson, openModal, the action sheets, More,
// quick-add) only ever mutated app.state and re-rendered, never touching
// the browser's own history stack. With zero history entries of its own to
// pop, the mobile/Android back button (and the PWA's own back gesture) had
// nothing to do but fall through to the browser's default action -- closing
// the tab or exiting the installed app outright -- instead of stepping back
// one layer the way a native app would. Fixed with a single "trap" history
// entry (UI.initBackTrap()/onPopState()/closeTopLayer()) kept one step
// ahead of the real page at all times; see the long comment on
// initBackTrap() in ui.js for the full design reasoning.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) The mobile back button closes a modal instead of leaving the page ===");
  await page.click(".fab");
  await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Expense')");
  await page.waitForTimeout(150);
  console.log("modal open:", await page.locator(".dialog").count() === 1);
  await page.goBack();
  await page.waitForTimeout(200);
  console.log("back closed the modal, not the tab:", await page.locator(".dialog").count() === 0 && page.url().startsWith("file://"));

  console.log("\n=== 2) Back closes an action sheet (the ...-menu kind) ===");
  await page.click(".navbtn:has-text('Accounts')");
  await page.waitForTimeout(200);
  await page.click(".acct-more-btn");
  await page.waitForTimeout(150);
  console.log("sheet open:", await page.locator(".sheet-actions").count() >= 1);
  await page.goBack();
  await page.waitForTimeout(200);
  console.log("back closed the sheet:", await page.locator(".sheet-actions").count() === 0);
  console.log("...and we're still on Accounts, not bounced to Dashboard:", await page.evaluate(() => UI.app.state.page) === "accounts");

  console.log("\n=== 3) Back closes the More sheet and the quick-add FAB sheet ===");
  await page.click(".navbtn:has-text('More')");
  await page.waitForTimeout(150);
  console.log("More sheet open:", await page.locator(".sheet-item:has-text('Settings')").count() === 1);
  await page.goBack();
  await page.waitForTimeout(200);
  console.log("back closed More:", await page.locator(".sheet-item:has-text('Settings')").count() === 0);
  await page.click(".fab");
  await page.waitForTimeout(150);
  console.log("quick-add sheet open:", await page.locator(".sheet-item:has-text('Expense')").count() === 1);
  await page.goBack();
  await page.waitForTimeout(200);
  console.log("back closed quick-add:", await page.locator(".sheet-item:has-text('Expense')").count() === 0);

  console.log("\n=== 4) Back returns from a person's detail page to wherever it was opened from ===");
  await page.click(".navbtn:has-text('People')");
  await page.waitForTimeout(200);
  await page.click(".person-card button.link-btn");
  await page.waitForTimeout(200);
  console.log("landed on person_detail:", await page.evaluate(() => UI.app.state.page) === "person_detail");
  await page.goBack();
  await page.waitForTimeout(200);
  console.log("back returned to People (where it was opened from):", await page.evaluate(() => UI.app.state.page) === "people");

  console.log("\n=== 4b) The on-screen '← X' link agrees with where the hardware back button actually goes ===");
  // Real bug caught in code review: the on-screen back link used to be
  // hardcoded to "← People" regardless of where person_detail was opened
  // from -- fine before this feature existed (there was no other "back"
  // to compare it against), but a real inconsistency once the hardware
  // back button started using the real origin (_personDetailFrom): two
  // "back" affordances on the same screen disagreeing about where "back"
  // goes. Opening from Installments (not People) exercises the
  // non-default origin.
  await page.click(".navbtn:has-text('Installments')");
  await page.waitForTimeout(200);
  await page.click(".card-row .inline-link");
  await page.waitForTimeout(200);
  console.log("landed on person_detail from Installments:", await page.evaluate(() => UI.app.state.page) === "person_detail");
  const backLink = page.locator(".link-btn.small", { hasText: "Installments" });
  console.log("the on-screen link now reads '← Installments', not a stale '← People':", await backLink.count() === 1);
  await backLink.click();
  await page.waitForTimeout(200);
  console.log("tapping it lands on Installments, matching what the hardware back button would do:", await page.evaluate(() => UI.app.state.page) === "installments");

  console.log("\n=== 5) From a non-Dashboard tab, back returns to Dashboard first, only THEN would a further back leave ===");
  await page.click(".navbtn:has-text('More')");
  await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Reports')");
  await page.waitForTimeout(200);
  console.log("on Reports:", await page.evaluate(() => UI.app.state.page) === "reports");
  await page.goBack();
  await page.waitForTimeout(200);
  console.log("back landed on Dashboard, not straight out of the app:", await page.evaluate(() => UI.app.state.page) === "dashboard");

  console.log("\n=== 6) Nested layers close one at a time, most-recently-opened first ===");
  await page.click(".navbtn:has-text('Accounts')");
  await page.waitForTimeout(200);
  await page.click(".acct-more-btn");
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
  await page.waitForTimeout(150);
  console.log("modal now open on top of what was the sheet:", await page.locator(".dialog").count() === 1);
  await page.goBack();
  await page.waitForTimeout(200);
  console.log("first back closes only the modal:", await page.locator(".dialog").count() === 0);
  console.log("...sheet is already gone too (Edit's own opener clears it before opening the modal, so there's nothing left underneath):", await page.locator(".sheet-actions").count() === 0);

  console.log("\n=== 7) Closing a layer normally (Cancel/backdrop, not back) never desyncs the trap for the NEXT back press ===");
  await page.click(".fab");
  await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Income')");
  await page.waitForTimeout(150);
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);
  console.log("modal closed via Cancel, not back:", await page.locator(".dialog").count() === 0);
  await page.click(".navbtn:has-text('Accounts')");
  await page.waitForTimeout(200);
  console.log("moved to Accounts:", await page.evaluate(() => UI.app.state.page) === "accounts");
  await page.goBack();
  await page.waitForTimeout(200);
  console.log("a single back press still correctly returns to Dashboard (no stale extra entry to burn through first):", await page.evaluate(() => UI.app.state.page) === "dashboard");

  console.log("\n=== 8) A reload doesn't stack up extra trap entries that would take several back presses to clear ===");
  // Real bug caught in code review: initBackTrap() used to push
  // unconditionally on every init(), and a reload does NOT reset the
  // tab's session history -- so each reload piled one more untracked
  // entry on top of the last, and a user who reloaded a few times would
  // need that many back presses before one actually closed anything.
  await page.reload();
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForTimeout(400);
  const histLenAfterTwoReloads = await page.evaluate(() => history.length);
  await page.reload();
  await page.waitForTimeout(400);
  const histLenAfterThreeReloads = await page.evaluate(() => history.length);
  console.log("a further reload doesn't grow the history stack at all (already sitting on its own trap entry):", histLenAfterThreeReloads === histLenAfterTwoReloads);
  console.log("nothing is open right after a fresh reload (plain Dashboard):", await page.locator(".dialog, .sheet-actions").count() === 0 && await page.evaluate(() => UI.app.state.page) === "dashboard");
  // history.length only ever grows in this tab (going back moves the
  // *position*, it doesn't shrink the count) -- so the real signal that a
  // single back press already consumed the one and only trap entry
  // (rather than there being several stacked up left to clear first) is
  // history.state itself: it should no longer be our trap immediately
  // after just ONE press, whether this is the first reload or the third.
  console.log("sitting on the trap entry right before pressing back:", await page.evaluate(() => !!(history.state && history.state.pcfoTrap)));
  await page.goBack();
  await page.waitForTimeout(200);
  console.log("exactly ONE back press (not several) already moved off the trap entry:", await page.evaluate(() => !(history.state && history.state.pcfoTrap)));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
