const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Investments: (a) real bug -- the page went silently blank once every
// investment was deleted, no empty state like every other list in the app;
// (b) real missing feature -- investment_return was fully wired everywhere
// in derive()/categoryColor/categoryIcon/categoryInUse but had no entry
// form of its own, so there was no way to actually record selling/closing
// a position. Both fixed together: Edit/Sell/Delete moved into a shared
// "..." action sheet (mirroring Card statements'), Sell posts a real
// investment_return tx and collapses the position into a "Sold" section
// showing realized P&L, and the empty state covers the now-reachable
// zero-investments case.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  const goToInvestments = async () => {
    await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
    await page.click(".sheet-item:has-text('Investments')"); await page.waitForTimeout(250);
  };

  console.log("=== 1) Empty state: Settings > 'Erase all data' is the real user-reachable path to zero investments ===");
  // Note: the seed investment (and every investment created through the
  // normal Add form) always gets a matching investment_buy tx via
  // investmentId, so investmentCanDelete() is never true for it -- Delete
  // in the "..." sheet is reachable in principle but not from any
  // investment this demo data or the Add form can produce. The wipe flow
  // in Settings is the actual way a real user reaches zero investments
  // (a fresh install, or starting over), so that's what this test drives.
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(250);
  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('Erase all data')"); await page.waitForTimeout(250);
  await goToInvestments();
  console.log("no active investments left after wipe:", await page.locator(".card-list").first().locator(".card-row").count() === 0);
  const emptyStateVisible = await page.locator(".empty-state", { hasText: "No investments yet" }).count();
  console.log("empty state message shown instead of a blank page:", emptyStateVisible > 0);
  const headerAfterEmpty = await page.locator(".tab-title, .tab-sub").allInnerTexts();
  console.log("no NaN/undefined leaked into the header at zero investments:", !headerAfterEmpty.join(" ").includes("NaN") && !headerAfterEmpty.join(" ").includes("undefined"));

  console.log("\n=== 2) Add an account to sell into (wipe cleared them too), then two investments ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(250);
  await page.click("button:has-text('+ Account')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "Test Bank");
  await page.selectOption("#f_type", "bank");
  await page.fill("#f_opening", "10000");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  await goToInvestments();
  const addInvestment = async (name, amount) => {
    await page.click("button:has-text('+ Investment')"); await page.waitForTimeout(200);
    await page.fill("#f_name", name);
    await page.selectOption("#f_type", "Fixed deposit");
    await page.fill("#f_invested", amount);
    await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  };
  await addInvestment("Growth ETF", "50000");
  await addInvestment("Sukuk fund", "20000");
  const startCount = await page.locator(".card-list").first().locator(".card-row").count();
  console.log("both active investments now shown:", startCount === 2);

  console.log("\n=== 3) Update value / Edit / Delete are gone from the inline row -- moved into '...' ===");
  const sukukRow = page.locator(".card-row", { hasText: "Sukuk fund" });
  console.log("no inline Edit button on the row itself:", await sukukRow.locator(".btn-row > button:has-text('Edit')").count() === 0);
  console.log("Update value is still the one visible primary action:", await sukukRow.locator("button:has-text('Update value')").count() === 1);
  console.log("'...' trigger present:", await sukukRow.locator(".invest-more-btn").count() === 1);

  console.log("\n=== 4) Open the sheet, edit metadata via it ===");
  await sukukRow.locator(".invest-more-btn").click(); await page.waitForTimeout(200);
  // Delete is deliberately NOT asserted here -- pre-existing behavior
  // (unrelated to this batch): the "investment" submit branch always
  // posts an investment_buy tx tagged with this investmentId at creation
  // time, so investmentCanDelete() is already false the instant an
  // investment exists via the normal Add form. Edit and Sell are the two
  // this batch actually adds/moves into the sheet.
  console.log("sheet shows Edit and Sell:", await page.locator(".sheet-action:has-text('Edit')").count() === 1 && await page.locator(".sheet-action:has-text('Sell')").count() === 1);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  console.log("Edit modal pre-filled with the right name:", await page.inputValue("#f_name") === "Sukuk fund");
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 5) Sell / close the Sukuk fund, deposit proceeds into an account ===");
  await sukukRow.locator(".invest-more-btn").click(); await page.waitForTimeout(200);
  await page.click(".sheet-action:has-text('Sell')"); await page.waitForTimeout(200);
  console.log("Sell modal pre-selected this exact investment:", await page.locator("#f_investmentId option:checked").innerText() === "Sukuk fund");
  const sellOptionsBefore = await page.locator("#f_investmentId option").allTextContents();
  console.log("Growth ETF (untouched) still an option, since it's not closed:", sellOptionsBefore.includes("Growth ETF"));
  await page.selectOption("#f_accountId", { label: "Test Bank" });
  await page.fill("#f_amount", "23000");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);

  console.log("\n=== 6) Sold position moved to a collapsed 'Sold' section with realized P&L ===");
  const activeRowsAfterSale = await page.locator(".card-list").first().locator(".card-row").count();
  console.log("only Growth ETF left active:", activeRowsAfterSale === 1);
  console.log("Sukuk fund no longer among the active rows:", await page.locator(".card-list").first().locator(".card-row", { hasText: "Sukuk fund" }).count() === 0);
  const soldToggle = page.locator("button", { hasText: "sold" });
  console.log("collapsed 'N sold' toggle shown:", await soldToggle.count() === 1);
  await soldToggle.click(); await page.waitForTimeout(200);
  const soldRow = page.locator(".card-row", { hasText: "Sukuk fund" });
  const soldMeta = await soldRow.locator(".card-row-meta").innerText();
  console.log("sold row visible after expanding, shows realized P&L:", soldMeta.includes("Realized P&L"));
  console.log("realized P&L is proceeds minus invested (23000 - 20000 = +3,000):", soldMeta.includes("3,000"));
  console.log("sold row has no '...' trigger and no action buttons at all:", await soldRow.locator(".invest-more-btn").count() === 0 && await soldRow.locator("button").count() === 0);

  console.log("\n=== 7) Sale proceeds actually landed in the target account as a real transaction ===");
  const check = await page.evaluate(() => {
    const iv = UI.app.state.data.investments.find(i => i.name === "Sukuk fund");
    const acct = UI.app.state.data.accounts.find(a => a.name === "Test Bank");
    const tx = UI.app.state.data.tx.find(t => t.type === "investment_return" && t.accountId === (acct && acct.id) && t.amount === 23000);
    return { closed: iv && iv.closed, soldFor: iv && iv.soldFor, invested: iv && iv.invested, txFound: !!tx, txTaggedRight: !!tx && tx.investmentId === iv.id };
  });
  console.log("investment marked closed with the right soldFor/invested preserved:", check.closed === true && check.soldFor === 23000 && check.invested === 20000);
  console.log("investment_return tx posted to the chosen account for the exact sale amount:", check.txFound);
  console.log("that tx is tagged with the sold investment's id (blocks its own deletion automatically):", check.txTaggedRight);

  console.log("\n=== 8) A sold investment no longer appears in invest_update's or a fresh Sell's picker ===");
  const updateBtn = page.locator("button:has-text('Update value')").first();
  await updateBtn.click(); await page.waitForTimeout(200);
  const updateOptions = await page.locator("#f_investmentId option").allTextContents();
  console.log("Sukuk fund absent from Update value's picker:", !updateOptions.includes("Sukuk fund"));
  console.log("Growth ETF still present in Update value's picker:", updateOptions.includes("Growth ETF"));
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);
  const growthRow = page.locator(".card-list").first().locator(".card-row", { hasText: "Growth ETF" });
  await growthRow.locator(".invest-more-btn").click(); await page.waitForTimeout(200);
  await page.click(".sheet-action:has-text('Sell')"); await page.waitForTimeout(200);
  const sellOptionsAfter = await page.locator("#f_investmentId option").allTextContents();
  console.log("Sukuk fund absent from a fresh Sell's picker too:", !sellOptionsAfter.includes("Sukuk fund"));
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
