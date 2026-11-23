/**
 * Demo mode for UI/UX work: a build with VITE_DEMO_MODE=1 runs every screen without a backend.
 *
 * - Activation: sample codes are checked in the browser and a demo activation is kept under its
 *   own storage key. The real signed entitlement (`ohda-entitlement`) is never read or written.
 * - Admin: login and 2FA accept anything; codes and the audit log are in-memory sample data.
 *
 * The flag is a build-time constant (`__OHDA_DEMO__`, defined in vite.config.ts and
 * vitest.config.ts). Production builds do not set it, so DEMO is the literal `false` there and the
 * bundler drops every demo branch. Nothing here talks to a server.
 */
declare const __OHDA_DEMO__: boolean;
export const DEMO: boolean = __OHDA_DEMO__;

export type DemoPlan = "single" | "family";
export type DemoActivation = { plan: DemoPlan; at: string; ref: string };
export type DemoRedeem =
  { ok: true; activation: DemoActivation } | { ok: false; reason: "invalid" | "used" };

const DEMO_ACT_KEY = "ohda-demo-activation";

/** Sample codes shown on the activation page in demo mode. */
export const DEMO_CODES = {
  single: "OHDA-DEMO-0000-0001",
  family: "OHDA-DEMO-FAMILY-0001",
  used: "OHDA-DEMO-USED-0001",
} as const;

const norm = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Local stand-in for redeemActivation: any well-formed code works; "USED"/"FAMILY" pick cases. */
export function demoRedeem(code: string, now = new Date()): DemoRedeem {
  const n = norm(code);
  if (n.length < 16 || n.length > 40) return { ok: false, reason: "invalid" };
  if (n.includes("USED")) return { ok: false, reason: "used" };
  const plan: DemoPlan = n.includes("FAMILY") ? "family" : "single";
  return { ok: true, activation: { plan, at: now.toISOString(), ref: "demo" } };
}

export function readDemoActivation(): DemoActivation | null {
  try {
    const v = JSON.parse(localStorage.getItem(DEMO_ACT_KEY) ?? "null") as Partial<DemoActivation>;
    if (v && (v.plan === "single" || v.plan === "family") && typeof v.at === "string")
      return { plan: v.plan, at: v.at, ref: "demo" };
  } catch {
    /* blocked or corrupt storage: not activated */
  }
  return null;
}

export function writeDemoActivation(a: DemoActivation | null): void {
  try {
    if (a) localStorage.setItem(DEMO_ACT_KEY, JSON.stringify(a));
    else localStorage.removeItem(DEMO_ACT_KEY);
  } catch {
    /* ignore: the demo simply forgets on reload */
  }
}

// ---------- admin ----------
export type AdminCodeRow = {
  id: string;
  ref: string | null;
  plan: string;
  uses: number;
  max_uses: number;
  note: string | null;
  created_at: string | null;
};
export type AuditRow = { id: number; at: string; action: string; target: string | null };

/** What the admin screens need; the live version uses Supabase, the demo one sample data. */
export interface AdminApi {
  listCodes(): Promise<AdminCodeRow[]>;
  /** returns an error message, or null on success */
  createCode(hash: string, plan: DemoPlan, note: string): Promise<string | null>;
  revokeCode(ref: string): Promise<string | null>;
  listAudit(): Promise<AuditRow[]>;
}

const randRef = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");

/** In-memory admin data, seeded with a few sample rows. Resets on reload. */
export function createDemoAdminApi(now = () => new Date()): AdminApi {
  const day = (d: number) => new Date(now().getTime() - d * 86400000).toISOString();
  const codes: AdminCodeRow[] = [
    {
      id: "d1",
      ref: "a1b2c3d4e5f60718",
      plan: "family",
      uses: 1,
      max_uses: 2,
      note: "طلب 1042",
      created_at: day(1),
    },
    {
      id: "d2",
      ref: "9f8e7d6c5b4a3921",
      plan: "single",
      uses: 2,
      max_uses: 2,
      note: "طلب 1038",
      created_at: day(3),
    },
    {
      id: "d3",
      ref: "0a1b2c3d4e5f6a7b",
      plan: "single",
      uses: 0,
      max_uses: 2,
      note: null,
      created_at: day(6),
    },
  ];
  const audit: AuditRow[] = [
    { id: 3, at: day(1), action: "code.redeemed", target: "a1b2c3d4e5f60718" },
    { id: 2, at: day(1), action: "code.created", target: "a1b2c3d4e5f60718" },
    { id: 1, at: day(3), action: "code.redeemed", target: "9f8e7d6c5b4a3921" },
  ];
  const log = (action: string, target: string) =>
    audit.unshift({ id: (audit[0]?.id ?? 0) + 1, at: now().toISOString(), action, target });

  return {
    listCodes: async () => codes.map((c) => ({ ...c })),
    createCode: async (_hash, plan, note) => {
      const ref = randRef();
      codes.unshift({
        id: ref,
        ref,
        plan,
        uses: 0,
        max_uses: 2,
        note: note.trim().slice(0, 120) || null,
        created_at: now().toISOString(),
      });
      log("code.created", ref);
      return null;
    },
    revokeCode: async (ref) => {
      const c = codes.find((x) => x.ref === ref);
      if (!c) return "unknown ref";
      c.max_uses = c.uses;
      log("code.revoked", ref);
      return null;
    },
    listAudit: async () => audit.slice(0, 50).map((a) => ({ ...a })),
  };
}

/** Placeholder QR for the demo 2FA screen (data: URL, allowed by the page CSP). */
export const DEMO_QR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges">' +
      '<rect width="21" height="21" fill="#fff"/>' +
      '<path fill="#000" d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z"/>' +
      '<path fill="#fff" d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z"/>' +
      '<path fill="#000" d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2zM9 1h1v2H9zM8 4h3v1H8zM9 8h3v3H9zM14 9h2v1h-2zM12 13h3v2h-3zM16 14h3v1h-3zM9 15h2v4H9zM15 17h2v3h-2zM18 18h2v2h-2z"/>' +
      "</svg>",
  );
