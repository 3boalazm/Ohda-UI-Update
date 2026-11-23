// Post-build step for Vercel only (run after `NITRO_PRESET=vercel vite build`).
//
// Cloudflare reads public/_headers for static files; Vercel ignores it. This script ports those
// rules into .vercel/output/config.json so static files get the same security headers, and maps
// the extensionless /family-template URL (fetched by src/lib/plan.ts) to the HTML file, as
// Cloudflare's asset layer does. public/_headers stays the single source of truth.
//
// SSR responses are untouched: they get their headers from src/securityHeaders.ts at runtime.
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const OUT = ".vercel/output";
const CONFIG = `${OUT}/config.json`;

/** Parses the Cloudflare/Netlify `_headers` format into [{ path, headers }]. */
export function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { path: raw.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    if (!current) throw new Error(`_headers: header line before any path: ${raw}`);
    const i = raw.indexOf(":");
    if (i < 0) throw new Error(`_headers: malformed line: ${raw}`);
    current.headers[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
  }
  return rules;
}

/** `/assets/*` → `^/assets/(.*)$`; everything else is matched literally. */
export function pathToSrc(path) {
  const escaped = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return `^${escaped.replace(/\*/g, "(.*)")}$`;
}

/** Inserts the header rules and the /family-template rewrite into a Build Output API config. */
export function applyRules(config, rules) {
  const routes = config.routes ?? [];
  const fsIndex = routes.findIndex((r) => r.handle === "filesystem");
  if (fsIndex < 0) throw new Error("config.json has no filesystem phase");

  // Exact paths are static-only, so their headers can apply in the main phase (this also covers
  // the rewritten /family-template). Wildcards go to the "hit" phase so they touch static files
  // only, never SSR responses, which set their own headers.
  const exact = rules.filter((r) => !r.path.includes("*"));
  const wildcard = rules.filter((r) => r.path.includes("*"));
  const main = [
    ...exact.map((r) => ({ src: pathToSrc(r.path), headers: r.headers, continue: true })),
    { src: "^/family-template$", dest: "/family-template.html" },
  ];
  const hit = [
    { handle: "hit" },
    ...wildcard.map((r) => ({ src: pathToSrc(r.path), headers: r.headers, continue: true })),
  ];
  if (routes.some((r) => r.handle === "hit"))
    throw new Error("config.json already has a hit phase");
  config.routes = [...routes.slice(0, fsIndex), ...main, ...routes.slice(fsIndex), ...hit];
  return config;
}

if (process.argv[1]?.endsWith("vercel-output.mjs")) {
  const rules = parseHeadersFile(readFileSync("public/_headers", "utf8"));
  const config = JSON.parse(readFileSync(CONFIG, "utf8"));
  writeFileSync(CONFIG, JSON.stringify(applyRules(config, rules), null, 2) + "\n");
  // the Cloudflare rules file has no meaning on Vercel; do not serve it
  rmSync(`${OUT}/static/_headers`, { force: true });
  console.log(`vercel-output: applied ${rules.length} header rules from public/_headers`);
}
