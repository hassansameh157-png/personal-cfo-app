const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Manual category pick survives typing a matching description afterward ===");
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.selectOption("#f_category", "Shopping");
  console.log("category set to Shopping:", await page.locator("#f_category").inputValue());
  // "Family — day to day" matches seed data whose category is "Family" --
  // suggestCategory would return "Family" for this text.
  await page.fill("#f_desc", "Family — day to day");
  await page.waitForTimeout(150);
  console.log("category AFTER typing a Family-matching description (should stay Shopping):", await page.locator("#f_category").inputValue());
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 2) Editing an existing expense: category never flips just from touching description ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Car — day to day"); await page.waitForTimeout(200);
  const carRow = page.locator(".card-row", { hasText: "Car — day to day" }).first();
  await carRow.locator("button:has-text('Edit')").click(); await page.waitForTimeout(200);
  const catBefore = await page.locator("#f_category").inputValue();
  console.log("category before any edit:", catBefore);
  await page.fill("#f_desc", "Car — day to day (toll)");
  await page.waitForTimeout(150);
  console.log("category after editing description (should be unchanged):", await page.locator("#f_category").inputValue());
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 3) Duplicate: copied category survives editing the description ===");
  await page.fill("#txSearch", "Car — day to day"); await page.waitForTimeout(200);
  const carRow2 = page.locator(".card-row", { hasText: "Car — day to day" }).first();
  await carRow2.locator("button:has-text('Duplicate')").click(); await page.waitForTimeout(200);
  const dupCatBefore = await page.locator("#f_category").inputValue();
  console.log("duplicated category:", dupCatBefore);
  await page.fill("#f_desc", "Car — day to day, again");
  await page.waitForTimeout(150);
  console.log("category after editing duplicate's description (should be unchanged):", await page.locator("#f_category").inputValue());
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 4) Autocomplete still works for a genuinely fresh, untouched entry ===");
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  const freshDefault = await page.locator("#f_category").inputValue();
  await page.fill("#f_desc", "Family — day to day");
  await page.waitForTimeout(150);
  const suggested = await page.locator("#f_category").inputValue();
  console.log("default before typing:", freshDefault, "| suggested after typing a Family-matching desc:", suggested, "| actually suggested something:", suggested === "Family");
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 5) Quick add chip's remembered category also survives an edit ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const chip = page.locator(".pill").first();
  const chipCount = await chip.count();
  console.log("quick-add chip present:", chipCount > 0);
  if (chipCount) {
    await chip.click(); await page.waitForTimeout(200);
    const chipCat = await page.locator("#f_category").inputValue();
    console.log("chip's pre-filled category:", chipCat);
    await page.fill("#f_desc", (await page.locator("#f_desc").inputValue()) + " x2");
    await page.waitForTimeout(150);
    console.log("category after editing chip's description (should be unchanged):", await page.locator("#f_category").inputValue());
    await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);
  }

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
