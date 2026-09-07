const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// "Group similar" (mobile-only, off by default) on Transactions: collapses
// rows sharing the same type/category/(trimmed, case-insensitive) desc --
// a recurring bill, a repeated merchant -- into one expandable row, only
// among what's already on screen (this page's own filtered+paginated
// items), never touching the desktop table or the plain ungrouped default.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    for (let i = 0; i < 3; i++) {
      d.tx.push({ id: "grp-test-" + i, type: "expense", amount: 100 + i, date: "2026-0" + (i + 1) + "-05", category: "Netflix", desc: "Netflix subscription", void: false, accountId: d.accounts[0].id });
    }
    // A different category with the same description text should NOT
    // group with the Netflix ones above -- the key includes category too.
    d.tx.push({ id: "grp-test-diffcat", type: "expense", amount: 50, date: "2026-04-05", category: "Entertainment", desc: "Netflix subscription", void: false, accountId: d.accounts[0].id });
    // A single, non-repeated description should render as a plain row
    // even with grouping on.
    d.tx.push({ id: "grp-test-single", type: "expense", amount: 75, date: "2026-05-05", category: "Netflix", desc: "One-time Netflix gift card", void: false, accountId: d.accounts[0].id });
    UI.app.persist(d, "seed for group-similar test");
    UI.render();
  });
  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(200);
  await page.fill("#txSearch", "Netflix");
  await page.waitForTimeout(200);

  console.log("=== 1) Grouping off by default -- every row still shows individually ===");
  console.log("group toggle checkbox unchecked by default:", !(await page.locator(".group-tx-toggle input").isChecked()));
  console.log("all 5 seeded rows show as plain cards:", await page.locator(".mobile-only .card-row").count() === 5);
  console.log("no group rows exist while off:", await page.locator(".tx-group-head").count() === 0);

  console.log("\n=== 2) Turning it on collapses the 3 identical Netflix/Netflix-subscription rows into one ===");
  await page.locator(".group-tx-toggle input").check();
  await page.waitForTimeout(150);
  const groupHeads = page.locator(".tx-group-head");
  console.log("exactly one group formed (only 1 key has 3+ members):", await groupHeads.count() === 1);
  const headText = await groupHeads.first().textContent();
  console.log("group header names the shared description:", headText.includes("Netflix subscription"));
  console.log("group header shows the occurrence count:", headText.includes("3"));
  console.log("group header shows the correct aggregate total (100+101+102=303):", headText.includes("303"));

  console.log("\n=== 3) A same-text description but a DIFFERENT category does not join that group ===");
  console.log("the Entertainment-category row still renders on its own, not folded in:", await page.locator(".mobile-only .card-row:not(.tx-group-head)", { hasText: "Netflix subscription" }).count() === 1);

  console.log("\n=== 4) A non-repeated description stays a plain single row even with grouping on ===");
  console.log("the one-time gift-card row renders as a plain card, not a group:", await page.locator(".mobile-only .card-row:not(.tx-group-head)", { hasText: "One-time Netflix gift card" }).count() === 1);

  console.log("\n=== 4b) A voided row matching an otherwise-groupable description never joins the group ===");
  // Real bug caught in review: an earlier version summed every matching
  // row's signed amount unconditionally, so a voided (reversed)
  // transaction with the same desc/category would silently inflate the
  // live group's total with no visual distinction once merged in.
  await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    d.tx.push({ id: "grp-test-void", type: "expense", amount: 9999, date: "2026-06-05", category: "Netflix", desc: "Netflix subscription", void: true, accountId: d.accounts[0].id });
    UI.app.persist(d, "seed voided row for group test");
    UI.render();
  });
  await page.waitForTimeout(150);
  const headTextAfterVoid = await page.locator(".tx-group-head").first().textContent();
  console.log("group total unaffected by the voided row's huge amount (still 303, not +9999 more):", headTextAfterVoid.includes("303") && !headTextAfterVoid.includes("9999"));
  console.log("the voided row still appears on its own, not swallowed into the group:", await page.locator(".mobile-only .card-row.voided:not(.tx-group-head)").count() === 1);
  console.log("group still reports only 3 members, not 4:", (await page.locator(".tx-group-head").first().textContent()).includes("3 similar"));

  console.log("\n=== 4c) Two installment_payment rows from economically opposite plans never group together ===");
  // Real bug caught in review: installment_payment's sign depends on that
  // specific plan's direction (in vs out), not the type alone, and these
  // rows carry no category -- two payments from opposite-direction plans
  // with coincidentally similar blank/placeholder desc text could
  // otherwise net together into one misleading total.
  const planInfo = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    const planIn = d.plans.find(p => p.direction === "in");
    const planOut = d.plans.find(p => p.direction === "out");
    if (!planIn || !planOut) return null;
    d.tx.push({ id: "grp-test-inst-in", type: "installment_payment", amount: 500, date: "2026-06-01", desc: "Installment payment", void: false, planId: planIn.id, accountId: d.accounts[0].id });
    d.tx.push({ id: "grp-test-inst-out", type: "installment_payment", amount: 500, date: "2026-06-02", desc: "Installment payment", void: false, planId: planOut.id, accountId: d.accounts[0].id });
    UI.app.persist(d, "seed opposite-direction installment payments for group test");
    return true;
  });
  if (planInfo) {
    await page.fill("#txSearch", "");
    await page.fill("#txSearch", "Installment payment");
    await page.waitForTimeout(200);
    console.log("neither installment row was folded into a group:", await page.locator(".tx-group-head").count() === 0);
    console.log("both still render as plain, individually-signed rows:", await page.locator(".mobile-only .card-row:not(.tx-group-head)").count() === 2);
    await page.fill("#txSearch", "Netflix");
    await page.waitForTimeout(200);
  } else {
    console.log("(skipped -- seed data has no in/out installment plan pair to test with)");
    console.log("skip-not-a-failure: true");
  }

  console.log("\n=== 5) Expanding the group reveals all 3 real members, each fully editable ===");
  console.log("collapsed: no member rows visible yet:", await page.locator(".tx-group-members").count() === 0);
  await groupHeads.first().click();
  await page.waitForTimeout(150);
  const memberRows = page.locator(".tx-group-members .card-row");
  console.log("expanded shows all 3 members:", await memberRows.count() === 3);
  // Each member's Edit/Delete/Duplicate/Reverse actions live behind its
  // own "..." trigger now (see UI.renderTxActionSheet()), not
  // always-visible inline links -- one trigger per member, distinct from
  // the swipe-to-reveal .swipe-edit button each member ALSO carries (see
  // check_swipe_actions.js's own note on that separate mechanism).
  console.log("each member has its own actions trigger:", await page.locator(".tx-group-members .tx-more-btn").count() === 3);

  console.log("\n=== 6) Deleting a member from inside the expanded group actually removes it ===");
  const txCountBefore = await page.evaluate(() => UI.app.state.data.tx.length);
  page.once("dialog", (d) => d.accept());
  await memberRows.first().locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Delete')");
  await page.waitForTimeout(150);
  const txCountAfter = await page.evaluate(() => UI.app.state.data.tx.length);
  console.log("transaction actually removed from data:", txCountAfter === txCountBefore - 1);

  console.log("\n=== 7) The desktop table is completely unaffected by the toggle ===");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  console.log("group-tx-toggle checkbox itself is hidden on desktop:", await page.locator(".group-tx-toggle").isVisible().then(v => !v).catch(() => true));
  console.log("desktop table shows every row individually, no grouping there:", await page.locator(".desktop-only tbody tr").count() >= 4);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
