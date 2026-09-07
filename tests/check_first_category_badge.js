const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// A small "First <category>" badge on the ONE transaction row that's
// actually the earliest-ever use of its own category -- a light way to
// notice a spending/income habit starting, not just its running totals.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) A fresh, never-before-used category gets the badge on its very first transaction ===");
  const before = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    d.tx.push({ id: "badge-first", type: "expense", amount: 20, date: "2020-01-01", category: "BadgeTestCat", desc: "Very first one", void: false, accountId: d.accounts[0].id });
    d.tx.push({ id: "badge-second", type: "expense", amount: 30, date: "2020-02-01", category: "BadgeTestCat", desc: "Later one", void: false, accountId: d.accounts[0].id });
    UI.app.persist(d, "seed for first-category-badge test");
    UI.render();
    return [...UI.app.firstCategoryUseIds()];
  });
  console.log("the earliest transaction's id is in firstCategoryUseIds():", before.includes("badge-first"));
  console.log("the later transaction's id is NOT in it:", !before.includes("badge-second"));

  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(200);
  await page.fill("#txSearch", "Very first one");
  await page.waitForTimeout(200);
  const firstRow = page.locator(".mobile-only .card-row", { hasText: "Very first one" });
  console.log("the earliest row shows the badge:", await firstRow.locator(".first-cat-badge").count() === 1);
  console.log("badge text names the category:", (await firstRow.locator(".first-cat-badge").textContent()).includes("BadgeTestCat"));

  await page.fill("#txSearch", "Later one");
  await page.waitForTimeout(200);
  const laterRow = page.locator(".mobile-only .card-row", { hasText: "Later one" });
  console.log("\n=== 2) A LATER transaction in the same category gets no badge at all ===");
  console.log("the later row does NOT show a badge:", await laterRow.locator(".first-cat-badge").count() === 0);

  console.log("\n=== 2b) Two transactions on the exact same date: the earlier `created` timestamp wins the tie ===");
  const tieResult = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    d.tx.push({ id: "tie-a", type: "expense", amount: 5, date: "2021-05-05", created: "2021-05-05T10:00:00.000Z", category: "TieTestCat", desc: "Tie A", void: false, accountId: d.accounts[0].id });
    d.tx.push({ id: "tie-b", type: "expense", amount: 6, date: "2021-05-05", created: "2021-05-05T08:00:00.000Z", category: "TieTestCat", desc: "Tie B", void: false, accountId: d.accounts[0].id });
    UI.app.persist(d, "seed for same-date tie-break test");
    const ids = UI.app.firstCategoryUseIds();
    return { aWon: ids.has("tie-a"), bWon: ids.has("tie-b") };
  });
  console.log("same-date tie goes to the EARLIER created timestamp (tie-b, created 08:00 not 10:00):", !tieResult.aWon && tieResult.bWon);

  console.log("\n=== 3) Editing the earliest one to an earlier date keeps the badge with it (date-driven, not entry-order) ===");
  await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    // Make the SECOND-entered transaction now the earliest by date.
    const t = d.tx.find(x => x.id === "badge-second");
    t.date = "2019-06-01";
    UI.app.persist(d, "backdate for first-category-badge test");
    UI.render();
    return [...UI.app.firstCategoryUseIds()];
  });
  await page.fill("#txSearch", "Later one");
  await page.waitForTimeout(200);
  console.log("the now-earlier-dated transaction picks up the badge:", await laterRow.locator(".first-cat-badge").count() === 1);
  await page.fill("#txSearch", "Very first one");
  await page.waitForTimeout(200);
  console.log("the now-later-dated original loses it:", await firstRow.locator(".first-cat-badge").count() === 0);
  await page.fill("#txSearch", "");

  console.log("\n=== 4) The desktop table view shows the same badge (dual mobile/desktop render, both present in the DOM) ===");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  await page.fill("#txSearch", "Later one");
  await page.waitForTimeout(200);
  console.log("desktop table row shows the badge too:", await page.locator(".desktop-only .first-cat-badge").count() === 1);
  console.log("mobile card row (hidden but still in DOM) carries exactly one, not a stray duplicate:", await page.locator(".mobile-only .first-cat-badge").count() === 1);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
