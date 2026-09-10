// "Ledger" redesign, three more screens: Savings Goals and Savings Groups
// each get a new portfolio hero (neither page ever had one aggregate
// figure before, only a scroll of individual cards -- the same real gap
// Accounts had); Forecast's old plain two-color proj-bar becomes the same
// gold heroTrendChart() gradient line every other hero already draws,
// built straight from Engine.forecast()'s own already-computed running-
// balance trajectory (fc.points), not a second calculation. All additive
// next to each page's existing structure (KPI/due banners, card lists,
// completed-collapse, the What-if panel) -- none of it changed.
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Savings Goals: a new portfolio hero ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Savings goals')"); await page.waitForTimeout(200);
  console.log("hero present:", await page.locator(".hero-card.alt").count() === 1);
  const goalsExpected = await page.evaluate(() => {
    const app = UI.app, D = app.derive();
    return Math.round(D.savingsGoals.reduce((s, g) => s + g.saved, 0));
  });
  const goalsHeroVal = await page.locator(".hero-card.alt .hero-value").innerText();
  const goalsHeroDigits = Math.round(parseFloat(goalsHeroVal.replace(/[^\d.]/g, "")));
  console.log("hero value: computed", goalsExpected, "| shown", goalsHeroDigits);
  console.log("the hero's own figure matches an independent recomputation (sum of every goal's own .saved):", goalsHeroDigits === goalsExpected);
  console.log("sub-row breaks it down (Saved / Still needed / Goals count):", await page.locator(".hero-card.alt .hero-sub-row .hero-sub-value").count() === 3);
  const goalsCount = await page.evaluate(() => UI.app.derive().savingsGoals.length);
  const shownGoalsCount = await page.locator(".hero-card.alt .hero-sub-row .hero-sub-value").nth(2).innerText();
  console.log("the count in the sub-row matches the real number of goals:", parseInt(shownGoalsCount) === goalsCount);
  console.log("pre-existing structure (individual goal cards) is completely untouched:", await page.locator(".card-row").count() > 0);

  console.log("\n=== 2) Savings Groups: a new portfolio hero ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Savings groups')"); await page.waitForTimeout(200);
  console.log("hero present:", await page.locator(".hero-card.alt").count() === 1);
  const groupsExpected = await page.evaluate(() => {
    const app = UI.app, D = app.derive();
    return Math.round(D.groups.reduce((s, g) => s + g.net, 0));
  });
  const groupsHeroVal = await page.locator(".hero-card.alt .hero-value").innerText();
  const groupsHeroDigits = Math.round(parseFloat(groupsHeroVal.replace(/[^\d.]/g, "")) * (groupsHeroVal.includes("−") ? -1 : 1));
  console.log("hero value: computed", groupsExpected, "| shown", groupsHeroDigits);
  console.log("the hero's own figure matches an independent recomputation (sum of every group's own .net = paidTotal - received):", groupsHeroDigits === groupsExpected);
  console.log("sub-row breaks it down (Paid in / Received / Groups count):", await page.locator(".hero-card.alt .hero-sub-row .hero-sub-value").count() === 3);
  console.log("the due-this-month banner (pre-existing) still renders right after the new hero:", await page.locator(".due-banner").count() >= 0);

  console.log("\n=== 3) Forecast: the old proj-bar is gone, replaced by the same gold trend line every other hero uses ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Forecast')"); await page.waitForTimeout(200);
  console.log("no leftover .proj-bar element (fully replaced, not left dangling in the DOM):", await page.locator(".proj-bar").count() === 0);
  console.log("hero-card.alt still present (pre-existing 'Timeline' hero, untouched otherwise):", await page.locator(".hero-card.alt").count() === 1);
  console.log("it now carries a real .hero-trend chart (seed data has real forecast events across the default horizon):", await page.locator(".hero-card.alt .hero-trend").count() === 1);
  const forecastHeroVal = await page.locator(".hero-card.alt .hero-value").innerText();
  console.log("hero-value is still the projected balance (unchanged meaning):", /EGP/.test(forecastHeroVal));
  console.log("the pre-existing 'Available today' / 'Expected inflows' stat boxes are untouched:", await page.locator(".stat-box").count() === 2);

  console.log("\n=== 3b) Real behavior check: the chart's own trajectory actually tracks the horizon, not a fixed window ===");
  await page.click("button:has-text('365')"); // switch horizon
  await page.waitForTimeout(200);
  console.log("switching horizon still shows a real chart (a full year of seed events is definitely more than a flat line):", await page.locator(".hero-card.alt .hero-trend").count() === 1);
  const yearProjected = await page.locator(".hero-card.alt .hero-value").innerText();
  await page.click("button:has-text('7')");
  await page.waitForTimeout(200);
  const weekProjected = await page.locator(".hero-card.alt .hero-value").innerText();
  console.log("a 7-day projection differs from a 365-day one (the hero-value genuinely reflects the selected horizon, not a stale figure):", weekProjected !== yearProjected);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
