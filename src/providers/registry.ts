import type { RepoRef, EvidenceItem } from "../types.js";
import { github } from "./github.js";
import { gitlab } from "./gitlab.js";
import { generic } from "./generic.js";

export type RawItem = Omit<EvidenceItem, "id">;
export type IssueKind = "issue" | "pr";

// A code host that can answer issue/PR queries. Cloning is provider-agnostic
// (plain git); only issues/PRs need a host-specific API, so that's all a
// provider implements. Hosts without a public API fall through to `generic`,
// which is honest about returning nothing.
export interface Provider {
  name: string;
  matches: (host: string) => boolean;
  search: (ref: RepoRef, question: string, kind: IssueKind, perSource: number) => Promise<{ items: RawItem[]; notes: string[] }>;
}

const PROVIDERS: Provider[] = [github, gitlab];

export function providerFor(host: string): Provider {
  return PROVIDERS.find((p) => p.matches(host)) ?? generic;
}
