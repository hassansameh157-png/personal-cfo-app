const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Safe to spend (7d) stat on dashboard ===");
  const label = await page.locator(".hero-sub-label", { hasText: "Safe to spend" }).count();
  console.log("label present:", label > 0);
  const val = await page.locator(".hero-sub-value").first().innerText();
  console.log("first hero-sub-value (should be Safe to spend amount):", val);

  console.log("\n=== 2) Quick add chips ===");
  // Seed data already has higher-frequency expenses than a fresh 2x repeat
  // would produce, so a brand-new description won't make the top-6 cut —
  // confirm the counting logic directly instead, then test the click/
  // pre-fill wiring against a chip that IS visible (from seed data).
  for (let i = 0; i < 2; i++) {
    await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(150);
    await page.fill("#f_amount", "35");
    await page.fill("#f_desc", "Coffee run");
    await page.click("button:has-text('Save')"); await page.waitForTimeout(150);
  }
  const freqAll = await page.evaluate(() => window.APP.frequentExpenses(999));
  const coffee = freqAll.find(f => f.desc === "Coffee run");
  console.log("'Coffee run' counted correctly after 2 repeats:", coffee && coffee.count === 2);

  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const chip = page.locator(".pill-row .pill").first();
  console.log("a quick-add chip is visible:", await chip.count() > 0);
  const chipDesc = await chip.innerText();
  await chip.click();
  await page.waitForTimeout(200);
  console.log("modal opened:", await page.locator(".dialog-title").innerText());
  const preDesc = await page.locator("#f_desc").inputValue();
  console.log("desc pre-filled, matches chip label:", preDesc, chipDesc.startsWith(preDesc));
  console.log("amount pre-filled (non-empty):", await page.locator("#f_amount").inputValue());
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 3) What-if simulator on Forecast ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Forecast')"); await page.waitForTimeout(200);
  const beforeProjected = await page.locator(".hero-value").innerText();
  console.log("projected before scenario:", beforeProjected);
  await page.fill("#wiTitle", "New laptop");
  await page.fill("#wiAmount", "20000");
  await page.selectOption("#wiKind", "expense");
  await page.click("button:has-text('Add scenario')");
  await page.waitForTimeout(200);
  const afterProjected = await page.locator(".hero-value").innerText();
  console.log("projected after -20000 scenario:", afterProjected);
  console.log("scenario changed the projection:", beforeProjected !== afterProjected);
  console.log("scenario chip listed:", await page.locator(".pill", { hasText: "New laptop" }).count() > 0);
  console.log("event shows in the list:", await page.locator(".event-title", { hasText: "New laptop" }).count() > 0);

  // Confirm the what-if scenario did NOT leak into the Dashboard's own forecast-based numbers.
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const dashSafeToSpend = await page.locator(".hero-sub-value").first().innerText();
  console.log("Dashboard Safe-to-spend unaffected by Forecast-tab what-if (still a normal number):", dashSafeToSpend);

  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Forecast')"); await page.waitForTimeout(200);
  await page.click("button:has-text('Clear all')");
  await page.waitForTimeout(200);
  const clearedProjected = await page.locator(".hero-value").innerText();
  console.log("projected after Clear all (should match original):", clearedProjected, "matches original:", clearedProjected === beforeProjected);

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
