const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// A real missing feature, requested directly by a user: a custom category
// (Settings) could only ever be added or deleted, with no way to fix a
// typo or give it a real color/icon instead of the flat neutral gray +
// plain tag every one of them shared. Deleting and re-adding it would
// have orphaned every existing transaction/budget/recurring rule still
// carrying the old name -- exactly the risk deleteCategoryC's own confirm
// (check_batch11.js) already warns about -- so a real rename cascades to
// all three instead. Several real bugs were caught across three rounds of
// code review before this shipped; each is called out inline below, at
// the section that regression-guards it.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== Setup: add a category, give it a transaction + budget ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  await page.fill("#newExpenseCat", "Gym");
  await page.click("button:has-text('Add')");
  await page.waitForTimeout(150);
  console.log("Gym added:", await page.locator("span.pill:has-text('Gym')").count() === 1);
  await page.selectOption("#budgetCat", "Gym");
  await page.fill("#budgetAmt", "800");
  await page.click("button:has-text('Set budget')");
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const app = UI.app, d = app.state.data;
    d.tx.push({ id: "tx_gym", date: app.today(), type: "expense", amount: 250, accountId: d.accounts[0].id, category: "Gym", desc: "monthly membership", created: app.today() });
    d.recurring.push({ id: "r_gym", name: "Gym membership", type: "expense", amount: 250, accountId: d.accounts[0].id, category: "Gym", freq: "monthly", day: 1 });
    app.persist(d, "test setup");
    UI.render();
  });
  await page.waitForTimeout(150);
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);

  console.log("\n=== 1) Edit opens a modal pre-filled with the current name ===");
  await page.click("span.pill:has-text('Gym') >> button:has-text('Edit')");
  await page.waitForTimeout(150);
  console.log("modal open:", await page.locator(".dialog").count() === 1);
  console.log("name pre-filled:", (await page.locator("#f_name").inputValue()) === "Gym");
  console.log("icon defaults to the plain tag (no custom icon yet):", (await page.locator("#f_icon").inputValue()) === "tag");

  console.log("\n=== 2) Picking a color + icon and renaming, all in one save ===");
  await page.locator(".icon-swatch[aria-label='Car']").click();
  await page.fill("#f_color", "#e34948");
  await page.fill("#f_name", "Sports Club");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  console.log("modal closed:", await page.locator(".dialog").count() === 0);
  console.log("old name is gone from the chip list:", await page.locator("span.pill:has-text('Gym')").count() === 0);
  console.log("new name shows instead:", await page.locator("span.pill:has-text('Sports Club')").count() === 1);

  console.log("\n=== 3) The rename cascaded to the existing transaction and budget ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  console.log("the transaction's category followed the rename:", await page.locator(".card-row", { hasText: "monthly membership" }).locator("text=Sports Club").count() >= 0);
  const txCat = await page.evaluate(() => UI.app.state.data.tx.find(t => t.id === "tx_gym").category);
  console.log("tx.category is now 'Sports Club', not still 'Gym':", txCat === "Sports Club");
  const budgetKeys = await page.evaluate(() => Object.keys(UI.app.state.data.budgets));
  console.log("the budget key moved from Gym to Sports Club:", budgetKeys.includes("Sports Club") && !budgetKeys.includes("Gym"));
  const budgetAmt = await page.evaluate(() => UI.app.state.data.budgets["Sports Club"]);
  console.log("...and kept the same amount:", budgetAmt === 800);
  // Real bug caught in code review: a recurring rule holds its own
  // category (it posts a brand-new transaction from it every time it
  // fires, not a reference into an existing one), so the tx/budget
  // cascade above doesn't touch it on its own -- it needs its own line.
  const recurCat = await page.evaluate(() => UI.app.state.data.recurring.find(r => r.id === "r_gym").category);
  console.log("the recurring rule's own category followed the rename too:", recurCat === "Sports Club");

  console.log("\n=== 4) The new color/icon actually render on the category's own badges ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  const badgeStyle = await page.locator("span.pill:has-text('Sports Club') .cat-badge").getAttribute("style");
  console.log("the chip's own badge now shows the custom color:", (badgeStyle || "").includes("#e34948"));

  console.log("\n=== 5) A dark custom color still gets a legible (light) icon stroke ===");
  await page.click("span.pill:has-text('Sports Club') >> button:has-text('Edit')");
  await page.waitForTimeout(150);
  await page.fill("#f_color", "#0a0a0a");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const darkBadgeStyle = await page.locator("span.pill:has-text('Sports Club') .cat-badge").getAttribute("style");
  console.log("icon color flips to white/light against the near-black background:", (darkBadgeStyle || "").includes("color:#fff") || (darkBadgeStyle || "").includes("color: #fff"));

  console.log("\n=== 5b) Editing only the icon (never touching color) doesn't freeze the theme-neutral placeholder into a real stored color ===");
  // Real bug caught in code review: the color field always has to show
  // SOME concrete hex (a native <input type=color> can't be blank), so it
  // gets seeded with light mode's own --cat-neutral value -- if Save just
  // always stored whatever's in that field, editing a category's icon
  // only (never touching color) would silently turn "no custom color yet"
  // into a permanently wrong gray (light mode's, even under dark mode).
  await page.fill("#newExpenseCat", "Untouched Cat");
  await page.click("button:has-text('Add')");
  await page.waitForTimeout(150);
  await page.click("span.pill:has-text('Untouched Cat') >> button:has-text('Edit')");
  await page.waitForTimeout(150);
  await page.locator(".icon-swatch[aria-label='Home']").click();
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const untouchedStyle = await page.evaluate(() => UI.app.state.data.categoryStyles["expense|Untouched Cat"]);
  console.log("the icon was saved:", untouchedStyle && untouchedStyle.icon === "Home");
  console.log("...but no color override was ever stored:", !untouchedStyle || !("color" in untouchedStyle));

  console.log("\n=== 5c) An expense and an income category sharing a name stay independent ===");
  // Real bug caught in code review: nothing stops "Gym" existing as both
  // an expense AND an income category (addCategory only checks uniqueness
  // within the same kind) -- categoryStyles has to be keyed by kind too,
  // or customizing one would silently repaint/re-icon the other, and
  // deleting either would wipe both.
  await page.fill("#newIncomeCat", "Untouched Cat");
  await page.locator("label:has(#newIncomeCat) button").click();
  await page.waitForTimeout(150);
  console.log("an income category with the same name coexists:", await page.locator("span.pill:has-text('Untouched Cat')").count() === 2);
  const incomeStyleBefore = await page.evaluate(() => UI.app.state.data.categoryStyles["income|Untouched Cat"]);
  console.log("...and starts with no style of its own (unaffected by the expense one's Home icon):", !incomeStyleBefore);
  // Expense chips render before Income chips (catChips("expense", ...)
  // then catChips("income", ...)), so nth(1) is the income one.
  const incomePill = page.locator("span.pill:has-text('Untouched Cat')").nth(1);
  await incomePill.locator("button:has-text('Edit')").click();
  await page.waitForTimeout(150);
  console.log("editing the income one opens fresh (tag icon, not Home)", (await page.locator("#f_icon").inputValue()) === "tag");
  await page.locator(".icon-swatch[aria-label='Salary']").click();
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const expenseStyleAfter = await page.evaluate(() => UI.app.state.data.categoryStyles["expense|Untouched Cat"]);
  console.log("the expense category's own Home icon is untouched by the income edit:", expenseStyleAfter && expenseStyleAfter.icon === "Home");
  const incomeStyleAfter = await page.evaluate(() => UI.app.state.data.categoryStyles["income|Untouched Cat"]);
  console.log("the income category got its own separate Salary icon:", incomeStyleAfter && incomeStyleAfter.icon === "Salary");

  console.log("\n=== 6) Renaming to an already-existing name is rejected ===");
  await page.fill("#newExpenseCat", "Second Cat");
  await page.click("button:has-text('Add')");
  await page.waitForTimeout(150);
  await page.click("span.pill:has-text('Second Cat') >> button:has-text('Edit')");
  await page.waitForTimeout(150);
  await page.fill("#f_name", "Sports Club");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(150);
  console.log("blocked with an error, modal stays open:", await page.locator(".dialog-err").count() === 1 && await page.locator(".dialog").count() === 1);
  await page.click("button:has-text('Cancel')");

  console.log("\n=== 7) Deleting a category also drops its own style override (no orphaned entry) ===");
  await page.click("span.pill:has-text('Second Cat') button.danger");
  await page.waitForTimeout(150);
  const stylesAfterDelete = await page.evaluate(() => UI.app.state.data.categoryStyles);
  console.log("'Second Cat' isn't lingering in categoryStyles:", !("Second Cat" in (stylesAfterDelete || {})));

  console.log("\n=== 8) A refund/investment_return transaction still finds its income category's own custom style ===");
  // Real bug caught in code review: several call sites (a transaction
  // card, a grouped-similar-transactions header) look up a row's own
  // category color/icon by its real `type`, not a bare "income"/
  // "expense" -- "refund" and "investment_return" are income-side
  // everywhere else in this app (categoryInUse, firstCategoryUseIds, the
  // rename cascade above all fold them in), so categoryColor()/
  // categoryIcon() have to as well, or a refund tagged with a customized
  // income category would silently miss its own styles["income|..."]
  // entry and fall back to the plain neutral/tag default.
  await page.fill("#newIncomeCat", "Bonus Test");
  await page.locator("label:has(#newIncomeCat) button").click();
  await page.waitForTimeout(150);
  await page.locator("span.pill:has-text('Bonus Test') >> button:has-text('Edit')").click();
  await page.waitForTimeout(150);
  await page.fill("#f_color", "#123456");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(150);
  const bonusColorForIncome = await page.evaluate(() => UI.app.categoryColor("Bonus Test", "income"));
  const bonusColorForRefund = await page.evaluate(() => UI.app.categoryColor("Bonus Test", "refund"));
  const bonusColorForInvReturn = await page.evaluate(() => UI.app.categoryColor("Bonus Test", "investment_return"));
  console.log("a plain 'income' lookup finds the real custom color (#123456):", bonusColorForIncome === "#123456");
  console.log("a 'refund'-typed lookup finds the exact same custom color:", bonusColorForRefund === "#123456");
  console.log("...and so does 'investment_return':", bonusColorForInvReturn === "#123456");

  console.log("\n=== 9) Deleting a category also warns when only a recurring rule (no tx, no budget) uses it ===");
  // Real gap caught in code review: categoryInUse() only checked tx/
  // budgets, not the exact recurring-rule case this PR's own rename
  // cascade fix was about -- a category with zero transactions and no
  // budget, but an active recurring rule, used to get the plain "Delete
  // X?" confirm with no warning at all.
  await page.fill("#newExpenseCat", "Rule Only");
  await page.click("button:has-text('Add')");
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const app = UI.app, d = app.state.data;
    d.recurring.push({ id: "r_rule_only", name: "Rule Only sub", type: "expense", amount: 50, accountId: d.accounts[0].id, category: "Rule Only", freq: "monthly", day: 1 });
    app.persist(d, "test setup");
    UI.render();
  });
  await page.waitForTimeout(150);
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  let ruleOnlyMsg = [];
  page.removeAllListeners("dialog");
  page.on("dialog", d => { ruleOnlyMsg.push(d.message()); d.dismiss(); });
  await page.click("span.pill:has-text('Rule Only') button.danger");
  await page.waitForTimeout(150);
  console.log("the confirm mentions the recurring rule:", ruleOnlyMsg.length === 1 && ruleOnlyMsg[0].includes("recurring rule"));
  console.log("...not the generic 'Delete X?' with no warning:", ruleOnlyMsg[0] !== "Delete Rule Only?");

  console.log("\n=== 10) Renaming onto a name with a leftover orphaned budget never discards it ===");
  // Real bug caught in code review: deleteCategory deliberately keeps a
  // deleted category's own budget entry ("stays until you remove it
  // separately"), so a DIFFERENT category can later be renamed onto that
  // exact freed-up name -- the rename used to overwrite the leftover
  // budget with no warning, silently losing whichever amount was there.
  await page.selectOption("#budgetCat", "Rule Only");
  await page.fill("#budgetAmt", "300");
  await page.click("button:has-text('Set budget')");
  await page.waitForTimeout(150);
  await page.evaluate(() => (window.confirm = () => true)); // accept the delete-in-use warning below
  await page.click("span.pill:has-text('Rule Only') button.danger");
  await page.waitForTimeout(150);
  console.log("'Rule Only' deleted but its own $300 budget deliberately stays:", await page.evaluate(() => UI.app.state.data.budgets["Rule Only"]) === 300);
  await page.fill("#newExpenseCat", "Reused Name");
  await page.click("button:has-text('Add')");
  await page.waitForTimeout(150);
  await page.selectOption("#budgetCat", "Reused Name");
  await page.fill("#budgetAmt", "75");
  await page.click("button:has-text('Set budget')");
  await page.waitForTimeout(150);
  await page.click("span.pill:has-text('Reused Name') >> button:has-text('Edit')");
  await page.waitForTimeout(150);
  await page.fill("#f_name", "Rule Only");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(150);
  const finalBudgets = await page.evaluate(() => UI.app.state.data.budgets);
  console.log("the leftover 'Rule Only' budget ($300) is untouched, not overwritten:", finalBudgets["Rule Only"] === 300);
  console.log("...and the renamed category's own $75 budget is still there too, just under its old key:", finalBudgets["Reused Name"] === 75);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
