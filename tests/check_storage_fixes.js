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

  console.log("=== 1) Normal save still shows the plain green success pill ===");
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "10");
  await page.fill("#f_desc", "Normal save test");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  console.log("plain flash-pill shown:", await page.locator(".flash-pill:not(.danger)").count() > 0);
  console.log("no danger pill on a normal save:", await page.locator(".flash-pill.danger").count() === 0);
  await page.waitForTimeout(2200);
  console.log("plain pill auto-dismissed:", await page.locator(".flash-pill:not(.danger)").count() === 0);

  console.log("\n=== 2) Simulated storage failure: danger pill + persistent Dashboard alert ===");
  await page.evaluate(() => {
    Storage.prototype._realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "pcfo.v7") throw new DOMException("QuotaExceededError simulated", "QuotaExceededError");
      return this._realSetItem(k, v);
    };
  });
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "20");
  await page.fill("#f_desc", "This should fail to save");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  console.log("danger pill shown:", await page.locator(".flash-pill.danger").count() > 0);
  console.log("danger pill text:", await page.locator(".flash-pill.danger span").innerText().catch(() => "MISSING"));
  console.log("danger pill has NOT auto-dismissed after 2.5s:");
  await page.waitForTimeout(2500);
  console.log(" ->", await page.locator(".flash-pill.danger").count() > 0);
  // dismiss it manually
  await page.locator(".flash-dismiss").click(); await page.waitForTimeout(150);
  console.log("dismiss button removed the pill:", await page.locator(".flash-pill.danger").count() === 0);

  console.log("\n=== 3) Persistent Dashboard alert stays even after the toast is gone ===");
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const saveAlert = page.locator(".alert-card", { hasText: "wasn't saved" });
  console.log("Dashboard save-failure alert present:", await saveAlert.count() > 0);
  console.log("alert severity class:", await saveAlert.first().getAttribute("class"));

  console.log("\n=== 4) Export backup CTA on the alert actually works ===");
  const [download] = await Promise.all([
    page.waitForEvent("download").catch(() => null),
    saveAlert.locator(".alert-cta").click()
  ]);
  console.log("export triggered a download:", !!download);

  console.log("\n=== 5) Once storage recovers, the alert clears on the next save ===");
  await page.evaluate(() => { Storage.prototype.setItem = Storage.prototype._realSetItem; });
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "30");
  await page.fill("#f_desc", "Recovery save test");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  console.log("plain success pill shown again:", await page.locator(".flash-pill:not(.danger)").count() > 0);
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  console.log("Dashboard save-failure alert gone after a successful save:", await page.locator(".alert-card", { hasText: "wasn't saved" }).count() === 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
