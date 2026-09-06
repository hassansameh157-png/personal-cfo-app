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

  console.log("=== 1) People list shows a colored avatar + relation tag per person ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  const avatarCount = await page.locator(".person-avatar").count();
  console.log("avatar count (should equal number of seed people, mobile card list):", avatarCount);
  const firstTag = await page.locator(".person-tag").first().innerText();
  console.log("first person's relation tag (defaults to Other):", firstTag);

  console.log("\n=== 2) Add a person with a Family relation -> gets the family default color ===");
  await page.click("button:has-text('+ Person')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "Mona Family Test");
  await page.selectOption("#f_relation", "family");
  await page.waitForTimeout(150);
  const colorAfterRelation = await page.locator("#f_color").inputValue();
  console.log("color auto-set to family default (#e8734a):", colorAfterRelation);
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const newCard = page.locator(".person-card", { hasText: "Mona Family Test" });
  console.log("new person card present:", await newCard.count() > 0);
  const avatarStyle = await newCard.locator(".person-avatar").getAttribute("style");
  console.log("avatar uses family color:", avatarStyle.includes("e8734a"));
  console.log("card left-border uses family color:", (await newCard.getAttribute("style")).includes("e8734a"));

  console.log("\n=== 3) Person detail header shows a big colored avatar ===");
  await newCard.locator(".card-row-title").click(); await page.waitForTimeout(200);
  console.log("large avatar present:", await page.locator(".person-avatar.lg").count() > 0);
  console.log("relation tag shown in sub:", await page.locator(".tab-sub").innerText());
  await page.click("button:has-text('← People')"); await page.waitForTimeout(200);

  console.log("\n=== 4) Edit person: relation/color round-trip ===");
  await newCard.locator("button:has-text('Edit')").click(); await page.waitForTimeout(200);
  console.log("relation pre-filled as family:", await page.locator("#f_relation").inputValue());
  console.log("color pre-filled as family color:", await page.locator("#f_color").inputValue());
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 5) Reorder accounts: move a tile up/down ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  const tileNamesBefore = await page.locator(".credit-card-tile .cc-name").allTextContents();
  console.log("tile order before:", tileNamesBefore);
  // move the 2nd tile up one step
  const secondTile = page.locator(".credit-card-tile").nth(1);
  await secondTile.locator('button[aria-label]', { hasText: "↑" }).click();
  await page.waitForTimeout(200);
  const tileNamesAfter = await page.locator(".credit-card-tile .cc-name").allTextContents();
  console.log("tile order after moving #2 up:", tileNamesAfter);
  console.log("first two swapped:", tileNamesAfter[0] === tileNamesBefore[1] && tileNamesAfter[1] === tileNamesBefore[0]);
  console.log("first tile has no Move-up button:", await page.locator(".credit-card-tile").first().locator('button[aria-label]', { hasText: "↑" }).count() === 0);

  console.log("\n=== 6) Total credit card debt summary (now 4 tiles incl. Available) ===");
  const ccLabel = await page.locator(".pos-tile", { hasText: "Total card debt" }).count();
  console.log("summary tile present:", ccLabel > 0);
  if (ccLabel) {
    const summaryText = await page.locator(".tile-grid.four").first().innerText();
    console.log("summary text:", summaryText.replace(/\n/g, " | "));
  }

  console.log("\n=== 7) Per-card tile shows Available balance too ===");
  const firstCard = page.locator(".credit-card-tile:not(.balance-tile)").first();
  console.log("labels:", await firstCard.locator(".cc-label").allTextContents());

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
