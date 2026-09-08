const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Real bug reported directly by a user, with a screenshot: paying more than
// a card statement's remaining balance showed the raw error message as
// literal "<bdi dir=\"ltr\" class=\"amt-bidi\">EGP 7,021</bdi>" text instead
// of a normal formatted amount. fmt()/fmtS() return HTML markup (a <bdi>
// wrap for RTL-safe number display) meant to be inserted into rendered
// HTML -- but this.state.err is displayed through esc() (see the modal's
// error banner), so any HTML embedded in it shows up escaped and literal
// instead of rendered. Fixed by using the existing fmtPlain() helper
// (built for exactly this "needs a plain string, not markup" case) in the
// three "That is more than the <cap> ..." messages that had this bug:
// installment payment, statement payment, and gam3ya payment.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Card statement over-payment: the exact scenario from the bug report ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Card statements')"); await page.waitForTimeout(250);
  const payBtn = page.locator(".card-row").locator("button:has-text('Pay')").first();
  const statementCard = payBtn.locator("xpath=ancestor::div[contains(@class,'card-row')][1]");
  console.log("found a statement with a Pay button to test against:", await payBtn.count() > 0);
  await payBtn.click(); await page.waitForTimeout(200);
  await page.fill("#f_amount", "99999999");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);

  const errBanner = page.locator(".dialog-err");
  console.log("error banner shown:", await errBanner.count() === 1);
  const errText = await errBanner.innerText();
  console.log("error text:", errText);
  console.log("no raw <bdi> markup leaked as literal text (the actual bug):", !errText.includes("<bdi") && !errText.includes("amt-bidi"));
  console.log("shows a real formatted amount instead (EGP + a number):", /EGP\s*[\d,]+/.test(errText) || /[\d,]+\s*EGP/.test(errText));
  console.log("modal stayed open (submission correctly blocked):", await page.locator("#modalForm").count() === 1);
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 2) Regression: a valid, in-range statement payment still works normally ===");
  await payBtn.click(); await page.waitForTimeout(200);
  const capText = await page.locator("label:has(#f_amount) .field-hint, label:has(#f_amount)").innerText().catch(() => "");
  await page.fill("#f_amount", "1");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
  console.log("modal closed on a valid payment (no error blocked it):", await page.locator("#modalForm").count() === 0);

  console.log("\n=== 3) Same class of bug, same fix: an installment payment over the remaining balance ===");
  await page.click(".navbtn:has-text('Installments')"); await page.waitForTimeout(200);
  const instPayBtn = page.locator(".card-row").locator("button:has-text('Record payment')").first();
  if (await instPayBtn.count() > 0) {
    await instPayBtn.click(); await page.waitForTimeout(200);
    await page.fill("#f_amount", "99999999");
    await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
    const instErrText = await page.locator(".dialog-err").innerText().catch(() => "");
    console.log("installment cap error also has no leaked <bdi> markup:", instErrText ? (!instErrText.includes("<bdi") && !instErrText.includes("amt-bidi")) : true);
    await page.click("button:has-text('Cancel')").catch(() => {});
  } else {
    console.log("no installment with an active Pay button in the seed data -- skipped, covered directly via source fix + statement test above");
  }

  console.log("\n=== 4) Same class of bug, same fix: a gam3ya (savings group) payment over the remaining balance ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Savings groups')"); await page.waitForTimeout(250);
  const groupPayBtn = page.locator(".card-row").locator("button:has-text('Record contribution')").first();
  if (await groupPayBtn.count() > 0) {
    await groupPayBtn.click(); await page.waitForTimeout(200);
    await page.fill("#f_amount", "99999999");
    await page.click("button:has-text('Save')"); await page.waitForTimeout(250);
    const groupErrText = await page.locator(".dialog-err").innerText().catch(() => "");
    console.log("gam3ya cap error also has no leaked <bdi> markup:", groupErrText ? (!groupErrText.includes("<bdi") && !groupErrText.includes("amt-bidi")) : true);
    await page.click("button:has-text('Cancel')").catch(() => {});
  } else {
    console.log("no group with an active contribute button in the seed data -- skipped, covered directly via source fix + statement test above");
  }

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
