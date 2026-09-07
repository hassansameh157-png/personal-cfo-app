const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Dispatches a synthetic touch event with a single touch point at (x, y)
  // -- must live in the page's own JS context (Touch/TouchEvent are DOM
  // globals), so addInitScript rather than a plain Node-side function.
  await page.addInitScript(() => {
    window.__dispatchTouch = (el, type, x, y) => {
      const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [touch], targetTouches: type === "touchend" ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
    };
  });
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  await page.click(".navbtn:has-text('Transactions')");
  await page.waitForTimeout(200);

  console.log("=== 1) An editable row gets the swipe wrapper with Edit/Delete ===");
  const firstRow = page.locator(".card-row").first();
  console.log("first row is a swipe-row:", await firstRow.evaluate(el => el.classList.contains("swipe-row")));
  console.log("has a swipe-content child:", await firstRow.locator(".swipe-content").count() === 1);
  console.log("has Edit + Delete swipe buttons:", await firstRow.locator(".swipe-act").count() === 2);
  console.log("still has the full rowActions link row underneath (additive, not replacing):", await firstRow.locator(".btn-row.wrap button").count() >= 3);

  console.log("\n=== 1b) At rest (no swipe), Edit/Delete never visually bleed through the row ===");
  // Real bug reported by the user with a screenshot, TWICE: Edit/Delete
  // showing behind every row's content even with no swipe gesture at all.
  // The first fix (test 10/11 below) addressed a real but separate JS bug
  // (scroll misclassified as swipe); this one is the actual root cause the
  // screenshot showed. .swipe-content used var(--c-surface), the same
  // translucent "glass" token every other card uses -- invisible against
  // the app's own muted background, but .swipe-content sits directly over
  // .swipe-actions' saturated purple/red buttons, not the app background,
  // so that same translucency let 28-40% of the button color bleed
  // straight through even at rest. Assert what a screenshot can't: the
  // background is actually opaque -- this alpha check is the real guard
  // against the bug regressing (a plain elementFromPoint hit-test alone
  // would NOT catch it: paint/DOM order already put .swipe-content above
  // .swipe-actions before this fix too, so hit-testing was never the
  // problem -- only the visible color bleeding through an on-top-but-
  // translucent layer was).
  const alpha = await firstRow.locator(".swipe-content").evaluate(el => {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
    const parts = m[1].split(",").map(s => s.trim());
    return parts.length === 4 ? parseFloat(parts[3]) : 1; // rgb() with no 4th part is fully opaque
  });
  console.log(".swipe-content's background is fully opaque (alpha 1), not the translucent glass token:", alpha === 1);
  // Separate, unrelated sanity check (not a regression guard for the bug
  // above): confirms pointer routing genuinely lands on the content layer,
  // not the actions underneath it, regardless of visual opacity.
  const actionsBox = await firstRow.locator(".swipe-actions").boundingBox();
  const hitsContentNotActions = await firstRow.evaluate((row, [x, y]) => {
    const hit = document.elementFromPoint(x, y);
    return !!hit && row.querySelector(".swipe-content").contains(hit) && !row.querySelector(".swipe-actions").contains(hit);
  }, [actionsBox.x + actionsBox.width / 2, actionsBox.y + actionsBox.height / 2]);
  console.log("a real point over the actions area hit-tests to the content layer (pointer routing sanity check):", hitsContentNotActions);

  console.log("\n=== 2) A reversed (non-editable) transaction gets NO swipe wrapper ===");
  const rowId = await firstRow.evaluate(el => el.querySelector(".swipe-edit").getAttribute("onclick").match(/openTxEdit\('([^']+)'\)/)[1]);
  await page.evaluate((id) => UI.reverseTx(id), rowId);
  await page.waitForTimeout(200);
  const reversedRow = page.locator(".card-row.voided").first();
  console.log("reversed row is NOT a swipe-row:", !(await reversedRow.evaluate(el => el.classList.contains("swipe-row"))));
  console.log("reversed row has no swipe-content:", await reversedRow.locator(".swipe-content").count() === 0);

  console.log("\n=== 3) Dragging a swipe-content left reveals the actions, and it snaps open past the threshold ===");
  const content = page.locator(".swipe-content").first();
  const box = await content.boundingBox();
  const startX = box.x + box.width - 20, y = box.y + box.height / 2;
  // locator.evaluate(pageFunction, arg) only accepts ONE extra arg -- wrap
  // multiple values into an array/object rather than passing them
  // positionally (a real bug: this worked against the sandbox's own
  // globally-installed Playwright locally, but failed strictly once CI
  // installed the pinned version from package-lock.json).
  await content.evaluate((el, [sx, sy]) => window.__dispatchTouch(el, "touchstart", sx, sy), [startX, y]);
  await content.evaluate((el, [sx, sy]) => window.__dispatchTouch(el, "touchmove", sx - 100, sy), [startX, y]);
  const midTransform = await content.evaluate(el => el.style.transform);
  console.log("mid-drag transform is a partial negative translateX:", /translateX\(-\d+px\)/.test(midTransform) && !midTransform.includes("-144"));
  await content.evaluate((el, [sx, sy]) => window.__dispatchTouch(el, "touchmove", sx - 130, sy), [startX, y]);
  await content.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));
  await page.waitForTimeout(250);
  console.log("snapped fully open (translateX(-144px)):", (await content.evaluate(el => el.style.transform)).includes("-144"));
  console.log("has swipe-open class:", await content.evaluate(el => el.classList.contains("swipe-open")));

  console.log("\n=== 4) Opening a second row's swipe closes the first one ===");
  const secondContent = page.locator(".swipe-content").nth(1);
  const box2 = await secondContent.boundingBox();
  const sx2 = box2.x + box2.width - 20, y2 = box2.y + box2.height / 2;
  await secondContent.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [sx2, y2]);
  await secondContent.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x - 130, y), [sx2, y2]);
  await secondContent.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));
  await page.waitForTimeout(250);
  console.log("second row now open:", await secondContent.evaluate(el => el.classList.contains("swipe-open")));
  console.log("first row auto-closed:", !(await content.evaluate(el => el.classList.contains("swipe-open"))));

  console.log("\n=== 5) Tapping Delete in the revealed panel actually deletes the transaction ===");
  page.once("dialog", (d) => d.accept()); // deleteTxC() gates on a native confirm()
  // .card-row's own DOM count stays pinned at S.txVisible (25) regardless
  // -- renderTransactions() paginates, so a real deletion just pulls the
  // next row up to refill the visible slot. The actual data is the real
  // signal.
  const txCountBefore = await page.evaluate(() => UI.app.state.data.tx.length);
  await page.locator(".swipe-delete").nth(1).click();
  await page.waitForTimeout(200);
  const txCountAfter = await page.evaluate(() => UI.app.state.data.tx.length);
  console.log("transaction actually removed from data:", txCountAfter === txCountBefore - 1);

  console.log("\n=== 6) A short drag that doesn't clear the threshold snaps back closed ===");
  const content3 = page.locator(".swipe-content").first();
  const box3 = await content3.boundingBox();
  const sx3 = box3.x + box3.width - 20, y3 = box3.y + box3.height / 2;
  await content3.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [sx3, y3]);
  await content3.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x - 30, y), [sx3, y3]);
  await content3.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));
  await page.waitForTimeout(250);
  console.log("snapped back closed (translateX(0px) or none):", !(await content3.evaluate(el => el.classList.contains("swipe-open"))));

  console.log("\n=== 7) Desktop viewport: swipe panel is hidden (still has the full rowActions links) ===");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);
  console.log("swipe-actions hidden on desktop:", await page.locator(".swipe-actions").first().isVisible().then(v => !v).catch(() => true));

  console.log("\n=== 8) Tapping a revealed Edit/Delete button doesn't slide the row shut under the tap ===");
  await page.setViewportSize({ width: 390, height: 844 }); // back from test 7's desktop check
  await page.waitForTimeout(150);
  // Real bug found by code review: touchstart's closeAllExcept(null) was
  // closing every open row, including the one whose own button was just
  // touched, since .swipe-act lives in .swipe-actions (a sibling of
  // .swipe-content, not inside it).
  const content4 = page.locator(".swipe-content").first();
  const box4 = await content4.boundingBox();
  const sx4 = box4.x + box4.width - 20, y4 = box4.y + box4.height / 2;
  await content4.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [sx4, y4]);
  await content4.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x - 130, y), [sx4, y4]);
  await content4.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));
  await page.waitForTimeout(250);
  const editBtn = page.locator(".swipe-edit").first();
  const editBox = await editBtn.boundingBox();
  await editBtn.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [editBox.x + editBox.width / 2, editBox.y + editBox.height / 2]);
  await page.waitForTimeout(100);
  console.log("row stays open when touching its own revealed Edit button:", await content4.evaluate(el => el.classList.contains("swipe-open")));

  console.log("\n=== 9) RTL (Arabic): swiping reveals the actions on the correct (now-physical-left) side ===");
  await page.evaluate(() => { UI.setLang("ar"); });
  await page.waitForTimeout(200);
  console.log("document dir is rtl:", await page.evaluate(() => document.documentElement.getAttribute("dir")) === "rtl");
  const contentRtl = page.locator(".swipe-content").first();
  const boxRtl = await contentRtl.boundingBox();
  // In RTL, .swipe-actions sits at the physical left -- start the drag
  // from the row's left edge and drag right (positive dx) to reveal it.
  const sxRtl = boxRtl.x + 20, yRtl = boxRtl.y + boxRtl.height / 2;
  await contentRtl.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [sxRtl, yRtl]);
  await contentRtl.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x + 130, y), [sxRtl, yRtl]);
  await contentRtl.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));
  await page.waitForTimeout(250);
  const rtlTransform = await contentRtl.evaluate(el => el.style.transform);
  console.log("RTL swipe snaps open with a POSITIVE translateX (144px, not -144):", rtlTransform.includes("144") && !rtlTransform.includes("-144"));
  console.log("RTL row has swipe-open class:", await contentRtl.evaluate(el => el.classList.contains("swipe-open")));

  console.log("\n=== 10) Ordinary vertical scrolling (with natural sideways jitter) never opens the row ===");
  // Real bug reported by the user with a screenshot: scrolling the list on
  // a real phone was leaving rows stuck open, Edit/Delete visibly showing
  // behind the content. Root cause: the old horizontal-vs-vertical decision
  // locked in the instant EITHER axis crossed a 6px dead zone, using a bare
  // dx > dy tiebreak -- the very first touchmove of a real finger scroll is
  // rarely perfectly vertical, so a slightly-larger-than-dy sideways nudge
  // right at the start would win that coin flip, lock the gesture in as a
  // "swipe" for its entire remaining duration, and once locked,
  // e.preventDefault() blocks the page from ever scrolling -- so the
  // finger's continued vertical travel just keeps accumulating as raw dx
  // instead, eventually crossing the open threshold and leaving the row
  // stuck open. Simulate exactly that: an ambiguous first nudge (dx
  // slightly exceeds dy), then a long, clearly-vertical scroll (dy
  // massively dominates every later step) -- a real scroll gesture from a
  // person's thumb, start to finish.
  await page.evaluate(() => { UI.setLang("en"); });
  await page.waitForTimeout(150);
  const scrollContent = page.locator(".swipe-content").first();
  const scrollBox = await scrollContent.boundingBox();
  const scx = scrollBox.x + scrollBox.width / 2, scy = scrollBox.y + scrollBox.height / 2;
  await scrollContent.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [scx, scy]);
  for (const [ddx, ddy] of [[-8, -5], [-15, -40], [-25, -90], [-40, -160], [-80, -250]]) {
    await scrollContent.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x, y), [scx + ddx, scy + ddy]);
  }
  await scrollContent.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));
  await page.waitForTimeout(200);
  console.log("row did NOT open from a mostly-vertical scroll gesture:", !(await scrollContent.evaluate(el => el.classList.contains("swipe-open"))));
  console.log("transform stayed at rest (no leftover partial slide):", !(await scrollContent.evaluate(el => el.style.transform)).includes("translateX(-"));

  console.log("\n=== 11) A steady diagonal swipe (dx clearly bigger than dy, but under the 1.75x bar) still opens the row ===");
  // Found in code review while fixing #10 above: making "horizontal" require
  // dx > dy*1.75 to lock in protects real scrolls, but a drag held at a
  // constant angle whose dx/dy ratio sits between 1x and 1.75x (a real,
  // fairly steady diagonal swipe -- not a scroll) would grow both axes in
  // that same proportion forever and NEVER cross either bar, leaving
  // drag.horizontal stuck at null for the whole gesture: no preventDefault,
  // no transform update, nothing on release -- a deliberate swipe silently
  // doing nothing. Simulate exactly that (ratio ~1.25 throughout) and
  // confirm it still resolves once the drag is unambiguously large.
  await scrollContent.evaluate(el => { el.style.transition = ""; el.style.transform = "translateX(0)"; el.classList.remove("swipe-open"); });
  await page.waitForTimeout(100);
  const diagBox = await scrollContent.boundingBox();
  const dgx = diagBox.x + diagBox.width - 20, dgy = diagBox.y + diagBox.height / 2;
  await scrollContent.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchstart", x, y), [dgx, dgy]);
  for (const [ddx, ddy] of [[-10, -8], [-20, -16], [-31, -25], [-60, -48], [-90, -72]]) {
    await scrollContent.evaluate((el, [x, y]) => window.__dispatchTouch(el, "touchmove", x, y), [dgx + ddx, dgy + ddy]);
  }
  await scrollContent.evaluate(el => window.__dispatchTouch(el, "touchend", 0, 0));
  await page.waitForTimeout(200);
  console.log("a steady diagonal swipe (never crosses the 1.75x bar) still snaps the row open:", await scrollContent.evaluate(el => el.classList.contains("swipe-open")));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
