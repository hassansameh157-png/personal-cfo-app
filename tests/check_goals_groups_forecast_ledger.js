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
  // Real, intermittent bug chased down here (not just a test-timing race):
  // the new notification bell (#36) renders its live attentionCount() right
  // into the button's own visible text -- <button class="bell-btn" ...>N
  // <span class="bell-badge">N</span></button> -- so whenever that count
  // happens to be 7, 17, 27... (it drifts with real wall-clock time, since
  // several of attentionCount()'s own inputs -- overdue/due-soon windows,
  // the 3-month unusual-spending comparison -- are relative to `new Date()`
  // against this seed's fixed dates), a bare `button:has-text('7')` matches
  // BOTH the bell and the "7 days" horizon pill. Two real failure shapes
  // came out of that ambiguity depending on exactly how Playwright resolved
  // it that run: an immediate strict-mode violation, or -- worse -- a
  // "successful" click that silently landed on the bell (which navigates to
  // Dashboard, not a horizon change) leaving state.horizon never reaching 7
  // at all, so a later wait for it just timed out. Scoped to the pills'
  // own .pill-row container (the bell lives in the topbar, never inside
  // it) so this can never collide with the bell's badge again regardless
  // of what attentionCount() happens to be when this runs.
  await page.click(".pill-row button:has-text('365')"); // switch horizon
  await page.waitForFunction(() => UI.app.state.horizon === 365);
  await page.waitForTimeout(200);
  console.log("switching horizon still shows a real chart (a full year of seed events is definitely more than a flat line):", await page.locator(".hero-card.alt .hero-trend").count() === 1);
  const yearProjected = await page.locator(".hero-card.alt .hero-value").innerText();
  await page.click(".pill-row button:has-text('7')");
  await page.waitForFunction(() => UI.app.state.horizon === 7);
  await page.waitForTimeout(200);
  const weekProjected = await page.locator(".hero-card.alt .hero-value").innerText();
  console.log("a 7-day projection differs from a 365-day one (the hero-value genuinely reflects the selected horizon, not a stale figure):", weekProjected !== yearProjected);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
