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

  console.log("=== 1) Seed data (has >=10 tx, never backed up) shows the reminder ===");
  console.log("needsBackupReminder():", await page.evaluate(() => UI.app.needsBackupReminder()));
  console.log("tx count:", await page.evaluate(() => UI.app.state.data.tx.length));
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  console.log("Dashboard shows the alert:", await page.locator(".alert-card", { hasText: "Back up your data" }).count() > 0);

  console.log("\n=== 2) Settings shows 'Last backup: never' ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  console.log("shows 'never':", (await page.locator("text=Last backup:").innerText()).includes("never"));

  console.log("\n=== 3) Exporting a JSON backup clears the reminder immediately ===");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("button:has-text('Export JSON backup')")
  ]);
  console.log("download fired:", !!download);
  console.log("needsBackupReminder() now false:", await page.evaluate(() => UI.app.needsBackupReminder()) === false);
  console.log("lastBackupAt set to today:", await page.evaluate(() => UI.app.state.data.lastBackupAt === UI.app.today()));
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  console.log("Dashboard alert gone:", await page.locator(".alert-card", { hasText: "Back up your data" }).count() === 0);
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  const backupLine = await page.locator("text=Last backup:").innerText();
  console.log("Settings shows today's date now:", backupLine, "| no longer 'never':", !backupLine.includes("never"));

  console.log("\n=== 4) exportCsv() does NOT count as a real backup ===");
  await page.evaluate(() => { UI.app.state.data.lastBackupAt = null; UI.app.state.data.lastBackupTxCount = 0; });
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.click("button:has-text('Export transactions CSV')")
  ]);
  console.log("csv download fired:", !!csvDownload);
  console.log("lastBackupAt still null after CSV export (CSV isn't a real backup):", await page.evaluate(() => UI.app.state.data.lastBackupAt) === null);

  console.log("\n=== 5) Reminder reappears once 20+ new transactions pile up after a backup ===");
  await page.evaluate(() => {
    UI.app.state.data.lastBackupAt = UI.app.today();
    UI.app.state.data.lastBackupTxCount = UI.app.state.data.tx.length;
  });
  console.log("no reminder right after a fresh backup:", await page.evaluate(() => UI.app.needsBackupReminder()) === false);
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      UI.app.state.data.tx.push({ id: "bulk" + i, type: "expense", amount: 1, date: UI.app.today(), category: "Food", desc: "bulk", void: false, accountId: UI.app.state.data.accounts[0].id });
    }
  });
  console.log("reminder returns after 20 new transactions:", await page.evaluate(() => UI.app.needsBackupReminder()) === true);

  console.log("\n=== 6) Reminder stays off with plenty of tx but a recent backup and few new ones ===");
  await page.evaluate(() => {
    UI.app.state.data.lastBackupAt = UI.app.today();
    UI.app.state.data.lastBackupTxCount = UI.app.state.data.tx.length - 3;
  });
  console.log("stays quiet with only a few new tx since a fresh backup:", await page.evaluate(() => UI.app.needsBackupReminder()) === false);

  console.log("\nerrors:", errors.length ? errors : "none");
  await browser.close();
})();
