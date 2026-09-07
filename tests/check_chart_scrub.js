const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Dragging a finger across a bar chart (net-worth trend, Reports charts)
// scrubs through every bar's value live, like a stock app's price chart --
// not just a tap-per-bar tooltip. Reuses the exact same scroll-biased
// horizontal-vs-vertical classification check_swipe_actions.js already
// covers for swipe rows (see initChartScrub()'s own comment), so this
// mirrors that suite's test 10/11 shape for the same reason: an ordinary
// vertical scroll over a chart must never get mistaken for a scrub.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__dispatchTouch = (el, type, x, y) => {
      const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [touch], targetTouches: type === "touchend" ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
    };
    window.__vibrateCalls = [];
    Object.defineProperty(navigator, "vibrate", { value: (p) => { window.__vibrateCalls.push(p); return true; }, configurable: true });
  });
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => UI.toggleNwTrend());
  await page.waitForTimeout(200);

  const chart = page.locator(".chart-cols").first();
  const bars = chart.locator(".chart-bar");
  const n = await bars.count();
  console.log("=== 1) The expanded net-worth trend chart has multiple bars to scrub across ===");
  console.log("at least 3 bars present:", n >= 3);
  const box0 = await bars.nth(0).boundingBox();
  const boxLast = await bars.nth(n - 1).boundingBox();
  const y = box0.y + box0.height / 2;

  console.log("\n=== 2) A deliberate horizontal drag scrubs the tooltip across bars, showing each bar's own value ===");
  const firstLabel = await bars.nth(0).getAttribute("aria-label");
  const lastLabel = await bars.nth(n - 1).getAttribute("aria-label");
  await chart.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [box0.x + box0.width / 2, y]);
  // +15px: enough to clear the classification's own dead zone (locks
  // horizontal at dx > 12 with dy staying 0) but still well inside bar0's
  // own 35px width (17.5px either side of its center) so this genuinely
  // tests "still over the first bar", not an accidental hop to the next one.
  await chart.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x, y), [box0.x + box0.width / 2 + 15, y]);
  await page.waitForTimeout(30);
  const midTip = await page.locator("#chartTooltip").textContent();
  console.log("tooltip shows the first bar's own value while scrubbing over it:", midTip === firstLabel);
  await chart.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x, y), [boxLast.x + boxLast.width / 2, y]);
  await page.waitForTimeout(30);
  const endTip = await page.locator("#chartTooltip").textContent();
  console.log("tooltip updates to the last bar's own value once dragged there:", endTip === lastLabel);
  console.log("tooltip stayed visible throughout the drag (no flicker-hide):", await page.locator("#chartTooltip.show").count() === 1);

  console.log("\n=== 3) Crossing a bar during a scrub gives a tiny haptic tick ===");
  const vibrateCount = await page.evaluate(() => window.__vibrateCalls.length);
  console.log("navigator.vibrate was called while scrubbing across bars:", vibrateCount > 0);
  await chart.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));

  console.log("\n=== 4) An ordinary vertical scroll over the chart never triggers a scrub ===");
  // Same realistic-scroll-with-jitter shape as check_swipe_actions.js's own
  // test 10 -- an ambiguous first nudge, then a long, clearly-vertical drag.
  await page.evaluate(() => { document.getElementById("chartTooltip").classList.remove("show"); });
  const scy = box0.y + box0.height / 2;
  await chart.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [box0.x + box0.width / 2, scy]);
  for (const [ddx, ddy] of [[-8, -5], [-15, -40], [-25, -90], [-40, -160]]) {
    await chart.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x, y), [box0.x + box0.width / 2 + ddx, scy + ddy]);
  }
  await page.waitForTimeout(30);
  console.log("tooltip did NOT appear from a mostly-vertical scroll gesture:", await page.locator("#chartTooltip.show").count() === 0);
  await chart.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));

  console.log("\n=== 5) A plain tap on one bar still shows its tooltip (the pre-existing behavior, unchanged) ===");
  await page.evaluate(() => { document.getElementById("chartTooltip").classList.remove("show"); });
  await bars.nth(1).click();
  await page.waitForTimeout(30);
  const tapLabel = await bars.nth(1).getAttribute("aria-label");
  const tapTip = await page.locator("#chartTooltip").textContent();
  console.log("plain tap still shows that bar's own tooltip:", tapTip === tapLabel);

  console.log("\n=== 6) Scrubbing at a tall bar's Y correctly picks up a much SHORTER neighboring bar ===");
  // Real bug caught in review: the scrub used to find the crossed bar via
  // document.elementFromPoint(x, y) -- but .chart-bar sits bottom-aligned
  // inside its full-height .chart-col, so a short bar's own painted box
  // only covers the lower slice of the chart. Held at the Y of a TALL
  // neighboring bar (very common: one big month next to a near-zero one),
  // elementFromPoint over the short bar's column hits the empty column,
  // not the bar -- the scrub would silently freeze instead of picking up
  // the short bar. Build a synthetic 2-bar chart (one full-height, one
  // barely-there) to make this deterministic rather than hoping the real
  // seeded data happens to have that exact shape.
  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "scrubTestChart";
    el.innerHTML = '<div class="chart-cols" style="height:120px">' +
      '<div class="chart-col"><div class="chart-bar" aria-label="Tall: 1000" style="height:100%;width:70%"></div></div>' +
      '<div class="chart-col"><div class="chart-bar" aria-label="Short: 10" style="height:4px;width:70%"></div></div>' +
      "</div>";
    document.body.appendChild(el);
  });
  const synthChart = page.locator("#scrubTestChart .chart-cols");
  const cols = synthChart.locator(".chart-col");
  const tallBox = await cols.nth(0).boundingBox();
  const shortBox = await cols.nth(1).boundingBox();
  // Touch stays at the TALL bar's Y (near the top of the chart) the whole
  // time -- exactly where a short bar's own box would never reach.
  const tallY = tallBox.y + 10;
  await synthChart.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [tallBox.x + tallBox.width / 2, tallY]);
  await synthChart.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x, y), [tallBox.x + tallBox.width / 2 + 15, tallY]);
  await synthChart.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x, y), [shortBox.x + shortBox.width / 2, tallY]);
  await page.waitForTimeout(30);
  const synthTip = await page.locator("#chartTooltip").textContent();
  console.log("scrub picks up the short bar's own value even at the tall bar's Y:", synthTip === "Short: 10");
  await synthChart.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
