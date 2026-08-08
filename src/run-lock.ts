// Serialize work that touches one run folder.
//
// The run folder is the durable artifact, and almost everything is
// read-merge-write over it: `research` folds new evidence into an id ledger that
// must keep [E#] ids stable, `render --merge` preserves the SRD prose you
// enriched, `review --apply` folds verdicts into the ledger. Two of those
// interleaved lose one side's work — and in the ledger's case worse than lose
// it, because two items can end up claiming the same id.
//
// The CLI never hit this because one process runs one command to completion.
// The MCP server can have several tool calls in flight at once.
//
// The mechanism — a promise chain per key — is the engine's, and identical to
// what stood here; only the parameter's name differs. This stays as the import
// path the repo already uses.
export { withRunLock, resetRunLocks } from "./engine.js";
