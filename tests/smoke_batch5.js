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

  console.log("=== 1) Credit cards render as card tiles, in their own color ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  // wallet/cash/ecard also share .credit-card-tile (as .balance-tile) now
  // -- scope to actual debt cards for this check.
  const tileCount = await page.locator(".credit-card-tile:not(.balance-tile)").count();
  console.log("credit-card-tile count (seed has 3 cards):", tileCount);
  const firstTile = page.locator(".credit-card-tile:not(.balance-tile)").first();
  console.log("tile shows Outstanding/Limit:", await firstTile.locator(".cc-label").allTextContents());

  console.log("\n=== 2) Edit account color, tile updates ===");
  await firstTile.locator("button:has-text('Edit')").click(); await page.waitForTimeout(200);
  console.log("color field present:", await page.locator("#f_color").count() > 0);
  await page.evaluate(() => { document.getElementById("f_color").value = "#c8102e"; });
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  // Background/color moved from .credit-card-tile itself to .cc-face-front
  // (front/back flip faces) when the card-flip feature shipped.
  const tileStyle = await page.locator(".credit-card-tile:not(.balance-tile)").first().locator(".cc-face-front").getAttribute("style");
  console.log("tile background reflects new color:", tileStyle.includes("c8102e"));

  console.log("\n=== 3) Tap category bar -> filters Transactions ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const firstBar = page.locator(".bar-row").first();
  const catName = (await firstBar.locator(".bar-name").innerText()).trim();
  await firstBar.click(); await page.waitForTimeout(200);
  console.log("navigated to Transactions:", await page.locator(".tab-title").innerText());
  // Fixed real bug (a user reported it): this used to reuse the free-text
  // search (#txSearch) for a category-bar tap, which matched any row
  // whose DESCRIPTION merely contained the category's name as a
  // substring, regardless of its actual category field. Now a dedicated
  // exact-match select (see Engine.state.filt.category).
  console.log("category filter select set to the tapped category:", await page.locator(".filter-row select").nth(3).inputValue() === catName);

  console.log("\n=== 4) Month vs last month badge ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const badgeText = await page.locator(".stat-box").first().innerText();
  console.log("income stat box text (should include 'vs last month' or be silent if no prior data):", badgeText.replace(/\n/g, " | "));

  console.log("\n=== 5) Tags on expense ===");
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "77");
  await page.fill("#f_desc", "Trip lunch");
  await page.fill("#f_tags", "trip, food");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", ""); await page.waitForTimeout(150);
  // Clear leftover category filter from step 3 too -- that tap now sets a
  // real category filter (see the fix note in step 3 above), a separate
  // field from #txSearch, so clearing the search box alone doesn't reset it.
  await page.locator(".filter-row select").nth(3).selectOption("all"); await page.waitForTimeout(200);
  const tripRow = page.locator(".card-row", { hasText: "Trip lunch" }).first();
  console.log("tag chips shown:", await tripRow.locator(".pill-row button").allTextContents());
  await tripRow.locator(".pill-row button", { hasText: "trip" }).click();
  await page.waitForTimeout(200);
  console.log("tapping tag filters search:", await page.locator("#txSearch").inputValue());
  console.log("filtered rows include the tagged one:", await page.locator(".card-row", { hasText: "Trip lunch" }).count() > 0);

  console.log("\n=== 6) Duplicate transaction ===");
  const beforeCount = await page.locator(".card-row").count();
  await page.locator(".card-row", { hasText: "Trip lunch" }).first().locator("button:has-text('Duplicate')").click();
  await page.waitForTimeout(200);
  console.log("modal opened with title:", await page.locator(".dialog-title").innerText());
  console.log("desc pre-filled:", await page.locator("#f_desc").inputValue());
  console.log("date reset to today:", await page.locator("#f_date").inputValue());
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Trip lunch"); await page.waitForTimeout(200);
  const dupCount = await page.locator(".card-row", { hasText: "Trip lunch" }).count();
  console.log("now two 'Trip lunch' rows exist (original + duplicate):", dupCount === 2);

  console.log("\n=== 7) Payoff calculator ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Receivables')"); await page.waitForTimeout(200);
  const calcPresent = await page.locator("h2:has-text('Payoff calculator')").count() > 0;
  console.log("calculator section present:", calcPresent);
  if (calcPresent) {
    await page.fill("#payoffCalcAmt", "5000");
    await page.waitForTimeout(200);
    const resultText = await page.locator("p.pos-value", { hasText: "months" }).innerText().catch(() => "NONE");
    console.log("result text:", resultText);
  }

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
