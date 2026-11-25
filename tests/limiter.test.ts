import { describe, expect, it } from "vitest";
import { createLimiter } from "@/lib/plan/limiter";

describe("plan concurrency limiter", () => {
  it("turns callers away once full, without queueing", () => {
    const l = createLimiter(2);
    const a = l.tryAcquire();
    const b = l.tryAcquire();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(l.tryAcquire()).toBeNull();
    expect(l.active).toBe(2);
  });

  it("frees a slot on release, and a double release can't free two", () => {
    const l = createLimiter(1);
    const release = l.tryAcquire()!;
    release();
    release();
    expect(l.active).toBe(0);
    expect(l.tryAcquire()).not.toBeNull();
    expect(l.tryAcquire()).toBeNull();
  });
});
