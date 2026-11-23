import { describe, it, expect } from "vitest";
import {
  NONCE_HEADER,
  backendOrigin,
  buildCsp,
  scriptsWithoutNonce,
  secureResponse,
} from "@/lib/securityHeaders";

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { "content-type": "text/html; charset=utf-8" } });

describe("security headers", () => {
  it("never touches HTML: injected scripts stay unnonced and are blocked by CSP", async () => {
    const src = `<script nonce="N">ok</script><p>x</p><script>injected()</script>`;
    const r = await secureResponse(html(src), { nonce: "N" });
    const body = await r.text();
    expect(body).toBe(src);
    expect(scriptsWithoutNonce(body, "N")).toBe(1);
    expect(r.headers.get("content-security-policy")).toContain("'nonce-N'");
  });
  it("streams HTML bodies through without buffering", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("<p>a</p>"));
        c.close();
      },
    });
    const original = new Response(stream, { headers: { "content-type": "text/html" } });
    const r = await secureResponse(original, { nonce: "N" });
    expect(r.body).toBe(original.body);
  });
  it("keeps bodyless responses valid (204, 304, HEAD-like) and upgrades untouched", async () => {
    for (const status of [204, 304]) {
      const r = await secureResponse(new Response(null, { status }));
      expect(r.status).toBe(status);
      expect(r.headers.get("x-frame-options")).toBe("DENY");
    }
    const r = await secureResponse(
      new Response(null, { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(r.body).toBeNull();
  });
  it("connect-src uses the exact backend origin, never a wildcard", () => {
    expect(backendOrigin("https://abc.supabase.co/")).toBe("https://abc.supabase.co");
    expect(backendOrigin("http://abc.supabase.co")).toBeNull();
    expect(backendOrigin("https://evil.com")).toBeNull();
    expect(backendOrigin(undefined)).toBeNull();
    const c = buildCsp("n", ["https://abc.supabase.co"]);
    expect(c).toContain("connect-src 'self' https://abc.supabase.co;");
    expect(c).not.toContain("*");
  });
  it("strips the internal nonce header from responses", async () => {
    const r = await secureResponse(
      new Response("{}", { headers: { "content-type": "application/json", [NONCE_HEADER]: "x" } }),
    );
    expect(r.headers.get(NONCE_HEADER)).toBeNull();
  });
  it("CSP has no unsafe-inline scripts and forbids framing", () => {
    const c = buildCsp("abc");
    expect(c).toMatch(/script-src 'self' 'nonce-abc' 'strict-dynamic'/);
    expect(c).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(c).toContain("frame-ancestors 'none'");
    expect(c).toContain("object-src 'none'");
    expect(c).toContain("base-uri 'none'");
  });
  it("HTML gets nonce CSP, no-store and the static headers", async () => {
    const r = await secureResponse(
      new Response("<p>x</p>", {
        headers: { "content-type": "text/html; charset=utf-8", "x-powered-by": "x" },
      }),
      { nonce: "Q" },
    );
    expect(r.headers.get("content-security-policy")).toContain("'nonce-Q'");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });
  it("generated nonces differ per response when none is supplied", async () => {
    const a = (await secureResponse(html("<p/>"))).headers.get("content-security-policy");
    const b = (await secureResponse(html("<p/>"))).headers.get("content-security-policy");
    expect(a).not.toBe(b);
  });
  it("non-HTML gets a restrictive CSP and keeps the body", async () => {
    const r = await secureResponse(
      new Response('{"a":1}', { headers: { "content-type": "application/json" } }),
    );
    expect(r.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(await r.text()).toBe('{"a":1}');
  });
});
