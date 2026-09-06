const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) FAB present on Dashboard (mobile viewport) ===");
  const fab = page.locator(".fab");
  console.log("fab visible:", await fab.isVisible());
  console.log("fab has aria-label:", (await fab.getAttribute("aria-label")) === "Quick add");
  console.log("fab aria-expanded starts false:", (await fab.getAttribute("aria-expanded")) === "false");

  console.log("\n=== 2) Tapping the FAB opens the quick-add sheet ===");
  await fab.click();
  await page.waitForTimeout(200);
  console.log("fab aria-expanded now true:", (await fab.getAttribute("aria-expanded")) === "true");
  const sheet = page.locator(".sheet", { hasText: "Quick add" });
  console.log("sheet visible:", await sheet.isVisible());
  console.log("sheet has 3 items (Expense/Income/Transfer):", await sheet.locator(".sheet-item").count() === 3);

  console.log("\n=== 3) Tapping 'Expense' opens the expense modal AND closes the sheet ===");
  await sheet.locator(".sheet-item", { hasText: "Expense" }).click();
  await page.waitForTimeout(200);
  console.log("dialog opened:", await page.locator(".dialog").isVisible());
  console.log("dialog title mentions Expense:", (await page.locator(".dialog-title").innerText()).includes("Expense"));
  console.log("quick-add sheet closed (only one sheet-backdrop, the modal's own):", await page.locator(".sheet-backdrop").count() === 1);
  await page.evaluate(() => UI.closeModal());
  await page.waitForTimeout(150);

  console.log("\n=== 4) Opening the More sheet closes an already-open quick-add sheet (mutual exclusion) ===");
  await page.evaluate(() => { UI.app.state.modal = null; UI.app.state.moreOpen = false; UI.app.state.quickAddOpen = false; UI.render(); });
  await page.waitForTimeout(150);
  await fab.click();
  await page.waitForTimeout(150);
  console.log("quick-add sheet open:", await page.locator(".sheet", { hasText: "Quick add" }).isVisible());
  // Simulate toggling More via direct call (no separate More button in this narrow viewport's primary nav necessarily labelled the same, use JS to be robust)
  await page.evaluate(() => UI.toggleMore());
  await page.waitForTimeout(150);
  console.log("quick-add sheet now closed:", await page.locator(".sheet", { hasText: "Quick add" }).count() === 0);
  console.log("More sheet now open:", await page.locator(".sheet-grid .sheet-item").count() > 0);
  console.log("only one sheet-backdrop present (no double-render):", await page.locator(".sheet-backdrop").count() === 1);

  console.log("\n=== 5) Desktop viewport hides the FAB (topbar's own + Expense covers it) ===");
  await page.evaluate(() => { UI.app.state.moreOpen = false; UI.render(); });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);
  console.log("fab hidden on desktop:", !(await page.locator(".fab").isVisible()));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
