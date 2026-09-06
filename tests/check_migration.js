const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Seed real data under a synthetic "legacy" key (standing in for
  // whatever a real future key bump would call "pcfo.v7"), and put
  // nothing under a synthetic "current" key -- simulating a user who
  // still has real data under an old version's key, on a build that's
  // moved on to a new one.
  await page.addInitScript(() => {
    const legacyData = {
      accounts: [{ id: "acc-legacy", name: "Legacy Test Account", type: "bank", opening: 999, active: true, color: "#7d7979" }],
      people: [], tx: [{ id: "t-legacy", type: "expense", category: "Food", amount: 42, date: "2024-01-01", desc: "Migrated transaction", accountId: "acc-legacy", void: false }],
      plans: [], groups: [], cardStatements: [], savingsGoals: [], investments: [], recurring: [],
      customCategories: { income: [], expense: [] }, budgets: {}, audit: []
    };
    localStorage.setItem("pcfo.v6-test", JSON.stringify(legacyData));
  });
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== Simulate a future version bump: storageKey='pcfo.v7-test', legacy=['pcfo.v6-test'] ===");
  await page.evaluate(() => {
    Engine.prototype.storageKey = () => "pcfo.v7-test";
    Engine.prototype.legacyStorageKeys = () => ["pcfo.v6-test"];
    // Re-run load() against the patched keys, as if this were a fresh
    // app start on the "new" version.
    UI.app.load();
    UI.render();
  });
  await page.waitForTimeout(300);

  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  console.log("legacy account visible after migration:", await page.locator("text=Legacy Test Account").count() > 0);
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Migrated transaction"); await page.waitForTimeout(150);
  console.log("legacy transaction visible after migration:", await page.locator(".card-row", { hasText: "Migrated transaction" }).count() > 0);

  const migratedForward = await page.evaluate(() => !!localStorage.getItem("pcfo.v7-test"));
  console.log("data promoted forward to the new current key:", migratedForward);
  const oldStillThere = await page.evaluate(() => !!localStorage.getItem("pcfo.v6-test"));
  console.log("old legacy key left untouched (not deleted):", oldStillThere);
  console.log("loadError NOT set for a clean migration:", await page.evaluate(() => UI.app.state.loadError) === false);

  console.log("\n=== A genuinely fresh install (no legacy data anywhere) still gets demo data ===");
  await page.evaluate(() => {
    localStorage.removeItem("pcfo.v6-test");
    localStorage.removeItem("pcfo.v7-test");
    UI.app.load();
    UI.render();
  });
  await page.waitForTimeout(200);
  console.log("demo seed data loaded (not blank/broken):", (await page.locator(".navbtn").count()) > 0);
  console.log("no false loadError on a genuine fresh install:", await page.evaluate(() => UI.app.state.loadError) === false);

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
