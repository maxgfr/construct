// Serialize work that touches one run folder.
//
// The run folder is the durable artifact, and almost everything is
// read-merge-write over it: `research` folds new evidence into an id ledger
// that must keep [E#] ids stable, `render --merge` preserves the SRD prose you
// enriched, `review --apply` folds verdicts into the ledger. Two of those
// interleaved lose one side's work — and in the ledger's case worse than lose
// it, because two items can end up claiming the same id.
//
// The CLI never hit this because one process runs one command to completion.
// The MCP server can have several tool calls in flight at once.
//
// The fix is a promise chain per run folder — the smallest thing that is
// actually correct. Different runs stay fully parallel.
const chains = new Map<string, Promise<unknown>>();

export function withRunLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(dir) ?? Promise.resolve();
  // Chain off `prev` however it settled: a failed predecessor must not poison
  // every later call for the same repo.
  const next = prev.then(fn, fn);
  // The tail the NEXT caller waits on never rejects, so one thrown tool call
  // can't reject the whole queue behind it.
  const tail = next.then(noop, noop);
  chains.set(dir, tail);
  // Drop the entry once the tail is still us, so a long-lived server doesn't
  // accumulate a settled promise per repo it ever touched.
  tail.then(() => {
    if (chains.get(dir) === tail) chains.delete(dir);
  }, noop);
  return next;
}

function noop(): void {}

// Test seam: drop every pending chain. Never call this from product code — an
// in-flight lock holder would stop serializing against later arrivals.
export function resetRunLocks(): void {
  chains.clear();
}
