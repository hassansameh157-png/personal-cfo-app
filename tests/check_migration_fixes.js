const { chromium } = require("playwright");
const path = require("path");

require("./_watchdog"); // shared pass/fail detector -- see that file

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: "dark" });
  await page.route("**/*", r => r.request().url().startsWith("file://") ? r.continue() : r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);

  console.log("=== 1) Corrupted current key + no legacy data -> loadError stays true (no false-cleared-by-persist) ===");
  const r1 = await page.evaluate(() => {
    Engine.prototype.storageKey = () => "pcfo.fix1-current";
    Engine.prototype.legacyStorageKeys = () => [];
    localStorage.setItem("pcfo.fix1-current", "{ not valid json [[[");
    UI.app.load();
    return { loadError: UI.app.state.loadError, isSeed: UI.app.state.data.tx.length > 5 };
  });
  console.log(JSON.stringify(r1));
  console.log("loadError correctly stays true:", r1.loadError === true);

  console.log("\n=== 2) Corrupted current key, corrupted middle legacy key, VALID older legacy key -> recovers the valid one and loadError clears (real recovery happened) ===");
  const r2 = await page.evaluate(() => {
    const validOld = { accounts: [{ id: "a1", name: "Old Real Account", type: "bank", opening: 500, active: true, color: "#7d7979" }], people: [], tx: [], plans: [], groups: [], cardStatements: [], savingsGoals: [], investments: [], recurring: [], customCategories: { income: [], expense: [] }, budgets: {}, audit: [] };
    localStorage.setItem("pcfo.fix2-current", "{ garbage current [[[");
    localStorage.setItem("pcfo.fix2-legacy-mid", "{ garbage legacy mid [[[");
    localStorage.setItem("pcfo.fix2-legacy-old", JSON.stringify(validOld));
    Engine.prototype.storageKey = () => "pcfo.fix2-current";
    Engine.prototype.legacyStorageKeys = () => ["pcfo.fix2-legacy-mid", "pcfo.fix2-legacy-old"];
    UI.app.load();
    return {
      loadError: UI.app.state.loadError,
      recoveredAccountName: UI.app.state.data.accounts[0] && UI.app.state.data.accounts[0].name,
      midBackupExists: !!localStorage.getItem("pcfo.fix2-legacy-mid.corrupted-backup"),
      currentBackupExists: !!localStorage.getItem("pcfo.fix2-current.corrupted-backup"),
      promotedToCurrentKey: !!localStorage.getItem("pcfo.fix2-current")
    };
  });
  console.log(JSON.stringify(r2, null, 2));
  console.log("recovered the OLDER valid legacy key, not the corrupted middle one:", r2.recoveredAccountName === "Old Real Account");
  console.log("corrupted current key's raw was backed up:", r2.currentBackupExists);
  console.log("corrupted middle legacy key's raw was backed up:", r2.midBackupExists);
  console.log("data promoted onto the current key going forward:", r2.promotedToCurrentKey);

  console.log("\nerrors:", errors.length ? errors : "none");
  console.log("no unexpected JS errors:", errors.length === 0);
  await browser.close();
})();
