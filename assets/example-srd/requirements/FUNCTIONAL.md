# Functional requirements

## FR-001 — Save an article from a URL or browser extension _(must)_ [E4][E1]

A signed-in user saves a web article by pasting its URL into the Web App or clicking the browser extension. Readpile fetches the page, extracts the readable body, and stores it locally so the saved copy survives the original going offline.

**Acceptance criteria:**
- **Given** a signed-in user with a reachable article URL **When** they submit it via the Web App or the browser extension **Then** the readable body (title, author, text, inline images) is extracted and stored locally, and the article appears at the top of their list within 2 seconds [E4]
- **Given** the article URL returns HTTP 404, or does not respond within 10 seconds **When** the user submits it **Then** the save is rejected with the HTTP status in the message, nothing partial is written to the library, and the URL stays in the input so the user can retry without re-typing it
- **Given** a URL the user has already saved **When** they submit it again **Then** no duplicate is created; the existing article is re-fetched, its body replaced, and its original saved-at timestamp preserved

_Traceability — NFRs: NFR-001, NFR-002, NFR-003 · entities: Article · interfaces: Web App, Browser Extension_

## FR-002 — Full-text search across all saved articles _(must)_ [E3]

A user finds any saved article by searching its full text. Search covers title, author and body, tolerates one typo per word, and returns results fast enough to feel instant while typing.

**Acceptance criteria:**
- **Given** a library of 5,000 saved articles **When** the user types a two-word query containing one typo **Then** matching articles are returned in under 300 ms at p95, ranked by relevance, with the typo tolerated and the matched terms highlighted in the excerpt [E3]
- **Given** the search backend is unreachable **When** the user submits a query **Then** the Web App falls back to a substring match over titles held locally, labels the results as degraded, and does not report zero results as an empty library
- **Given** a query matching no article **When** the user submits it **Then** an empty state names the query and offers to clear the active tag filter, rather than rendering a blank list

_Traceability — NFRs: NFR-001, NFR-002, NFR-003 · entities: Article · interfaces: Web App_

## FR-003 — Tag and organize saved articles _(should)_ [E1]

A user organises the library with free-form tags. Tags are created inline while tagging, can be applied in bulk from the list view, and filter the library additively.

**Acceptance criteria:**
- **Given** an article open in the reader **When** the user types a tag name that does not exist yet and confirms **Then** the tag is created, applied to that article, and offered as a suggestion the next time any article is tagged
- **Given** a tag applied to 40 articles **When** the user deletes the tag **Then** the tag is removed from all 40 articles in one operation, the articles themselves are untouched, and the action is reported with the count
- **Given** two tags selected as filters **When** the user views the library **Then** only articles carrying BOTH tags are listed, and the active filters are shown with a one-click way to clear each

_Traceability — NFRs: NFR-001, NFR-002, NFR-003 · entities: Article, Tag · interfaces: Web App_

## FR-004 — Import an existing Pocket or Instapaper export _(should)_ [E5][E2]

A user migrates off a hosted service by importing a Pocket or Instapaper export file. The import is incremental and resumable: a single unreadable entry never aborts the run.

**Acceptance criteria:**
- **Given** a Pocket export containing up to 10,000 articles **When** the user uploads it **Then** entries are imported in batches of 100 with a visible progress count, and the import survives a browser refresh by resuming from the last committed batch [E5]
- **Given** an export in which 12 entries have an unreachable URL **When** the import runs **Then** the other entries import successfully, the 12 failures are listed with their URL and reason in a downloadable report, and the import completes rather than aborting wholesale [E5]
- **Given** a file that is not a recognised Pocket or Instapaper export **When** the user uploads it **Then** the upload is rejected before any write, naming which formats are accepted; the library is unchanged

_Traceability — NFRs: NFR-001, NFR-002, NFR-003 · entities: Article, Tag, ImportJob · interfaces: Web App_

## FR-005 — Read articles offline on mobile _(could)_ [E2]

A user reads previously synced articles on a phone with no connectivity. Article bodies and images are cached on the device; reading position syncs back when connectivity returns.

**Acceptance criteria:**
- **Given** a device that has synced 200 articles and is now in airplane mode **When** the user opens any of those 200 articles **Then** the full text and inline images render from the local cache within 1 second, and no network error is shown
- **Given** an article that was never synced to the device **When** the user opens it while offline **Then** the reader shows the stored title and excerpt with an explicit 'not downloaded' state and a retry action, instead of a blank page or a generic error
- **Given** reading position advanced on 3 articles while offline **When** connectivity returns **Then** the positions sync to the server within 30 seconds; if the server holds a newer position for an article, the most recently updated one wins and the other is discarded silently

_Traceability — NFRs: NFR-001, NFR-002, NFR-003 · entities: Article · interfaces: Web App_
