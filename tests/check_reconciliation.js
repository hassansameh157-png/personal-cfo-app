// Loan/advance reconciliation -- picking a specific open loan on a
// receivable_payment/debt_payment (the new "Settles" field) closes that
// exact loan, shows the link in both directions on the person's page, and
// is capped to what that specific loan still owes. Also checks the old
// pool-FIFO behavior (no loan picked) still works unchanged.
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

  const addDebt = async (amount, desc) => {
    await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
    await page.click(".sheet-item:has-text('Receivables')"); await page.waitForTimeout(200);
    await page.click("button:has-text('+ Debt I owe')");
    await page.waitForTimeout(200);
    await page.fill("#f_amount", String(amount));
    await page.selectOption("#f_personId", { index: 1 });
    const personName = await page.locator("#f_personId option:checked").innerText();
    await page.fill("#f_desc", desc);
    await page.click("button:has-text('Save')");
    await page.waitForTimeout(200);
    return personName;
  };

  console.log("=== 1) Two separate debts to the same person ===");
  await addDebt(1000, "Loan A");
  const personName = await addDebt(500, "Loan B");
  console.log("person:", personName);

  console.log("\n=== 2) Open the person's page, pay Loan A specifically ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  await page.click(".card-row-title:has-text('" + personName + "')");
  await page.waitForTimeout(200);

  const loanARow = page.locator(".card-row", { hasText: "Loan A" });
  console.log("Loan A row visible before payment:", await loanARow.count() > 0);
  await loanARow.locator("button:has-text('Record payment')").click();
  await page.waitForTimeout(200);

  const settlesLabel = await page.locator("#f_settlesId option:checked").innerText().catch(() => "MISSING");
  console.log("settlesId pre-filled to:", settlesLabel);
  const settlesPicksLoanA = settlesLabel.includes("Loan A");

  console.log("\n=== 3) Cap check: typing more than Loan A's remaining is refused ===");
  await page.fill("#f_amount", "1500");
  await page.selectOption("#f_accountId", { index: 1 });
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const capErr = await page.locator(".dialog-err").innerText().catch(() => "MISSING");
  console.log("overpay error shown:", capErr);

  console.log("\n=== 4) Paying exactly Loan A's amount goes through ===");
  await page.fill("#f_amount", "1000");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);

  console.log("\n=== 5) Loan A now shows under Settled, Loan B still open ===");
  // A loan's own title legitimately appears more than once on this page --
  // once (still) in the History section below regardless of its own
  // settled state -- so "settled" is checked the same way loanSection()
  // itself decides it (loanRows()'s own rem <= 0.001): no "Record payment"
  // button on that specific loan's own row, not "title not found anywhere".
  const isSettled = async (desc) => (await page.locator(".card-row", { hasText: desc }).first().locator("button:has-text('Record payment')").count()) === 0;
  console.log("Loan A now settled (no Record payment button):", await isSettled("Loan A"));
  console.log("Loan B still open (has a Record payment button):", !(await isSettled("Loan B")));
  const settledToggle = page.locator("button:has-text('settled')");
  const hasToggle = await settledToggle.count() > 0;
  console.log("Settled toggle present:", hasToggle);
  if (hasToggle) {
    await settledToggle.click();
    await page.waitForTimeout(150);
    const settledLoanA = page.locator(".card-row", { hasText: "Loan A" });
    console.log("Loan A visible after expanding Settled:", await settledLoanA.count() > 0);
    const settledByTxt = await settledLoanA.locator(".card-row-sub", { hasText: "Settled by" }).innerText().catch(() => "MISSING");
    console.log("Loan A settled-by trail:", settledByTxt);
  }

  console.log("\n=== 6) History shows the payment with its Settles reference ===");
  const historyDebtPaymentRow = page.locator(".card-row", { hasText: "Record repayment" }).first();
  const settlesNote = await historyDebtPaymentRow.locator(".card-row-sub", { hasText: "Settles" }).innerText().catch(() => "MISSING");
  console.log("history 'Settles' note:", settlesNote);

  console.log("\n=== 7) Old behavior unaffected: a payment with NO loan picked still auto-settles the oldest open loan (Loan B) ===");
  const collectBtns = page.locator("button", { hasText: /^Pay$/ });
  if (await collectBtns.count()) {
    await collectBtns.first().click();
    await page.waitForTimeout(200);
    const autoSettles = await page.locator("#f_settlesId option:checked").innerText().catch(() => "MISSING");
    console.log("generic Pay button leaves Settles on auto:", autoSettles);
    await page.fill("#f_amount", "500");
    await page.selectOption("#f_accountId", { index: 1 });
    await page.click("button:has-text('Save')");
    await page.waitForTimeout(200);
    const saveErr = await page.locator(".dialog-err").innerText().catch(() => "");
    console.log("save error (should be empty):", saveErr || "(none)");
    console.log("Loan B closed via auto pool (no Record payment button left):", await isSettled("Loan B"));
  }

  console.log("\n=== 8) Real bug caught in review: shrinking an already-settled loan's own amount must free its excess direct payment back into the shared pool, not drop it ===");
  const personName2 = await addDebt(1000, "Loan C");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  await page.click(".card-row-title:has-text('" + personName2 + "')");
  await page.waitForTimeout(200);
  await page.locator(".card-row", { hasText: "Loan C" }).locator("button:has-text('Record payment')").click();
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "1000");
  await page.selectOption("#f_accountId", { index: 1 });
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  console.log("Loan C fully settled via a direct-linked payment:", await isSettled("Loan C"));

  // Edit the original Loan C transaction itself down to 200 (e.g. fixing a
  // typo after the fact) -- same Edit path History's own "..." sheet uses.
  // Scoped to the History section specifically -- unlike step 5's isSettled
  // helper, this needs the row that actually HAS a "..." actions trigger
  // (only History rows do; the loan section's own settled row does not).
  // hasText on the whole row would also match the repayment's own row --
  // its new "Settles: Loan C" sub-line (added by this feature) mentions the
  // same text -- so this matches on the row's *title* specifically, which
  // only the original loan transaction (not the payment referencing it) has.
  const historySection = page.locator(".section-title", { hasText: "History" }).locator("xpath=following-sibling::div[1]");
  const loanCHistoryRow = historySection.locator(".card-row", { has: page.locator(".card-row-title", { hasText: "Loan C" }) });
  await loanCHistoryRow.locator(".tx-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
  await page.waitForTimeout(200);
  await page.fill("#f_amount", "200");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);

  // Real bug caught in review: the "Settled by" trail must never show a
  // total bigger than the loan's own (now-edited) amount -- it originally
  // still listed the full original 1,000 payment against a loan that's now
  // only 200, the exact contradiction this whole trail exists to rule out.
  const loanCTrail = await page.locator(".card-row", { has: page.locator(".card-row-title", { hasText: "Loan C" }) }).first().locator(".card-row-sub", { hasText: "Settled by" }).innerText().catch(() => "MISSING");
  console.log("Loan C's settled-by trail after shrinking it to 200:", loanCTrail);
  console.log("trail no longer overclaims the full original 1,000:", !loanCTrail.includes("1,000"));

  // A fresh, unlinked 800 loan for the same person -- if the 800 excess the
  // shrink just freed correctly rejoined the shared pool, this settles it
  // immediately with no further action; if it was silently dropped instead,
  // this stays open.
  await addDebt(800, "Loan D");
  console.log("Loan D (800) auto-settled by the freed excess:", await isSettled("Loan D"));

  console.log("\n=== 9) Real bug reported by a user (screenshot): the Settles dropdown listed EVERY person's open loans, not just the one the payment is actually for ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  const ahmedRow = page.locator(".card-row.person-card", { hasText: "Ahmed Fathy" });
  await ahmedRow.locator("button:has-text('Pay')").click();
  await page.waitForTimeout(200);
  const scopedOpts = await page.locator("#f_settlesId option").allInnerTexts();
  console.log("Settles options (from Ahmed's own Pay button):", JSON.stringify(scopedOpts));
  console.log("exactly the placeholder + Ahmed's own one open loan, nothing more:", scopedOpts.length === 2);
  console.log("no OTHER person's name leaked into the list:", !scopedOpts.some(o => o.includes("Hazem") || o.includes("Sameh") || o.includes("Mohamed") || o.includes("Hussein")));

  console.log("\n=== 10) Changing Person mid-modal re-scopes Settles live, without wiping other unsaved fields ===");
  await page.fill("#f_amount", "321");
  await page.selectOption("#f_personId", { label: "Hazem" });
  await page.waitForTimeout(150);
  const afterSwitch = await page.locator("#f_settlesId option").allInnerTexts();
  console.log("Settles options updated to Hazem's own (Hazem has none open, so just the auto placeholder):", JSON.stringify(afterSwitch));
  console.log("amount typed just before the switch was NOT wiped (no full re-render):", await page.locator("#f_amount").inputValue() === "321");

  console.log("\nRESULT settlesId pre-fill correct:", settlesPicksLoanA);
  console.log("RESULT cap check fired:", capErr.includes("outstanding"));
  console.log("errors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
