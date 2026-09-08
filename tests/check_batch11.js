const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// A small two-item batch: a real missing feature and a real bug, both
// spotted while sweeping the screens that hadn't had a "Recut" pass yet
// (Savings Goals, Settings' custom categories).

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Savings Goals: a reached goal now collapses into its own section ===");
  // Real gap fix, same pattern already applied to Installments (#53) and
  // Savings groups: a reached goal used to stay inline forever, sorted
  // purely by its now-moot due date -- an old finished goal with an early
  // due date could sit at the very top, crowding out what's still active.
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Savings goals')"); await page.waitForTimeout(200);
  console.log("no 'reached' toggle yet (seed data has no completed goal):", await page.locator("button", { hasText: "reached" }).count() === 0);
  await page.evaluate(() => {
    const app = UI.app, d = app.state.data;
    const acc = d.accounts[0];
    d.savingsGoals.push({ id: "g_test_done", name: "Test Done Goal", target: 100, due: null, accountId: acc.id, baseline: acc.opening, color: "#2a9d8f", created: app.today() });
    acc.opening += 500; // pushes this goal's own saved total past its target
    app.persist(d, "test setup");
    UI.render();
  });
  await page.waitForTimeout(200);
  console.log("a reached goal is collapsed behind a '1 reached' toggle by default:", await page.locator("button", { hasText: "1 reached" }).count() === 1);
  console.log("it is NOT sitting inline in the active list:", await page.locator(".card-row", { hasText: "Test Done Goal" }).count() === 0);
  await page.locator("button", { hasText: "reached" }).click();
  await page.waitForTimeout(150);
  console.log("expanding reveals it under a 'Reached' heading:", await page.locator(".section-title", { hasText: "Reached" }).count() === 1 && await page.locator(".card-row", { hasText: "Test Done Goal" }).count() === 1);
  console.log("navigating away and back re-collapses it (transient view state, same as Installments/Groups):", await (async () => {
    await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(150);
    await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
    await page.click(".sheet-item:has-text('Savings goals')"); await page.waitForTimeout(200);
    return page.locator("button", { hasText: "1 reached" }).count();
  })() === 1);

  console.log("\n=== 2) Settings: deleting a custom category now warns when it's actually in use ===");
  // Real bug fix: this used to be a plain "Delete X?" regardless of
  // whether the category was still referenced by a transaction or a
  // budget -- deleteCategory() itself never blocks (a category is a
  // free-text label, not an id anything depends on), so nothing ever told
  // the user they'd lose the ability to re-pick this exact category until
  // they ran into it later editing one of those entries.
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  await page.fill("#newExpenseCat", "TestCat");
  await page.click("button:has-text('Add')");
  await page.waitForTimeout(150);
  console.log("new category added:", await page.locator("span.pill", { hasText: "TestCat" }).count() === 1);

  let dialogMsgs = [];
  page.on("dialog", d => { dialogMsgs.push(d.message()); d.dismiss(); });
  await page.click("span.pill:has-text('TestCat') button.danger");
  await page.waitForTimeout(150);
  console.log("an unused category still gets the plain 'Delete X?' confirm, nothing extra:", dialogMsgs.length === 1 && dialogMsgs[0] === "Delete TestCat?");
  console.log("dismissing the confirm keeps it (nothing deleted yet):", await page.locator("span.pill", { hasText: "TestCat" }).count() === 1);

  await page.selectOption("#budgetCat", "TestCat");
  await page.fill("#budgetAmt", "500");
  await page.click("button:has-text('Set budget')");
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const app = UI.app, d = app.state.data;
    d.tx.push({ id: "tx_testcat", date: app.today(), type: "expense", amount: 10, accountId: d.accounts[0].id, category: "TestCat", desc: "test", created: app.today() });
    app.persist(d, "test setup");
    UI.render();
  });
  await page.waitForTimeout(150);
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  dialogMsgs = [];
  await page.click("span.pill:has-text('TestCat') button.danger");
  await page.waitForTimeout(150);
  console.log("once it's in use (a transaction + a budget), the confirm now names both:", dialogMsgs.length === 1 && dialogMsgs[0].includes("1 transaction") && dialogMsgs[0].includes("budget"));
  console.log("dismissing still keeps everything untouched:", await page.locator("span.pill", { hasText: "TestCat" }).count() === 1 && await page.locator(".card-row", { hasText: "TestCat" }).count() === 1);

  await page.evaluate(() => (window.confirm = () => true)); // accept for the real delete below
  await page.click("span.pill:has-text('TestCat') button.danger");
  await page.waitForTimeout(150);
  console.log("accepting the warning actually removes it from the picker:", await page.locator("span.pill", { hasText: "TestCat" }).count() === 0);
  console.log("...but the existing transaction/budget keep the category name (nothing retroactively touched):", await page.locator(".card-row", { hasText: "TestCat" }).count() === 1);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
