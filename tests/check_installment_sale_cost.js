const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Cost of goods sold on an "Installment sale": real gap fixed, per direct
// user request. Before this, a sale's only money fields were its total
// (split across the installment schedule) and an optional down payment --
// nothing captured what the goods actually cost, so no account balance
// ever reflected the real cash outlay at the moment of the sale, and there
// was no way to see the margin (Cost vs. Sale price vs. Revenue, in the
// user's own words). Cost:
//   - is a brand-new, fully independent field (not derived from total/down
//     -- it can be more, less, or equal to either)
//   - is deducted from its own chosen account IN FULL, ONCE, right when the
//     sale is recorded -- not spread over the installment schedule the way
//     the sale price is, because the cost was already incurred then
//   - is optional, defaults to 0 (a good already owned, nothing new spent)
//   - only exists on "sale" (direction "in"), never "purchase" -- a
//     purchase's own total already IS the cost, there's no separate
//     "cost of the goods" concept to track on top of it
// Profit (= Sale total − Cost) shows on the Installments screen once at
// least one sale actually records a cost, both as a per-plan figure and as
// an aggregate KPI, "realized" scaled to how much has actually been
// collected so far -- matching the user's own framing of the margin being
// achieved gradually with collection, not banked in full on day one.
//
// Real bug caught by code review, fixed before shipping: the account
// check (cost > 0 requires an account) let a NEGATIVE cost straight
// through (-200 <= 0 skips that check same as 0 does), posting no real
// transaction but still storing -200 on the plan -- silently inflating
// that plan's own profit AND the aggregate KPIs with a number no actual
// cash movement backs, and with no way to trace it since the negative-cost
// plan's own Cost/Profit line stays hidden (it only shows for cost > 0).
// Test 2b reproduces this exact scenario.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  await page.click(".navbtn:has-text('Installments')");
  await page.waitForTimeout(200);

  console.log("=== 1) The Cost fields exist on Sale, defaulting to 0/blank, but NOT on Purchase ===");
  await page.click("button:has-text('+ Installment sale')"); await page.waitForTimeout(200);
  console.log("Cost field present on Sale:", await page.locator("#f_cost").count() === 1);
  console.log("Cost account field present on Sale:", await page.locator("#f_costAccountId").count() === 1);
  console.log("Cost defaults to 0 (same convention as Down payment/Balloon):", await page.locator("#f_cost").inputValue() === "0");
  console.log("Cost account defaults to the blank 'No cost to deduct' placeholder:", await page.locator("#f_costAccountId").inputValue() === "");
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);
  await page.click("button:has-text('+ Installment purchase')"); await page.waitForTimeout(200);
  console.log("Cost field absent on Purchase (a purchase's own total already IS the cost):", await page.locator("#f_cost").count() === 0);
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 2) Cost > 0 with no account picked is refused, same as any other field that needs an account once its amount is real ===");
  await page.click("button:has-text('+ Installment sale')"); await page.waitForTimeout(200);
  const personOpt = await page.locator("#f_personId option").nth(1).getAttribute("value");
  await page.selectOption("#f_personId", personOpt);
  await page.fill("#f_title", "Cost-guard test sale");
  await page.fill("#f_total", "5000");
  await page.fill("#f_down", "0");
  await page.fill("#f_cost", "1200");
  await page.fill("#f_count", "5");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const errText = await page.locator(".dialog-err").innerText().catch(() => "");
  console.log("blocked with a real error, modal stays open:", errText.length > 0 && await page.locator(".dialog").count() === 1);
  console.log("error names the actual problem (which account):", /account/i.test(errText));

  console.log("\n=== 2b) Real bug caught in review, fixed before shipping: a negative cost is refused too, not just a missing account ===");
  await page.fill("#f_cost", "-200");
  await page.selectOption("#f_costAccountId", "cash");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const negErrText = await page.locator(".dialog-err").innerText().catch(() => "");
  console.log("blocked, modal stays open:", negErrText.length > 0 && await page.locator(".dialog").count() === 1);
  console.log("no plan/transaction was created from the refused negative-cost attempt:", await page.evaluate(() => !UI.app.state.data.tx.some(t => t.desc === "Cost of goods — Cost-guard test sale")));
  await page.fill("#f_cost", "1200");

  console.log("\n=== 3) Cost, Down payment and Sale total are genuinely independent (three different numbers, three different accounts) ===");
  const cashBefore = await page.evaluate(() => UI.app.derive().bal["cash"]);
  const vfBefore = await page.evaluate(() => UI.app.derive().bal["vf"]);
  const cibBefore = await page.evaluate(() => UI.app.derive().bal["cib"]);
  await page.selectOption("#f_accountId", "cash"); // down payment into Cash
  await page.selectOption("#f_costAccountId", "vf"); // cost paid from Vodafone Cash
  await page.fill("#f_down", "800");
  // total (5000), down (800) and cost (1200) all deliberately different --
  // nothing here is derived from anything else.
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  console.log("no leftover JS error from the fix:", errors.length === 0);
  const plan = await page.evaluate(() => UI.app.state.data.plans[UI.app.state.data.plans.length - 1]);
  console.log("plan stores its own cost, independent of total/down:", plan.cost === 1200 && plan.total === 5000 && plan.down === 800);
  console.log("plan stores which account the cost came from:", plan.costAccountId === "vf");
  const costTx = await page.evaluate(() => UI.app.state.data.tx.slice().reverse().find(t => t.type === "installment_cost"));
  console.log("a real installment_cost transaction was posted:", !!costTx && costTx.amount === 1200 && costTx.accountId === "vf" && costTx.planId === plan.id);
  const cashAfter = await page.evaluate(() => UI.app.derive().bal["cash"]);
  const vfAfter = await page.evaluate(() => UI.app.derive().bal["vf"]);
  const cibAfter = await page.evaluate(() => UI.app.derive().bal["cib"]);
  console.log("Cash went up by exactly the down payment (800), not the cost:", Math.round((cashAfter - cashBefore) * 100) / 100 === 800);
  console.log("Vodafone Cash went DOWN by exactly the cost (1200), not touched by the down payment:", Math.round((vfAfter - vfBefore) * 100) / 100 === -1200);
  console.log("CIB (unrelated account) untouched:", cibAfter === cibBefore);

  console.log("\n=== 4) Installments screen surfaces Profit once a real cost exists ===");
  await page.waitForTimeout(200);
  const profitTiles = page.locator(".pos-label", { hasText: "Profit" });
  console.log("a 'Profit margin' KPI tile now shows under Owed to me:", await page.locator(".pos-label", { hasText: "Profit margin" }).count() === 1);
  console.log("a 'Profit so far' KPI tile shows too:", await page.locator(".pos-label", { hasText: "Profit so far" }).count() === 1);
  const planCard = page.locator(".card-row", { hasText: "Cost-guard test sale" });
  const cardMeta = await planCard.innerText();
  console.log("the plan's own card shows its Cost:", cardMeta.includes("Cost:") && cardMeta.includes("1,200") || cardMeta.includes("1200"));
  console.log("...and its Profit (5000 total − 1200 cost = 3800):", cardMeta.includes("3,800") || cardMeta.includes("3800"));

  console.log("\n=== 5) An older/legacy plan with no cost recorded shows no Cost/Profit line (no clutter) ===");
  const macbookCard = page.locator(".card-row", { hasText: "MacBook Pro sold to Hazem" });
  const macbookMeta = await macbookCard.innerText();
  console.log("no 'Cost:' line on a plan that never recorded one:", !macbookMeta.includes("Cost:"));

  console.log("\n=== 6) The cost transaction shows correctly in Transactions: labeled, and signed as an outflow ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  const costRow = page.locator(".card-row", { hasText: "Cost of goods" }).first();
  console.log("cost row is visible, labeled 'Cost of goods':", await costRow.count() === 1);
  console.log("shown as a negative (outflow), same tone-neg convention as an expense:", await costRow.locator(".card-row-amt.tone-neg").count() === 1);
  console.log("filterable via the type dropdown:", await page.locator("select", { has: page.locator("option", { hasText: "All types" }) }).locator("option", { hasText: "Cost of goods" }).count() === 1);

  console.log("\n=== 7) Deleting the plan (nothing paid against the schedule yet) reverses BOTH the down payment and the cost ===");
  await page.click(".navbtn:has-text('Installments')"); await page.waitForTimeout(200);
  // deletePlanC() gates on a real confirm() dialog (UI.hapticConfirm()) --
  // accept it, same pattern check_haptic_feedback.js itself uses.
  page.once("dialog", (d) => d.accept());
  await planCard.locator("button:has-text('Delete plan')").click(); await page.waitForTimeout(250);
  const cashAfterDelete = await page.evaluate(() => UI.app.derive().bal["cash"]);
  const vfAfterDelete = await page.evaluate(() => UI.app.derive().bal["vf"]);
  console.log("Cash back to its pre-sale balance (down payment reversed):", cashAfterDelete === cashBefore);
  console.log("Vodafone Cash back to its pre-sale balance (cost reversed):", vfAfterDelete === vfBefore);
  console.log("the plan itself is gone:", await page.evaluate((id) => !UI.app.state.data.plans.some(p => p.id === id), plan.id));

  console.log("\n=== 8) Arabic mode: the new labels are real Arabic, not a silent English fallback ===");
  await page.evaluate(() => { UI.app.state.lang = "ar"; UI.render(); });
  await page.waitForTimeout(200);
  await page.click("button:has-text('+ بيع بالتقسيط')"); await page.waitForTimeout(200);
  await page.selectOption("#f_personId", personOpt);
  await page.fill("#f_title", "بيع تجربة عربي");
  await page.fill("#f_total", "2000");
  await page.fill("#f_down", "0");
  await page.selectOption("#f_costAccountId", "cash");
  await page.fill("#f_cost", "500");
  await page.fill("#f_count", "4");
  await page.click("button:has-text('حفظ')"); await page.waitForTimeout(250);
  const arProfitTile = await page.locator(".pos-label", { hasText: "هامش الربح" }).count();
  console.log("Arabic 'Profit margin' KPI label renders:", arProfitTile === 1);
  await page.click(".navbtn:has-text('الحركات')"); await page.waitForTimeout(200);
  console.log("the cost transaction's Arabic type label renders (not a raw English fallback):", await page.locator("text=تكلفة بضاعة مباعة").count() >= 1);
  await page.evaluate(() => { UI.app.state.lang = "en"; UI.render(); });

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
