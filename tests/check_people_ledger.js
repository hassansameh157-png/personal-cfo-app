// People screen "Ledger" redesign: a portfolio-level hero (same .hero-card.alt
// Person Detail already uses, just for everyone at once), a "Needs a look"
// priority strip, and a status ring around every avatar -- all additive next
// to the existing People Recut structure (.person-card, .card-row-meta,
// summary tile counts, search, settled-collapse...), none of which changed.
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
  await page.click(".navbtn:has-text('People')");
  await page.waitForTimeout(300);

  console.log("=== 1) Portfolio hero -- same .hero-card.alt treatment Person Detail already uses ===");
  console.log("hero present:", await page.locator(".hero-card.alt").count() === 1);
  const heroVal = await page.locator(".hero-card.alt .hero-value").innerText();
  console.log("hero shows a real net figure:", /EGP/.test(heroVal));
  const owed = await page.locator(".hero-card.alt .hero-sub-value").nth(0).innerText();
  const owe = await page.locator(".hero-card.alt .hero-sub-value").nth(1).innerText();
  const relCount = await page.locator(".hero-card.alt .hero-sub-value").nth(2).innerText();
  console.log("relationships count matches the real people count:", relCount === String(await page.evaluate(() => UI.app.state.data.people.length)));

  console.log("\n=== 2) Priority strip -- overdue people float first, then largest balance ===");
  console.log("priority strip present:", await page.locator(".priority-strip").count() === 1);
  const priorityNames = await page.locator(".priority-name").allInnerTexts();
  console.log("priority strip lists real names:", priorityNames.length > 0);
  // Hazem carries a genuinely overdue installment (MacBook Pro plan) despite
  // an overall positive net -- confirms overdue wins the sort regardless of
  // which direction the balance runs, not just "biggest number first".
  console.log("Hazem (has a real overdue installment) appears in the priority strip:", priorityNames.includes("Hazem"));

  console.log("\n=== 3) Status rings on avatars -- color reflects overdue/net, not decoration ===");
  const hazemCard = page.locator(".person-card", { hasText: "Hazem" });
  const hazemRingColor = await hazemCard.locator(".avatar-ring").first().evaluate(el => el.style.getPropertyValue("--ring-c").trim());
  console.log("Hazem's card ring is the overdue/neg color despite his positive net (has a real overdue plan):", hazemRingColor === "var(--c-neg)");
  // No one in the seed data is actually settled (every real person carries
  // a nonzero net) -- add one fresh, zero-balance person on the fly, same
  // way check_people_recut.js's own #45 does, to reach that state for real.
  await page.click("button:has-text('+ Person')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "Ledger Ring Neutral Test");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  // Scoped to .btn-secondary.block specifically -- since the "Ledger
  // refresh" batch, a plain `button:has-text("settled")` also matches the
  // new People tabs' own "Settled" pill (UI.setPeopleTab), which is a
  // different real button (a tab, not the collapse toggle) sharing the
  // same substring.
  const settledToggle = page.locator("button.btn-secondary.block", { hasText: "settled" });
  if (await settledToggle.count()) { await settledToggle.click(); await page.waitForTimeout(150); }
  const settledSectionRow = page.locator(".person-card", { hasText: "Ledger Ring Neutral Test" });
  const settledRing = await settledSectionRow.locator(".avatar-ring").first().evaluate(el => el.style.getPropertyValue("--ring-c").trim());
  console.log("a genuinely settled person's ring is the plain neutral line color, not empty (real bug fix, see engine/ui comments):", settledRing === "var(--c-line)");

  console.log("\n=== 4) Amount tag under each person's net figure ===");
  const ahmedCard = page.locator(".person-card", { hasText: "Ahmed Fathy" });
  const ahmedTag = await ahmedCard.locator(".amt-tag").first().innerText();
  console.log("a person I owe reads 'you owe', not a bare sign:", ahmedTag.toLowerCase().includes("you owe"));
  const hazemTag = await hazemCard.locator(".amt-tag").first().innerText();
  console.log("a person who owes me reads 'owes you':", hazemTag.toLowerCase().includes("owes you"));

  console.log("\n=== 5) Nothing pre-existing broke: search, summary tile, settled-collapse all still work ===");
  const countBefore = await page.locator(".person-card").count();
  await page.fill(".tx-search-row input", "Hazem");
  await page.waitForTimeout(200);
  console.log("search still narrows the list:", await page.locator(".person-card").count() < countBefore);
  await page.fill(".tx-search-row input", "");
  await page.waitForTimeout(200);
  const summaryLabels = await page.locator(".tile-grid .pos-label").allTextContents();
  console.log("original count-summary tile is untouched:", ["People who owe me", "People I owe", "Settled"].every(l => summaryLabels.includes(l)));

  console.log("\n=== 6) Person Detail carries the same ring language on its own header avatar ===");
  await hazemCard.locator(".card-row-title").click();
  await page.waitForTimeout(300);
  console.log("header avatar has a status ring too:", await page.locator(".tab-head .avatar-ring").count() === 1);
  const headerRing = await page.locator(".tab-head .avatar-ring").evaluate(el => el.style.getPropertyValue("--ring-c").trim());
  console.log("same overdue-aware color as the list card had:", headerRing === "var(--c-neg)");
  console.log("net hero (.hero-card.alt, pre-existing) still renders correctly underneath it:", await page.locator(".hero-card.alt .hero-value").count() === 1);

  console.log("\n=== 7) Real bug caught in review: .priority-strip must actually stay hidden at desktop widths, not just carry the .mobile-only class ===");
  const desktopPage = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await desktopPage.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  await desktopPage.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await desktopPage.waitForTimeout(300);
  await desktopPage.click(".navbtn:has-text('People')");
  await desktopPage.waitForTimeout(300);
  const desktopDisplay = await desktopPage.locator(".priority-strip").first().evaluate(el => getComputedStyle(el).display);
  console.log("computed display at 1200px is actually none, not flex (a same-specificity .mobile-only/.priority-strip tie used to resolve by source order, not intent):", desktopDisplay === "none");
  await desktopPage.close();

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
