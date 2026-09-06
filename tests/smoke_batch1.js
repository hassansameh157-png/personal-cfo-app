const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  console.log("=== 1) Icon shortcut deep link (?action=expense) opens the Add Expense modal ===");
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html") + "?action=expense");
  await page.waitForTimeout(300);
  console.log("dialog title:", await page.locator(".dialog-title").innerText().catch(() => "NONE"));
  console.log("query string cleared after open:", (await page.evaluate(() => location.search)) === "");
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 2) ?action=income opens Add Income ===");
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html") + "?action=income");
  await page.waitForTimeout(300);
  console.log("dialog title:", await page.locator(".dialog-title").innerText().catch(() => "NONE"));
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 3) Category auto-suggest ===");
  // Post one expense with a description + category first.
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "50");
  await page.selectOption("#f_category", "Entertainment");
  await page.fill("#f_desc", "Netflix subscription");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  // Now start a new expense with a similar description and see if category auto-fills.
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_desc", "Netflix");
  await page.waitForTimeout(150);
  const suggested = await page.locator("#f_category").inputValue();
  console.log("category auto-suggested from similar past description (expect Entertainment):", suggested);
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 4) Person detail page ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  const firstPersonName = await page.locator(".card-list.mobile-only .card-row-title").first().innerText();
  await page.locator(".card-list.mobile-only .card-row-title").first().click();
  await page.waitForTimeout(200);
  console.log("navigated to person detail for:", await page.locator(".tab-title").innerText());
  console.log("People nav still highlighted:", await page.locator(".navbtn.on span", { hasText: "People" }).count() > 0);
  console.log("back link present:", await page.locator("button:has-text('People')").first().count() > 0);
  await page.click("button.link-btn:has-text('People')");
  await page.waitForTimeout(150);
  console.log("back on People list:", (await page.locator(".tab-title").innerText()) === "People");

  console.log("\n=== 5) Arabic-Indic numerals toggle ===");
  await page.evaluate(() => { UI.setLang("ar"); });
  await page.waitForTimeout(200);
  // navigate to settings via More sheet in Arabic
  const moreBtn = page.locator(".navbtn", { hasText: "المزيد" });
  if (await moreBtn.count()) { await moreBtn.click(); await page.waitForTimeout(150); }
  const settingsItem = page.locator(".sheet-item", { hasText: "الإعدادات" });
  if (await settingsItem.count()) { await settingsItem.click(); await page.waitForTimeout(200); }
  const toggle = page.locator("#arabicNumToggle");
  console.log("Arabic numerals toggle present in Settings (AR mode):", await toggle.count() > 0);
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(200);
    const heroValue = await page.locator(".navbtn", { hasText: "الرئيسية" }).count();
    await page.locator(".navbtn", { hasText: "الرئيسية" }).click();
    await page.waitForTimeout(200);
    const heroTxt = await page.locator(".hero-value").innerText();
    console.log("hero value now uses Arabic-Indic digits:", heroTxt, "/", /[٠-٩]/.test(heroTxt));
  }

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
