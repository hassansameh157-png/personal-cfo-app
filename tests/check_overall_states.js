const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(400);
  // Dashboard Recut #25 collapses Needs Attention to its first 3 cards --
  // this script re-renders in place (UI.render(), never UI.setPage()) so
  // setting this once up front holds for every check below, same as
  // clicking the real "+N more" button would, without needing that button
  // to exist yet at each of the three budget states being simulated.
  await page.evaluate(() => { UI._needsAttentionExpanded = true; });

  // Set a very low overall budget so this month's real expenses blow past it -> "over"
  await page.evaluate(() => UI.app.setOverallBudget(100));
  await page.evaluate(() => UI.render());
  await page.waitForTimeout(200);
  console.log("=== OVER state ===");
  console.log("overall-budget classes:", await page.locator(".overall-budget").getAttribute("class"));
  console.log("Needs Attention has 'Over your overall budget':", await page.locator(".alert-card", { hasText: "Over your overall budget" }).count());
  const overSevClass = await page.locator(".alert-card", { hasText: "Over your overall budget" }).getAttribute("class").catch(()=>"n/a");
  console.log("that alert's class (should include sev-neg):", overSevClass);
  await page.screenshot({ path: "shot_ov_over.png", fullPage: true });

  // Set a budget right around 90-100% of current spend -> "near"
  const spend = await page.evaluate(() => {
    const app = UI.app;
    const map = app.monthCategorySpend();
    return Object.values(map).reduce((s,v)=>s+v,0);
  });
  const nearBudget = Math.ceil(spend / 0.95);
  await page.evaluate((b) => UI.app.setOverallBudget(b), nearBudget);
  await page.evaluate(() => UI.render());
  await page.waitForTimeout(200);
  console.log("\n=== NEAR state (budget=" + nearBudget + ", spend=" + spend + ") ===");
  console.log("overall-budget classes:", await page.locator(".overall-budget").getAttribute("class"));
  console.log("Needs Attention has 'Near your overall budget':", await page.locator(".alert-card", { hasText: "Near your overall budget" }).count());
  await page.screenshot({ path: "shot_ov_near.png", fullPage: true });

  // Clear it -> section disappears
  await page.evaluate(() => UI.app.setOverallBudget(0));
  await page.evaluate(() => UI.render());
  await page.waitForTimeout(200);
  console.log("\n=== CLEARED state ===");
  console.log("overall-budget bar present (should be 0):", await page.locator(".overall-budget").count());
  console.log("Needs Attention overall-budget alert present (should be 0):", await page.locator(".alert-card", { hasText: "your overall budget" }).count());

  await browser.close();
})();
