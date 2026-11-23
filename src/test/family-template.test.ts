/**
 * The family file runs offline (file://) where only its meta CSP applies. It must allow exactly
 * its own inline script by hash — no 'unsafe-inline', no inline event handlers, no network.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAMILY_TEMPLATE_SCRIPT_SHA256, FAMILY_TEMPLATE_SHA256 } from "@/lib/familyTemplateHash";
import { templateScriptMatches } from "@/lib/plan";
import { formatCode, parseCode, randomBytes, toB64 } from "@/lib/ohdaCrypto";
import vectors from "./vectors.v1.json";

const tpl = readFileSync("public/family-template.html", "utf8");
const headers = readFileSync("public/_headers", "utf8");
const scripts = [
  ...tpl.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g),
];
const hash = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

describe("family template CSP", () => {
  it("has one executable inline script whose hash is in the meta CSP and in _headers", () => {
    expect(scripts).toHaveLength(1);
    const h = hash(scripts[0]![1]!);
    const meta = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(tpl)![1]!;
    expect(meta).toContain(`script-src ${h}`);
    expect(/script-src[^;]*unsafe-inline/.test(meta)).toBe(false);
    expect(meta).toContain("default-src 'none'");
    expect(meta).not.toMatch(/connect-src/);
    for (const path of ["/family-template.html", "/family-template"]) {
      const block = headers.split(`\n${path}\n`)[1]!.split("\n\n")[0]!;
      expect(block).toContain(`script-src ${h}`);
    }
  });
  it("has no inline event handlers (blocked by the hash CSP)", () => {
    expect(tpl).not.toMatch(/\son[a-z]+\s*=/i);
  });
  it("keeps the data placeholder inside a non-executable JSON block", () => {
    expect(tpl).toContain(
      '<script id="ohda-data" type="application/json">/*__OHDA_DATA__*/</script>',
    );
  });
});

describe("family template decryptor", () => {
  it("is pinned: the exporter's expected hash equals the real script hash", async () => {
    expect(`'sha256-${FAMILY_TEMPLATE_SCRIPT_SHA256}'`).toBe(hash(scripts[0]![1]!));
    expect(await templateScriptMatches(tpl)).toBe(true);
    expect(await templateScriptMatches(tpl.replace("use strict", "use  strict"))).toBe(false);
    // the whole file is pinned, not only the script: a weakened meta CSP is refused too
    expect(await templateScriptMatches(tpl.replace("default-src 'none'", "default-src *"))).toBe(
      false,
    );
    expect(createHash("sha256").update(tpl, "utf8").digest("base64")).toBe(FAMILY_TEMPLATE_SHA256);
  });

  // load the template's own code parser (pure functions) and compare with the app's parser
  const src = scripts[0]![1]!;
  const pick = (name: string) =>
    new RegExp(`function ${name}\\([^)]*\\)\\{[^\\n]*\\}\\n`).exec(src)![0];
  const tplParse = new Function(
    "Uint8Array",
    `"use strict";var ALPH="0123456789ABCDEFGHJKMNPQRSTVWXYZ";` +
      ["norm", "b32", "sum", "enc32", "parse"].map(pick).join("") +
      "return parse;",
  )(Uint8Array) as (s: string) => Uint8Array;

  it("parses exactly like the app (random codes, frozen vectors, Arabic digits, look-alikes)", () => {
    for (let i = 0; i < 300; i++) {
      const c = formatCode(randomBytes(16));
      expect(toB64(tplParse(c))).toBe(toB64(parseCode(c)));
    }
    for (const c of vectors.codes) {
      const arabic = c.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
      expect(toB64(tplParse(arabic))).toBe(toB64(parseCode(c)));
      expect(toB64(tplParse(c.toLowerCase().replace(/-/g, " ")))).toBe(toB64(parseCode(c)));
    }
  });

  it("rejects non-canonical codes like the app does", () => {
    const c = formatCode(new Uint8Array(16)).replace(/-/g, "");
    const tweaked = c.slice(0, 25) + "1" + c.slice(26);
    expect(() => tplParse(tweaked)).toThrow();
    expect(() => parseCode(tweaked)).toThrow();
  });
});
