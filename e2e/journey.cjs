// End-to-end journey against a running build (no network services needed):
// create file -> edit -> autosave -> lock -> reopen -> edit persisted -> second tab takes over
// (first tab saves and locks) -> handover is gated without a valid entitlement (a forged
// localStorage flag is ignored). Fails on any CSP violation or page error.
// Usage: BASE=http://127.0.0.1:8788 node e2e/journey.cjs
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:8788";
const PASS = "mango river quietly 1987 lantern";

function check(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else console.log("ok  ", msg);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true });
  await ctx.addInitScript(() => {
    window.__v = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__v.push(e.violatedDirective),
    );
  });
  const errors = [];
  const watch = (p) => p.on("pageerror", (e) => errors.push(e.message));

  const a = await ctx.newPage();
  watch(a);
  await a.goto(BASE + "/start", { waitUntil: "networkidle" });
  await a.fill("#p1", PASS);
  await a.fill("#p2", PASS);
  await a.check("input[type=checkbox]");
  await a.waitForTimeout(800); // strength checker loads lazily
  await a.click('button:has-text("اعمل ملفي")');
  await a.waitForURL("**/file", { timeout: 60000 });
  await a.waitForSelector("text=جاهزية الملف");
  await a.click('[data-section="owner"]'); // home screen: open the first section
  await a.locator("input.field").first().fill("Journey Name");
  await a.waitForSelector("text=اتحفظ مشفّر على جهازك");
  await a.waitForTimeout(2000);
  await a.click('[data-nav="home"]');

  // backup download works
  const [dl] = await Promise.all([
    a.waitForEvent("download"),
    a.click("text=نزّل نسخة احتياطية مشفّرة"),
  ]);
  check((await dl.suggestedFilename()).endsWith(".ohda"), "encrypted backup downloads");

  // lock and reopen
  await a.click('button:has-text("اقفل")');
  await a.waitForURL("**/start");
  await a.fill("#pw", PASS);
  await a.click('button:has-text("افتح")');
  await a.waitForURL("**/file", { timeout: 60000 });
  await a.waitForSelector("text=جاهزية الملف");
  await a.click('[data-section="owner"]'); // home screen: open the first section
  check(
    (await a.locator("input.field").first().inputValue()) === "Journey Name",
    "edit persisted across lock/reopen",
  );

  // second tab takes over: first tab saves its pending edit and locks
  await a.locator("input.field").first().fill("Edited in tab A");
  const c = await ctx.newPage();
  watch(c);
  await c.goto(BASE + "/start", { waitUntil: "networkidle" });
  await c.fill("#pw", PASS);
  await c.click('button:has-text("افتح")');
  await c.waitForURL("**/file", { timeout: 60000 });
  await c.waitForSelector("text=جاهزية الملف");
  await c.click('[data-section="owner"]'); // home screen: open the first section
  check(
    (await c.locator("input.field").first().inputValue()) === "Edited in tab A",
    "tab B sees tab A's unsaved edit (A saved before handing over)",
  );
  await a.waitForTimeout(500);
  check((await a.innerText("body")).includes("الملف مقفول"), "tab A is locked after the hand-over");

  // entitlement gate ignores forged flags
  await c.evaluate(() =>
    localStorage.setItem("ohda-activation", JSON.stringify({ plan: "family" })),
  );
  await c.evaluate(() => localStorage.setItem("ohda-entitlement", "eyJ2IjoxfQ.forged"));
  await c.click('[data-nav="home"]');
  await c.click('a:has-text("سلّم أهلك")');
  await c.waitForURL("**/handover");
  await c.waitForTimeout(800);
  check(
    (await c.innerText("body")).includes("فعّل دلوقتي"),
    "handover stays gated with forged activation data",
  );

  const v = [...(await a.evaluate(() => window.__v)), ...(await c.evaluate(() => window.__v))];
  check(v.length === 0, "no CSP violations (" + v.join(",") + ")");
  check(errors.length === 0, "no page errors (" + errors.join(" | ") + ")");
  await b.close();
})();
