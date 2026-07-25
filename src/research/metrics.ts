// Retrieval instrumentation — how long each angle took and what it cost in
// network traffic. Without this, any perf work on the research pipeline is
// guesswork: the angles run concurrently (registry.ts), so a plain before/after
// snapshot cannot attribute a request to the angle that issued it.
//
// AsyncLocalStorage is what makes the attribution correct under concurrency:
// each angle runs inside its own counter store, and every request the angle
// issues — however deep the await chain — lands in that store. Requests made
// outside any angle (a drill, a direct httpGet) still count toward the totals.
//
// Zero dependencies: AsyncLocalStorage and performance.now() are Node core.
import { AsyncLocalStorage } from "node:async_hooks";
import type { AngleTiming } from "../types.js";

export type { AngleTiming };

export interface Counters {
  requests: number; // requests that actually hit the network
  cacheHits: number; // requests served from the on-disk cache
  bytes: number; // response bytes read
}

const store = new AsyncLocalStorage<Counters>();
let total: Counters = { requests: 0, cacheHits: 0, bytes: 0 };

function zero(): Counters {
  return { requests: 0, cacheHits: 0, bytes: 0 };
}

/** Reset the process-wide totals. Tests call this between cases. */
export function resetMetrics(): void {
  total = zero();
}

/** Process-wide totals since the last reset. */
export function totals(): Counters {
  return { ...total };
}

/**
 * Record one retrieval. Counts toward the enclosing angle (when there is one)
 * and always toward the process totals. A cache hit is counted separately so a
 * run can report how much of its work the cache absorbed.
 */
export function recordFetch(bytes: number, cacheHit = false): void {
  const local = store.getStore();
  if (cacheHit) {
    total.cacheHits++;
    if (local) local.cacheHits++;
  } else {
    total.requests++;
    if (local) local.requests++;
  }
  total.bytes += bytes;
  if (local) local.bytes += bytes;
}

/**
 * Run one angle inside its own counter store, appending its timing to `sink`.
 * The timing is recorded even when the angle throws — a failed angle that spent
 * 30 s is exactly the thing worth seeing.
 */
export async function timeAngle<T>(angle: string, sink: AngleTiming[], fn: () => Promise<T>): Promise<T> {
  const local = zero();
  const started = performance.now();
  try {
    return await store.run(local, fn);
  } finally {
    sink.push({ angle, ms: Math.round(performance.now() - started), ...local });
  }
}
