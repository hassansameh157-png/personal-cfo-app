const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  page.on("pageerror", (e) => errors.push(e.message));
  // "Failed to load resource" is expected noise here, not a real error --
  // the route() above deliberately aborts every non-file:// request (the
  // app's only external reference is a Google Fonts preconnect), and the
  // network error code Chromium reports for an aborted request isn't
  // consistent (ERR_CONNECTION_RESET and ERR_FAILED have both been seen),
  // so match on the resource-load-failure message itself rather than
  // chasing one specific error code.
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push("console: " + m.text()); });
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(400);

  console.log("=== flashStack container exists outside #root ===");
  const structure = await page.evaluate(() => {
    const stack = document.getElementById("flashStack");
    const root = document.getElementById("root");
    return { stackExists: !!stack, isSiblingOfRoot: stack && stack.parentElement === root.parentElement, stackChildrenBefore: stack ? stack.children.length : -1 };
  });
  console.log(JSON.stringify(structure));

  console.log("=== Rapid-fire 3 saves in a row: pills should stack, not replace ===");
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(150);
  await page.fill("#f_amount", "10"); await page.click("button:has-text('Save')"); await page.waitForTimeout(80);
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(150);
  await page.fill("#f_amount", "20"); await page.click("button:has-text('Save')"); await page.waitForTimeout(80);
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(150);
  await page.fill("#f_amount", "30"); await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const pillCount = await page.locator(".flash-pill").count();
  console.log("flash-pill count after 3 rapid saves (should be 3, not 1):", pillCount);
  await page.screenshot({ path: "shot_flash_stack.png" });

  console.log("=== After 1.8s+fade, all pills should be gone, container survives ===");
  await page.waitForTimeout(2300);
  console.log("flash-pill count after fade:", await page.locator(".flash-pill").count());
  console.log("flashStack container still present:", await page.locator("#flashStack").count());

  console.log("\n=== Overall budget projection ===");
  await page.evaluate(() => UI.app.setOverallBudget(50000));
  await page.evaluate(() => UI.render());
  await page.waitForTimeout(200);
  const proj = await page.locator(".overall-budget-proj").innerText().catch(() => "NONE");
  console.log("projection text:", proj);

  console.log("\n=== Input focus ring ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.focus("#txSearch");
  const focusStyle = await page.evaluate(() => {
    const el = document.getElementById("txSearch");
    const cs = getComputedStyle(el);
    return { outline: cs.outline, boxShadow: cs.boxShadow, borderColor: cs.borderColor };
  });
  console.log(JSON.stringify(focusStyle));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
