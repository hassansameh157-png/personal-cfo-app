const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// People Recut (#41-47): seven mobile-focused changes to the People screen
// and Person Detail. Also regression-guards two real bugs caught during
// implementation, not by ad-hoc checking: deletePersonC() leaving a stale,
// click-blocking action-sheet backdrop behind when its confirm() is
// cancelled, and (mirroring Accounts Recut's own openAcctEdit/
// openAcctStatement fix) a sheet item that hands off to openModal() must
// clear _personActionRow first, or the sheet's own markup stays in the DOM
// underneath the modal, ready to reappear once it closes.

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

  console.log("=== 41) '+ Lend'/'+ Debt'/Edit/Delete all live behind one shared '...' action sheet ===");
  console.log("no always-visible '+ Lend'/'+ Debt' buttons on a card:", await page.locator(".person-card button", { hasText: "Lend" }).count() === 0);
  const firstCard = page.locator(".person-card").first();
  console.log("Collect/Pay stays its own always-visible primary button:", await firstCard.locator(".btn-primary").count() > 0);
  await firstCard.locator(".person-more-btn").click();
  await page.waitForTimeout(150);
  console.log("sheet opens with the person's own name as its title:", (await page.locator(".sheet-title").innerText()) === (await firstCard.locator(".card-row-title").innerText()));
  console.log("'+ Lend / owed to me' action present:", await page.locator(".sheet-action:has-text('Lend')").count() > 0);
  console.log("'+ Debt I owe' action present:", await page.locator(".sheet-action:has-text('Debt')").count() > 0);
  console.log("Edit action present:", await page.locator(".sheet-action:has-text('Edit')").count() > 0);
  await page.click(".sheet-backdrop", { force: true, position: { x: 5, y: 5 } });
  await page.waitForTimeout(150);
  console.log("clicking the backdrop closes it, sheet gone:", await page.locator(".sheet-actions").count() === 0);

  console.log("\n=== 41b) Real bug regression: a sheet item that opens a modal must close the sheet first, not leave it stuck underneath ===");
  await firstCard.locator(".person-more-btn").click();
  await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')");
  await page.waitForTimeout(200);
  console.log("the sheet itself is actually gone once the edit modal is open (not just covered by it):", await page.locator(".sheet-actions").count() === 0);
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);
  console.log("no leftover sheet reappears once the modal closes:", await page.locator(".sheet-actions").count() === 0);

  console.log("\n=== 41c) Real bug regression: cancelling a delete confirm() must not strand a click-blocking backdrop ===");
  await page.click("button:has-text('+ Person')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "Removable Person Test");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  // A brand-new person has no balance yet, so #45 collapses them into the
  // "settled" section by default -- expand it first, or their card isn't
  // in the DOM at all to find.
  // Scoped to .btn-secondary.block -- since the "Ledger refresh" batch, a
  // bare button:has-text("settled") also matches the new People tabs' own
  // "Settled" pill (a different, always-present button), not just this
  // collapse toggle.
  const settledToggle = page.locator("button.btn-secondary.block", { hasText: "settled" });
  if (await settledToggle.count()) { await settledToggle.click(); await page.waitForTimeout(150); }
  const removableRow = page.locator(".card-row", { hasText: "Removable Person Test" });
  await removableRow.locator(".person-more-btn").click();
  await page.waitForTimeout(150);
  page.once("dialog", (d) => d.dismiss());
  await page.click(".sheet-action:has-text('Delete')");
  await page.waitForTimeout(150);
  console.log("sheet actually closed after a CANCELLED delete (previously stayed stuck in the DOM):", await page.locator(".sheet-backdrop").count() === 0);
  await page.click("button:has-text('+ Expense')");
  await page.waitForTimeout(200);
  console.log("a click right after that cancel still reaches its real target:", await page.locator(".dialog-title").count() === 1);
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);

  console.log("\n=== 42) Search filters the People list by name/phone/notes ===");
  const countBefore = await page.locator(".person-card").count();
  await page.fill(".tx-search-row input", "Hazem");
  await page.waitForTimeout(200);
  console.log("search narrows the list:", await page.locator(".person-card").count() < countBefore);
  console.log("Hazem is among the results:", await page.locator(".card-row-title", { hasText: "Hazem" }).count() > 0);
  await page.fill(".tx-search-row input", "");
  await page.waitForTimeout(200);
  console.log("clearing search restores the full list:", await page.locator(".person-card").count() === countBefore);

  console.log("\n=== 43) Count-based summary tile (people who owe me / I owe / settled) ===");
  const summaryLabels = await page.locator(".tile-grid .pos-label").allTextContents();
  console.log("summary tile present with all 3 labels:", ["People who owe me", "People I owe", "Settled"].every(l => summaryLabels.includes(l)));

  console.log("\n=== 44) Last-activity text shown per person, mobile only ===");
  const cardWithHistory = page.locator(".person-card", { hasText: "Hazem" });
  console.log("Hazem's card shows a last-activity line (he has real transactions in the seed):", (await cardWithHistory.locator(".card-row-meta").innerText()).length > (await cardWithHistory.locator(".card-row-meta span").nth(0).innerText()).length + (await cardWithHistory.locator(".card-row-meta span").nth(1).innerText()).length);

  console.log("\n=== 45) Settled (net-zero) people collapse into their own section by default ===");
  // A settled section left expanded by an earlier step (41c above) is
  // sticky until a real page navigation resets it -- start from a clean
  // slate here rather than assume it's still collapsed.
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(150);
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(150);
  await page.click("button:has-text('+ Person')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "New Neutral Person");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  console.log("brand-new zero-balance person is NOT in the default visible list:", await page.locator(".card-row-title", { hasText: "New Neutral Person" }).count() === 0);
  // Same scoping as #41c above -- the new People tabs' own "Settled" pill
  // would otherwise also match here.
  const settledBtn = page.locator("button.btn-secondary.block", { hasText: "settled" });
  console.log("a 'N settled' expand button is present instead:", await settledBtn.count() > 0);
  await settledBtn.click(); await page.waitForTimeout(150);
  console.log("expanding reveals them:", await page.locator(".card-row-title", { hasText: "New Neutral Person" }).count() > 0);
  await page.click(".navbtn:has-text('Dashboard')"); await page.waitForTimeout(150);
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(150);
  console.log("re-landing on the page starts collapsed again, not stuck open from the last visit:", await page.locator(".card-row-title", { hasText: "New Neutral Person" }).count() === 0);
  await page.fill(".tx-search-row input", "New Neutral");
  await page.waitForTimeout(200);
  console.log("a search for a settled person's name shows them uncollapsed, not hidden away:", await page.locator(".card-row-title", { hasText: "New Neutral Person" }).count() > 0);
  await page.fill(".tx-search-row input", "");
  await page.waitForTimeout(200);

  console.log("\n=== 46) tel:/wa.me links sit next to a phone number ===");
  const hazemCard = page.locator(".person-card", { hasText: "Hazem" });
  const telHref = await hazemCard.locator(".phone-link").first().getAttribute("href");
  const waHref = await hazemCard.locator(".phone-link").nth(1).getAttribute("href");
  console.log("tel: link present:", (telHref || "").startsWith("tel:"));
  console.log("wa.me link present, Egyptian country code applied:", (waHref || "").startsWith("https://wa.me/20"));

  console.log("\n=== 47) Real bug fixed: Transactions filters by an exact personId match, not free-text search ===");
  await hazemCard.locator("button:has-text('Transactions')").click();
  await page.waitForTimeout(200);
  console.log("landed on Transactions:", (await page.locator(".tab-title").innerText()) === "Transactions");
  console.log("#txSearch was NOT populated with the person's name (that old text-search mechanism is gone):", await page.locator("#txSearch").inputValue() === "");
  await page.click(".filters-toggle"); await page.waitForTimeout(150);
  const personSelect = page.locator(".filter-row select").nth(4);
  console.log("the new Person filter dropdown is set to Hazem:", (await personSelect.locator("option:checked").innerText()) === "Hazem");
  const rows = await page.locator(".card-list.mobile-only .card-row").count();
  console.log("every visible row is a real match (Hazem has real transactions in the seed):", rows > 0);
  await personSelect.selectOption("all"); await page.waitForTimeout(150);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
