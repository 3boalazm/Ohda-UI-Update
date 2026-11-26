// The whole hand-over, end to end, ending with the STANDALONE family file opened offline:
// create a file -> quick-add an online account -> write the letter (first with a password in it:
// the hand-over must block the download and point at the letter, then fix it) -> demo activation
// -> issue and confirm the printed card -> download the family file -> open it from disk
// (file://, its own CSP, no server) with the card code -> the letter and the accounts show up,
// letter first -> the same file also opens on /open.
//
// Needs a build made with VITE_DEMO_MODE=1 (sample activation code; no backend is available in CI):
//   VITE_DEMO_MODE=1 bun run build
// Usage: BASE=http://127.0.0.1:8788 node e2e/family.cjs
// Set NO_PRETTY_URLS=1 for a server that does not map /family-template to the .html file.
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const BASE = process.env.BASE || "http://127.0.0.1:8788";
const PASS = "blue falcon river 7391 tent";
const LETTER = "LETTER-TEXT-123";

function check(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else console.log("ok  ", msg);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  if (process.env.NO_PRETTY_URLS)
    await ctx.route("**/family-template", async (r) =>
      r.fulfill({ response: await r.fetch({ url: BASE + "/family-template.html" }) }),
    );
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto(BASE + "/start", { waitUntil: "networkidle" });
  await p.fill("#p1", PASS);
  await p.fill("#p2", PASS);
  await p.check("#ack");
  await p.waitForTimeout(800);
  await p.click('button:has-text("اعمل ملفي")');
  await p.waitForURL("**/file", { timeout: 60000 });

  // quick add an online account
  await p.click('button[aria-controls="quick-add"]');
  await p.click('#quick-add button:has-text("حساب على النت")');
  await p.fill("#quick-add input.field", "Gmail");
  await p.click('#quick-add button:has-text("ضيف")');
  await p.waitForSelector("text=اتضاف «Gmail»");

  // a letter that contains a password
  await p.click('[data-section="letter"]');
  await p.fill("textarea.field", "كلمة السر بتاعة الموبايل 4455");
  await p.waitForTimeout(1500);
  await p.click('[data-nav="home"]');

  // activation (demo code), then the hand-over flow
  await p.click('a:has-text("سلّم أهلك")');
  await p.waitForURL("**/handover");
  await p.click('a:has-text("فعّل دلوقتي")');
  await p.fill("input.code-input", "OHDA-DEMO-0000-0001");
  await p.click('button:has-text("فعّل")');
  await p.click('a:has-text("روح لسلّم أهلك")');
  await p.waitForURL("**/handover");
  await p.fill("ol input.field", "Mama");
  await p.click('button:has-text("اعمل الكود")');
  await p.waitForSelector(".code-text");
  const code = (await p.innerText(".code-text")).replace(/\s/g, "");
  await p.check('ol input[type="checkbox"]');
  await p.fill("ol input.code-input", code.replace(/-/g, "").slice(-4));
  await p.click('button:has-text("فعّل الكروت الجديدة")');
  await p.waitForSelector("text=الكروت الجديدة اتفعّلت");

  const download = p.locator('button:has-text("نزّل ملف-عهدة-للأهل.html")');
  check(await download.isDisabled(), "download is blocked while the letter contains a password");
  const gate = await p.innerText("ol");
  check(gate.includes("رسالة لأهلك"), "the warning names the letter");
  check(
    !gate.includes("ومفيش أرقام حسابات كاملة ولا كلمات سر في الملف"),
    "no 'the file is clean' claim",
  );
  await p.click('a:has-text("عدّله")');
  await p.waitForURL("**/file?s=letter");
  await p.fill("textarea.field", LETTER);
  await p.waitForTimeout(1500);
  await p.click('[data-nav="home"]');
  await p.click('a:has-text("سلّم أهلك")');
  await p.waitForURL("**/handover");
  await p.waitForSelector("ol");
  check(await download.isEnabled(), "after the fix the download is allowed");

  const [dl] = await Promise.all([p.waitForEvent("download"), download.click()]);
  const file = path.join(os.tmpdir(), `ohda-family-${Date.now()}.html`);
  await dl.saveAs(file);

  // the family opens the standalone file from disk: no server, only its own strict CSP
  const f = await ctx.newPage();
  const fErrors = [];
  f.on("pageerror", (e) => fErrors.push(e.message));
  f.on("console", (m) => m.type() === "error" && fErrors.push(m.text()));
  await f.goto("file://" + file.replace(/\\/g, "/"));
  await f.fill("#c1", code);
  await f.click("#go");
  await f.waitForSelector("#out .card", { timeout: 20000 });
  const out = await f.innerText("#out");
  check(
    out.includes(LETTER) && out.includes("رسالة ليكم"),
    "standalone family file shows the letter",
  );
  check(
    out.includes("Gmail") && out.includes("حساباته على النت"),
    "standalone file shows the accounts",
  );
  check(out.indexOf("رسالة ليكم") < out.indexOf("جهات ممكن تساعدكم"), "the letter comes first");
  check(!out.includes("4455"), "the password that was removed is not in the family file");
  check(fErrors.length === 0, "family file: no script or CSP errors (" + fErrors.join(" | ") + ")");

  // a wrong code is refused
  await f.reload();
  await f.fill("#c1", "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA");
  await f.click("#go");
  await f.waitForTimeout(800);
  check(!(await f.innerText("body")).includes(LETTER), "a wrong code does not open the file");

  // the same file opens through the site's own /open page
  await p.goto(BASE + "/open", { waitUntil: "networkidle" });
  await p.setInputFiles('input[type="file"]', file);
  await p.fill("input.code-input", code);
  await p.click('button:has-text("افتح الملف")');
  await p.waitForSelector("text=رسالة ليكم", { timeout: 20000 });
  const open = await p.innerText("main");
  check(open.includes(LETTER) && open.includes("Gmail"), "/open shows both new sections");

  fs.rmSync(file, { force: true });
  check(errors.length === 0, "no page errors (" + errors.join(" | ") + ")");
  await b.close();
})().catch((e) => {
  console.error("FAIL script error:", e.message.split("\n")[0]);
  process.exit(1);
});
