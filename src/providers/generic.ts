import type { Provider } from "./registry.js";

// Fallback for hosts with no known public issue/PR API (self-hosted git,
// Bitbucket, Gitea, a bare URL, …). Cloning the code still works; this is just
// honest that issues/PRs can't be retrieved here, so the dossier never implies
// a search happened when it didn't.
export const generic: Provider = {
  name: "generic",
  matches: () => true,
  async search(ref, _question, kind) {
    return {
      items: [],
      notes: [`No public ${kind} API for host "${ref.host}". The code was cloned and indexed; ` + `issues/PRs are not retrievable for this host.`],
    };
  },
};
