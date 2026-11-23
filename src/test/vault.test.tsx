/**
 * Vault session: serialised + revision-fenced saves, generations, key loans, lock semantics,
 * staged commits and cross-tab hand-over.
 */
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makePassWrap,
  newDataKey,
  unlockWithPassphrase,
  type OhdaEnvelope,
} from "@/lib/ohdaCrypto";
import { emptyPlan } from "@/lib/plan";

const PASS = "pass phrase for tests";
const disk: { env: OhdaEnvelope | null; rev: number; epoch: string; writes: OhdaEnvelope[] } = {
  env: null,
  rev: 0,
  epoch: "e1",
  writes: [],
};
let failNext = false;
const deleted = { count: 0 };
let gate: Promise<void> = Promise.resolve();

vi.mock("@/lib/plan", async (orig) => {
  const real = await orig<typeof import("@/lib/plan")>();
  return {
    ...real,
    saveVault: vi.fn(async (env: OhdaEnvelope, fence: { rev: number; epoch: string }) => {
      const expectedRev = fence.rev;
      if (fence.epoch !== disk.epoch) throw new real.StaleWriteError();
      await gate;
      if (failNext) {
        failNext = false;
        throw new Error("disk full");
      }
      if (expectedRev !== undefined && expectedRev !== disk.rev) throw new real.StaleWriteError();
      disk.env = env;
      disk.rev += 1;
      disk.writes.push(env);
      return disk.rev;
    }),
    deleteVault: vi.fn(async (fence: { rev: number; epoch: string }) => {
      if (fence.epoch !== disk.epoch || fence.rev !== disk.rev) throw new real.StaleWriteError();
      deleted.count++;
      disk.env = null;
      disk.rev += 1;
    }),
  };
});

const { VaultProvider, useVault, claimVault } = await import("@/lib/vault");
type V = ReturnType<typeof useVault>;

function fakeOwner() {
  let lose!: () => void;
  const lost = new Promise<void>((r) => (lose = r));
  const release = vi.fn();
  let held = true;
  void lost.then(() => (held = false));
  return {
    supported: true,
    lost,
    release,
    lose,
    held: () => held,
    fence: { rev: disk.rev, epoch: "e1" },
  };
}

async function setup() {
  const own = fakeOwner();
  let v!: V;
  function Grab() {
    v = useVault();
    return null;
  }
  render(
    <VaultProvider>
      <Grab />
    </VaultProvider>,
  );
  const dk = newDataKey();
  const wraps = [await makePassWrap(dk, PASS, 100_000)];
  act(() => v.open(dk, { wraps } as unknown as OhdaEnvelope, emptyPlan(), disk.rev, own));
  return { get: () => v, dk, wraps, own };
}
const wishesOf = async (env: OhdaEnvelope) =>
  ((await unlockWithPassphrase(env, PASS)).content as { wishes: string }).wishes;

beforeEach(() => {
  disk.env = null;
  disk.rev = 0;
  disk.writes.length = 0;
  disk.epoch = "e1";
  failNext = false;
  deleted.count = 0;
  gate = Promise.resolve();
});

describe("vault", () => {
  it("serialises saves and the last save carries the latest edit", async () => {
    const { get } = await setup();
    let release!: () => void;
    gate = new Promise((r) => (release = r));
    act(() => get().update((p) => ({ ...p, wishes: "one" })));
    await act(async () => {
      const p1 = get().saveNow();
      get().update((p) => ({ ...p, wishes: "two" }));
      const p2 = get().saveNow();
      release();
      await Promise.all([p1, p2]);
    });
    expect(disk.writes).toHaveLength(2);
    expect(await wishesOf(disk.env!)).toBe("two");
    expect(get().status).toBe("saved");
  });

  it("does not wipe the key while a save or a key loan is running", async () => {
    const { get, dk } = await setup();
    let release!: () => void;
    gate = new Promise((r) => (release = r));
    act(() => get().update((p) => ({ ...p, wishes: "x" })));
    let endLoan!: () => void;
    const loanDone = new Promise<void>((r) => (endLoan = r));
    let locked!: Promise<boolean>;
    await act(async () => {
      void get().saveNow();
      void get().withKey(async () => loanDone);
      locked = get().lock();
      await Promise.resolve();
      expect(dk.some((b) => b !== 0)).toBe(true);
      await expect(get().withKey(async () => 1)).rejects.toThrow(); // no new loans while locking
      endLoan();
      release();
      await locked;
    });
    expect(dk.every((b) => b === 0)).toBe(true);
    expect(get().session).toBeNull();
  });

  it("lock keeps the file open when the save fails, so edits are not lost", async () => {
    const { get, dk } = await setup();
    act(() => get().update((p) => ({ ...p, wishes: "important" })));
    failNext = true;
    let ok!: boolean;
    await act(async () => {
      ok = await get().lock();
    });
    expect(ok).toBe(false);
    expect(get().session?.plan.wishes).toBe("important");
    expect(dk.some((b) => b !== 0)).toBe(true);
    await act(async () => {
      ok = await get().lock();
    });
    expect(ok).toBe(true);
    expect(await wishesOf(disk.env!)).toBe("important");
  });

  it("lock({discard}) wipes without saving (used only for delete)", async () => {
    const { get } = await setup();
    act(() => get().update((p) => ({ ...p, wishes: "x" })));
    await act(async () => {
      await get().lock({ discard: true });
    });
    expect(disk.writes).toHaveLength(0);
    expect(get().session).toBeNull();
  });

  it("a writer whose revision is stale is refused (conflict), never overwriting newer data", async () => {
    const { get } = await setup();
    disk.rev = 7; // another tab saved meanwhile
    act(() => get().update((p) => ({ ...p, wishes: "late" })));
    await act(async () => {
      await get().saveNow();
    });
    expect(disk.writes).toHaveLength(0);
    expect(get().status).toBe("conflict");
  });

  it("open() refuses while another session is open (it must be locked first)", async () => {
    const { get, wraps } = await setup();
    expect(() =>
      get().open(newDataKey(), { wraps } as unknown as OhdaEnvelope, emptyPlan(), 0, fakeOwner()),
    ).toThrow();
  });

  it("destroy deletes while still owning, then wipes; exportSnapshot seals memory", async () => {
    const { get, own, dk } = await setup();
    act(() => get().update((p) => ({ ...p, wishes: "only in memory" })));
    failNext = true;
    let snap!: OhdaEnvelope | null;
    await act(async () => {
      await get().saveNow(); // fails
      snap = await get().exportSnapshot();
    });
    expect(await wishesOf(snap!)).toBe("only in memory");
    await act(async () => {
      await get().destroy();
    });
    expect(deleted.count).toBe(1);
    expect(get().session).toBeNull();
    expect(own.release).toHaveBeenCalled();
    expect(dk.every((b) => b === 0)).toBe(true);
  });

  it("commitNow saves immediately and rolls back in memory if the save fails", async () => {
    const { get } = await setup();
    failNext = true;
    await act(async () => {
      await expect(
        get().commitNow((s) => ({ ...s, plan: { ...s.plan, wishes: "new cards" } })),
      ).rejects.toThrow();
    });
    expect(get().session?.plan.wishes).toBe("");
    await act(async () => {
      await get().commitNow((s) => ({ ...s, plan: { ...s.plan, wishes: "new cards" } }));
    });
    expect(await wishesOf(disk.env!)).toBe("new cards");
  });

  it("never exposes the raw key through session state", async () => {
    const { get } = await setup();
    expect(Object.keys(get().session!)).toEqual(["wraps", "plan"]);
  });

  it("another tab claiming the file makes this tab save its edits and lock first", async () => {
    const { get } = await setup();
    act(() => get().update((p) => ({ ...p, wishes: "unsaved in tab A" })));
    let r!: string;
    await act(async () => {
      r = await claimVault(2000);
    });
    expect(r).toBe("released");
    expect(get().session).toBeNull();
    expect(get().lockedElsewhere).toBe(true);
    expect(await wishesOf(disk.env!)).toBe("unsaved in tab A");
  });

  it("claimVault reports none when no other tab has the file", async () => {
    expect(await claimVault(500)).toBe("none");
  });

  it("a tab that lost ownership becomes read-only at once: no edits, no writes", async () => {
    const { get, own } = await setup();
    act(() => get().update((p) => ({ ...p, wishes: "before" })));
    await act(async () => {
      own.lose();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(get().status).toBe("conflict");
    expect(get().lockedElsewhere).toBe(true);
    act(() => get().update((p) => ({ ...p, wishes: "after" })));
    expect(get().session?.plan.wishes).toBe("before"); // edit refused
    await act(async () => {
      expect(await get().saveNow()).toBeNull();
    });
    expect(disk.writes).toHaveLength(0);
    await expect(get().commitNow((x) => x)).rejects.toThrow();
  });

  it("lock releases ownership", async () => {
    const { get, own } = await setup();
    await act(async () => {
      await get().lock();
    });
    expect(own.release).toHaveBeenCalled();
  });

  it("commitNow refuses to run on top of edits it could not save", async () => {
    const { get } = await setup();
    act(() => get().update((p) => ({ ...p, wishes: "pending" })));
    failNext = true;
    await act(async () => {
      await expect(
        get().commitNow((x) => ({ ...x, plan: { ...x.plan, firstSteps: "cards" } })),
      ).rejects.toThrow();
    });
    expect(get().session?.plan.wishes).toBe("pending"); // the user's edit is kept
    expect(get().session?.plan.firstSteps).toBe("");
  });

  it("after losing ownership, lock() never drops unsaved edits silently", async () => {
    const { get, own } = await setup();
    act(() => get().update((p) => ({ ...p, wishes: "unsaved when stolen" })));
    await act(async () => {
      own.lose();
      await Promise.resolve();
      await Promise.resolve();
    });
    let ok!: boolean;
    await act(async () => {
      ok = await get().lock();
    });
    expect(ok).toBe(false);
    expect(get().session?.plan.wishes).toBe("unsaved when stolen");
    let snap!: OhdaEnvelope | null;
    await act(async () => {
      snap = await get().exportSnapshot();
    });
    expect(await wishesOf(snap!)).toBe("unsaved when stolen");
    expect(disk.writes).toHaveLength(0); // still never written by the read-only tab
  });

  it("a newer owner's epoch fences out every write and delete from the old session", async () => {
    const { get } = await setup();
    disk.epoch = "e2"; // another tab claimed ownership (even if this tab's lock was not stolen)
    act(() => get().update((p) => ({ ...p, wishes: "late" })));
    await act(async () => {
      await get().saveNow();
    });
    expect(disk.writes).toHaveLength(0);
    expect(get().status).toBe("conflict");
    await act(async () => {
      await expect(get().destroy()).rejects.toThrow();
    });
    expect(deleted.count).toBe(0);
    expect(get().session).not.toBeNull(); // nothing wiped on a failed delete
  });
});
