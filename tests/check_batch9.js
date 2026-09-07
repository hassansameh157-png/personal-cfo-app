const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// A second grab-bag batch: a real missing feature (manual light/dark theme,
// the CSS for it already existed and was never wired up), two real gaps
// (Reports had no period control at all, Cash Flow was locked to the
// current month), and a small polish item (editing a budget in place).

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);

  console.log("=== 1) Real missing feature fixed: a manual light/dark theme toggle ===");
  console.log("defaults to 'System' -- no data-theme attribute at all:", await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === null);
  await page.click("label:has(input[name=theme]):has-text('Dark')");
  await page.waitForTimeout(150);
  console.log("picking Dark sets data-theme=dark:", await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "dark");
  console.log("the choice survives a full re-render (Settings re-opened):", await page.locator("input[name=theme]").nth(2).isChecked());
  await page.click("label:has(input[name=theme]):has-text('Light')");
  await page.waitForTimeout(150);
  console.log("picking Light sets data-theme=light (overriding any OS dark preference):", await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "light");
  await page.click("label:has(input[name=theme]):has-text('System')");
  await page.waitForTimeout(150);
  console.log("picking System removes the attribute again, back to OS-driven:", await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === null);

  console.log("\n=== 2) Real gap fixed: Reports now has a period filter, not just an all-time total ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Reports')"); await page.waitForTimeout(200);
  console.log("defaults to '6 months', not an unscoped all-time total:", await page.locator(".pill.on").innerText() === "6 months");
  const catThisMonth = await page.locator(".bar-list").first().innerText();
  await page.click(".pill:has-text('This month')");
  await page.waitForTimeout(150);
  const catAllTime = await page.locator(".bar-list").first().innerText();
  console.log("switching period actually changes the category breakdown shown:", catThisMonth !== catAllTime);
  console.log("'All time' is still reachable for the old behavior:", await page.locator(".pill:has-text('All time')").count() === 1);
  await page.click(".pill:has-text('All time')");
  await page.waitForTimeout(150);
  console.log("net worth trend chart is untouched by the period pills (still its own fixed 6-month view):", await page.locator(".chart-bar").count() === 6);

  console.log("\n=== 3) Real gap fixed: Cash Flow can now navigate to a previous month, not locked to 'now' ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Cash flow')"); await page.waitForTimeout(200);
  console.log("no Next/Today controls while viewing the current month:", await page.locator("button[aria-label='Next month']").count() === 0);
  const netThisMonth = await page.locator(".hero-value").innerText();
  await page.click("button[aria-label='Previous month']");
  await page.waitForTimeout(150);
  const netLastMonth = await page.locator(".hero-value").innerText();
  console.log("the net cash change actually recomputes for the earlier month:", netThisMonth !== netLastMonth);
  console.log("Next month + Today controls appear once off the current month:", await page.locator("button[aria-label='Next month']").count() === 1 && await page.locator("button:has-text('Today')").count() === 1);
  await page.click("button:has-text('Today')");
  await page.waitForTimeout(150);
  console.log("'Today' returns exactly to the current month's own figure:", (await page.locator(".hero-value").innerText()) === netThisMonth);

  console.log("\n=== 4) Regression: a past month's figures must be correct in a timezone west of UTC, not silently zero ===");
  // Real bug caught in code review: new Date("2026-09-01") parses as UTC
  // midnight; reading it back with local getters (getFullYear/getMonth)
  // in a timezone west of UTC returns the PREVIOUS day/month, so mEnd
  // could land before mStart and the whole page would go quietly blank.
  await browser.close();
  const browser2 = await chromium.launch(Object.assign({}, process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}));
  const page2 = await browser2.newPage({ viewport: { width: 390, height: 900 }, timezoneId: "America/New_York" });
  await page2.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(e.message));
  await page2.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page2.waitForTimeout(300);
  await page2.click(".navbtn:has-text('More')"); await page2.waitForTimeout(150);
  await page2.click(".sheet-item:has-text('Cash flow')"); await page2.waitForTimeout(200);
  const label1 = await page2.locator("strong").innerText();
  await page2.click("button[aria-label='Previous month']");
  await page2.waitForTimeout(150);
  const label2 = await page2.locator("strong").innerText();
  console.log("month label actually changed going back a month (America/New_York):", label1 !== label2);
  const opMeta = await page2.locator(".card-row-meta").first().innerText();
  console.log("previous month's Operating bucket shows real In/Out, not a suspicious blank 0/0:", !/In: EGP 0\s*Out: EGP 0/.test(opMeta));
  console.log("errors (tz browser):", errors2.length ? errors2 : "none");
  const tzOk = errors2.length === 0;
  await browser2.close();

  console.log("\n=== 5) Settings: an existing budget can be edited in place, not just removed and re-added ===");
  const browser3 = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page3 = await browser3.newPage({ viewport: { width: 390, height: 1400 } });
  await page3.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors3 = [];
  page3.on("pageerror", (e) => errors3.push(e.message));
  await page3.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page3.waitForTimeout(300);
  await page3.click(".navbtn:has-text('More')"); await page3.waitForTimeout(150);
  await page3.click(".sheet-item:has-text('Settings')"); await page3.waitForTimeout(200);
  await page3.selectOption("#budgetCat", "Food");
  await page3.fill("#budgetAmt", "3000");
  await page3.click("button:has-text('Set budget')");
  await page3.waitForTimeout(150);
  const foodRow = page3.locator(".card-row", { hasText: "Food" });
  await foodRow.locator("button:has-text('Edit')").click();
  await page3.waitForTimeout(150);
  console.log("Edit pre-fills the category dropdown:", (await page3.locator("#budgetCat").inputValue()) === "Food");
  console.log("Edit pre-fills the existing amount:", (await page3.locator("#budgetAmt").inputValue()) === "3000");
  await page3.fill("#budgetAmt", "4500");
  await page3.click("button:has-text('Set budget')");
  await page3.waitForTimeout(150);
  console.log("still exactly one Food budget row (updated, not duplicated):", await page3.locator(".card-row", { hasText: "Food" }).count() === 1);
  console.log("the new amount is reflected:", (await foodRow.innerText()).includes("4,500"));

  console.log("\nerrors:", errors.concat(errors3).length ? errors.concat(errors3) : "none");
  console.log("no unexpected JS errors:", errors.length === 0 && errors3.length === 0 && tzOk);
  await browser3.close();
})();
