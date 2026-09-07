const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

// Dashboard Recut #25 collapses Needs Attention to its first 3 cards, with
// a "+N more" button revealing the rest -- every .alert-card assertion in
// this file needs the full list actually in the DOM (a to-do reminder can
// easily land past position 3 once the seed's own overdue plans/receivables
// are counted first), so expand before reading it every time.
async function expandAlerts(page) {
  const moreBtn = page.locator(".dash-section button.btn-secondary.block");
  if (await moreBtn.count()) { await moreBtn.click(); await page.waitForTimeout(150); }
}

// The To-do list: a plain reminder with a due date, surfaced on the
// Dashboard as it approaches -- and, by design, completely invisible to
// every financial number in the app. Engine.submit()'s "todo"/"todo_edit"
// branches deliberately never call push() (the closure every other kind in
// that big if/else chain uses to create a transaction row), so a to-do can
// never touch a balance, net worth, or show up in derive() output at all.

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 1100 } });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Reachable from More, adding one records it with zero financial effect ===");
  const balBefore = await page.evaluate(() => UI.app.derive().available);
  const netWorthBefore = await page.evaluate(() => UI.app.derive().netWorth);
  const txCountBefore = await page.evaluate(() => UI.app.state.data.tx.length);
  await page.click(".navbtn:has-text('More')");
  await page.waitForTimeout(150);
  console.log("More sheet lists To-do list:", await page.locator(".sheet").locator("text=To-do list").count() >= 1);
  await page.click("text=To-do list");
  await page.waitForTimeout(200);
  console.log("navigated to the todos page:", await page.evaluate(() => UI.app.state.page) === "todos");

  const dueSoon = await page.evaluate(() => UI.app.iso(UI.app.addDays(new Date(), 1)));
  await page.evaluate(() => UI.openModal("todo"));
  await page.waitForTimeout(150);
  await page.fill("#f_title", "Renew car insurance");
  await page.fill("#f_due", dueSoon);
  await page.fill("#f_notes", "call the agent first");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => UI.app.state.data.todos);
  console.log("to-do saved with title/due/notes, not done:", saved.length === 1 && saved[0].title === "Renew car insurance" && saved[0].due === dueSoon && saved[0].notes === "call the agent first" && saved[0].done === false);

  const balAfter = await page.evaluate(() => UI.app.derive().available);
  const netWorthAfter = await page.evaluate(() => UI.app.derive().netWorth);
  const txCountAfter = await page.evaluate(() => UI.app.state.data.tx.length);
  console.log("available balance unchanged by adding a to-do:", balAfter === balBefore);
  console.log("net worth unchanged by adding a to-do:", netWorthAfter === netWorthBefore);
  console.log("no transaction row was created for the to-do:", txCountAfter === txCountBefore);

  console.log("\n=== 2) A due-soon to-do surfaces as a Dashboard Needs Attention reminder ===");
  await page.evaluate(() => UI.setPage("dashboard"));
  await page.waitForTimeout(200);
  await expandAlerts(page);
  const alertTexts = await page.locator(".alert-card").allTextContents();
  console.log("Dashboard shows a reminder card naming the to-do:", alertTexts.some(x => x.includes("Renew car insurance")));
  const attnBefore = await page.evaluate(() => UI.app.attentionCount(UI.app.derive()));
  console.log("attentionCount (badge) also counts the due-soon to-do:", attnBefore > 0);

  console.log("\n=== 3) A to-do with no due date, or one due far in the future, never appears as a reminder ===");
  await page.evaluate(() => UI.setPage("todos"));
  await page.waitForTimeout(150);
  await page.evaluate(() => UI.openModal("todo"));
  await page.waitForTimeout(150);
  await page.fill("#f_title", "Someday — repaint the balcony");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(150);
  const farDue = await page.evaluate(() => UI.app.iso(UI.app.addDays(new Date(), 60)));
  await page.evaluate(() => UI.openModal("todo"));
  await page.waitForTimeout(150);
  await page.fill("#f_title", "Renew passport");
  await page.fill("#f_due", farDue);
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(150);
  await page.evaluate(() => UI.setPage("dashboard"));
  await page.waitForTimeout(200);
  await expandAlerts(page);
  const alertTexts2 = await page.locator(".alert-card").allTextContents();
  console.log("no-due-date to-do never becomes a reminder:", !alertTexts2.some(x => x.includes("repaint the balcony")));
  console.log("a to-do due 60 days out never becomes a reminder yet:", !alertTexts2.some(x => x.includes("Renew passport")));

  console.log("\n=== 4) Editing a to-do's due date to overdue re-surfaces it, worded as overdue ===");
  await page.evaluate(() => UI.setPage("todos"));
  await page.waitForTimeout(150);
  const passportId = await page.evaluate(() => UI.app.state.data.todos.find(t => t.title === "Renew passport").id);
  const yesterday = await page.evaluate(() => UI.app.iso(UI.app.addDays(new Date(), -1)));
  await page.evaluate((args) => { UI.openModal("todo_edit", { id: args.id, title: "Renew passport", due: args.due, notes: "" }); }, { id: passportId, due: yesterday });
  await page.waitForTimeout(150);
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(150);
  await page.evaluate(() => UI.setPage("dashboard"));
  await page.waitForTimeout(200);
  await expandAlerts(page);
  const alertTexts3 = await page.locator(".alert-card").allTextContents();
  const passportAlert = alertTexts3.find(x => x.includes("Renew passport"));
  console.log("now-overdue to-do shows up as a reminder:", !!passportAlert);
  console.log("its wording says it WAS due, not that it's still upcoming:", !!passportAlert && passportAlert.includes("Was due"));
  const passportCard = await page.locator(".alert-card", { hasText: "Renew passport" });
  console.log("its severity is the negative (overdue) tone, not the warning one:", (await passportCard.getAttribute("class") || "").includes("sev-neg"));

  console.log("\n=== 5) Checking a to-do off removes it from the reminder without deleting it ===");
  // attentionCount right before this step counts BOTH still-open reminders
  // (car insurance due tomorrow, passport now overdue from step 4) -- the
  // right comparison for "drops once checked off" is against that number,
  // not attnBefore from step 2 (back when passport wasn't overdue yet).
  const attnBeforeCheck = await page.evaluate(() => UI.app.attentionCount(UI.app.derive()));
  await page.evaluate(() => UI.setPage("todos"));
  await page.waitForTimeout(150);
  const insuranceRow = page.locator(".todo-row", { hasText: "Renew car insurance" });
  await insuranceRow.locator(".todo-check input").check();
  await page.waitForTimeout(150);
  const insuranceTodo = await page.evaluate(() => UI.app.state.data.todos.find(t => t.title === "Renew car insurance"));
  console.log("checking it off marks done, doesn't delete it:", insuranceTodo && insuranceTodo.done === true);
  console.log("the checked row gets the done styling:", await page.locator(".todo-row.todo-done", { hasText: "Renew car insurance" }).count() === 1);
  await page.evaluate(() => UI.setPage("dashboard"));
  await page.waitForTimeout(200);
  await expandAlerts(page);
  const alertTexts4 = await page.locator(".alert-card").allTextContents();
  console.log("a done to-do no longer shows as a reminder even though its due date already passed the 3-day window:", !alertTexts4.some(x => x.includes("Renew car insurance")));
  console.log("the still-open overdue reminder (passport) keeps showing:", alertTexts4.some(x => x.includes("Renew passport")));
  const attnAfterDone = await page.evaluate(() => UI.app.attentionCount(UI.app.derive()));
  console.log("attentionCount drops by exactly one once that reminder is checked off:", attnAfterDone === attnBeforeCheck - 1);

  console.log("\n=== 6) Deleting a to-do removes it entirely, with no trace in transactions/balances ===");
  await page.evaluate(() => UI.setPage("todos"));
  await page.waitForTimeout(150);
  const countBeforeDelete = await page.evaluate(() => UI.app.state.data.todos.length);
  page.once("dialog", d => d.accept());
  await page.locator(".todo-row", { hasText: "Someday" }).locator("button:has-text('Delete')").click();
  await page.waitForTimeout(150);
  const countAfterDelete = await page.evaluate(() => UI.app.state.data.todos.length);
  console.log("deleting a to-do removes exactly one:", countAfterDelete === countBeforeDelete - 1);
  const finalBal = await page.evaluate(() => UI.app.derive().available);
  const finalNetWorth = await page.evaluate(() => UI.app.derive().netWorth);
  const finalTxCount = await page.evaluate(() => UI.app.state.data.tx.length);
  console.log("after the whole flow, available balance is exactly as it started:", finalBal === balBefore);
  console.log("after the whole flow, net worth is exactly as it started:", finalNetWorth === netWorthBefore);
  console.log("after the whole flow, transaction count is exactly as it started (nothing ever posted):", finalTxCount === txCountBefore);

  console.log("\n=== 7) An HTML-bearing due date (e.g. from a restored JSON backup) never injects markup ===");
  // A to-do's due date normally only ever comes from <input type=date>, but
  // Settings -> Restore from JSON writes data.todos back verbatim with no
  // format check on this field (same as title/notes) -- both render sites
  // (the To-do page's own row, and the Dashboard reminder card built from
  // dueSoonTodos()) must escape it like any other free-text field, not
  // trust it as safe HTML.
  const payload = "<img src=x onerror=\"window.__todoXss=true\">";
  await page.evaluate((due) => {
    const data = JSON.parse(JSON.stringify(UI.app.state.data));
    data.todos.push({ id: "td_xss", title: "XSS probe", due, notes: "", done: false, created: UI.app.today() });
    UI.app.persist(data);
  }, payload);
  await page.waitForTimeout(150);
  await page.evaluate(() => UI.setPage("todos"));
  await page.waitForTimeout(200);
  console.log("no injected script executed via the To-do list page:", await page.evaluate(() => !window.__todoXss));
  console.log("the raw markup shows as literal text, not a rendered <img>:", (await page.locator(".todo-row", { hasText: "XSS probe" }).innerText()).includes("<img"));
  await page.evaluate(() => UI.setPage("dashboard"));
  await page.waitForTimeout(200);
  console.log("no injected script executed via the Dashboard reminder card either:", await page.evaluate(() => !window.__todoXss));

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
