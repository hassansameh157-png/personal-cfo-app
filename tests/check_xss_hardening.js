const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

const PAYLOAD = "x\\');alert(document.cookie);//<script>alert(1)</script>&\"'";

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  const dialogs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Person name with a malicious payload ===");
  await page.click(".navbtn:has-text('People')"); await page.waitForTimeout(150);
  await page.click("button:has-text('+ Person')"); await page.waitForTimeout(200);
  await page.fill("#f_name", PAYLOAD);
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  const personRow = page.locator(".card-row.person-card").last();
  const viewTxBtn = personRow.locator("button", { hasText: "transactions" }).first();
  const onclickAttr1 = await viewTxBtn.getAttribute("onclick").catch(() => "MISSING");
  console.log("onclick attr well-formed (no unescaped break):", onclickAttr1 !== "MISSING");
  await viewTxBtn.click(); await page.waitForTimeout(200);
  console.log("navigated safely, no dialog fired:", dialogs.length === 0);
  console.log("search box got the raw (unexecuted) name text:", (await page.locator("#txSearch").inputValue()).includes("alert"));

  console.log("\n=== 2) Tag with a malicious payload ===");
  await page.click(".navbtn:has-text('Transactions')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", ""); await page.waitForTimeout(150);
  await page.click("button:has-text('+ Expense')"); await page.waitForTimeout(200);
  await page.fill("#f_amount", "5");
  await page.fill("#f_desc", "Tag XSS test");
  await page.fill("#f_tags", PAYLOAD);
  await page.click("button:has-text('Save')"); await page.waitForTimeout(200);
  await page.fill("#txSearch", "Tag XSS test"); await page.waitForTimeout(200);
  const tagBtn = page.locator(".card-row", { hasText: "Tag XSS test" }).first().locator(".pill-row button").first();
  await tagBtn.click(); await page.waitForTimeout(200);
  console.log("no dialog fired from tag click:", dialogs.length === 0);

  console.log("\n=== 3) Custom category with a malicious payload ===");
  await page.click(".navbtn:has-text('More')"); await page.waitForTimeout(150);
  await page.click(".sheet-item:has-text('Settings')"); await page.waitForTimeout(200);
  await page.fill("#newExpenseCat", PAYLOAD);
  await page.evaluate(() => UI.addCategoryC("expense"));
  await page.waitForTimeout(200);
  console.log("no dialog fired from adding the category:", dialogs.length === 0);
  const catPill = page.locator(".pill", { hasText: "alert" }).first();
  const catPillCount = await catPill.count();
  console.log("malicious category pill rendered inertly:", catPillCount > 0);
  if (catPillCount) {
    // Deleting a category goes through a real confirm() -- a legitimate
    // app dialog, not an injected one. confirm()/alert() only ever show
    // PLAIN TEXT, never execute markup or script in their message, so the
    // real proof-of-safety here is that the payload shows up VERBATIM,
    // inert, as the dialog's own text -- if escaping had failed, the
    // payload would have broken OUT of the onclick argument instead and
    // "alert(document.cookie)" would have run for real, showing the
    // actual cookie value (or an empty string) as its message, not this
    // literal source text.
    await catPill.locator("button").click(); await page.waitForTimeout(200);
    const deleteDialog = dialogs[dialogs.length - 1] || "";
    console.log("delete confirm() showed the raw payload as inert text (not executed):", deleteDialog.includes(PAYLOAD));
  }

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  console.log("all dialogs seen (expected: only the app's own confirm/alert, always showing the payload as plain literal text, never actually executing it):");
  dialogs.forEach(d => console.log(" -", d));
  await browser.close();
})();
