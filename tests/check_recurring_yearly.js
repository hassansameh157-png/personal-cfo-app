// Real bug fixed (#30, a long-pending task): a yearly recurring rule
// stored only a day of month, never a month -- nextOccurrence()'s own
// yearly branch faked one by reading whatever month `from` happened to be
// AT CALL TIME (`x.setMonth(new Date(base).getMonth())`), so the computed
// "next occurrence" silently drifted to match whichever month you happened
// to check Forecast/Dashboard in, instead of staying pinned to a real
// fixed annual month. Fixed with a real `month` field (FORMS()' own
// locale-aware Month select), read by nextOccurrence() directly.
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Real bug regression: a yearly rule's own month no longer drifts to match whatever month it's checked in ===");
  const drift = await page.evaluate(() => {
    const app = UI.app;
    // December (11), day 25 -- deliberately far from "now" (seed data's
    // today is 2026-09-10) so a drift-to-current-month bug is impossible
    // to miss.
    const r = { id: "r_test", name: "Yearly test", type: "expense", amount: 100, freq: "yearly", month: 11, day: 25 };
    const fromJan = app.nextOccurrence(r, new Date(2026, 0, 1));
    const fromJul = app.nextOccurrence(r, new Date(2026, 6, 1));
    const fromOct = app.nextOccurrence(r, new Date(2026, 9, 1)); // after Dec 25 has already passed this year? no, Oct < Dec
    return { janMonth: fromJan.getMonth(), julMonth: fromJul.getMonth(), octMonth: fromOct.getMonth() };
  });
  console.log("computed month checked from January:", drift.janMonth, "| from July:", drift.julMonth, "| from October:", drift.octMonth);
  console.log("the SAME rule's next occurrence stays pinned to December (11) regardless of which month it's checked from -- the real bug this closes:", drift.janMonth === 11 && drift.julMonth === 11 && drift.octMonth === 11);

  console.log("\n=== 2) The year itself still rolls over correctly once the date has passed ===");
  const rollover = await page.evaluate(() => {
    const app = UI.app;
    const r = { id: "r_test2", name: "Yearly test 2", type: "expense", amount: 100, freq: "yearly", month: 2, day: 10 }; // March 10
    // Checked from a date AFTER March 10 the same year -- must roll to
    // next year's March 10, not stay stuck in the past.
    const next = app.nextOccurrence(r, new Date(2026, 8, 15));
    return { year: next.getFullYear(), month: next.getMonth(), date: next.getDate() };
  });
  console.log("next occurrence:", rollover.year + "-" + (rollover.month + 1) + "-" + rollover.date);
  console.log("correctly rolled to next year's March 10, not stuck in the past or drifted to September:", rollover.year === 2027 && rollover.month === 2 && rollover.date === 10);

  console.log("\n=== 3) Backward compat: a legacy yearly rule with no stored month at all still works, no crash ===");
  const legacy = await page.evaluate(() => {
    const app = UI.app;
    // The real seed data's own "Streaming bundle" rule (id r5) predates
    // this field -- genuinely has no .month, not a synthetic case.
    const r = app.state.data.recurring.find(x => x.id === "r5");
    if (!r) return { found: false };
    const next = app.nextOccurrence(r, new Date());
    return { found: true, hasMonth: r.month != null, isValidDate: !isNaN(next.getTime()) };
  });
  console.log("seed's own pre-existing yearly rule ('Streaming bundle') genuinely has no stored month:", legacy.found && !legacy.hasMonth);
  console.log("nextOccurrence() still returns a real, valid date for it (falls back to the current month, same as before this fix, not a crash):", legacy.isValidDate);

  console.log("\n=== 4) The real UI: a Month field is offered when adding/editing a recurring rule ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Recurring')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Recurring')"); await page.waitForTimeout(200);
  console.log("modal open:", await page.locator(".dialog").count() === 1);
  console.log("a Month select field is present:", await page.locator("#f_month").count() === 1);
  console.log("it offers all 12 real month names (not a raw 0-11 index):", await page.locator("#f_month option").count() === 12);
  const monthLabels = await page.locator("#f_month option").allInnerTexts();
  console.log("labels are real month names, e.g. includes 'December':", monthLabels.includes("December"));
  console.log("defaults to the current month (seed's today is September):", await page.locator("#f_month").inputValue() === "8");

  console.log("\n=== 5) Creating a real yearly rule end-to-end actually persists and uses the chosen month ===");
  await page.fill("#f_name", "Domain renewal");
  await page.fill("#f_amount", "450");
  await page.selectOption("#f_freq", "yearly");
  await page.selectOption("#f_month", "5"); // June
  await page.fill("#f_day", "20");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => {
    const app = UI.app;
    const r = app.state.data.recurring.find(x => x.name === "Domain renewal");
    return r ? { month: r.month, day: r.day, nextMonth: app.nextOccurrence(r, new Date()).getMonth() } : null;
  });
  console.log("saved rule's own month is exactly what was picked (June = 5):", saved && saved.month === 5);
  console.log("its own computed next-occurrence month agrees:", saved && saved.nextMonth === 5);
  await page.locator(".card-row", { hasText: "Domain renewal" }).locator("button:has-text('Edit')").click();
  await page.waitForTimeout(150);
  console.log("editing it back open shows the same month pre-filled:", await page.locator("#f_month").inputValue() === "5");

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
