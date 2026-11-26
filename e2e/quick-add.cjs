// Keyboard behaviour of the quick-add sheet (the + button), driven with REAL key presses, not
// synthetic events: Tab and Shift+Tab never leave the dialog, Escape returns focus to the +
// button, adding with the keyboard returns focus to it, and choosing "رسالة لأهلك" lands the
// focus in the letter's editor. Needs no network services and no activation (a normal build).
// Usage: BASE=http://127.0.0.1:8788 node e2e/quick-add.cjs
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:8788";
const PASS = "copper lantern quietly 2041 river";

function check(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else console.log("ok  ", msg);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto(BASE + "/start", { waitUntil: "networkidle" });
  await p.fill("#p1", PASS);
  await p.fill("#p2", PASS);
  await p.check("#ack");
  await p.waitForTimeout(800); // the strength library loads on focus
  await p.click('button:has-text("اعمل ملفي")');
  await p.waitForURL("**/file", { timeout: 60000 });

  const fab = 'button[aria-controls="quick-add"]';
  const inDialog = () => p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  const onFab = () =>
    p.evaluate(() => document.activeElement?.getAttribute("aria-controls") === "quick-add");

  // open with the keyboard: focus moves into the dialog by itself
  await p.focus(fab);
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'), null, {
    timeout: 5000,
  });
  check(await inDialog(), "focus is inside the dialog right after it opens");

  let stayed = true;
  for (let i = 0; i < 30; i++) {
    await p.keyboard.press("Tab");
    if (!(await inDialog())) stayed = false;
  }
  check(stayed, "30 x Tab: focus never leaves the dialog");
  stayed = true;
  for (let i = 0; i < 30; i++) {
    await p.keyboard.press("Shift+Tab");
    if (!(await inDialog())) stayed = false;
  }
  check(stayed, "30 x Shift+Tab: focus never leaves the dialog");

  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  check(await onFab(), "Escape closes it and returns focus to the + button");

  // add one thing with the keyboard only
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'));
  await p.locator('#quick-add button:has-text("بنك")').first().focus();
  await p.keyboard.press("Enter");
  await p.waitForSelector("#quick-add input.field");
  await p.keyboard.type("Test Bank");
  await p.keyboard.press("Enter");
  await p.waitForSelector("text=اتضاف «Test Bank»");
  await p.waitForTimeout(400);
  check(await onFab(), "after adding, focus returns to the + button");

  // the letter entry moves focus into the editor
  await p.click(fab);
  await p.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'));
  await p.click('#quick-add button:has-text("رسالة لأهلك")');
  await p.waitForURL("**/file?s=letter");
  await p.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA", null, {
    timeout: 5000,
  });
  check(true, "choosing the letter puts focus in its text box");
  await p.keyboard.type("hello");
  check((await p.inputValue("textarea.field")) === "hello", "typing goes straight into the letter");

  check(errors.length === 0, "no page errors (" + errors.join(" | ") + ")");
  await b.close();
})().catch((e) => {
  console.error("FAIL script error:", e.message.split("\n")[0]);
  process.exit(1);
});
