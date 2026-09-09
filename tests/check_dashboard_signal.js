// Dashboard "Signal" redesign: the chart-forward hero trend + delta chip,
// the proportional "where my money is" stacked bar, and the diverging
// income/expense bar under "This month" -- all new, additive visuals; every
// pre-existing element they sit alongside (hero-value's own text/sparkline,
// the tile grid, the category bars, the budget ring...) stays exactly where
// it was, still tested by the rest of this suite.
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Hero chart + delta chip render on the seed data (real history, a real trend) ===");
  console.log("hero-value text still there and unaffected:", (await page.locator(".hero-value").first().innerText()).length > 0);
  console.log("small .sparkline still inside .hero-value (unrelated to the new chart, must survive untouched):", await page.locator(".hero-value .sparkline").count() === 1);
  console.log("new .hero-trend chart present:", await page.locator(".hero-chart-wrap svg.hero-trend").count() === 1);
  const chipCount = await page.locator(".delta-chip").count();
  console.log("delta chip present:", chipCount === 1);
  if (chipCount) {
    const chipText = await page.locator(".delta-chip").innerText();
    console.log("chip reads a signed percentage:", /^[+−-]?\d/.test(chipText.replace(/\s/g, "")));
  }

  console.log("\n=== 2) 'Where my money is' -- stacked bar sits ABOVE the untouched tile grid ===");
  console.log("stack card present:", await page.locator(".stack-card").count() === 1);
  const segCount = await page.locator(".stack-seg").count();
  const legendCount = await page.locator(".legend-row").count();
  console.log("stack segments match legend rows (one per positive bucket):", segCount === legendCount && segCount > 0);
  const segWidths = await page.locator(".stack-seg").evaluateAll(els => els.map(el => parseFloat(el.style.width)));
  const widthSum = segWidths.reduce((s, w) => s + w, 0);
  console.log("segment widths sum to ~100%:", Math.abs(widthSum - 100) < 0.5);
  console.log("tile grid (unaffected, same 9 tiles) still there:", await page.locator(".tile-grid .pos-tile").count() === 9);
  console.log("the 3 derived-total alt tiles still have no icon (untouched by this redesign):", await page.locator(".pos-tile.alt .tile-ico").count() === 0);

  console.log("\n=== 3) 'This month' -- diverging bar sits between the stat boxes and the budget/category bars, all untouched ===");
  console.log("diverge bar present:", await page.locator(".diverge").count() === 1);
  const divWidths = await page.locator(".div-in, .div-out").evaluateAll(els => els.map(el => parseFloat(el.style.width)));
  console.log("div-in + div-out widths sum to ~100%:", Math.abs(divWidths.reduce((s, w) => s + w, 0) - 100) < 0.5);
  console.log("category bars (.bar-list, untouched) still there:", await page.locator(".bar-list .bar-row").count() > 0);

  console.log("\n=== 4) Real bug caught in review: a zero (or negative) starting balance must hide the delta chip, not show a huge/nonsense percentage ===");
  // Every account carries its own static opening balance independent of
  // any transaction date, so simply wiping tx doesn't zero out a *past*
  // derive() point the way it would zero out only the CURRENT balance --
  // the reliable way to force the exact boundary this guard exists for is
  // to stub Engine.derive() itself: real value for "now", forced to
  // exactly 0 for every older weekly point (still leaves a real, non-flat
  // 0->real shape for heroTrendChart() to draw).
  await page.evaluate(() => {
    const real = UI.app.derive.bind(UI.app);
    UI.app.derive = (cutoff) => {
      const r = real(cutoff);
      const daysAgo = (Date.now() - new Date(cutoff)) / 86400000;
      if (daysAgo > 3) r.available = 0;
      return r;
    };
    UI.render();
  });
  await page.waitForTimeout(150);
  console.log("chart still draws (a real 0 -> 5000 shape, not flat):", await page.locator(".hero-chart-wrap svg.hero-trend").count() === 1);
  console.log("delta chip is hidden, not showing a nonsense percentage off a zero baseline:", await page.locator(".delta-chip").count() === 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
