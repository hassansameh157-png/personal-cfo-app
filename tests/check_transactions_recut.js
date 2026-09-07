const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Transactions Recut (#31, #32, #34, #35 -- #33/desktop table row-height was
// explicitly out of scope, the user's own usage is 100% mobile): four
// mobile-focused changes to the Transactions screen, plus a real charset/
// doctype bug found and fixed along the way. Also regression-guards two real
// bugs caught by the full suite during implementation, not by ad-hoc
// checking: deleteTxC() leaving a stale, click-blocking action-sheet
// backdrop behind when its confirm() is cancelled, and txDateGroupLabel()'s
// weekday name shifting a day for viewers west of UTC.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 0) Charset + doctype fix: the file now declares both explicitly ===");
  console.log("document renders in standards mode, not quirks (real bug: no <!DOCTYPE html> at all before this):", await page.evaluate(() => document.compatMode) === "CSS1Compat");
  console.log("an explicit UTF-8 <meta charset> exists (real bug: previously relied entirely on browser sniffing + GitHub Pages' own header):", await page.evaluate(() => (document.characterSet || document.charset) === "UTF-8"));

  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(200);

  console.log("\n=== 31) Edit/Delete/Duplicate/Reverse now live behind one shared '...' action sheet ===");
  console.log("no always-visible inline Edit/Delete links on a row:", await page.locator(".card-row .link-btn:has-text('Edit')").count() === 0);
  const firstRow = page.locator(".card-list.mobile-only .card-row").first();
  await firstRow.locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  console.log("sheet opens with all 4 actions:", await page.locator(".sheet-action").count() === 4);
  const sheetText = await page.locator(".sheet-actions").innerText();
  console.log("labels present:", ["Edit", "Reverse", "Duplicate", "Delete"].every(l => sheetText.includes(l)));
  await page.click(".sheet-backdrop", { force: true, position: { x: 5, y: 5 } });
  await page.waitForTimeout(150);
  console.log("clicking the backdrop closes it, sheet gone:", await page.locator(".sheet-actions").count() === 0);

  console.log("\n=== 31b) Real bug regression: cancelling a delete confirm() must not strand a click-blocking backdrop ===");
  await firstRow.locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  page.once("dialog", (d) => d.dismiss());
  await page.click(".sheet-action:has-text('Delete')");
  await page.waitForTimeout(150);
  console.log("sheet actually closed after a CANCELLED delete (previously stayed stuck in the DOM):", await page.locator(".sheet-backdrop").count() === 0);
  // The real symptom this bug caused: the very next click anywhere else on
  // the page (here, opening the quick-add) used to get silently intercepted
  // by the leftover backdrop.
  await page.click("button:has-text('+ Expense')");
  await page.waitForTimeout(200);
  console.log("a click right after that cancel still reaches its real target:", await page.locator(".dialog-title").count() === 1);
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);

  console.log("\n=== 32) Filters: search is always visible, the 4 dropdowns collapse behind a toggle ===");
  console.log("#txSearch visible without expanding anything:", await page.locator("#txSearch").isVisible());
  console.log("the 4 structural dropdowns start collapsed:", await page.locator(".filter-row select").first().isVisible().then(v => !v));
  await page.click(".filters-toggle");
  await page.waitForTimeout(150);
  console.log("expanding reveals all 4 dropdowns:", await page.locator(".filter-row select").count() === 4);
  console.log("all 4 now visible:", await page.locator(".filter-row select").first().isVisible());
  await page.click(".navbtn:has-text('Accounts')");
  await page.waitForTimeout(150);
  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(150);
  console.log("re-landing on the page starts collapsed again, not stuck open from the last visit:", await page.locator(".filter-row select").first().isVisible().then(v => !v));

  console.log("\n=== 34) Per-account color dots next to the account name in each row ===");
  console.log("at least one row shows an account color dot:", await page.locator(".card-list.mobile-only .tx-acc-dot").count() > 0);
  const transferRow = page.locator(".card-row", { hasText: "→" }).first();
  console.log("a transfer-style row (two accounts) shows two dots:", await transferRow.locator(".tx-acc-dot").count() >= 2);

  console.log("\n=== 34b) Same dots also reach Person Detail's History (real bug: it shares txSign() but wasn't reading accColors) ===");
  await page.click(".navbtn:has-text('People')");
  await page.waitForTimeout(200);
  // Mohamed Hassan has a receivable in the seed data (see shot_person_history.js);
  // collecting from him guarantees a real History row with a known account.
  await page.locator(".card-row", { hasText: "Mohamed Hassan" }).locator(".link-btn.card-row-title").click();
  await page.waitForTimeout(200);
  await page.click("button:has-text('Collect')");
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "1000");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(300);
  const collectionRow = page.locator(".card-row", { hasText: "Collection" }).first();
  console.log("the new Collection row in History shows its account color dot:", await collectionRow.locator(".tx-acc-dot").count() > 0);
  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(200);

  console.log("\n=== 35) Date-group headers ('Today'/'Yesterday'/weekday) appear above the mobile list, ungrouped only ===");
  console.log("a 'Today' header exists (seed has transactions dated today):", await page.locator(".tx-date-header", { hasText: "Today" }).count() > 0);
  await page.locator(".group-tx-toggle input").check();
  await page.waitForTimeout(150);
  console.log("turning on 'Group similar' removes the date headers entirely (grouped entries can legitimately span several real dates):", await page.locator(".tx-date-header").count() === 0);
  await page.locator(".group-tx-toggle input").uncheck();
  await page.waitForTimeout(150);
  console.log("headers come back once grouping is off again:", await page.locator(".tx-date-header").count() > 0);

  console.log("\n=== 35b) Real bug regression: the weekday label must not shift a day depending on the viewer's timezone ===");
  const weekdayCheck = await page.evaluate(() => {
    // txDateGroupLabel() only takes the weekday branch for a date 1-6 days
    // ago; seed a transaction exactly 3 days back and read the label back
    // regardless of the actual host machine's timezone.
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    const target = new Date(UI.app.today());
    target.setUTCDate(target.getUTCDate() - 3);
    const targetIso = target.toISOString().slice(0, 10);
    // The UTC weekday name is the ground truth this label must match,
    // computed independently of the app's own formatting code.
    const expectedWeekday = new Date(targetIso).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    d.tx.push({ id: "recut-weekday-test", type: "expense", amount: 1, date: targetIso, category: "Shopping", desc: "Weekday label test", void: false, accountId: d.accounts[0].id });
    UI.app.persist(d, "seed for weekday-label timezone test");
    UI.render();
    const label = UI.txDateGroupLabel(targetIso);
    return { label, expectedWeekday };
  });
  console.log("label:", weekdayCheck.label, "| expected (UTC-pinned):", weekdayCheck.expectedWeekday);
  console.log("weekday label matches the UTC calendar day regardless of host timezone:", weekdayCheck.label === weekdayCheck.expectedWeekday);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
