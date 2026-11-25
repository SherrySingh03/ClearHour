/**
 * Caps how many plan generations run at once in this server instance.
 * Non-blocking: when full, callers are turned away immediately (the route
 * answers with its generic 502) instead of queueing work. Per-visitor rate
 * limiting across instances belongs in the Vercel Firewall.
 */
export function createLimiter(max: number) {
  let active = 0;
  return {
    /** A release function if a slot was free, otherwise null. Release is idempotent. */
    tryAcquire(): (() => void) | null {
      if (active >= max) return null;
      active++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active--;
      };
    },
    get active() {
      return active;
    },
  };
}

/** JUDGMENT CALL: assumptions.ts#plan-concurrency */
export const MAX_CONCURRENT_PLANS = 4;
export const planLimiter = createLimiter(MAX_CONCURRENT_PLANS);
