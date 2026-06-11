// Every timeout (and retry knob) the engine uses, in one place. These were
// scattered as literals across the network, shell, git, docker and verify
// layers; naming them here makes the tuning surface visible and greppable.
// Zero imports — safe to pull from anywhere without cycles.

// --- HTTP (research pipeline) -----------------------------------------------
export const HTTP_GET_TIMEOUT_MS = 20_000;
export const HTTP_JSON_TIMEOUT_MS = 30_000;
export const SEARXNG_TIMEOUT_MS = 8_000;
export const DDG_TIMEOUT_MS = 12_000;

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
