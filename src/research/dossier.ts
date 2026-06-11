import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceItem, SourceResult, DossierMeta, SourceKind } from "../types.js";

// Canonical ordering so evidence ids are stable and grouped predictably,
// regardless of which order the angles finished in.
const SOURCE_ORDER: SourceKind[] = ["market", "oss", "docs", "so", "issue", "pr"];
const SOURCE_LABEL: Record<SourceKind, string> = {
  market: "Market & competitors",
  oss: "Open-source prior art",
  docs: "Technology documentation",
  so: "StackOverflow",
  issue: "Issues (prior art)",
  pr: "Pull / Merge Requests (prior art)",
};

function rank(s: SourceKind): number {
  const i = SOURCE_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
}

// Flatten all angle results into one list and assign stable ids (E1, E2 …) in
// canonical source order, best-scored first within each source.
export function assignIds(results: SourceResult[]): EvidenceItem[] {
  const flat = results.flatMap((r) => r.items);
  flat.sort((a, b) => rank(a.source) - rank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref));
  return flat.map((it, i) => ({ id: `E${i + 1}`, ...it }));
}

// Render the model-facing evidence document. Every item carries an id the SRD
// cites; the advisory grounding pass later reports which requirements rest on it.
export function renderEvidenceMarkdown(evidence: EvidenceItem[], meta: DossierMeta): string {
  const out: string[] = [];
  out.push(`# Evidence dossier`);
  out.push("");
  out.push(`**Idea:** ${meta.idea}`);
  if (meta.query) out.push(`**Query:** ${meta.query}`);
  out.push(`**Angles:** ${meta.angles.join(", ")} · **semantic:** ${meta.semantic ? "on" : "off"} · **built:** ${meta.builtAt}`);
  out.push("");
  out.push(
    `> Ground the SRD's requirements and decisions in this evidence. Cite items by id, e.g. \`[E1]\`. ` +
      `Grounding is advisory — \`construct check\` reports coverage but never fails on it. Still: prefer a cited claim to a guessed one.`,
  );
  out.push("");

  if (evidence.length === 0) {
    out.push(`_No evidence was retrieved. Broaden the query, add angles, or check connectivity._`);
  }

  for (const source of SOURCE_ORDER) {
    const items = evidence.filter((e) => e.source === source);
    if (items.length === 0) continue;
    out.push(`## ${SOURCE_LABEL[source]}`);
    out.push("");
    for (const it of items) {
      out.push(`### [${it.id}] ${it.title}`);
      const meta1 = [`ref: \`${it.ref}\``, it.location ? `loc: \`${it.location}\`` : "", `score: ${it.score}`].filter(Boolean).join(" · ");
      out.push(meta1);
      if (it.url) out.push(`url: ${it.url}`);
      out.push("");
      out.push("```");
      out.push(it.snippet);
      out.push("```");
      out.push("");
    }
  }

  if (meta.notes.length) {
    out.push(`## Retrieval notes`);
    out.push("");
    for (const n of meta.notes) out.push(`- ${n}`);
    out.push("");
  }
  return out.join("\n");
}

export interface DossierPaths {
  dir: string;
  evidenceJson: string;
  evidenceMd: string;
  metaJson: string;
}

// Persist a run's evidence: evidence.json (machine-readable, what `check`
// reads), EVIDENCE.md (model-readable), meta.json. `dir` is the run's
// `evidence/` folder.
export function writeDossier(dir: string, evidence: EvidenceItem[], meta: DossierMeta): DossierPaths {
  mkdirSync(dir, { recursive: true });
  const evidenceJson = join(dir, "evidence.json");
  const evidenceMd = join(dir, "EVIDENCE.md");
  const metaJson = join(dir, "meta.json");
  writeFileSync(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync(metaJson, JSON.stringify(meta, null, 2));
  return { dir, evidenceJson, evidenceMd, metaJson };
}
