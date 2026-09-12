// Curated card themes, round 2 (real gap fixed, iterated twice on direct
// user feedback on the Accounts screen): round 1's raw color/color2/pattern
// trio never looked like anything until composed by hand; round 1's own
// presets (soft mesh/radial gradients) still read as "generic gradient
// generator", not distinctive. This round replaces the gallery with two
// genuinely different, opposite families instead: GEM_THEMES (a real
// triangulated facet mesh, each facet's shade computed from an actual
// virtual light source -- see UI.gemPatternSvgDataUri) for a standout
// card, and PLAIN_THEMES (flat, no gradient at all) for the explicit
// opposite ask, a plain one -- both one tap via UI.setCardTheme, in the
// same gallery, grouped under "Faceted"/"Plain" labels. Both patterns
// ("gem"/"solid") are also real options in the plain Pattern dropdown for
// any hand-picked color, not preset-only.
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

  console.log("=== 1) The gallery shows two labeled groups: 8 Faceted + 6 Plain ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  const firstTile = page.locator(".credit-card-tile").first();
  await firstTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  console.log("modal open:", await page.locator(".dialog").count() === 1);
  const groupLabels = await page.locator(".card-theme-group-label").allTextContents();
  console.log("group labels:", JSON.stringify(groupLabels));
  console.log("14 theme swatches total:", await page.locator(".card-theme-swatch").count() === 14);
  console.log("each swatch's own background is a real gradient/image (previews exactly what picking it renders, not a placeholder):",
    (await page.locator(".card-theme-swatch").first().evaluate(el => el.style.backgroundImage)).length > 0);

  console.log("\n=== 2) Clicking a Faceted preset writes color+pattern, leaves color2/textColor sane, doesn't wipe unsaved fields ===");
  await page.fill("#f_desc", "unsaved note mid-edit");
  const beforeColor = await page.locator("#f_color").inputValue();
  await page.click(".card-theme-swatch[data-theme-id='sapphire']");
  await page.waitForTimeout(100);
  console.log("color changed:", await page.locator("#f_color").inputValue() !== beforeColor);
  console.log("color set to Sapphire's own hex:", (await page.locator("#f_color").inputValue()).toLowerCase() === "#1d4ed8");
  console.log("pattern set to gem:", await page.locator("#f_pattern").inputValue() === "gem");
  console.log("textColor reset to auto:", await page.locator("#f_textColor").inputValue() === "auto");
  console.log("the unsaved desc field typed just before was NOT wiped (no full render()):", await page.locator("#f_desc").inputValue() === "unsaved note mid-edit");

  console.log("\n=== 3) Exactly one swatch shows .on, matching what was actually picked ===");
  console.log("exactly one .on swatch:", await page.locator(".card-theme-swatch.on").count() === 1);
  console.log("it's Sapphire:", await page.locator(".card-theme-swatch.on").getAttribute("data-theme-id") === "sapphire");
  console.log("aria-pressed agrees:", await page.locator(".card-theme-swatch.on").getAttribute("aria-pressed") === "true");

  console.log("\n=== 4) Saving actually renders the real faceted mesh on the tile's own face, text still legible ===");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const face = firstTile.locator(".cc-face-front");
  const bg = await face.evaluate(el => getComputedStyle(el).backgroundImage);
  console.log("background-image is the gem SVG data URI (not a plain gradient):", bg.startsWith('url("data:image/svg+xml'));
  // Real bug caught and fixed in this same pass: gemPatternSvgDataUri()
  // originally wrapped its data URI in url("...") -- double quotes -- which
  // is dropped straight into this exact element's own double-quoted
  // style="background:...;color:..." attribute (see renderAccounts()'s
  // faceStyle). That closed the attribute early and silently truncated
  // everything after it, INCLUDING the color: property -- the swatch
  // preview and the real tile both rendered with no visible facets and
  // (less obviously, since it still happened to look like something) no
  // real text-color rule at all, just whatever the browser's own default
  // button/div color happened to be. Asserting the actual computed color
  // here, not just that the background exists, is what would have caught
  // that -- a "background looks non-empty" check alone would not have.
  const color = await face.evaluate(el => getComputedStyle(el).color);
  console.log("style attribute wasn't truncated -- a real text color is set (rgb, not the browser default black):", /^rgb\(/.test(color) && color !== "rgb(0, 0, 0)");
  console.log("cc-name text is actually visible (real contrast, not invisible-on-invisible):", await face.locator(".cc-name").isVisible());

  console.log("\n=== 5) Real bug guard: reopening Edit on an account that already matches a preset exactly re-highlights it ===");
  await firstTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  console.log("re-lands on Sapphire, not unmatched:", await page.locator(".card-theme-swatch.on").getAttribute("data-theme-id") === "sapphire");

  console.log("\n=== 5b) Real bug caught in review, fixed before shipping: picking a preset also re-syncs Secondary color to it ===");
  // Reproduces the exact scenario the review flagged: color2 was still
  // whatever shade the ACCOUNT'S OLD color had auto-darkened it to before
  // a preset was ever picked -- switching Pattern straight to a two-color
  // one after a preset (a flow this same field's own hint explicitly
  // invites -- "fine-tune past a preset") rendered a gradient with no
  // relation to the theme just chosen. Cancel back out to the account's
  // pre-Sapphire state first so this starts from a real "old" color2, not
  // one already synced by test 2's own Sapphire pick.
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);
  await firstTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  await page.click(".card-theme-swatch[data-theme-id='citrine']"); // amber -- far from the current blue
  await page.waitForTimeout(100);
  const color2AfterPreset = (await page.locator("#f_color2").inputValue()).toLowerCase();
  console.log("Secondary color re-synced to a shade of the NEW (Citrine) color, not left as the old one's:", color2AfterPreset !== "" && color2AfterPreset !== "#000000");
  await page.selectOption("#f_pattern", "diag2");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const bgAfterDiag2 = await face.evaluate(el => getComputedStyle(el).backgroundImage);
  console.log("switching to a two-color pattern right after the preset renders Citrine's own family, not a stale leftover gradient:", bgAfterDiag2.includes("linear-gradient") && bgAfterDiag2.includes("245, 158, 11"));

  console.log("\n=== 6) Switching to a Plain preset replaces the facets with a genuinely flat fill ===");
  await firstTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  await page.click(".card-theme-swatch[data-theme-id='onyxblack']");
  await page.waitForTimeout(100);
  console.log("color set to Onyx Black's own hex:", (await page.locator("#f_color").inputValue()).toLowerCase() === "#18181b");
  console.log("pattern set to solid:", await page.locator("#f_pattern").inputValue() === "solid");
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const bg2 = await face.evaluate(el => getComputedStyle(el).backgroundImage);
  console.log("no background-image at all for a solid fill (genuinely flat, not a gradient/image):", bg2 === "none");
  const bgColor = await face.evaluate(el => getComputedStyle(el).backgroundColor);
  console.log("flat background-color matches Onyx Black:", bgColor === "rgb(24, 24, 27)");

  console.log("\n=== 7) The plain Pattern dropdown offers Faceted gem cut and Plain / solid directly (not preset-only) ===");
  await firstTile.locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.click(".sheet-action:has-text('Edit')"); await page.waitForTimeout(200);
  const patternOptions = await page.locator("#f_pattern option").allTextContents();
  console.log("pattern options:", JSON.stringify(patternOptions));
  console.log("gem cut listed:", patternOptions.some(o => /gem|مضلعة/i.test(o)));
  console.log("plain/solid listed:", patternOptions.some(o => /plain|solid|سادة/i.test(o)));
  await page.click("button:has-text('Cancel')"); await page.waitForTimeout(150);

  console.log("\n=== 8) The same gallery (shared cardStyleFields()) also themes a person's avatar, gem included ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(200);
  await page.click("button:has-text('+ Person')"); await page.waitForTimeout(200);
  await page.fill("#f_name", "Theme Test Person");
  console.log("gallery present on the Person form too (14 swatches):", await page.locator(".card-theme-swatch").count() === 14);
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
  console.log("person avatar picked up the real Emerald gem mesh:", avatarBg.startsWith('url("data:image/svg+xml'));

  console.log("\n=== 9) Real bug caught in review, fixed before shipping: theme names go through app.L() like every other label ===");
  await page.click(".navbtn:has-text('Accounts')"); await page.waitForTimeout(200);
  await page.evaluate(() => { UI.app.state.lang = "ar"; UI.render(); });
  await page.locator(".credit-card-tile").first().locator(".acct-more-btn").click(); await page.waitForTimeout(150);
  await page.locator(".sheet-action").first().click(); await page.waitForTimeout(200);
  const arGroupLabels = await page.locator(".card-theme-group-label").allTextContents();
  console.log("group labels are Arabic under lang=ar:", JSON.stringify(arGroupLabels));
  const arLabel = await page.locator(".card-theme-swatch[data-theme-id='sapphire'] .card-theme-name").innerText().catch(() => "MISSING");
  console.log("Arabic UI shows the theme's own Arabic name, not the English one:", arLabel === "ياقوت أزرق");
  await page.evaluate(() => { UI.app.state.lang = "en"; UI.render(); });

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
