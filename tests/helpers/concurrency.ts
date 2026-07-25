// Test helpers for measuring whether work actually overlaps.
//
// Concurrency is the one property that cannot be asserted by inspecting a
// result: a serial loop and a bounded pool return the same array. These helpers
// record when each unit of work ran, so a test can assert the SHAPE of the
// execution rather than trusting the code's intent.
//
// Not a *.test.ts file on purpose — vitest only collects `*.test.ts`, and biome
// forbids exports from test files.

export interface Span {
  label: string;
  start: number;
  end: number;
}

/**
 * A fake unit of work that records its own wall-clock span. Each call takes
 * `delayMs`, so two calls that overlap in real time produce overlapping spans.
 */
export function makeProbe(delayMs = 20): { spans: Span[]; fn: (label: string) => Promise<string> } {
  const spans: Span[] = [];
  const fn = async (label: string): Promise<string> => {
    const start = performance.now();
    await new Promise((r) => setTimeout(r, delayMs));
    spans.push({ label, start, end: performance.now() });
    return `body of ${label}`;
  };
  return { spans, fn };
}

/**
 * The largest number of spans in flight at the same instant.
 * 1 means fully serial; N means N-way concurrency.
 */
export function maxOverlap(spans: Span[]): number {
  const edges = spans.flatMap((s) => [
    { t: s.start, d: 1 },
    { t: s.end, d: -1 },
  ]);
  // Process an end before a start at an identical timestamp, so spans that
  // merely touch don't read as concurrent.
  edges.sort((a, b) => a.t - b.t || a.d - b.d);
  let cur = 0;
  let max = 0;
  for (const e of edges) {
    cur += e.d;
    if (cur > max) max = cur;
  }
  return max;
}
