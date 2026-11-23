import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { applyRules, parseHeadersFile, pathToSrc } from "../../scripts/vercel-output.mjs";
import { clientIp } from "@/lib/clientIp";

const headersFile = readFileSync("public/_headers", "utf8");
// the routes nitro's vercel preset emits (see .vercel/output/config.json after a build)
const nitroConfig = () => ({
  version: 3,
  routes: [
    { headers: { "cache-control": "public, max-age=31536000, immutable" }, src: "/assets/(.*)" },
    { handle: "filesystem" },
    { src: "/(.*)", dest: "/__server" },
  ],
});

describe("Vercel output: public/_headers ported to config.json", () => {
  const rules = parseHeadersFile(headersFile);

  it("parses every rule in public/_headers", () => {
    expect(rules.map((r) => r.path)).toEqual([
      "/*",
      "/family-template.html",
      "/family-template",
      "/assets/*",
    ]);
    expect(rules[0]!.headers["X-Frame-Options"]).toBe("DENY");
    expect(rules[1]!.headers["Content-Security-Policy"]).toContain("script-src 'sha256-");
  });

  it("turns paths into anchored regexes", () => {
    const all = new RegExp(pathToSrc("/*"));
    expect(all.test("/favicon.ico")).toBe(true);
    const tpl = new RegExp(pathToSrc("/family-template.html"));
    expect(tpl.test("/family-template.html")).toBe(true);
    expect(tpl.test("/family-templateXhtml")).toBe(false);
    expect(tpl.test("/family-template.html/x")).toBe(false);
  });

  it("puts template CSP and rewrite before the filesystem, global headers in the hit phase", () => {
    const routes = applyRules(nitroConfig(), rules).routes!;
    const fs = routes.findIndex((r) => r.handle === "filesystem");
    const hit = routes.findIndex((r) => r.handle === "hit");
    const server = routes.findIndex((r) => r.dest === "/__server");
    const rewrite = routes.findIndex((r) => r.dest === "/family-template.html");
    const tplCsp = routes.findIndex((r) => r.src === "^/family-template$" && r.headers);

    expect(rewrite).toBeGreaterThan(-1);
    expect(rewrite).toBeLessThan(fs);
    expect(tplCsp).toBeLessThan(rewrite); // headers set before the path is rewritten
    expect(fs).toBeLessThan(server);
    expect(server).toBeLessThan(hit); // SSR catch-all is untouched; hit phase is last

    for (const r of routes.slice(hit + 1)) {
      expect(r.continue).toBe(true);
      expect(r.dest).toBeUndefined();
    }
    const global = routes.slice(hit + 1).find((r) => r.src === "^/(.*)$")!;
    expect(global.headers!["Strict-Transport-Security"]).toContain("max-age=63072000");
  });
});

describe("clientIp", () => {
  const headers: Record<string, string> = { "cf-connecting-ip": "1.1.1.1", "x-real-ip": "2.2.2.2" };
  const get = (n: string) => headers[n];

  it("trusts cf-connecting-ip on Cloudflare and ignores x-real-ip", () => {
    expect(clientIp(get, {})).toBe("1.1.1.1");
    expect(clientIp((n) => (n === "x-real-ip" ? "2.2.2.2" : undefined), {})).toBe("no-ip");
  });

  it("trusts only x-real-ip on Vercel, never a client-sent cf-connecting-ip", () => {
    expect(clientIp(get, { VERCEL: "1" })).toBe("2.2.2.2");
    expect(
      clientIp((n) => (n === "cf-connecting-ip" ? "1.1.1.1" : undefined), { VERCEL: "1" }),
    ).toBe("no-ip");
  });
});
