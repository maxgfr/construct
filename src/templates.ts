import type { SRD, ADR } from "./types.js";

// Markdown rendering for every SRD section. Each function is pure (model slice →
// string) so it is trivially golden-testable offline.
//
// Conventions, consistent across sections:
//   - `> 🧠 **Decide:** <question>`  — an open decision the hard `check` counts
//     as an unresolved placeholder (fails the build until resolved).
//   - `[E#]` appended inline           — a grounded claim citing evidence; empty
//     evidence renders nothing (the advisory grounding pass flags it later).

// Render evidence ids as inline citations: ["E1","E3"] → " [E1][E3]".
export function cite(ids: string[]): string {
  if (!ids || ids.length === 0) return "";
  return " " + ids.map((id) => `[${id}]`).join("");
}

// Escape a value for safe inclusion in a Markdown table cell: a raw `|` ends the
// cell (silent data loss) and a newline breaks the row.
export function cell(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export function slugTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "decision";
}

function bullets(items: string[], empty: string): string {
  if (!items.length) return `_${empty}_`;
  return items.map((i) => `- ${i}`).join("\n");
}

export function renderVision(srd: SRD): string {
  const p = srd.product;
  return [
    `# Vision`,
    ``,
    `**Product:** ${p.name}`,
    ``,
    `## Problem`,
    p.problem,
    ``,
    `## Target users`,
    bullets(p.users, "No users captured."),
    ``,
    `## Value proposition`,
    p.valueProp,
    ``,
    `## Success metrics`,
    bullets(p.metrics, "Define a measurable launch success metric."),
    ``,
  ].join("\n");
}

export function renderScope(srd: SRD): string {
  const lines = [
    `# Scope`,
    ``,
    `## In scope`,
    bullets(srd.scope.inScope, "No in-scope items captured."),
    ``,
    `## Out of scope`,
    bullets(srd.scope.outOfScope, "Nothing explicitly excluded yet."),
    ``,
    `## Assumptions`,
    bullets(srd.scope.assumptions, "No assumptions recorded."),
    ``,
  ];
  if (srd.openQuestions.length) {
    lines.push(`## Open decisions`, ``);
    for (const q of srd.openQuestions) lines.push(`> 🧠 **Decide:** ${q}`, ``);
  }
  return lines.join("\n");
}

export function renderFunctional(srd: SRD): string {
  const out = [`# Functional requirements`, ``];
  if (!srd.functional.length) out.push(`_No functional requirements defined._`, ``);
  for (const fr of srd.functional) {
    out.push(`## ${fr.id} — ${fr.title} _(${fr.priority})_${cite(fr.rationaleEvidence)}`);
    out.push(``);
    out.push(fr.description);
    out.push(``);
    out.push(`**Acceptance criteria:**`);
    for (const a of fr.acceptance) {
      out.push(`- **Given** ${a.given} **When** ${a.when} **Then** ${a.then}`);
    }
    out.push(``);
    const trace = [
      `NFRs: ${fr.nfrs.length ? fr.nfrs.join(", ") : "—"}`,
      `entities: ${fr.entities.length ? fr.entities.join(", ") : "—"}`,
      `interfaces: ${fr.interfaces.length ? fr.interfaces.join(", ") : "—"}`,
    ].join(" · ");
    out.push(`_Traceability — ${trace}_`);
    out.push(``);
  }
  return out.join("\n");
}

export function renderNonFunctional(srd: SRD): string {
  const out = [`# Non-functional requirements`, ``];
  if (!srd.nonFunctional.length) out.push(`_No non-functional requirements defined._`, ``);
  for (const n of srd.nonFunctional) {
    out.push(`## ${n.id} — ${n.category}${cite(n.rationaleEvidence)}`);
    out.push(``);
    out.push(n.statement);
    if (n.metric) out.push(``, `- **Metric:** ${n.metric}`);
    out.push(``);
  }
  return out.join("\n");
}

export function renderSystemContext(srd: SRD): string {
  return [`# System context`, ``, srd.architecture.context, ``].join("\n");
}

export function renderDataModel(srd: SRD): string {
  const out = [`# Data model`, ``];
  const entities = srd.architecture.dataModel;
  if (!entities.length) {
    out.push(`_No entities defined yet. Enrich during authoring: list entities, their attributes, and which functional requirements reference each._`, ``);
    return out.join("\n");
  }
  out.push(`_Seeded by inference from the brief — verify each entity and extend attributes during authoring._`, ``);
  for (const e of entities) {
    out.push(`## ${e.name}`);
    out.push(``);
    if (e.attributes.length) {
      out.push(`| Attribute | Type |`, `|---|---|`);
      for (const a of e.attributes) out.push(`| ${cell(a.name)} | ${cell(a.type)} |`);
    }
    out.push(``, `_Referenced by: ${e.referencedByFRs.length ? e.referencedByFRs.join(", ") : "—"}_`, ``);
  }
  return out.join("\n");
}

export function renderInterfaces(srd: SRD): string {
  const out = [`# Interfaces`, ``];
  const ifaces = srd.architecture.interfaces;
  if (!ifaces.length) {
    out.push(`_No interfaces defined yet. Enrich during authoring: list the API/event/UI/CLI surfaces and the functional requirements each serves._`, ``);
    return out.join("\n");
  }
  out.push(`_Seeded by inference from the brief — verify each surface and define its contract during authoring._`, ``);
  for (const i of ifaces) {
    out.push(`## ${i.name} _(${i.kind})_`, ``, i.summary, ``, `_Related: ${i.relatedFRs.length ? i.relatedFRs.join(", ") : "—"}_`, ``);
  }
  return out.join("\n");
}

export function renderADR(adr: ADR): string {
  const out = [
    `# ${adr.id}. ${adr.title}`,
    ``,
    `- **Status:** ${adr.status}`,
    ``,
    `## Context`,
    adr.context,
    ``,
    `## Decision`,
    `${adr.decision}${cite(adr.evidence)}`,
    ``,
    `## Consequences`,
    adr.consequences,
    ``,
  ];
  if (adr.alternatives) out.push(`## Alternatives considered`, adr.alternatives, ``);
  return out.join("\n");
}

export function renderLandscape(srd: SRD): string {
  const out = [`# Competitive landscape`, ``, `## Competitors`, ``];
  if (srd.competitive.competitors.length) {
    out.push(`| Product | Note | Evidence |`, `|---|---|---|`);
    for (const c of srd.competitive.competitors) {
      const ev = c.evidence.length ? c.evidence.map((id) => `[${id}]`).join("") : "_ungrounded_";
      out.push(`| ${cell(c.name)} | ${cell(c.note)} | ${ev} |`);
    }
  } else {
    out.push(`_No competitors captured. Use the market research angle to discover them._`);
  }
  out.push(``, `## Comparable open-source projects`, ``);
  if (srd.competitive.oss.length) {
    out.push(`| Project | Note | Evidence |`, `|---|---|---|`);
    for (const o of srd.competitive.oss) {
      const name = o.url ? `[${cell(o.name)}](${o.url})` : cell(o.name);
      const ev = o.evidence.length ? o.evidence.map((id) => `[${id}]`).join("") : "_ungrounded_";
      out.push(`| ${name} | ${cell(o.note)} | ${ev} |`);
    }
  } else {
    out.push(`_No OSS prior art captured. Use the oss research angle to mine comparable projects._`);
  }
  out.push(``);
  return out.join("\n");
}

export function renderBuildPlan(srd: SRD): string {
  const out = [`# Build plan`, ``];
  for (const m of srd.buildPlan) {
    out.push(`## ${m.title}`, ``, m.outcome, ``);
    out.push(`- **Requirements:** ${m.frIds.length ? m.frIds.join(", ") : "—"}`);
    if (m.risks.length) {
      out.push(`- **Risks:**`);
      for (const r of m.risks) out.push(`  - ${r}`);
    }
    out.push(``);
  }
  return out.join("\n");
}

export function renderTraceability(srd: SRD): string {
  const out = [
    `# Traceability matrix`,
    ``,
    `| Requirement | NFRs | ADRs | Entities | Interfaces |`,
    `|---|---|---|---|---|`,
  ];
  for (const r of srd.traceability) {
    out.push(
      `| ${r.fr} | ${r.nfrs.join(", ") || "—"} | ${r.adrs.join(", ") || "—"} | ${r.entities.join(", ") || "—"} | ${r.interfaces.join(", ") || "—"} |`,
    );
  }
  out.push(``);
  return out.join("\n");
}

// The single-file bundle (`--merge`): the whole SRD concatenated in reading
// order. Reuses the same section renderers so it never drifts from the tree.
export function renderMergeBundle(srd: SRD): string {
  const parts = [
    `# Software Requirements Document — ${srd.product.name}`,
    ``,
    `_Level: ${srd.level} · generated: ${srd.generatedAt}_`,
    ``,
    renderVision(srd),
    renderScope(srd),
    renderFunctional(srd),
    renderNonFunctional(srd),
    renderSystemContext(srd),
    renderDataModel(srd),
    renderInterfaces(srd),
    `# Architecture decisions`,
    ``,
    ...srd.architecture.adrs.map(renderADR),
    renderLandscape(srd),
    renderBuildPlan(srd),
    renderTraceability(srd),
  ];
  return parts.join("\n");
}
