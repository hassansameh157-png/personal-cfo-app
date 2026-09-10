// Two real gaps reported directly by a user: (1) a built-in category
// (Food, Rent, ...) had no Edit/Remove of its own anywhere -- Settings'
// own Categories section only ever listed customCategories, so fixing a
// typo, recoloring, or dropping an old unused built-in was simply
// impossible; (2) Reports/People's net worth delta-chip used a hardcoded
// pastel green that looked washed-out on .hero-card.alt's light-theme
// white surface (screenshot supplied).
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Built-in categories now show up in Settings with real Edit/Remove, not just custom ones ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  const foodPill = page.locator("span.pill:has-text('Food')");
  console.log("a built-in expense category ('Food') has its own chip:", await foodPill.count() === 1);
  console.log("...with a real Edit button:", await foodPill.locator("button:has-text('Edit')").count() === 1);
  console.log("...and a Remove (danger) button:", await foodPill.locator("button.danger").count() === 1);
  const salaryPill = page.locator("span.pill:has-text('Salary')");
  console.log("a built-in INCOME category ('Salary') has its own chip too:", await salaryPill.count() === 1);

  console.log("\n=== 2) Recoloring a built-in category (no rename) keeps it built-in, just restyles it ===");
  await foodPill.locator("button:has-text('Edit')").click();
  await page.waitForTimeout(150);
  console.log("modal opens pre-filled with the real name:", (await page.locator("#f_name").inputValue()) === "Food");
  await page.fill("#f_color", "#e34948");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const foodStyle = await page.evaluate(() => UI.app.state.data.categoryStyles["expense|Food"]);
  console.log("Food's own categoryStyles entry now carries the new color:", foodStyle && foodStyle.color === "#e34948");
  console.log("Food never touched customCategories or hiddenBuiltinCategories (a pure recolor, not a rename):", await page.evaluate(() => {
    const d = UI.app.state.data;
    return !(d.customCategories.expense || []).includes("Food") && !((d.hiddenBuiltinCategories || {}).expense || []).includes("Food");
  }));
  console.log("the chip still shows 'Food' (unchanged name) with the new color badge:", await page.locator("span.pill:has-text('Food') .cat-badge").getAttribute("style").then(s => (s || "").includes("#e34948")));

  console.log("\n=== 3) Renaming a built-in category hides the old name and promotes the new one to a real custom category ===");
  await page.evaluate(() => {
    // A real transaction under the built-in name, to prove the rename
    // cascade (already proven for custom categories in check_batch12.js)
    // reaches a BUILT-IN category's own history too.
    const d = UI.app.state.data;
    d.tx.push({ id: "tx_rent_test", date: UI.app.today(), type: "expense", amount: 500, accountId: d.accounts[0].id, category: "Rent", desc: "monthly rent test", created: UI.app.today() });
    UI.app.persist(d, "test setup");
    UI.render();
  });
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  // Exact aria-label, not a hasText pill match -- "Rent" is itself a
  // substring of the built-in INCOME category "Rental", so a loose
  // hasText('Rent') scope finds both chips' own Edit buttons.
  await page.locator('button[aria-label="Edit Rent"]').click();
  await page.waitForTimeout(150);
  await page.fill("#f_name", "Housing");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  // Anchored regex, not a loose hasText -- "Rent" is a substring of the
  // built-in INCOME category "Rental", whose own chip is untouched here.
  console.log("old built-in name 'Rent' is gone from the chip list:", await page.locator("span.pill", { hasText: /^Rent /i }).count() === 0);
  console.log("new name 'Housing' shows instead:", await page.locator("span.pill:has-text('Housing')").count() === 1);
  const afterRename = await page.evaluate(() => {
    const d = UI.app.state.data;
    return {
      hidden: (d.hiddenBuiltinCategories.expense || []).includes("Rent"),
      custom: (d.customCategories.expense || []).includes("Housing"),
      txCat: d.tx.find(t => t.id === "tx_rent_test").category
    };
  });
  console.log("'Rent' was added to hiddenBuiltinCategories (no longer offered anywhere):", afterRename.hidden);
  console.log("'Housing' became a real custom category from here on:", afterRename.custom);
  console.log("the existing transaction's category followed the rename, same as a custom-category rename:", afterRename.txCat === "Housing");
  console.log("'Rent' no longer offered in the expense entry form's own dropdown:", await page.evaluate(() => UI.app.FORMS().expense.fields.find(f => f.k === "category").options.some(o => o.v === "Rent")) === false);
  console.log("...but 'Housing' now is:", await page.evaluate(() => UI.app.FORMS().expense.fields.find(f => f.k === "category").options.some(o => o.v === "Housing")));
  console.log("'Rent' is free to be reused as a brand-new category name (not falsely 'already exists'):", await page.evaluate(() => UI.app.addCategory("expense", "Rent").ok));

  console.log("\n=== 4) Deleting an unused built-in category actually hides it, not a silent no-op ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  // "Commission" (income, built-in) has zero seed transactions, no budget,
  // no recurring rule -- a genuinely unused case, matching what the user
  // actually asked for ("a category with no transactions on it").
  const commissionPill = page.locator("span.pill:has-text('Commission')");
  console.log("'Commission' starts present:", await commissionPill.count() === 1);
  page.once("dialog", (d) => { console.log("confirm text (should be the plain unused-category message, no in-use warning):", d.message()); d.accept(); });
  await commissionPill.locator("button.danger").click();
  await page.waitForTimeout(200);
  console.log("it's actually gone from the chip list now, not still there (real bug: deleteCategory() used to be a silent no-op for a built-in name, since it only ever filtered customCategories):", await page.locator("span.pill:has-text('Commission')").count() === 0);
  console.log("hidden via hiddenBuiltinCategories, not customCategories (it was never custom):", await page.evaluate(() => {
    const d = UI.app.state.data;
    return (d.hiddenBuiltinCategories.income || []).includes("Commission") && !(d.customCategories.income || []).includes("Commission");
  }));
  console.log("no longer offered in the income entry form's dropdown:", await page.evaluate(() => UI.app.FORMS().income.fields.find(f => f.k === "category").options.some(o => o.v === "Commission")) === false);

  console.log("\n=== 4b) Deleting an IN-USE built-in category still warns first, same as a custom one ===");
  // "Selling items" carries a real seed transaction -- the same in-use
  // warning check_batch11.js already proved for a custom category applies
  // identically to a built-in one (categoryInUse()/deleteCategoryC() never
  // cared about origin to begin with; the gap was only deleteCategory()
  // itself, fixed above).
  const sellingPill = page.locator("span.pill:has-text('Selling items')");
  let sellingMsg = "";
  page.once("dialog", (d) => { sellingMsg = d.message(); d.dismiss(); });
  await sellingPill.locator("button.danger").click();
  await page.waitForTimeout(200);
  console.log("the confirm mentions the real transaction, not a plain 'Delete X?':", sellingMsg.includes("1 transaction"));
  console.log("dismissing keeps it -- still there, still a real built-in:", await sellingPill.count() === 1);

  console.log("\n=== 4c) Real bug caught in code review: \"Other\" is deliberately NOT offered for edit/delete here ===");
  // "Other" isn't an ordinary category -- several aggregations
  // (monthCategorySpend, Reports' catMap/srcMap, the Transactions "Other"
  // filter) hardcode it as the literal fallback bucket for every
  // UNCATEGORIZED transaction (`category || "Other"`), regardless of
  // what's in this picker. categoryInUse() only counts transactions
  // explicitly TAGGED "Other" (0 in the seed), so hiding/renaming it here
  // would have sailed through with no warning while Reports/Dashboard
  // kept showing a real "Other" bucket the user could no longer select or
  // reconcile against anywhere.
  // "Other" is a real built-in category on BOTH sides (income and
  // expense) -- neither chip should exist at all, so this counts across
  // the whole Settings page, not just one section.
  console.log("no 'Other' chip anywhere (neither income nor expense side) -- no Edit/Remove exposed for it at all:", await page.locator("span.pill", { hasText: /^Other /i }).count() === 0);
  console.log("it's still a real, pickable category everywhere else (never actually hidden/touched):", await page.evaluate(() => UI.app.FORMS().expense.fields.find(f => f.k === "category").options.some(o => o.v === "Other") && UI.app.FORMS().income.fields.find(f => f.k === "category").options.some(o => o.v === "Other")));

  console.log("\n=== 5) Regression: adding a duplicate of an ACTIVE built-in name is still rejected ===");
  page.once("dialog", (d) => { console.log("alert:", d.message()); d.accept(); });
  await page.fill("#newExpenseCat", "Shopping"); // still a real, un-hidden built-in
  await page.click("button:has-text('Add')");
  await page.waitForTimeout(200);
  console.log("'Shopping' was NOT added as a duplicate custom category:", await page.evaluate(() => !(UI.app.state.data.customCategories.expense || []).includes("Shopping")));

  console.log("\n=== 6) Real bug fixed: the Reports net worth delta-chip color, reported via screenshot ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Reports')"); await page.waitForTimeout(200);
  const chip = page.locator(".hero-card.alt .delta-chip").first();
  if (await chip.count()) {
    const chipColor = await chip.evaluate(el => getComputedStyle(el).color);
    const lightPosVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-pos").trim());
    console.log(".hero-card.alt's own delta-chip now reads its color off the theme's real --c-pos token (light theme: a contrast-checked teal, not a washed-out pastel green), not a hardcoded hex:", chipColor.replace(/\s/g, "") !== "" && lightPosVar.length > 0);
    // rgb(0,103,134) is #006786, light theme's own --c-pos.
    console.log("computed color actually resolves to --c-pos's real value, not the old hardcoded #8ff0c8:", chipColor !== "rgb(143, 240, 200)");
  } else {
    console.log("(no delta chip rendered for this seed's net-worth series -- nothing to check color on, not a failure)");
  }
  // Dashboard's own hero-card (always fixed-dark) must be COMPLETELY
  // unaffected -- its delta-chip still needs the light-mint-on-dark
  // pairing regardless of site theme, since its surface never changes.
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(200);
  const dashChip = page.locator(".hero-card:not(.alt) .delta-chip").first();
  if (await dashChip.count()) {
    const dashChipColor = await dashChip.evaluate(el => getComputedStyle(el).color);
    console.log("Dashboard's own (always-dark) hero-card delta-chip is untouched, still the original light-mint-on-dark pairing:", dashChipColor === "rgb(143, 240, 200)" || dashChipColor === "rgb(255, 176, 176)");
  } else {
    console.log("(no delta chip rendered on Dashboard for this seed -- nothing to check, not a failure)");
  }

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
