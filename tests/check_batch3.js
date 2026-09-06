const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Card flip ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  const tile = page.locator(".credit-card-tile:not(.balance-tile)").first();
  console.log("flip button present:", await tile.locator(".cc-flip-btn").count() > 0);
  const flipEl = tile.locator(".cc-flip");
  const flippedBefore = (await flipEl.getAttribute("class")).includes("flipped");
  await tile.locator(".cc-flip-btn").first().click();
  await page.waitForTimeout(500);
  const flippedAfter = (await flipEl.getAttribute("class")).includes("flipped");
  console.log("flip toggled:", flippedBefore === false && flippedAfter === true);
  console.log("back face shows recent activity title:", await tile.locator(".cc-back-title").count() > 0);
  await page.screenshot({ path: "shot_flip.png" });

  console.log("\n=== 2) Chart tooltip ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const bar = page.locator(".chart-bar, .bar-row").first();
  // "This month" bars are .bar-row (catBar), not .chart-bar -- go to Reports for a real .chart-bar
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Reports')"); await page.waitForTimeout(200);
  const chartBar = page.locator(".chart-bar").first();
  console.log("chart-bar present:", await chartBar.count() > 0);
  await chartBar.click(); await page.waitForTimeout(150);
  const tipVisible = await page.locator("#chartTooltip.show").count();
  console.log("tooltip shows after tap:", tipVisible > 0);
  console.log("tooltip text:", await page.locator("#chartTooltip").innerText());
  await page.screenshot({ path: "shot_tooltip.png" });
  await page.waitForTimeout(2600);
  console.log("tooltip auto-hides after 2.5s:", (await page.locator("#chartTooltip.show").count()) === 0);

  console.log("\n=== 3) Expandable sparkline ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const sparkTrigger = page.locator(".spark-trigger");
  console.log("spark-trigger present:", await sparkTrigger.count() > 0);
  console.log("nwTrendExpand hidden before tap:", !(await page.locator("#nwTrendExpand.show").count()));
  await sparkTrigger.click(); await page.waitForTimeout(300);
  console.log("nwTrendExpand shown after tap:", (await page.locator("#nwTrendExpand.show").count()) > 0);
  console.log("trend chart bars count:", await page.locator("#nwTrendExpand .chart-bar").count());
  await page.screenshot({ path: "shot_sparkline_expand.png" });
  await sparkTrigger.click(); await page.waitForTimeout(300);
  console.log("nwTrendExpand hidden again after 2nd tap:", !(await page.locator("#nwTrendExpand.show").count()));

  console.log("\n=== 4) Privacy mode hides tooltip amount ===");
  await page.click(".navbtn:has-text('Settings')").catch(()=>{});
  // toggle privacy via Dashboard eye icon if present, else via keyboard shortcut in app? check for a privacy toggle button
  const privacyBtn = page.locator("[aria-label*='rivacy'], [aria-label*='Hide'], .privacy-toggle");
  console.log("privacy toggle candidates:", await privacyBtn.count());

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
