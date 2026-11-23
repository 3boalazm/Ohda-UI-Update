/**
 * In-memory session for an unlocked file.
 *
 * Integrity and key-lifetime rules (reviews 2026-10):
 * - The raw data key never enters React state. It lives only in a ref and is lent out through
 *   `withKey`; lock waits for every outstanding loan and refuses new ones while locking.
 * - The session lives in a ref updated synchronously on every change, so a save never seals a
 *   stale plan. Saves are serialised; "dirty" is cleared only for the revision actually written.
 * - Each open/lock starts a new generation; queued saves from an older generation never write.
 * - Every write is fenced by the stored revision (saveVault(env, expectedRev)): a tab that lost
 *   ownership gets StaleWriteError instead of overwriting newer data.
 * - Exclusive ownership across tabs uses the Web Locks API, held for the whole unlocked session.
 *   A tab that wants the file first asks the owner (BroadcastChannel) to save and lock; if the
 *   owner does not answer in time the lock is stolen, and the old owner's writes are then fenced.
 * - lock() saves first and stays open (returns false) if the save fails; edits are never
 *   silently discarded. `discard` is explicit and used only for delete.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sealContent, type Bytes, type OhdaEnvelope, type Wrap } from "@/lib/ohdaCrypto";
import { StaleWriteError, deleteVault, saveVault, type Plan } from "./plan";
import type { OwnerMsg, Ownership } from "./ownership";

type Inner = { dk: Bytes; wraps: Wrap[]; plan: Plan };
export type Session = { wraps: Wrap[]; plan: Plan };
type Status = "idle" | "saving" | "saved" | "error" | "conflict";
type Ctx = {
  session: Session | null;
  status: Status;
  /** set when this tab was locked because the file was opened in another tab */
  lockedElsewhere: boolean;
  /** Requires ownership acquired beforehand (acquireOwnership), so no write can precede it. */
  open: (dk: Bytes, env: OhdaEnvelope, plan: Plan, rev: number, owner: Ownership) => void;
  update: (fn: (p: Plan) => Plan) => void;
  /** Apply a change and save it now; if the save fails the change is rolled back and it throws. */
  commitNow: (fn: (s: Session) => Session) => Promise<void>;
  withKey: <T>(fn: (dk: Bytes) => Promise<T>) => Promise<T>;
  saveNow: () => Promise<OhdaEnvelope | null>;
  exportSnapshot: () => Promise<OhdaEnvelope | null>;
  destroy: () => Promise<void>;
  lock: (opts?: { discard?: boolean }) => Promise<boolean>;
};
const VaultCtx = createContext<Ctx | null>(null);
const IDLE_MS = 5 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 1500;
const CHANNEL = "ohda-vault";

export { askOwnerToRelease as claimVault } from "./ownership";

const view = (s: Inner | null): Session | null => (s ? { wraps: s.wraps, plan: s.plan } : null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [lockedElsewhere, setLockedElsewhere] = useState(false);
  const inner = useRef<Inner | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  const rev = useRef(0);
  const gen = useRef(0);
  const locking = useRef(false);
  const loans = useRef(new Set<Promise<unknown>>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const tabId = useRef(Math.random().toString(36).slice(2));
  const channel = useRef<BroadcastChannel | null>(null);
  const owner = useRef<Ownership | null>(null);
  /** write authority: true only while this tab holds ownership of the open session */
  const writable = useRef(false);
  const committing = useRef(false);

  const commit = (next: Inner | null) => {
    inner.current = next;
    setSession(view(next));
  };
  const isDirty = () => editSeq.current !== savedSeq.current;

  /** Serialised, generation-checked, revision-fenced save of the latest state. */
  const persist = useCallback((): Promise<OhdaEnvelope | null> => {
    const myGen = gen.current;
    const run = async (): Promise<OhdaEnvelope | null> => {
      const s = inner.current;
      if (!s || gen.current !== myGen || !writable.current) return null; // never write without authority
      const seqAtStart = editSeq.current;
      setStatus("saving");
      try {
        const env = await sealContent(s.dk, s.plan, "owner", s.wraps);
        const own = owner.current;
        if (gen.current !== myGen || !writable.current || !own?.held()) return null;
        rev.current = await saveVault(env, { rev: rev.current, epoch: own.fence.epoch });
        savedSeq.current = Math.max(savedSeq.current, seqAtStart);
        setStatus(isDirty() ? "saving" : "saved");
        return env;
      } catch (e) {
        setStatus(e instanceof StaleWriteError ? "conflict" : "error");
        return null;
      }
    };
    const p = chain.current.then(run, run);
    chain.current = p.catch(() => undefined);
    return p;
  }, []);

  const wipe = useCallback(() => {
    gen.current++;
    writable.current = false;
    inner.current?.dk.fill(0);
    commit(null);
    owner.current?.release();
    owner.current = null;
  }, []);

  const lock = useCallback(
    async (opts: { discard?: boolean } = {}): Promise<boolean> => {
      if (!inner.current) return true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      locking.current = true;
      try {
        await Promise.allSettled([...loans.current]); // never wipe a key that is on loan
        await chain.current; // nor one a running save is using
        if (!opts.discard && writable.current && isDirty()) await persist();
        await chain.current;
        // unsaved edits (save failed, or this tab lost ownership): never drop them silently;
        // the caller offers an encrypted export or an explicit discard
        if (!opts.discard && isDirty()) return false;
        wipe();
        setStatus("idle");
        return true;
      } finally {
        locking.current = false;
      }
    },
    [persist, wipe],
  );

  // one owner at a time: answer pings, hand the file over on request
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<OwnerMsg>) => {
      const m = e.data;
      if (!m || m.from === tabId.current) return;
      const reply = (type: OwnerMsg["type"]) =>
        ch.postMessage({ type, from: tabId.current, to: m.from } satisfies OwnerMsg);
      if (m.type === "ping" && inner.current && writable.current) reply("here");
      if (m.type === "takeover" && inner.current && writable.current) {
        void lock().then((locked) => {
          if (!locked) return; // save failed: keep the edits; the other tab will see it busy
          setLockedElsewhere(true);
          reply("released");
        });
      }
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [lock]);

  // save before the page goes away
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && inner.current && isDirty()) void persist();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [persist]);

  const open: Ctx["open"] = (dk, env, plan, storedRev, own) => {
    // one session at a time: the previous one must be locked first (its saves and key loans
    // have then settled), so nothing from it can run after this point
    if (inner.current || loans.current.size > 0) throw new Error("another session is open");
    if (!own.held()) throw new Error("ownership lost");
    owner.current = own;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    gen.current++;
    editSeq.current = 0;
    savedSeq.current = 0;
    rev.current = storedRev;
    commit({ dk, wraps: env.wraps, plan });
    setStatus("saved");
    setLockedElsewhere(false);
    writable.current = true;
    const myGen = gen.current;
    void own.lost.then(() => {
      // another tab took the file over: this session becomes read-only immediately
      if (gen.current !== myGen) return;
      writable.current = false;
      gen.current++;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setLockedElsewhere(true);
      setStatus("conflict");
    });
  };

  const update: Ctx["update"] = (fn) => {
    const s = inner.current;
    if (!s || locking.current || committing.current || !writable.current) return;
    commit({ ...s, plan: { ...fn(s.plan), updated: new Date().toISOString() } });
    editSeq.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), SAVE_DEBOUNCE_MS);
  };

  const commitNow: Ctx["commitNow"] = async (fn) => {
    if (!inner.current || locking.current || committing.current || !writable.current)
      throw new Error("locked");
    committing.current = true; // no other edit can interleave, so a rollback never clobbers one
    try {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      await chain.current;
      if (isDirty()) await persist(); // land pending edits first, separately
      if (isDirty()) throw new Error("save failed"); // could not save them: change nothing
      const base = inner.current;
      if (!base || !writable.current) throw new Error("locked");
      const next = fn(view(base)!);
      commit({ ...base, wraps: next.wraps, plan: next.plan });
      editSeq.current++;
      const env = await persist();
      if (!env) {
        if (inner.current) commit({ ...inner.current, wraps: base.wraps, plan: base.plan });
        savedSeq.current = editSeq.current; // memory equals the last committed revision again
        throw new Error("save failed");
      }
    } finally {
      committing.current = false;
    }
  };

  const withKey: Ctx["withKey"] = async (fn) => {
    const s = inner.current;
    if (!s || locking.current) throw new Error("locked");
    const loan = fn(s.dk);
    loans.current.add(loan);
    try {
      return await loan;
    } finally {
      loans.current.delete(loan);
    }
  };

  /** Encrypted copy of exactly what is in memory now, even if saving to the browser fails. */
  const exportSnapshot: Ctx["exportSnapshot"] = async () => {
    const s = inner.current;
    if (!s) return null;
    return withKey((dk) => sealContent(dk, s.plan, "owner", s.wraps));
  };

  /** Deletes the file while still holding ownership, then wipes the session. */
  const destroy: Ctx["destroy"] = async () => {
    if (!inner.current || !writable.current) throw new Error("locked");
    locking.current = true;
    try {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      await Promise.allSettled([...loans.current]);
      await chain.current;
      // re-check ownership right before the delete; the delete itself is also fenced by
      // revision + epoch, so a tab that lost ownership meanwhile can never delete
      const own = owner.current;
      if (!writable.current || !own?.held()) throw new Error("locked");
      await deleteVault({ rev: rev.current, epoch: own.fence.epoch });
      wipe(); // only after the delete succeeded
      setStatus("idle");
    } finally {
      locking.current = false;
    }
  };

  const saveNow = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return persist();
  };

  // auto-lock after inactivity (stays open, with an error status, if the save fails)
  useEffect(() => {
    if (!session) return;
    let t = setTimeout(() => void lock(), IDLE_MS);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => void lock(), IDLE_MS);
    };
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [!!session, lock]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <VaultCtx.Provider
      value={{
        session,
        status,
        lockedElsewhere,
        open,
        update,
        commitNow,
        withKey,
        saveNow,
        exportSnapshot,
        destroy,
        lock,
      }}
    >
      {children}
    </VaultCtx.Provider>
  );
}

export function useVault() {
  const c = useContext(VaultCtx);
  if (!c) throw new Error("VaultProvider missing");
  return c;
}
