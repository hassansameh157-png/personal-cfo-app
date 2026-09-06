const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) No overall budget set -- no ring, dashboard unchanged ===");
  console.log("no .overall-budget section:", await page.locator(".overall-budget").count() === 0);

  const setBudgetAndMonthExpense = async (budget) => {
    await page.evaluate((b) => {
      const d = JSON.parse(JSON.stringify(UI.app.state.data));
      d.overallBudget = b;
      UI.app.persist(d, "test budget");
      UI.render();
    }, budget);
    await page.waitForTimeout(150);
  };

  console.log("\n=== 2) A generous budget (well under spend) -- normal ring, accent color, no warning classes ===");
  await setBudgetAndMonthExpense(1000000);
  console.log("ring present:", await page.locator(".overall-budget .ring-wrap svg").count() === 1);
  console.log("not .near or .over:", !(await page.locator(".overall-budget.near, .overall-budget.over").count()));
  const pctText1 = await page.locator(".ring-label").innerText();
  console.log("ring label is a real low percentage:", /^\d+%$/.test(pctText1) && parseInt(pctText1) < 50);
  console.log("ring label NOT tone-neg:", !(await page.locator(".ring-label").evaluate(el => el.classList.contains("tone-neg"))));

  console.log("\n=== 3) A budget that's already exceeded -- .over class, red ring color, label reads past 100% ===");
  await setBudgetAndMonthExpense(1);
  console.log(".overall-budget has .over:", await page.locator(".overall-budget.over").count() === 1);
  const pctText2 = await page.locator(".ring-label").innerText();
  console.log("ring label reads well past 100%:", parseInt(pctText2) > 100);
  console.log("ring label IS tone-neg when over:", await page.locator(".ring-label").evaluate(el => el.classList.contains("tone-neg")));
  const ringStroke = await page.locator(".overall-budget svg circle").nth(1).evaluate(el => el.getAttribute("stroke"));
  console.log("progress circle uses the neg color token when over:", ringStroke === "var(--c-neg)");

  console.log("\n=== 4) Ring geometry never overshoots a full circle even far past 100% ===");
  const dashoffset = await page.locator(".overall-budget svg circle").nth(1).evaluate(el => parseFloat(el.getAttribute("stroke-dashoffset")));
  console.log("dashoffset clamped to >= 0 (full ring, not overdrawn):", dashoffset >= 0 && dashoffset < 1);

  console.log("\n=== 5) Removing the budget makes the ring disappear again ===");
  await setBudgetAndMonthExpense(0);
  console.log("no .overall-budget section:", await page.locator(".overall-budget").count() === 0);

  console.log("\n=== 6) Label + amount no longer overlap (the real layout bug found during dev) ===");
  await setBudgetAndMonthExpense(20000);
  const rowBox = await page.locator(".overall-budget-row").boundingBox();
  const labelBox = await page.locator(".overall-budget-row > span").first().boundingBox();
  const amtBox = await page.locator(".overall-budget-amt").boundingBox();
  console.log("label and amount are stacked (amount starts below where label ends), not overlapping:", amtBox.y >= labelBox.y + labelBox.height - 1);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
