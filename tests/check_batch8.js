const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// A grab-bag batch, not a single-screen recut: (1) a real missing feature
// (recurring rules had no edit/delete anywhere), (2) a full Savings Groups
// Recut mirroring Installments Recut on its sibling page, and (3) three
// smaller cross-screen gaps (Ledgers person links, Investments % return,
// Card statements action-sheet consolidation) spotted during the same
// review pass.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Real missing feature fixed: a recurring rule can now be edited and deleted ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Recurring')"); await page.waitForTimeout(300);
  const salaryCard = page.locator(".card-row", { hasText: "Salary" });
  console.log("the account and category now show on the card (used to be invisible without opening Edit):", (await salaryCard.locator(".card-row-meta").innerText()).includes("Salary"));
  await salaryCard.locator("button:has-text('Edit')").click();
  await page.waitForTimeout(200);
  console.log("edit dialog opens, pre-filled correctly:", (await page.locator(".dialog-title").innerText()) === "Edit recurring rule");
  console.log("amount field pre-filled from the real rule:", Number(await page.locator("#f_amount").inputValue()) > 0);
  await page.fill("#f_name", "Salary EDITED");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  console.log("name change saved:", await page.locator(".card-row-title", { hasText: "Salary EDITED" }).count() === 1);
  console.log("Delete is available before the rule has ever posted:", await page.locator(".card-row", { hasText: "Salary EDITED" }).locator("button:has-text('Delete')").count() === 1);
  await page.locator(".card-row", { hasText: "Salary EDITED" }).locator("button:has-text('Post now')").click();
  await page.waitForTimeout(200);
  console.log("Delete disappears once it's actually posted a real transaction (same canDelete gate every structural record uses):", await page.locator(".card-row", { hasText: "Salary EDITED" }).locator("button:has-text('Delete')").count() === 0);
  console.log("Edit still works afterward (fixing account/amount going forward stays possible):", await page.locator(".card-row", { hasText: "Salary EDITED" }).locator("button:has-text('Edit')").count() === 1);
  page.once("dialog", d => d.accept());
  await page.locator(".card-row", { hasText: "Apartment rent" }).locator("button:has-text('Delete')").click();
  await page.waitForTimeout(200);
  console.log("a never-posted rule really does delete:", await page.locator(".card-row-title", { hasText: "Apartment rent" }).count() === 0);

  console.log("\n=== 2) Savings Groups Recut: progress bar, next-due line, due-banner breakdown ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Savings groups')"); await page.waitForTimeout(300);
  const g5k = page.locator(".card-row", { hasText: "Gam3ya 5k" });
  console.log("progress bar reflects EGP 15,000/100,000 paid in (15%):", (await g5k.locator(".bar-fill").getAttribute("style") || "").includes("width:15%"));
  console.log("next contribution line shown without expanding the schedule:", (await g5k.locator(".card-row-meta").nth(1).innerText()).includes("Next: #4"));
  // Seen from the Groups page, the seed's installment plans DO have
  // something due this month (5,000) while no group does -- so the
  // banner's own breakdown correctly appears here too, linking back to
  // Installments, or "Due this month" on this page would be exactly the
  // unexplained mystery number #56 was written to fix.
  console.log("breakdown appears here too, since installments (not shown on this page) make up the whole total:", await page.locator(".due-banner .inline-link").count() === 1);
  console.log("that link points back to Installments:", (await page.locator(".due-banner .inline-link").getAttribute("onclick") || "").includes("installments"));

  console.log("\n=== 2b) Regression: the banner still explains its total when ONE half is entirely zero ===");
  // Real bug caught in code review: gating the breakdown on BOTH halves
  // being nonzero reintroduced the exact "mystery total" #56 fixed --
  // zero out every installment plan so due.installments is 0, then give
  // a group a contribution due this month so due.groups alone carries
  // the whole total.
  const today2 = await page.evaluate(() => UI.app.today());
  await page.evaluate((today) => {
    const app = UI.app, d = app.state.data;
    d.plans = [];
    d.tx = d.tx.filter(t => t.type !== "installment_sale" && t.type !== "installment_payment");
    d.groups.push({ id: "g_due_test", name: "Due This Month Circle", accountId: "cib", amount: 4000, periods: 3, myTurn: 2, first: today, freq: "monthly" });
    app.persist(d, "test setup");
    UI.render();
  }, today2);
  await page.waitForTimeout(200);
  await page.click(".navbtn:has-text('Installments')");
  await page.waitForTimeout(200);
  console.log("Installments' own due-installments is genuinely 0 now:", (await page.evaluate(() => UI.app.duesThisMonth(UI.app.derive()).installments)) === 0);
  console.log("...yet the banner still breaks the total down and links to where it lives:", await page.locator(".due-banner .inline-link").count() === 1);
  await page.click(".due-banner .inline-link");
  await page.waitForTimeout(200);
  console.log("that link lands on Savings groups:", (await page.locator(".tab-title").innerText()) === "Savings groups");

  console.log("\n=== 3) Real bug fix: 'Edit' from the group's sheet must close the sheet first, not leave it stuck underneath ===");
  await g5k.locator(".group-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
  await page.waitForTimeout(200);
  console.log("the sheet itself is actually gone once the edit modal is open:", await page.locator(".sheet-actions").count() === 0);
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);
  console.log("no leftover sheet reappears once the modal closes:", await page.locator(".sheet-actions").count() === 0);

  console.log("\n=== 4) A new, never-contributed-to group is deletable, and cancelling its delete doesn't strand a backdrop ===");
  await page.click("button:has-text('+ Savings group')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "Test Circle");
  await page.fill("#f_amount", "1000");
  await page.fill("#f_periods", "2");
  await page.fill("#f_myTurn", "1");
  const today = await page.evaluate(() => UI.app.today());
  await page.fill("#f_first", today);
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const testCircle = page.locator(".card-row", { hasText: "Test Circle" });
  console.log("Record contribution present while still owing money in:", await testCircle.locator("button:has-text('Record contribution')").count() === 1);
  await testCircle.locator(".group-more-btn").click();
  await page.waitForTimeout(150);
  console.log("Delete available (no contributions recorded yet):", await page.locator(".sheet-action:has-text('Delete group')").count() === 1);
  page.once("dialog", d => d.dismiss());
  await page.click(".sheet-action:has-text('Delete group')");
  await page.waitForTimeout(150);
  console.log("sheet actually closed after a CANCELLED delete (previously stayed stuck in the DOM):", await page.locator(".sheet-backdrop").count() === 0);
  await page.click("button:has-text('+ Expense')");
  await page.waitForTimeout(200);
  console.log("a click right after that cancel still reaches its real target:", await page.locator(".dialog-title").count() === 1);
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);

  console.log("\n=== 5) Real bug fix: 'Record contribution' hides once a group is fully paid in ===");
  await testCircle.locator("button:has-text('Record contribution')").click();
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "2000"); // 2 periods x 1000 = full obligation
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  console.log("Record contribution correctly gone now (would be a dead end -- submit()'s own cap check refuses it):", await testCircle.locator("button:has-text('Record contribution')").count() === 0);
  // Real bug caught in code review: fully paid in isn't the same as
  // "nothing left to do" -- the payout still hasn't been collected, so
  // this must stay in the ACTIVE list (not collapsed away) until it is.
  console.log("still in the active list -- payout not collected yet is still a live task:", await page.locator(".card-list .card-row-title", { hasText: "Test Circle" }).count() === 1);
  console.log("'Payout not collected yet' still visible, not hidden away:", (await testCircle.locator(".card-row-meta").nth(1).innerText()).includes("Payout not collected yet"));

  await testCircle.locator("button:has-text('Record payout')").click();
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "2000");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  console.log("NOW it's fully done (paid in AND payout collected) and drops out of the active list:", await page.locator(".card-list .card-row-title", { hasText: "Test Circle" }).count() === 0);
  const completedToggle = page.locator("button", { hasText: "1 completed" });
  console.log("a '1 completed' toggle appears (mirrors Installments #53):", await completedToggle.count() === 1);
  await completedToggle.click();
  await page.waitForTimeout(150);
  const completedCircle = page.locator(".card-row", { hasText: "Test Circle" });
  console.log("expanding reveals it under Completed:", await page.locator(".section-title", { hasText: "Completed" }).count() === 1);
  console.log("its progress bar is drawn in the positive/done tone:", (await completedCircle.locator(".bar-fill").getAttribute("style") || "").includes("var(--c-pos)"));

  console.log("\n=== 6) Sort order: an overdue group sorts before ones that aren't (mirrors Installments #55) ===");
  await page.click("button:has-text('+ Savings group')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "Overdue Circle");
  await page.fill("#f_amount", "500");
  await page.fill("#f_periods", "3");
  await page.fill("#f_myTurn", "1");
  await page.fill("#f_first", "2020-01-01"); // long overdue
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const titlesInOrder = await page.locator(".card-list .card-row-title").allTextContents();
  console.log("the newly-overdue group now sorts first, ahead of two non-overdue seed groups:", titlesInOrder[0] === "Overdue Circle");

  console.log("\n=== 7) Record payment plan-picker (group_payment) names direction and remaining, not a bare title ===");
  await page.locator(".card-row", { hasText: "Overdue Circle" }).locator("button:has-text('Record contribution')").click();
  await page.waitForTimeout(200);
  const groupOpts = await page.locator("#f_groupId option").allTextContents();
  console.log("a still-active group's option shows its remaining amount:", groupOpts.some(o => /^Overdue Circle — EGP [\d,]+$/.test(o)));
  console.log("the now-settled Test Circle is labelled '(paid)' instead of dropped from the list:", groupOpts.some(o => /^Test Circle \(paid\)$/.test(o)));
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 8) Ledgers: a person's name is now a tappable link ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Receivables')"); await page.waitForTimeout(300);
  const firstLedgerRow = page.locator(".card-list").first().locator(".card-row").first();
  const ledgerName = await firstLedgerRow.locator(".card-row-title").innerText();
  await firstLedgerRow.locator(".card-row-title").click();
  await page.waitForTimeout(200);
  console.log("tapping the name lands on that person's own page (" + ledgerName + "):", (await page.locator(".tab-title").innerText()).includes(ledgerName));

  console.log("\n=== 9) Investments: P&L now shows a percentage return alongside the amount ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Investments')"); await page.waitForTimeout(300);
  const pnlLine = await page.locator(".card-row-meta").first().innerText();
  console.log("P&L line includes a % figure in parentheses:", /\([+-]?[\d.]+%\)/.test(pnlLine));

  console.log("\n=== 10) Card statements: Edit/Delete consolidated into a shared '...' sheet, Pay stays primary ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(300);
  const stmtCard = page.locator(".card-row").first();
  console.log("no more always-visible inline Edit button:", await stmtCard.locator(".btn-row > button:has-text('Edit')").count() === 0);
  console.log("a '...' trigger is there instead:", await stmtCard.locator(".stmt-more-btn").count() === 1);
  await stmtCard.locator(".stmt-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
  await page.waitForTimeout(200);
  console.log("opens the real edit dialog, sheet gone underneath it:", (await page.locator(".dialog-title").innerText()) === "Edit statement" && await page.locator(".sheet-actions").count() === 0);
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
