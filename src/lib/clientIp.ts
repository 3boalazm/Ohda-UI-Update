/**
 * The caller's IP for rate limiting, read only from a header the hosting edge sets itself.
 *
 * - Vercel (VERCEL=1): `x-real-ip` is written by Vercel's edge and overwrites any client value.
 *   `cf-connecting-ip` is NOT trusted there: a client could send it to rotate rate-limit buckets.
 * - Cloudflare (default, incl. Lovable): `cf-connecting-ip` is set by Cloudflare and cannot be
 *   spoofed by the client there; `x-real-ip` is not trusted.
 *
 * Returns "no-ip" when the trusted header is missing (all such callers share one bucket).
 */
export function clientIp(
  getHeader: (name: string) => string | undefined,
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): string {
  const header = env["VERCEL"] === "1" ? "x-real-ip" : "cf-connecting-ip";
  return getHeader(header)?.trim() || "no-ip";
}
