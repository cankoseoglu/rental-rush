/* Real-browser UI test: drives system Chrome through the flows that headless
   screenshots can't verify — deal-panel authority, scout mode, stale panels.
   Run: node scripts/uitest.mjs (expects the prod server on :3789) */

import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3789";

let passed = 0;
const ok = (cond, label) => {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickButton(page, text) {
  const found = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes(t),
    );
    if (!el) return false;
    el.click();
    return true;
  }, text);
  if (!found) throw new Error(`no button containing "${text}"`);
}

const state = (page) => page.evaluate(() => window.__rr.getState());

async function freshPage(browser, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1380, height: 950 });
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__rr !== undefined);
  await page.evaluate(() => window.__rr.getState().setSpeed(8));
  return page;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
try {
  // ----------------------------------------------------------------------
  console.log("\n1. Landing on an area: panel is pinned to where you stand");
  {
    const page = await freshPage(browser, "/?modals=1&seed=rr2-test-2"); // lands Ropewalks
    await page.waitForFunction(
      () =>
        window.__rr.getState().ui.pendingVisible &&
        document.querySelector("aside h2") !== null,
      { timeout: 25000 },
    );
    const s1 = await state(page);
    ok(s1.game.pendingQueue[0].areaId === "ropewalks", "engine pending = ropewalks");

    const heading = await page.$eval("aside h2", (el) => el.textContent);
    ok(heading === "Ropewalks", `panel shows Ropewalks (got ${heading})`);
    const hasMoves = await page.evaluate(() =>
      document.body.textContent.includes("Available moves here"),
    );
    ok(hasMoves, "moves offered where you landed");

    // tap a different tile while standing on Ropewalks
    await page.click('[title="Shoreditch, London"]');
    await sleep(500);
    const heading2 = await page.$eval("aside h2", (el) => el.textContent);
    ok(heading2 === "Ropewalks", "panel stays pinned to your tile, not the tapped one");

    // a rogue buy in another area must bounce off the engine
    const before = (await state(page)).game.players[0].assets.length;
    await page.evaluate(() => {
      // simulate a forged acquisition attempt while a different-area panel might show
      window.__rr.getState().act({
        t: "ACQUIRE",
        spec: { kind: "buy", model: "STR", furnish: "fast", withLicence: false },
      });
    });
    const after = (await state(page)).game.players[0].assets.length;
    ok(after === before + 1, "ACQUIRE lands in the PENDING area only (engine-authoritative)");
    const where = (await state(page)).game.players[0].assets[0].areaId;
    ok(where === "ropewalks", `bought in ropewalks, not the tapped tile (got ${where})`);
    await page.close();
  }

  // ----------------------------------------------------------------------
  console.log("\n2. Your exact flow: land on Guest desk, ack, then browse tiles");
  {
    const page = await freshPage(browser, "/?modals=1&seed=rr2-test-1"); // lands Guest desk
    await page.waitForFunction(
      () =>
        window.__rr.getState().game?.pendingQueue[0]?.kind === "event" &&
        window.__rr.getState().ui.pendingVisible,
      { timeout: 25000 },
    );
    const s = await state(page);
    ok(s.game.players[0].assets.length === 0, "you start with ZERO properties");
    const flavorOk = await page.evaluate(() =>
      document.body.textContent.includes("No guests yet") ||
      document.body.textContent.includes("no live units"),
    );
    ok(flavorOk, "guest filler event acknowledges an empty portfolio (no phantom upsells)");

    await clickButton(page, "Carry on");

    // bots play, month end comes back to you — ack any P&L modals
    for (let i = 0; i < 120; i++) {
      const st = await state(page);
      if (st.game.over) break;
      const head = st.game.pendingQueue[0];
      if (head?.kind === "monthEnd" && st.game.current === 0 && st.ui.pendingVisible) {
        await clickButton(page, "Continue");
      } else if (
        st.game.current === 0 &&
        st.game.phase === "awaitRoll" &&
        !st.game.pendingQueue.length &&
        !st.ui.busy
      ) {
        break;
      }
      await sleep(250);
    }
    const idle = await state(page);
    ok(
      idle.game.current === 0 && idle.game.phase === "awaitRoll",
      "reached your next pre-roll moment",
    );
    ok(idle.ui.selectedAreaId === null, "no stale area panel re-opened between turns");

    // browse a tile you are NOT standing on
    await page.click('[title="Clifton, Bristol"]');
    await page.waitForFunction(() => document.querySelector("aside h2") !== null, {
      timeout: 10000,
    });
    const scout = await page.evaluate(() => ({
      heading: document.querySelector("aside h2")?.textContent,
      hasMoves: document.body.textContent.includes("Available moves here"),
      hasScoutHint: document.body.textContent.includes("Scouting only"),
    }));
    ok(scout.heading === "Clifton", "tapped tile opens for inspection");
    ok(!scout.hasMoves, "NO buy/rent/manage offered on a tile you didn't land on");
    ok(scout.hasScoutHint, "scout-mode hint explains why");

    // forged ACQUIRE with no pending must be rejected by the engine
    const before = (await state(page)).game.players[0].assets.length;
    await page.evaluate(() => {
      window.__rr.getState().act({
        t: "ACQUIRE",
        spec: { kind: "buy", model: "STR", furnish: "fast", withLicence: false },
      });
    });
    const after = (await state(page)).game.players[0].assets.length;
    ok(after === before, "engine rejects buying while not standing on an area");

    const rollEnabled = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        (b.textContent ?? "").includes("ROLL THE DICE"),
      );
      return btn ? !btn.disabled : false;
    });
    ok(rollEnabled, "roll button live for your turn");
    await page.close();
  }

  console.log(`\nAll UI tests passed (${passed} assertions) ✓`);
} finally {
  await browser.close();
}
