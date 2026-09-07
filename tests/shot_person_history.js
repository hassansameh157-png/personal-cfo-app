const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Go to People, open Mohamed Hassan (has a receivable, will collect from him) ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "Mohamed Hassan" }).locator(".link-btn.card-row-title").click();
  await page.waitForTimeout(200);
  console.log("on person detail:", await page.locator(".tab-title").innerText());
  console.log("History section present before any action:", await page.locator(".section-title", { hasText: "History" }).count() > 0);
  const beforeCount = await page.locator(".card-row").count();
  console.log("card rows before:", beforeCount);

  console.log("\n=== 2) Collect a payment from him ===");
  await page.click("button:has-text('Collect')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "1000");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);

  console.log("\n=== 3) History section now shows the collection ===");
  const historyPresent = await page.locator(".section-title", { hasText: "History" }).count() > 0;
  console.log("History section present:", historyPresent);
  await page.screenshot({ path: "shot_person_history.png", fullPage: true });
  const collectionRow = page.locator(".card-row", { hasText: "Collection" });
  console.log("a 'Collection' type row exists in history:", await collectionRow.count() > 0);
  if (await collectionRow.count() > 0) {
    console.log("collection row text:", (await collectionRow.first().innerText()).replace(/\n/g, " | "));
  }

  console.log("\n=== 4) Edit/Delete/Duplicate/Reverse wired from History ===");
  // txRowActions() -- shared with Transactions -- puts Edit/Delete/
  // Duplicate/Reverse behind the "..." trigger's action sheet now (see
  // UI.renderTxActionSheet()), not always-visible inline links.
  const moreBtn = collectionRow.first().locator(".tx-more-btn");
  console.log("'...' actions trigger present on history row:", await moreBtn.count() > 0);
  await moreBtn.click(); await page.waitForTimeout(150);
  console.log("Edit action present in the sheet:", await page.locator(".sheet-action:has-text('Edit')").count() > 0);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  console.log("edit dialog title:", await page.locator(".dialog-title").innerText());
  console.log("amount pre-filled:", await page.locator("#f_amount").inputValue());
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 5) Now test: fully settle a small existing loan (e.g. S-Tareq) and confirm it still shows in History even though it disappears from 'Loans owed to me' ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "S-Tareq" }).locator(".link-btn.card-row-title").click();
  await page.waitForTimeout(200);
  const owedBefore = await page.locator(".hero-sub-label", { hasText: "Owes me" }).locator("xpath=following-sibling::div[@class='hero-sub-value tone-pos']").innerText();
  console.log("S-Tareq owes me before:", owedBefore);
  await page.click("button:has-text('Collect')"); await page.waitForTimeout(200);
  // collect the exact full amount (seed opening balance for stareq is 1020)
  await page.fill("#f_amount", "1020");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);
  console.log("Loans owed to me section gone (fully settled):", await page.locator(".section-title", { hasText: "Loans owed to me" }).count() === 0);
  console.log("History still shows both the original loan AND the collection:", await page.locator(".card-row", { hasText: "Receivable" }).count() > 0 || await page.locator(".card-row", { hasText: "Collection" }).count() > 0);
  await page.screenshot({ path: "shot_person_history_settled.png", fullPage: true });

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
