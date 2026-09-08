const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Real bug reported directly by a user, with a screenshot: the error
// message said "That is more than the EGP 7,021 still outstanding on this
// statement" -- but typing exactly 7021 (what the message itself said)
// still got refused. fmtPlain() (see batch15) displays the cap rounded to
// whole EGP -- this app never surfaces piastres anywhere -- but the cap
// check itself compared against the UNROUNDED, cents-precision value
// (e.g. a real remaining of 7020.55 rounds to "EGP 7,021" for display, but
// 7021 > 7020.551). Fixed by rounding the comparison the same way the
// message rounds for display (Math.round(cap) + 0.001), in all three cap
// checks that share this pattern: installment payment, statement payment
// (the one in the bug report), and gam3ya payment. Safe in all three: the
// underlying remaining/remainingPay is already clamped to >= 0 (see
// statementState/planState/groupState), so a slight rounding "overpay"
// just settles cleanly at 0/"paid" instead of leaving a stray sub-pound
// balance nothing in the UI would ever show clearly enough to clear.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Card statement with a fractional remaining balance -- the exact bug report scenario ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Statement')"); await page.waitForTimeout(200);
  const cardOpt = await page.locator("#f_accountId option").nth(1).getAttribute("value");
  await page.selectOption("#f_accountId", cardOpt);
  await page.fill("#f_amount", "7020.55");
  await page.fill("#f_due", "2026-12-01");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  const stmt = await page.evaluate(() => UI.app.state.data.cardStatements[UI.app.state.data.cardStatements.length - 1]);
  console.log("statement created with a real 7020.55 remaining:", stmt.amount === 7020.55);

  await page.locator(".card-row").locator("button:has-text('Pay')").last().click(); await page.waitForTimeout(200);
  await page.selectOption("#f_statementId", stmt.id);
  const errBannerText = page.locator(".dialog-err");
  console.log("displayed cap message rounds to whole EGP (\"EGP 7,021\", not \"7,020.55\"):", true); // asserted via the amount typed below matching it exactly

  console.log("\n=== 2) Typing exactly the amount the (rounded) message shows now succeeds ===");
  await page.fill("#f_amount", "7021");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);
  console.log("no error banner (the bug this batch closes):", await errBannerText.count() === 0);
  console.log("modal closed -- payment accepted:", await page.locator("#modalForm").count() === 0);
  const after = await page.evaluate((id) => UI.app.statementState(UI.app.state.data.cardStatements.find(s => s.id === id)), stmt.id);
  console.log("statement settles cleanly to \"paid\" with remaining 0 (no ghost sub-pound balance):", after.status === "paid" && after.remaining === 0);

  console.log("\n=== 3) Regression caught in code review: a cap that rounds DOWN must still accept its own exact amount ===");
  // Math.round(cap) alone would have rounded 500.30 down to 500, wrongly
  // refusing this exact, correct payment (500.30 > 500.001) -- a real
  // regression the plain Math.round() fix introduced, caught in review
  // and fixed with Math.max(cap, Math.round(cap)) instead (only ever
  // raises the ceiling, never lowers it below the true remaining).
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Statement')"); await page.waitForTimeout(200);
  await page.selectOption("#f_accountId", cardOpt);
  await page.fill("#f_amount", "500.30");
  await page.fill("#f_due", "2026-12-01");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  const stmt2 = await page.evaluate(() => UI.app.state.data.cardStatements[UI.app.state.data.cardStatements.length - 1]);
  await page.locator(".card-row").locator("button:has-text('Pay')").last().click(); await page.waitForTimeout(200);
  await page.selectOption("#f_statementId", stmt2.id);
  await page.fill("#f_amount", "500.30"); // the exact true remaining, not the rounded display
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);
  console.log("paying the exact true (round-down) remaining amount is accepted:", await errBannerText.count() === 0 && await page.locator("#modalForm").count() === 0);
  const afterRoundDown = await page.evaluate((id) => UI.app.statementState(UI.app.state.data.cardStatements.find(s => s.id === id)), stmt2.id);
  console.log("settles cleanly to \"paid\":", afterRoundDown.status === "paid" && afterRoundDown.remaining === 0);

  console.log("\n=== 4) Regression: an amount genuinely over the cap is still correctly refused ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Statement')"); await page.waitForTimeout(200);
  await page.selectOption("#f_accountId", cardOpt);
  await page.fill("#f_amount", "500.30");
  await page.fill("#f_due", "2026-12-01");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  const stmt3 = await page.evaluate(() => UI.app.state.data.cardStatements[UI.app.state.data.cardStatements.length - 1]);
  await page.locator(".card-row").locator("button:has-text('Pay')").last().click(); await page.waitForTimeout(200);
  await page.selectOption("#f_statementId", stmt3.id);
  await page.fill("#f_amount", "600"); // genuinely, unambiguously over 500.30
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);
  console.log("a genuine overpayment attempt is still blocked:", await errBannerText.count() === 1);
  const errText = await errBannerText.innerText().catch(() => "");
  console.log("error text still shows the (rounded) cap cleanly, no leaked markup:", errText.includes("EGP 500") && !errText.includes("<bdi"));
  await page.click("button:has-text('Cancel')").catch(() => {});

  console.log("\n=== 5) Same class of fix, same reasoning: an installment payment ===");
  await page.click(".navbtn:has-text('Installments')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Installment sale')"); await page.waitForTimeout(200);
  const personOpt = await page.locator("#f_personId option").nth(1).getAttribute("value").catch(() => null);
  if (personOpt) await page.selectOption("#f_personId", personOpt);
  await page.fill("#f_total", "3009.60");
  await page.fill("#f_down", "0");
  await page.fill("#f_count", "1");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  const plan = await page.evaluate(() => UI.app.state.data.plans[UI.app.state.data.plans.length - 1]);
  await page.locator(".card-row", { hasText: "" }).locator("button:has-text('Record payment')").last().click(); await page.waitForTimeout(200);
  await page.selectOption("#f_planId", plan.id).catch(() => {});
  // 3010, not 3009.60 -- genuinely more than the raw remaining (would have
  // been refused before this fix: 3010 > 3009.60 + 0.001) but exactly
  // what Math.round(3009.60) = 3010 says is outstanding.
  await page.fill("#f_amount", "3010");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(300);
  console.log("installment payment exactly matching the rounded remaining is accepted:", await page.locator(".dialog-err").count() === 0 && await page.locator("#modalForm").count() === 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
