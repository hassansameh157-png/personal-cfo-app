const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (d) => { errors.push("UNEXPECTED DIALOG: " + d.message()); await d.dismiss(); });
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Card back shows newest transactions, not oldest ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  const tile = page.locator(".credit-card-tile:not(.balance-tile)").first();
  await tile.locator(".cc-flip-btn").first().click(); await page.waitForTimeout(500);
  const backDates = await tile.locator(".cc-back-row-sub").allTextContents();
  console.log("back rows dates (should be descending / most recent first):", backDates);
  const sorted = [...backDates].sort().reverse();
  console.log("dates are in descending order:", JSON.stringify(backDates) === JSON.stringify(sorted));

  console.log("\n=== 2) XSS injection via card statement period field ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')").catch(async () => {
    await page.click(".sheet-item:has-text('Statements')").catch(()=>{});
  });
  await page.waitForTimeout(200);
  console.log("page title:", await page.locator(".tab-title").innerText().catch(()=>"?"));
  // find "Add statement" style button
  const addBtn = page.locator("button:has-text('Add')").first();
  if (await addBtn.count()) {
    await addBtn.click(); await page.waitForTimeout(200);
    const periodField = page.locator("#f_period");
    if (await periodField.count()) {
      await periodField.fill("x\\');alert(document.cookie);//");
      await page.selectOption("#f_accountId", { index: 0 }).catch(()=>{});
      await page.fill("#f_amount", "500").catch(()=>{});
      await page.click("button:has-text('Save')").catch(()=>{});
      await page.waitForTimeout(300);
    } else {
      console.log("no #f_period field found on this form -- skipping direct-form injection test");
    }
  }
  console.log("dialogs/errors triggered so far:", errors.length ? errors : "none");

  console.log("\n=== 3) Tooltip clears on page navigation ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Reports')"); await page.waitForTimeout(200);
  const bar = page.locator(".chart-bar").first();
  await bar.click(); await page.waitForTimeout(150);
  console.log("tooltip shown after tap:", (await page.locator("#chartTooltip.show").count()) > 0);
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  console.log("tooltip cleared after navigating away:", (await page.locator("#chartTooltip.show").count()) === 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
