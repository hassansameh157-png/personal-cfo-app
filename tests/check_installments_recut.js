const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Installments Recut (#48-58): two real bugs plus nine mobile-focused
// changes to the Installments screen. Also regression-guards a real bug
// caught by inspection, not by any of the ideas themselves: the "Show
// schedule"/"Hide schedule" toggle (shared with Savings groups' own plan
// cards) used app.L()'s generic ARW lookup, which has no entry for either
// phrase and so silently fell back to English under Arabic -- even though
// t.showSchedule/hideSchedule already carried a real Arabic translation,
// just never used.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  await page.click(".navbtn:has-text('Installments')");
  await page.waitForTimeout(300);

  const hazemCard = page.locator(".card-row", { hasText: "MacBook Pro sold to Hazem" });
  const samehCard = page.locator(".card-row", { hasText: "Workshop equipment" });
  const phoneCard = page.locator(".card-row", { hasText: "Phone bought in installments" });

  console.log("=== 50) A plan's person name is a tappable link, like everywhere else in the app ===");
  await hazemCard.locator(".inline-link").click();
  await page.waitForTimeout(200);
  console.log("tapping it lands on that person's own page:", (await page.locator(".tab-title").innerText()).includes("Hazem"));
  await page.click(".navbtn:has-text('Installments')");
  await page.waitForTimeout(200);

  console.log("\n=== 51) The next due row shows on the closed card, no need to expand the schedule ===");
  console.log("Hazem's card shows a 'Next:' line without expanding:", (await hazemCard.locator(".card-row-meta").innerText()).includes("Next: #3"));
  console.log("it includes the same day-count phrasing due dates use elsewhere:", (await hazemCard.locator(".card-row-meta").innerText()).includes("overdue"));
  console.log("Phone's own next line (not overdue) uses the 'in Nd' phrasing instead:", (await phoneCard.locator(".card-row-meta").innerText()).includes("in 13d"));
  console.log("a plan with nothing left owed on it would show no 'Next:' line at all (none here yet, all three still active):", await page.locator(".card-row-meta", { hasText: "Next:" }).count() === 3);

  console.log("\n=== 55) Plans sort most-urgent first (overdue, soonest due date) ===");
  const titlesInOrder = await page.locator(".card-list .card-row-title").allTextContents();
  console.log("Hazem (overdue, due 09-01) sorts before Sameh (overdue, due 09-05):", titlesInOrder.indexOf("MacBook Pro sold to Hazem") < titlesInOrder.indexOf("Workshop equipment — Sameh"));
  console.log("Sameh (overdue) sorts before Phone (not overdue at all):", titlesInOrder.indexOf("Workshop equipment — Sameh") < titlesInOrder.indexOf("Phone bought in installments"));

  console.log("\n=== 52) A slim collected/total progress bar draws under each plan ===");
  const hazemBarStyle = await hazemCard.locator(".bar-fill").getAttribute("style");
  console.log("Hazem's bar reflects EGP 5,200/24,000 collected (~22%):", (hazemBarStyle || "").includes("width:22%"));
  console.log("an overdue plan's bar is drawn in the negative tone:", (hazemBarStyle || "").includes("var(--c-neg)"));
  const phoneBarStyle = await phoneCard.locator(".bar-fill").getAttribute("style");
  console.log("a plan with no overdue rows draws its bar in the plain accent tone:", (phoneBarStyle || "").includes("var(--c-accent)"));

  console.log("\n=== 57) An overdue schedule row shows how overdue, not just the word 'Overdue' ===");
  await hazemCard.locator("button", { hasText: "Show schedule" }).click();
  await page.waitForTimeout(150);
  const rows = hazemCard.locator(".sched-row");
  console.log("a fully-paid row reads 'Fully settled':", (await rows.nth(0).locator(".sched-status").innerText()) === "Fully settled");
  console.log("the overdue row names both its status and how many days overdue:", (await rows.nth(2).locator(".sched-status").innerText()) === "Overdue · 6d overdue");
  console.log("a future row still just reads 'Open' (nothing to count down yet):", (await rows.nth(3).locator(".sched-status").innerText()) === "Open");
  await hazemCard.locator("button", { hasText: "Hide schedule" }).click();
  await page.waitForTimeout(150);

  console.log("\n=== 56) The due-this-month banner breaks its total down by installments vs gam3eya, with a real link ===");
  const todayIso = await page.evaluate(() => UI.app.today());
  await page.evaluate((today) => {
    const app = UI.app, d = app.state.data;
    d.groups = d.groups || [];
    d.groups.push({ id: "g_recut_test", name: "Recut Test Gam3eya", accountId: "cib", amount: 2000, periods: 6, myTurn: 3, first: today, freq: "monthly" });
    app.persist(d, "test setup");
    UI.render();
  }, todayIso);
  await page.waitForTimeout(200);
  console.log("banner now shows a breakdown line once a gam3eya contribution is due this month:", await page.locator(".due-banner").locator("text=Installments:").count() === 1);
  console.log("the gam3eya half of the breakdown is itself a link:", await page.locator(".due-banner .inline-link").count() === 1);
  await page.click(".due-banner .inline-link");
  await page.waitForTimeout(200);
  console.log("tapping it lands on Savings groups, where that contribution actually lives:", (await page.locator(".tab-title").innerText()) === "Savings groups");

  console.log("\n=== Regression: 'Show schedule'/'Hide schedule' uses the real translation under Arabic, not a silent English fallback ===");
  const groupCard = page.locator(".card-row", { hasText: "Recut Test Gam3eya" });
  await page.evaluate(() => { UI.setLang("ar"); });
  await page.waitForTimeout(200);
  const groupToggle = groupCard.locator('button[onclick*="togglePlanRows"]');
  console.log("Savings groups' own toggle reads the real Arabic label, not English:", (await groupToggle.innerText()) === "عرض الجدول");
  await groupToggle.click();
  await page.waitForTimeout(150);
  console.log("...and the 'hide' state does too:", (await groupToggle.innerText()) === "إخفاء الجدول");
  await page.click(".navbtn:has-text('الأقساط')");
  await page.waitForTimeout(200);
  const hazemToggleAr = page.locator(".card-row", { hasText: "Hazem" }).locator(".link-btn.small");
  console.log("Installments' own toggle reads the real Arabic label too:", (await hazemToggleAr.innerText()) === "عرض الجدول");
  await page.evaluate(() => { UI.setLang("en"); });
  await page.waitForTimeout(200);

  console.log("\n=== 48) A fully-settled plan loses its 'Record payment' button (a guaranteed dead end otherwise) ===");
  const phoneRemainingTxt = await phoneCard.locator(".card-row-amt").innerText();
  const phoneRemaining = Number(phoneRemainingTxt.replace(/[^\d.]/g, ""));
  console.log("Phone plan still has a Record payment button while active:", await phoneCard.locator("button", { hasText: "Record payment" }).count() === 1);
  await phoneCard.locator("button", { hasText: "Record payment" }).click();
  await page.waitForTimeout(200);
  await page.fill("#f_amount", String(phoneRemaining));
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(250);

  console.log("\n=== 53) A newly-completed plan collapses into its own 'Completed' section ===");
  console.log("the now-fully-paid plan is no longer in the active list:", await page.locator(".card-list .card-row-title", { hasText: "Phone bought in installments" }).count() === 0);
  const completedToggle = page.locator("button", { hasText: "1 completed" });
  console.log("a '1 completed' expand button appears instead:", await completedToggle.count() === 1);
  await completedToggle.click();
  await page.waitForTimeout(150);
  const completedCard = page.locator(".card-row", { hasText: "Phone bought in installments" });
  console.log("expanding reveals it under a 'Completed' heading:", await page.locator(".section-title", { hasText: "Completed" }).count() === 1);
  console.log("the completed card correctly lost its Record payment button (idea 48, same plan):", await completedCard.locator("button", { hasText: "Record payment" }).count() === 0);
  console.log("its progress bar is drawn in the positive/done tone:", (await completedCard.locator(".bar-fill").getAttribute("style") || "").includes("var(--c-pos)"));

  console.log("\n=== 54) The Record payment plan-picker names each option's direction and remaining, not a bare title ===");
  await hazemCard.locator("button", { hasText: "Record payment" }).click();
  await page.waitForTimeout(200);
  const planOpts = await page.locator("#f_planId option").allTextContents();
  console.log("still exactly 3 plans offered (a settled plan stays pickable, not silently removed):", planOpts.length === 3);
  console.log("an active plan's option names its direction and remaining amount:", /MacBook Pro sold to Hazem — Owed to me — EGP [\d,]+/.test(planOpts[0]));
  console.log("the now-settled Phone plan is labelled '(paid)' instead of a remaining amount:", /Phone bought in installments — I owe \(paid\)$/.test(planOpts[2]));
  await page.click("button:has-text('Cancel')");
  await page.waitForTimeout(150);

  console.log("\n=== 49) A direction with zero plans at all hides its whole KPI section (not just an all-zero one) ===");
  console.log("'I owe' section still shows right now (the plan is settled, not gone):", await page.locator(".section-title", { hasText: "I owe" }).count() === 1);
  await page.evaluate(() => {
    const app = UI.app, d = app.state.data;
    d.plans = d.plans.filter(p => p.id !== "pl_phone");
    d.tx = d.tx.filter(t => t.planId !== "pl_phone");
    app.persist(d, "test setup");
    UI.render();
  });
  await page.waitForTimeout(200);
  console.log("removing that one 'I owe' plan entirely makes the whole section disappear:", await page.locator(".section-title", { hasText: "I owe" }).count() === 0);
  console.log("'Owed to me' (still has plans) stays exactly as visible as before:", await page.locator(".section-title", { hasText: "Owed to me" }).count() === 1);

  console.log("\n=== 58) A completely empty plan list shows a real empty state, not a bare banner over nothing ===");
  await page.evaluate(() => {
    const app = UI.app, d = app.state.data;
    d.plans = [];
    d.tx = d.tx.filter(t => t.type !== "installment_sale" && t.type !== "installment_payment");
    app.persist(d, "test setup");
    UI.render();
  });
  await page.waitForTimeout(200);
  console.log("both direction headers are gone now:", await page.locator(".section-title", { hasText: "Owed to me" }).count() === 0 && await page.locator(".section-title", { hasText: "I owe" }).count() === 0);
  console.log("a real empty-state message takes their place:", await page.locator("text=No installment plans yet").count() === 1);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
