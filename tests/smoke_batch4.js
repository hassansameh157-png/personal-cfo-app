const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.grantPermissions(["notifications"]).catch(() => {});
  const page = await context.newPage();
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = "file://" + path.resolve(__dirname, "..", "index.html");
  await page.goto(url);
  await page.waitForTimeout(300);

  console.log("=== 1) Set a PIN in Settings ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  await page.fill("#pinNew", "1234");
  await page.click("button:has-text('Set PIN')");
  await page.waitForTimeout(300);
  console.log("confirmation shown:", await page.locator("text=PIN set.").count() > 0);
  console.log("Change/Remove buttons now shown instead of Set:", await page.locator("button:has-text('Change PIN')").count() > 0);

  console.log("\n=== 2) Reload -> lock screen appears ===");
  await page.reload();
  await page.waitForTimeout(400);
  console.log("lock screen shown:", await page.locator(".lock-screen").count() > 0);
  console.log("real app content hidden:", await page.locator(".navbtn").count() === 0);

  console.log("\n=== 3) Wrong PIN rejected ===");
  await page.fill("#lockPin", "0000");
  await page.click("button:has-text('Unlock')");
  await page.waitForTimeout(200);
  console.log("error shown:", await page.locator(".lock-screen .dialog-err").innerText().catch(() => "NONE"));
  console.log("still locked:", await page.locator(".lock-screen").count() > 0);

  console.log("\n=== 4) Correct PIN unlocks ===");
  await page.fill("#lockPin", "1234");
  await page.click("button:has-text('Unlock')");
  await page.waitForTimeout(300);
  console.log("unlocked, app visible:", await page.locator(".navbtn").count() > 0);

  console.log("\n=== 5) Reload again, use Forgot PIN ===");
  await page.reload();
  await page.waitForTimeout(400);
  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('Forgot PIN?')");
  await page.waitForTimeout(300);
  console.log("unlocked without correct PIN via Forgot PIN:", await page.locator(".navbtn").count() > 0);
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  console.log("PIN actually cleared (Set PIN button shown again):", await page.locator("button:has-text('Set PIN')").count() > 0);

  console.log("\n=== 6) Reload once more -> no PIN, no lock screen ===");
  await page.reload();
  await page.waitForTimeout(400);
  console.log("no lock screen when no PIN set:", await page.locator(".lock-screen").count() === 0);

  console.log("\n=== 7) Notifications toggle + badge (best-effort, feature-detected) ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  const notifSupported = await page.evaluate(() => "Notification" in window);
  console.log("Notification API present in this browser:", notifSupported);
  await page.click("#notifToggle");
  await page.waitForTimeout(300);
  console.log("toggle checked after enabling:", await page.locator("#notifToggle").isChecked());
  const badgeSupported = await page.evaluate(() => "setAppBadge" in navigator);
  console.log("Badge API present in this browser:", badgeSupported);

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
