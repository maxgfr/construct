// Every timeout (and retry knob) the engine uses, in one place. These were
// scattered as literals across the network, shell, git, docker and verify
// layers; naming them here makes the tuning surface visible and greppable.
// Zero imports — safe to pull from anywhere without cycles.

// --- HTTP (research pipeline) -----------------------------------------------
export const HTTP_GET_TIMEOUT_MS = 20_000;
export const HTTP_JSON_TIMEOUT_MS = 30_000;
export const SEARXNG_TIMEOUT_MS = 8_000;
export const DDG_TIMEOUT_MS = 12_000;

// How many retrievals may be in flight at once inside a single angle. The
// angles already overlap each other; this is what stops each of them fetching
// its own pages one at a time. Kept modest on purpose — the point is to hide
// latency, not to hammer a host. Overridable with `--concurrency`.
export const FETCH_CONCURRENCY = 4;
// Cloning is heavy (disk + network); overlap a couple of seeds, not all of them.
export const SEED_CONCURRENCY = 2;
// StackOverflow's anonymous API is rate-limited to roughly one request a minute,
// so its queries stay serial regardless of --concurrency.
export const SO_CONCURRENCY = 1;

// How many candidate technologies the `tech` angle grounds. This used to be a
// bare `.slice(0, 3)` in the angle — a depth limit invisible from the skill.
// Overridable with --max-tech.
export const MAX_TECH = 3;

// Concurrent embedding calls to the LOCAL Ollama. Modest: it is a CPU model on
// the user's own machine, so oversubscribing it slows every request down.
export const EMBED_CONCURRENCY = 3;

// How long a cached page body is served without revalidating. A week matches
// how long a competitor page or a docs page stays materially the same, and it is
// what `ultradoc` settled on. Override with CONSTRUCT_CACHE_TTL_HOURS.
export const CACHE_TTL_HOURS = 168;

// Retry policy for httpGet (transient failures only: network error, 5xx, 429).
export const RETRY_BASE_DELAY_MS = 300; // backoff = base * 2^attempt + jitter
export const RETRY_JITTER_MS = 150;
export const RETRY_AFTER_CAP_MS = 10_000; // longest Retry-After we honour

// --- shell / git / verify ----------------------------------------------------
export const SH_DEFAULT_TIMEOUT_MS = 120_000;
export const GIT_CLONE_TIMEOUT_MS = 300_000;
export const GIT_FETCH_TIMEOUT_MS = 180_000;
export const GIT_RESET_TIMEOUT_MS = 60_000;
export const VERIFY_COMMAND_TIMEOUT_MS = 600_000; // user test suites can be slow

// --- optional local semantic stack (Docker: Qdrant + Ollama + SearXNG) -------
export const REACHABLE_TIMEOUT_MS = 2_500;
export const EMBED_TIMEOUT_MS = 60_000;
export const COMPOSE_DOWN_TIMEOUT_MS = 120_000;
export const COMPOSE_PS_TIMEOUT_MS = 30_000;
export const COMPOSE_UP_TIMEOUT_MS = 300_000;
export const OLLAMA_PULL_TIMEOUT_MS = 600_000; // first model pull downloads ~hundreds of MB
