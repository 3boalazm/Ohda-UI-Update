import { beforeEach, describe, expect, it } from "vitest";

import {
  DEMO,
  DEMO_CODES,
  createDemoAdminApi,
  demoRedeem,
  readDemoActivation,
  writeDemoActivation,
} from "@/lib/demo";

describe("demo mode is off unless the build sets VITE_DEMO_MODE=1", () => {
  it("is off in tests and normal builds", () => {
    expect(DEMO).toBe(false);
  });
});

describe("demoRedeem", () => {
  const now = new Date("2026-11-24T10:00:00Z");

  it("accepts the sample codes with the right plan", () => {
    expect(demoRedeem(DEMO_CODES.single, now)).toEqual({
      ok: true,
      activation: { plan: "single", at: now.toISOString(), ref: "demo" },
    });
    const fam = demoRedeem(DEMO_CODES.family, now);
    expect(fam.ok && fam.activation.plan).toBe("family");
  });

  it("shows the used and invalid error paths", () => {
    expect(demoRedeem(DEMO_CODES.used)).toEqual({ ok: false, reason: "used" });
    expect(demoRedeem("OHDA-123")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("demo activation storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips and never touches the real signed entitlement", () => {
    writeDemoActivation({ plan: "family", at: "2026-11-24T10:00:00.000Z", ref: "x" });
    expect(readDemoActivation()).toEqual({
      plan: "family",
      at: "2026-11-24T10:00:00.000Z",
      ref: "demo",
    });
    expect(localStorage.getItem("ohda-entitlement")).toBeNull();
    writeDemoActivation(null);
    expect(readDemoActivation()).toBeNull();
  });

  it("ignores malformed stored values", () => {
    localStorage.setItem("ohda-demo-activation", '{"plan":"lifetime","at":"x"}');
    expect(readDemoActivation()).toBeNull();
    localStorage.setItem("ohda-demo-activation", "not json");
    expect(readDemoActivation()).toBeNull();
  });
});

describe("demo admin api", () => {
  it("creates and revokes codes and logs both", async () => {
    const api = createDemoAdminApi();
    const before = (await api.listCodes()).length;
    expect(await api.createCode("ab".repeat(32), "family", "طلب 1")).toBeNull();
    const rows = await api.listCodes();
    expect(rows).toHaveLength(before + 1);
    const fresh = rows[0]!;
    expect(fresh).toMatchObject({ plan: "family", uses: 0, max_uses: 2, note: "طلب 1" });

    expect(await api.revokeCode(fresh.ref!)).toBeNull();
    expect((await api.listCodes())[0]!.max_uses).toBe(0);
    expect(await api.revokeCode("missing")).toBe("unknown ref");

    const actions = (await api.listAudit()).slice(0, 2).map((a) => a.action);
    expect(actions).toEqual(["code.revoked", "code.created"]);
  });

  it("keeps each instance separate", async () => {
    const a = createDemoAdminApi();
    const b = createDemoAdminApi();
    await a.createCode("cd".repeat(32), "single", "");
    expect((await a.listCodes()).length).toBe((await b.listCodes()).length + 1);
  });
});
