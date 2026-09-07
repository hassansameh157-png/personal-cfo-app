const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Short navigator.vibrate() buzz on real "you just confirmed something"
// moments: an accepted destructive confirm() dialog (UI.hapticConfirm(),
// wrapping every one of the app's confirm() calls), and a successful
// modal save (UI.submitModal()). Both must be silent when the user
// actually cancels/doesn't confirm.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // navigator.vibrate doesn't exist in this headless Chromium build at
  // all (real desktop Chrome/Playwright have no vibration hardware) --
  // stub it before the app's own scripts run so `if (navigator.vibrate)`
  // feature-detects it as present, exactly like a real phone browser.
  await page.addInitScript(() => {
    window.__vibrateCalls = [];
    Object.defineProperty(navigator, "vibrate", { value: (p) => { window.__vibrateCalls.push(p); return true; }, configurable: true });
  });
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  const vibrateCount = () => page.evaluate(() => window.__vibrateCalls.length);

  console.log("=== 1) Accepting a destructive delete confirm() vibrates ===");
  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(200);
  page.once("dialog", (d) => d.accept());
  const before1 = await vibrateCount();
  await page.locator(".card-row").first().locator("button.link-btn:has-text('Delete')").click();
  await page.waitForTimeout(150);
  console.log("vibrate called on accepted delete:", await vibrateCount() > before1);

  console.log("\n=== 2) Cancelling that same dialog does NOT vibrate ===");
  page.once("dialog", (d) => d.dismiss());
  const before2 = await vibrateCount();
  await page.locator(".card-row").first().locator("button.link-btn:has-text('Delete')").click();
  await page.waitForTimeout(150);
  console.log("vibrate NOT called on a cancelled delete:", await vibrateCount() === before2);

  console.log("\n=== 3) A successful modal save (submitModal) vibrates ===");
  await page.click("button:has-text('+ Expense')");
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "42");
  await page.fill("#f_desc", "Haptic test expense");
  const before3 = await vibrateCount();
  await page.click("#modalForm button[type=submit], .dialog button:has-text('Save')");
  await page.waitForTimeout(200);
  console.log("modal actually closed (save succeeded):", await page.locator(".dialog").count() === 0);
  console.log("vibrate called on a successful save:", await vibrateCount() > before3);

  console.log("\n=== 4) A failed submit (validation error, modal stays open) does NOT vibrate ===");
  await page.click("button:has-text('+ Expense')");
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "0"); // invalid -- app.submit() should reject a zero amount
  const before4 = await vibrateCount();
  await page.click("#modalForm button[type=submit], .dialog button:has-text('Save')");
  await page.waitForTimeout(150);
  const stillOpen = await page.locator(".dialog").count() === 1;
  console.log("modal still open (save correctly rejected):", stillOpen);
  console.log("vibrate NOT called on a rejected save:", await vibrateCount() === before4);
  if (stillOpen) await page.evaluate(() => UI.closeModal());

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
