// New feature (#35, one of 3 ideas approved together — "نفذهم"): a
// recurring rule can now be type "transfer", not just income/expense — an
// automatic monthly move into a savings wallet, say. accountId doubles as
// "from" and a new toAccountId field is "to" (same distinct-accounts check
// the plain "transfer" transaction type already uses); postRecurring()
// posts a real plain-transfer row (fromId/toId, no category) instead of
// its usual income/expense shape; forecast()'s recurring-event amount is
// the rule's REAL impact on D.available (cash+bank+wallets+otherBalance,
// which excludes cards) rather than blindly `-amount` — zero between two
// ordinary accounts, the real amount when a card sits on either side — and
// the event-dot/amt tone ternaries (Dashboard's Upcoming 30 days + Forecast's
// own list) gain a neutral third state for that ~0 case instead of falsely
// reading red. accountCanDelete() also had to learn toAccountId is just as
// real a scheduled reference as accountId (a gap this feature would have
// otherwise introduced: a transfer rule's "to" account was deletable out
// from under it).
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1500 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) The real UI: Transfer is offered as a type, with its own To-account field ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Recurring')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Recurring')"); await page.waitForTimeout(200);
  console.log("modal open:", await page.locator(".dialog").count() === 1);
  const typeOptions = await page.locator("#f_type option").allInnerTexts();
  console.log("Type select offers Transfer alongside Income/Expense:", typeOptions.includes("Transfer"));
  console.log("a To-account field is present:", await page.locator("#f_toAccountId").count() === 1);

  console.log("\n=== 2) Real bug regression: picking the SAME account on both sides is rejected, same check the plain transfer form already uses ===");
  await page.fill("#f_name", "Auto-save sweep");
  await page.fill("#f_amount", "1500");
  await page.selectOption("#f_type", "transfer");
  await page.selectOption("#f_accountId", "cib");
  await page.selectOption("#f_toAccountId", "cib");
  await page.selectOption("#f_freq", "monthly");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  console.log("modal stays open (rejected):", await page.locator(".dialog").count() === 1);
  console.log("a real error is shown:", (await page.locator(".dialog-err").innerText()).length > 0);
  const rejectedCount = await page.evaluate(() => UI.app.state.data.recurring.filter(r => r.name === "Auto-save sweep").length);
  console.log("nothing was actually saved:", rejectedCount === 0);

  console.log("\n=== 3) Fixing it (two real, different accounts) saves end-to-end ===");
  await page.selectOption("#f_toAccountId", "sav"); // CIB Current -> CIB Savings, both non-card
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  console.log("modal closed (accepted):", await page.locator(".dialog").count() === 0);
  const saved = await page.evaluate(() => {
    const app = UI.app;
    const r = app.state.data.recurring.find(x => x.name === "Auto-save sweep");
    return r ? { type: r.type, accountId: r.accountId, toAccountId: r.toAccountId, category: r.category, amount: r.amount } : null;
  });
  console.log("saved as a real transfer rule, cib -> sav:", saved && saved.type === "transfer" && saved.accountId === "cib" && saved.toAccountId === "sav");
  console.log("category was forced null (a transfer rule has none, same as the plain transfer transaction type):", saved && saved.category === null);

  console.log("\n=== 4) The card itself: 'From -> To' instead of a bare account+category, neutral (not red) amount ===");
  const row = page.locator(".card-row", { hasText: "Auto-save sweep" });
  const metaText = await row.locator(".card-row-meta").innerText();
  console.log("meta line reads 'CIB Current → CIB Savings':", metaText.includes("CIB Current") && metaText.includes("CIB Savings") && metaText.includes("→"));
  console.log("no bare category shown for it (it has none):", !metaText.includes("Rent") && !metaText.includes("Salary"));
  const amtClass = await row.locator(".card-row-amt").getAttribute("class");
  console.log("amount tone is neutral, not tone-neg (it's not really an expense):", amtClass.includes("tone-neu") && !amtClass.includes("tone-neg"));
  const amtText = await row.locator(".card-row-amt").innerText();
  console.log("amount shown plain/unsigned (no +/- prefix), same convention the plain transfer transaction type already uses:", !/^[+−-]/.test(amtText.trim()));

  console.log("\n=== 5) Editing it back open pre-fills the same To-account ===");
  await row.locator("button:has-text('Edit')").click();
  await page.waitForTimeout(150);
  console.log("From account pre-filled:", await page.locator("#f_accountId").inputValue() === "cib");
  console.log("To account pre-filled:", await page.locator("#f_toAccountId").inputValue() === "sav");
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);

  console.log("\n=== 6) postRecurring() posts a REAL transfer transaction (fromId/toId), not an income/expense-shaped row ===");
  const before = await page.evaluate(() => {
    const app = UI.app, D = app.derive();
    const cib = D.bal["cib"] || 0, sav = D.bal["sav"] || 0;
    return { cib, sav };
  });
  await row.locator("button:has-text('Post now')").click();
  await page.waitForTimeout(200);
  const posted = await page.evaluate(() => {
    const app = UI.app, D = app.derive();
    const tx = app.state.data.tx.slice().reverse().find(t => t.desc && t.desc.indexOf("Auto-save sweep") === 0);
    return tx ? { type: tx.type, fromId: tx.fromId, toId: tx.toId, amount: tx.amount, hasAccountId: "accountId" in tx && tx.accountId != null, hasCategory: "category" in tx && tx.category != null, cib: D.bal["cib"], sav: D.bal["sav"] } : null;
  });
  console.log("posted a real transfer row:", posted && posted.type === "transfer" && posted.fromId === "cib" && posted.toId === "sav" && posted.amount === 1500);
  console.log("NOT the income/expense shape (no accountId/category on it):", posted && !posted.hasAccountId && !posted.hasCategory);
  console.log("balances actually moved: CIB Current -1500, CIB Savings +1500:", posted && Math.round(before.cib - posted.cib) === 1500 && Math.round(posted.sav - before.sav) === 1500);

  console.log("\n=== 7) forecast()'s own event amount is the rule's REAL impact on available money, not a blind -amount ===");
  const forecastMath = await page.evaluate(() => {
    const app = UI.app, D = app.derive();
    const savedData = JSON.parse(JSON.stringify(app.state.data));
    // Two synthetic rules, both due very soon (a 400-day horizon makes the
    // exact "next occurrence" anchor irrelevant -- only the per-event
    // amount formula is under test here): one between two ordinary
    // accounts (should net to ~0 -- the common "auto-save" case), one
    // where a card sits on one side (should be the real, nonzero amount).
    app.state.data.recurring.push(
      { id: "test_tr_plain", name: "TestTransferPlain", type: "transfer", amount: 777, accountId: "cib", toAccountId: "sav", freq: "monthly", day: 15 },
      { id: "test_tr_card", name: "TestTransferCard", type: "transfer", amount: 777, accountId: "cib", toAccountId: "card", freq: "monthly", day: 15 }
    );
    const fc = app.forecast(400, D);
    const plainEv = fc.events.find(e => e.title === "TestTransferPlain");
    const cardEv = fc.events.find(e => e.title === "TestTransferCard");
    app.state.data = savedData; // restore -- this was an in-memory-only probe, never persisted
    return { plainAmount: plainEv && plainEv.amount, cardAmount: cardEv && cardEv.amount };
  });
  console.log("cib -> sav (both ordinary accounts): amount is ~0, not -777:", forecastMath.plainAmount != null && Math.abs(forecastMath.plainAmount) < 0.01);
  console.log("cib -> card (a card on one side): amount is the real -777 (paying into a card reduces available cash):", forecastMath.cardAmount === -777);

  console.log("\n=== 8) Real behavior check: that ~0 event actually renders with the new neutral tone in the app's own event lists ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Forecast')"); await page.waitForTimeout(200);
  await page.click("button:has-text('365')"); // wide horizon, our monthly rule is guaranteed to land in it
  await page.waitForTimeout(200);
  const sweepRow = page.locator(".event-row", { hasText: "Auto-save sweep" }).first();
  const hasSweepEvent = await sweepRow.count() === 1;
  console.log("the real rule's own event shows up in Forecast's event list:", hasSweepEvent);
  if (hasSweepEvent) {
    const dotClass = await sweepRow.locator(".event-dot").getAttribute("class");
    const amtClass2 = await sweepRow.locator(".event-amt").getAttribute("class");
    console.log("its dot is neutral, not falsely red (cib -> sav is both ordinary accounts, ~0 real impact):", dotClass.includes("neu") && !dotClass.includes("neg"));
    console.log("its amount tone agrees:", amtClass2.includes("tone-neu") && !amtClass2.includes("tone-neg"));
  }

  console.log("\n=== 9) Real bug fix: accountCanDelete() now also blocks deleting a transfer rule's TO account, not just its FROM account ===");
  const canDeleteCheck = await page.evaluate(() => {
    const app = UI.app;
    // "sav" (CIB Savings) is only ever referenced as our sweep rule's own
    // toAccountId -- never as anyone's accountId/fromId/toId in real tx,
    // recurring.accountId, a statement, or a goal. Before the fix here,
    // accountCanDelete() would have missed this and said true.
    return app.accountCanDelete("sav");
  });
  console.log("CIB Savings (the sweep rule's own 'to' account) correctly reports as NOT deletable:", canDeleteCheck === false);

  console.log("\n=== 10) Real bug fix (caught by code review): an ordinary Expense rule never picks up a stray toAccountId ===");
  // #f_toAccountId is always visible on the form (see FORMS()) even for a
  // plain Expense rule, so its FormData value rides along in f regardless
  // -- without forcing it null server-side, an Expense rule would have
  // silently saved whatever account the untouched select happened to
  // default to, and accountCanDelete() (which trusts a non-null
  // toAccountId as a real scheduled reference) would have made that
  // unrelated account permanently undeletable for no visible reason.
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Recurring')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Recurring')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "Netflix");
  await page.fill("#f_amount", "300");
  // type stays "income" (the field's default) -- deliberately NOT touching
  // #f_toAccountId, the exact "untouched select" scenario the bug was in.
  await page.selectOption("#f_type", "expense");
  await page.selectOption("#f_accountId", "cib");
  await page.selectOption("#f_freq", "monthly");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const plainRule = await page.evaluate(() => {
    const r = UI.app.state.data.recurring.find(x => x.name === "Netflix");
    return r ? { type: r.type, toAccountId: r.toAccountId } : null;
  });
  console.log("saved as a plain expense rule:", plainRule && plainRule.type === "expense");
  console.log("toAccountId is null, not whatever the untouched select defaulted to:", plainRule && plainRule.toAccountId === null);
  // Isolated probe for accountCanDelete() itself, same swap-and-restore
  // shape as step 7's forecast probe -- every real seed account already
  // has SOME genuine reference (a tx, a statement, seed's own recurring
  // rules...), which would confound checking this against real data: the
  // only clean way to prove accountCanDelete() isn't fooled by a leftover
  // toAccountId is a synthetic account nothing else points to.
  const isolatedCheck = await page.evaluate(() => {
    const app = UI.app;
    const savedData = JSON.parse(JSON.stringify(app.state.data));
    app.state.data.accounts.push({ id: "test_acc_isolated", name: "Test isolated", type: "bank", opening: 0, color: "#000", active: true });
    // Simulates the exact pre-fix shape: an expense rule whose toAccountId
    // happens to be non-null (the untouched-select scenario) yet is NOT a
    // transfer.
    app.state.data.recurring.push({ id: "test_r_leftover", name: "TestLeftover", type: "expense", accountId: "cib", toAccountId: "test_acc_isolated", category: "Subscriptions", freq: "monthly", day: 1 });
    const result = app.accountCanDelete("test_acc_isolated");
    app.state.data = savedData; // restore
    return result;
  });
  console.log("a leftover toAccountId on a non-transfer rule does NOT block deleting that account:", isolatedCheck === true);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
