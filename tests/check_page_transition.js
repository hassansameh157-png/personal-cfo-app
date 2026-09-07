const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// A light slide+fade on real page switches (Dashboard -> Transactions,
// etc.) -- must fire only on an actual page change, never on every
// render() (a keystroke in the search box, opening a modal, a filter
// change), since render() rebuilds the whole subtree from scratch every
// single time and a class present unconditionally would replay the
// animation on all of those too.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Switching pages adds .page-enter to <main> ===");
  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(30);
  console.log("page-enter present right after a real nav:", await page.locator("main.page.page-enter").count() === 1);
  console.log("landed on the right page:", await page.locator(".tab-title:has-text('Transactions')").count() === 1);

  console.log("\n=== 2) A same-page re-render (typing in search) does NOT replay it ===");
  await page.waitForTimeout(300); // let the CSS animation itself finish
  await page.fill("#txSearch", "rent");
  await page.waitForTimeout(30);
  console.log("page-enter absent on a same-page re-render:", await page.locator("main.page.page-enter").count() === 0);
  await page.fill("#txSearch", "");

  console.log("\n=== 3) Opening a modal (also just a render(), same page) does NOT add it either ===");
  await page.waitForTimeout(30);
  await page.click(".navbtn:has-text('Dashboard')");
  await page.waitForTimeout(300);
  await page.click("button:has-text('+ Expense')");
  await page.waitForTimeout(30);
  console.log("modal opened:", await page.locator(".dialog").count() === 1);
  console.log("page-enter absent while a modal opens on the same page:", await page.locator("main.page.page-enter").count() === 0);

  console.log("\n=== 4) Navigating again after that DOES replay it ===");
  await page.evaluate(() => UI.closeModal());
  await page.waitForTimeout(100);
  await page.click(".navbtn:has-text('Accounts')");
  await page.waitForTimeout(30);
  console.log("page-enter present on the next real nav:", await page.locator("main.page.page-enter").count() === 1);

  console.log("\n=== 5) prefers-reduced-motion disables the animation itself (CSS-level, still adds the class) ===");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.click(".navbtn:has-text('People')");
  await page.waitForTimeout(30);
  const anim = await page.locator("main.page.page-enter").evaluate(el => getComputedStyle(el).animationName);
  console.log("animation-name is 'none' under prefers-reduced-motion:", anim === "none");

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
