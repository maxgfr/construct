// Bounded-concurrency map — zero dependencies.
//
// The research angles overlap each other, but inside an angle every page was
// fetched one at a time: `for (const url of urls) await fetchAndExtract(url)`.
// A baseline run spent 17 s in the market angle to retrieve four pages. Latency,
// not bandwidth, was the whole cost.
//
// `pool` runs up to `limit` items at once while preserving INPUT ORDER in the
// result — order matters here because evidence ranking and the id ledger both
// depend on a deterministic sequence, and a race-ordered dossier would make runs
// non-reproducible.

/**
 * Map `items` through `fn` with at most `limit` in flight, preserving order.
 *
 * A rejecting `fn` rejects the whole call (same contract as `Promise.all`);
 * callers that must degrade per item catch inside `fn` — which is what the
 * research angles do, since one unreachable page must never abort an angle.
 */
export async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const width = Math.max(1, Math.floor(limit));
  if (items.length <= 1 || width === 1) {
    const out: R[] = [];
    for (let i = 0; i < items.length; i++) out.push(await fn(items[i]!, i));
    return out;
  }

  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    // Each worker claims the next index atomically — JS is single-threaded
    // between awaits, so the increment cannot interleave.
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
