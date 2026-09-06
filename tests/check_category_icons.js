const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Dashboard's category bars each show a real icon, not just the name ===");
  const bars = page.locator(".bar-name-ico svg");
  const barCount = await bars.count();
  console.log("at least one category bar has an icon:", barCount > 0);
  console.log("icon svg actually has a path with real geometry:", await bars.first().locator("path").evaluate(el => el.getAttribute("d").length > 5));

  console.log("\n=== 2) A categorized transaction row shows a colored icon badge ===");
  await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    d.tx.push({ id: "seed-food", type: "expense", amount: 50, date: UI.app.today(), category: "Food", desc: "Icon test food", void: false, accountId: d.accounts[0].id });
    d.tx.push({ id: "seed-custom", type: "expense", amount: 40, date: UI.app.today(), category: "MyCustomCat", desc: "Icon test custom", void: false, accountId: d.accounts[0].id });
    d.tx.push({ id: "seed-transfer", type: "transfer", amount: 30, date: UI.app.today(), desc: "Icon test transfer", void: false, fromId: d.accounts[0].id, toId: d.accounts[1].id });
    UI.app.persist(d, "seed for icon test");
    UI.render();
  });
  await page.click(".navbtn:has-text('Transactions')");
  await page.fill("#txSearch", "Icon test");
  await page.waitForTimeout(200);

  const foodRow = page.locator(".card-row", { hasText: "Icon test food" });
  console.log("Food row has a .cat-badge:", await foodRow.locator(".cat-badge").count() === 1);
  console.log("badge contains a real svg icon:", await foodRow.locator(".cat-badge svg path").count() === 1);

  console.log("\n=== 3) A custom (non-built-in) category falls back to the generic tag icon, not a blank/broken one ===");
  const customRow = page.locator(".card-row", { hasText: "Icon test custom" });
  console.log("custom-category row still has a .cat-badge:", await customRow.locator(".cat-badge").count() === 1);
  const foodPath = await foodRow.locator(".cat-badge svg path").getAttribute("d");
  const customPath = await customRow.locator(".cat-badge svg path").getAttribute("d");
  console.log("custom category's icon differs from Food's (real fallback, not accidentally reusing Food's path):", customPath !== foodPath);

  console.log("\n=== 4) An uncategorized/transfer row shows NO badge at all ===");
  const transferRow = page.locator(".card-row", { hasText: "Icon test transfer" });
  console.log("transfer row has no .cat-badge:", await transferRow.locator(".cat-badge").count() === 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
