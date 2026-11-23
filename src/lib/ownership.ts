/**
 * Exclusive write ownership of the local file across tabs (review C3-01/C3-02).
 *
 * - Ownership is acquired BEFORE a tab reads the file to unlock it, and is awaited: no tab can
 *   edit or save until it holds the Web Lock.
 * - Normal acquisition never steals. The current owner is first asked (BroadcastChannel) to
 *   save and release. Stealing is a separate, explicit user decision ("open here anyway").
 * - Losing ownership (stolen) is reported through `onLost`; the vault then becomes read-only.
 * - Browsers without the Web Locks API fall back to revision fencing only (`supported: false`).
 */
import { claimEpoch, type Fence } from "./plan";

export const OWNER_LOCK = "ohda-vault-owner";
const CHANNEL = "ohda-vault";

export interface Ownership {
  supported: boolean;
  /** storage fence for this owner session (revision at claim time + this session's epoch) */
  fence: Fence;
  /** synchronous check: still the owner (lock not stolen, not released) */
  held: () => boolean;
  /** resolves when ownership is lost (stolen); never resolves for a normal release */
  lost: Promise<void>;
  release: () => void;
}

export type OwnerMsg = {
  type: "ping" | "here" | "takeover" | "released";
  from: string;
  /** claim id the answer belongs to (answers are correlated, never matched by type alone) */
  to?: string;
};

/** Asks another tab that holds the file to save and lock. Resolves when it answered or timed out. */
export async function askOwnerToRelease(
  timeoutMs = 4000,
): Promise<"none" | "released" | "timeout"> {
  if (typeof BroadcastChannel === "undefined") return "none";
  const me = "claim-" + Math.random().toString(36).slice(2);
  const ch = new BroadcastChannel(CHANNEL);
  try {
    const wait = (type: OwnerMsg["type"], ms: number) =>
      new Promise<boolean>((res) => {
        const t = setTimeout(() => res(false), ms);
        ch.onmessage = (e: MessageEvent<OwnerMsg>) => {
          if (e.data?.type === type && e.data.to === me) {
            clearTimeout(t);
            res(true);
          }
        };
      });
    const here = wait("here", 300);
    ch.postMessage({ type: "ping", from: me });
    if (!(await here)) return "none";
    const released = wait("released", timeoutMs);
    ch.postMessage({ type: "takeover", from: me });
    return (await released) ? "released" : "timeout";
  } finally {
    ch.close();
  }
}

export class OwnershipBusyError extends Error {
  constructor() {
    super("الملف مفتوح في شاشة أو تاب تاني ومش راضي يتقفل.");
    this.name = "OwnershipBusyError";
  }
}

/**
 * Acquire exclusive ownership. Without `steal`, waits up to `waitMs` for the lock and throws
 * OwnershipBusyError if another tab still holds it. With `steal`, takes it immediately (the old
 * owner is told through its own `lost` promise and becomes read-only; its writes are also fenced).
 */
export async function acquireOwnership(
  opts: { steal?: boolean; waitMs?: number } = {},
): Promise<Ownership> {
  const api = typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : null;
  if (!api) {
    // no Web Locks: the epoch alone fences writes (last claimer wins, older tabs fail to write)
    const fence = await claimEpoch();
    return {
      supported: false,
      fence,
      held: () => true,
      lost: new Promise(() => {}),
      release: () => {},
    };
  }

  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let markLost!: () => void;
  const lost = new Promise<void>((r) => (markLost = r));

  let wasGranted = false;
  const granted = new Promise<void>((resolve, reject) => {
    const ctrl = opts.steal ? null : new AbortController();
    const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.waitMs ?? 5000) : null;
    api
      .request(
        OWNER_LOCK,
        opts.steal ? { steal: true } : { mode: "exclusive", signal: ctrl!.signal },
        () => {
          if (timer) clearTimeout(timer);
          wasGranted = true;
          resolve();
          return held;
        },
      )
      .catch((e: unknown) => {
        if (timer) clearTimeout(timer);
        if (wasGranted)
          markLost(); // stolen after it was granted
        else
          reject(
            e instanceof DOMException && e.name === "AbortError" ? new OwnershipBusyError() : e,
          );
      });
  });
  await granted;
  let isHeld = true;
  void lost.then(() => (isHeld = false));
  let fence: Fence;
  try {
    fence = await claimEpoch();
  } catch (e) {
    release();
    throw e;
  }
  return {
    supported: true,
    fence,
    held: () => isHeld,
    lost,
    release: () => {
      isHeld = false;
      release();
    },
  };
}
