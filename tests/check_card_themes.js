// Curated card themes (real gap fixed, per direct user feedback on the
// Accounts screen after the "Ledger" refresh: the raw color/color2/pattern
// trio was flexible but never actually looked like a distinctive card
// until composed by hand, and the existing patterns' hard edges didn't
// read as "blended like a real card"). CARD_THEMES/UI.setCardTheme (ui.js)
// add a one-tap gallery of curated looks that write all four real fields
// at once, plus a new "mesh" pattern (soft, blended-corners gradient) any
// hand-picked color pair can also use via the plain Pattern dropdown.
const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1200 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) The gallery shows all 12 curated themes on Edit account ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  const firstTile = page.locator(".credit-card-tile").first();
  await firstTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  console.log("modal open:", await page.locator(".dialog").count() === 1);
  console.log("12 theme swatches present:", await page.locator(".card-theme-swatch").count() === 12);
  console.log("each swatch's own background is a real gradient (previews exactly what picking it renders, not a placeholder):",
    (await page.locator(".card-theme-swatch").first().evaluate(el => el.style.backgroundImage)).includes("gradient"));

  console.log("\n=== 2) Clicking a preset writes color/color2/pattern/textColor together, no render() wiping unsaved fields ===");
  await page.fill("#f_desc", "unsaved note mid-edit");
  const beforeColor = await page.locator("#f_color").inputValue();
  // Matched on data-theme-id, not the (localized) visible label -- see
  // CARD_THEMES' own comment for why a label match would be the exact
  // fragile-locator bug this session already chased down twice today
  // elsewhere, just baked into the app instead of a test this time.
  await page.click(".card-theme-swatch[data-theme-id='rosegold']");
  await page.waitForTimeout(100);
  console.log("color changed:", await page.locator("#f_color").inputValue() !== beforeColor);
  console.log("color set to Rose Gold's own hex:", (await page.locator("#f_color").inputValue()).toLowerCase() === "#ec4899");
  console.log("color2 set:", (await page.locator("#f_color2").inputValue()).toLowerCase() === "#f59e0b");
  console.log("pattern set to mesh:", await page.locator("#f_pattern").inputValue() === "mesh");
  console.log("textColor reset to auto:", await page.locator("#f_textColor").inputValue() === "auto");
  console.log("the unsaved desc field typed just before was NOT wiped (no full render()):", await page.locator("#f_desc").inputValue() === "unsaved note mid-edit");

  console.log("\n=== 3) Exactly one swatch shows .on, matching what was actually picked ===");
  console.log("exactly one .on swatch:", await page.locator(".card-theme-swatch.on").count() === 1);
  console.log("it's Rose Gold:", await page.locator(".card-theme-swatch.on").getAttribute("data-theme-id") === "rosegold");
  console.log("aria-pressed agrees:", await page.locator(".card-theme-swatch.on").getAttribute("aria-pressed") === "true");

  console.log("\n=== 4) Saving actually renders the real mesh gradient on the tile's own face ===");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const bg = await firstTile.locator(".cc-face-front").evaluate(el => getComputedStyle(el).backgroundImage);
  console.log("two radial-gradients (the blended corner pools) plus a linear base, not a flat/2-stop-only fill:",
    (bg.match(/radial-gradient/g) || []).length === 2 && bg.includes("linear-gradient"));
  console.log("uses Rose Gold's own two colors:", bg.includes("236, 72, 153") && bg.includes("245, 158, 11"));

  console.log("\n=== 5) Real bug guard: reopening Edit on an account that already matches a preset exactly re-highlights it ===");
  await firstTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  console.log("re-lands on Rose Gold, not unmatched:", await page.locator(".card-theme-swatch.on").getAttribute("data-theme-id") === "rosegold");
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 6) The plain Pattern dropdown also offers the new Blended mesh option directly (not preset-only) ===");
  await firstTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  const patternOptions = await page.locator("#f_pattern option").allTextContents();
  console.log("pattern options:", JSON.stringify(patternOptions));
  console.log("Blended mesh listed:", patternOptions.some(o => /mesh|مزيج/i.test(o)));
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 7) The same gallery (shared cardStyleFields()) also themes a person's avatar ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Person')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "Theme Test Person");
  console.log("gallery present on the Person form too:", await page.locator(".card-theme-swatch").count() === 12);
  await page.click(".card-theme-swatch[data-theme-id='emerald']");
  await page.waitForTimeout(100);
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  // A brand-new person has no balance yet, so People Recut #45 collapses
  // them into the "settled" section by default -- expand it first, or the
  // card genuinely isn't in the DOM at all to find. Scoped to
  // .btn-secondary.block -- a bare button:has-text("settled") also matches
  // the People tabs' own always-present "Settled" pill (Ledger refresh
  // batch), not just this collapse toggle.
  const settledToggle = page.locator("button.btn-secondary.block", { hasText: "settled" });
  if (await settledToggle.count()) { await settledToggle.click(); await page.waitForTimeout(150); }
  const avatarBg = await page.locator(".person-card", { hasText: "Theme Test Person" }).locator(".person-avatar").evaluate(el => getComputedStyle(el).backgroundImage);
  console.log("person avatar picked up the Emerald Tide gradient:", (avatarBg.match(/radial-gradient/g) || []).length === 2 && avatarBg.includes("16, 185, 129"));

  console.log("\n=== 8) Real bug caught in review: theme names go through app.L() like every other label, not left English-only ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  await page.evaluate(() => { UI.app.state.lang = "ar"; UI.render(); });
  await page.locator(".credit-card-tile").first().locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.locator(".sheet-action").first().click(); await page.waitForTimeout(200);
  const arLabel = await page.locator(".card-theme-swatch[data-theme-id='ocean'] .card-theme-name").innerText().catch(() => "MISSING");
  console.log("Arabic UI shows the theme's own Arabic name, not the English one:", arLabel === "تيار المحيط");
  await page.evaluate(() => { UI.app.state.lang = "en"; UI.render(); });

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
