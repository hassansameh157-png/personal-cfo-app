const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Dashboard Recut (#25-30): six purely visual/layout changes to Dashboard,
// previewed for the user in a concept artifact before shipping. None of
// them touch a real number -- this file checks the mechanics (collapse/
// expand state, markup actually present) rather than exact colors/pixels,
// which the screenshots taken during development already covered.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 25) Needs Attention collapses to 3 cards + an expand button, real count unaffected ===");
  console.log("exactly 3 alert cards shown at rest:", await page.locator(".alert-card").count() === 3);
  const moreBtn = page.locator(".dash-section button.btn-secondary.block");
  const moreLabel = await moreBtn.textContent();
  await moreBtn.click();
  await page.waitForTimeout(150);
  // Only measured AFTER expanding -- at rest the DOM never has more than
  // the 3 collapsed cards in it at all (this isn't a CSS-hide of extra
  // cards, renderDashboard() only builds the first 3), so counting
  // .alert-card before expanding could never reveal the real total.
  const realAlertCount = await page.locator(".alert-card").count();
  console.log("more than 3 real alerts exist in this seed (a meaningful test of the cap):", realAlertCount > 3);
  console.log("the collapsed button's own label had already named that real hidden count:", (moreLabel || "").includes(String(realAlertCount - 3)));
  console.log("the expand button itself is gone once everything is already shown:", await page.locator(".dash-section button.btn-secondary.block").count() === 0);

  console.log("\n=== 25b) Landing on Dashboard again starts collapsed, not stuck expanded from the last visit ===");
  await page.click(".navbtn:has-text('Accounts')");
  await page.waitForTimeout(150);
  await page.click(".navbtn:has-text('Dashboard')");
  await page.waitForTimeout(150);
  console.log("collapsed again after navigating away and back:", await page.locator(".alert-card").count() === 3);

  console.log("\n=== 26/27) Hero card carries an aurora gradient and a bigger, bolder headline number ===");
  const hero = await page.evaluate(() => {
    const card = document.querySelector(".hero-card");
    const val = document.querySelector(".hero-value");
    return { bg: getComputedStyle(card).backgroundImage, fs: parseFloat(getComputedStyle(val).fontSize), fw: getComputedStyle(val).fontWeight };
  });
  console.log("hero card background is a real multi-layer gradient (not a flat fill):", (hero.bg.match(/gradient\(/g) || []).length >= 3);
  // At this test's fixed 390px viewport the OLD clamp(38px,10vw,52px) would
  // have resolved to 39px (10vw = 39, within the 38-52 band); the new
  // clamp(40px,10.5vw,56px) resolves to ~41px here -- real growth at this
  // exact viewport, not just a higher ceiling only wider screens ever reach.
  console.log("hero-value renders larger than the old formula would have, at this same viewport:", hero.fs > 39);
  console.log("hero-value is semibold, not the old default weight:", hero.fw === "600");

  console.log("\n=== 29) The Available balance headline itself now carries its own sparkline ===");
  const heroSparkCount = await page.evaluate(() => document.querySelector(".hero-value .sparkline") ? 1 : 0);
  console.log("a sparkline svg sits inside .hero-value:", heroSparkCount === 1);
  // Real bug this would catch: reusing the SAME sparkline instance/markup
  // for both Available and Net worth instead of two independently-drawn
  // series -- confirm .hero-value's own spark and the net-worth sub-value's
  // spark are two distinct <svg> elements, not one moved around.
  const sparkTotal = await page.locator(".hero-card svg.sparkline").count();
  console.log("hero card has two distinct sparklines (Available + Net worth), not one shared/reused element:", sparkTotal === 2);

  console.log("\n=== 28) 'Where my money is' gives each real money-bucket tile its own icon + tint ===");
  const tileIcoCount = await page.locator(".tile-ico").count();
  console.log("exactly the 6 real-bucket tiles (Cash/Bank/Wallets/Cards/Invested/Owed to me) get an icon:", tileIcoCount === 6);
  console.log("the 3 derived-total tiles (I owe/Total assets/Net worth) deliberately get NO icon:", await page.locator(".pos-tile.alt .tile-ico").count() === 0);
  const tileTints = await page.locator(".pos-tile.tinted").evaluateAll(els => [...new Set(els.map(el => getComputedStyle(el).backgroundColor))]);
  console.log("the 6 iconed tiles render as genuinely different colors, not one tint repeated:", tileTints.length === 6);

  console.log("\n=== 30) Category bar icons (Dashboard + Reports, shared catBar()) match Transactions' own colored badge ===");
  const dashBadge = await page.locator(".bar-row .cat-badge").first().evaluate(el => getComputedStyle(el).backgroundColor);
  console.log("Dashboard's category bars use the real colored .cat-badge, not a plain grey glyph:", dashBadge !== "rgba(0, 0, 0, 0)" && dashBadge !== "transparent");
  await page.click(".navbtn:has-text('More')");
  await page.waitForTimeout(150);
  await page.click("text=Reports");
  await page.waitForTimeout(200);
  console.log("Reports' by-category bars (same shared catBar()) also get the colored badge:", await page.locator(".bar-row .cat-badge").count() > 0);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
