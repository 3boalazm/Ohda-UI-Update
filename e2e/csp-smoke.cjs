// Loads every route in Chromium against a running build and fails on any CSP violation,
// page error, missing security header, or a script tag without the response nonce.
// Usage: BASE=http://127.0.0.1:8788 node e2e/csp-smoke.cjs
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:8788";
const routes = [
  "/",
  "/start",
  "/file",
  "/handover",
  "/open",
  "/activate",
  "/admin",
  "/privacy",
  "/security",
  "/quiz",
  "/family-template",
];
(async () => {
  let failed = 0;
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addInitScript(() => {
    window.__v = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__v.push(e.violatedDirective + " " + e.blockedURI),
    );
  });
  for (const r of routes) {
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    const res = await p.goto(BASE + r, { waitUntil: "networkidle" });
    await p.waitForTimeout(500);
    const h = res.headers();
    const csp = h["content-security-policy"] || "";
    const nonce = (/'nonce-([^']+)'/.exec(csp) || [])[1];
    const html = await res.text();
    const unnonced =
      r === "/family-template"
        ? 0
        : (html.match(/<script\b[^>]*>/gi) || []).filter((t) => !t.includes(`nonce="${nonce}"`))
            .length;
    const v = await p.evaluate(() => window.__v);
    const problems = [
      ...v.map((x) => "CSP " + x),
      ...errs.map((x) => "ERR " + x),
      ...(csp ? [] : ["no CSP header"]),
      ...(h["x-frame-options"] === "DENY" || r === "/family-template" ? [] : ["no XFO"]),
      ...(unnonced ? [`${unnonced} script(s) without nonce`] : []),
    ];
    console.log(problems.length ? "FAIL" : "ok  ", r, problems.join("; "));
    failed += problems.length ? 1 : 0;
    await p.close();
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})();
