import { TOOLS, WRITE_TOOLS } from "./tools.js";

// The workflows, as MCP prompts.
//
// Tools are the half of this skill a client can discover on its own. The other
// half is where the rigor has to come from. `construct_check` gates STRUCTURE —
// sections present, requirements well-formed, traceability intact — and
// grounding coverage is advisory: it never fails a run. So an SRD can pass
// every gate and rest on nothing, and a client handed only the tools produces
// exactly that: a well-shaped document full of decisions nobody researched.
//
// Each prompt says three things, in this order: the contract, the exact tool
// sequence, and what the gate does and does not check.

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface PromptDecl {
  name: string;
  title?: string;
  description: string;
  arguments: PromptArgument[];
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

export interface PromptResult {
  description: string;
  messages: PromptMessage[];
}

export class PromptError extends Error {}

export const PROMPTS: PromptDecl[] = [
  {
    name: "interview_idea",
    title: "Interview an idea into a brief",
    description:
      "The elicitation workflow: turn a one-line idea into a brief worth researching, by asking the questions whose answers change what gets built — " +
      "not by filling the scaffold with plausible defaults.",
    arguments: [{ name: "idea", description: "The product idea, in one line.", required: true }],
  },
  {
    name: "enrich_srd",
    title: "Write the SRD from the evidence",
    description:
      "The authoring workflow: turn the brief and the evidence dossier into requirements with testable acceptance criteria, and make every significant " +
      "decision traceable to something real.",
    arguments: [{ name: "run", description: "The run folder.", required: true }],
  },
  {
    name: "judge_adr",
    title: "Decide an architectural choice on evidence",
    description:
      "The decision workflow: ground a technology or architecture choice in what the candidates actually do — their docs, their open issues, what people " +
      "hit in production — rather than in what you remember about them.",
    arguments: [
      { name: "run", description: "The run folder.", required: true },
      { name: "decision", description: "The decision to make (e.g. 'which queue for the job pipeline').", required: false },
    ],
  },
];

export function getPrompt(name: string, args: Record<string, unknown> = {}): PromptResult {
  const decl = PROMPTS.find((p) => p.name === name);
  if (!decl) throw new PromptError(`unknown prompt: ${name || "(none given)"}`);

  for (const arg of decl.arguments) {
    if (arg.required && !str(args[arg.name])) throw new PromptError(`\`${arg.name}\` is required for prompt "${name}"`);
  }

  const text = name === "interview_idea" ? interviewIdea(args) : name === "enrich_srd" ? enrichSrd(args) : judgeAdr(args);
  return { description: decl.description, messages: [{ role: "user", content: { type: "text", text } }] };
}

// The rule every workflow here rests on. Stated once, quoted into each prompt,
// so the two can never drift apart.
const CORE_RULE = `construct_check gates STRUCTURE, not truth: it fails on a malformed requirement, never on a decision that rests on nothing. Grounding coverage is advisory by design — which means the rigor is yours. Every significant decision cites evidence the dossier actually holds, or is marked openly as an assumption.`;

const GATE = `\`construct_check\` returning \`ok: false\` is a VERDICT, not a tool failure — the SRD is malformed, and it says where. But a green check is NOT a quality signal: read its grounding coverage, and run \`construct_review\` to adjudicate the claims the gate cannot judge.`;

function interviewIdea(args: Record<string, unknown>): string {
  const idea = str(args.idea)!;

  return `Turn this idea into a brief worth researching:

> ${idea}

${CORE_RULE}

**Sequence:**

1. \`construct_init\` with the idea — it scaffolds the run folder and a brief. The brief is a SCAFFOLD, not an answer.
2. Interview the user. Do not fill the brief yourself.
3. \`construct_research\` once the brief actually says something.

**Ask the questions whose answers change what gets built.** Who specifically is this for, and what do they do today instead? What must it do on day one, and what is explicitly out of scope? What already exists that it has to live with — systems, data, contracts? What is the constraint that is not negotiable: a deadline, a regulation, a team size, a budget? What would make this a failure even if it shipped and worked?

**One question at a time, and follow the surprising answer.** A brief assembled from plausible defaults produces an SRD that reads well and describes a product nobody asked for. If the user does not know an answer yet, record it as an open question — that is a real finding, and \`construct_research\` may settle it.

${GATE}`;
}

function enrichSrd(args: Record<string, unknown>): string {
  const run = str(args.run)!;

  return `Write the SRD for the run at \`${run}\`.

${CORE_RULE}

**Sequence:**

1. \`construct_status\` — find out what exists and what is missing.
2. \`construct_read\` the brief and the evidence dossier. Read the evidence before writing requirements, not after.
3. \`construct_analyze\` — it names what is thin and the exact command that fills each gap. Fill the gaps that matter before rendering.
4. \`construct_render\` (use \`merge: true\` if you are re-rendering over prose you already wrote).
5. \`construct_check\`, then \`construct_review\` to adjudicate each claim against its evidence.

**What a requirement has to be.** Testable: a Given/When/Then whose failure is observable, not "the system should be fast". Scoped: one behaviour, so a build task can implement exactly it. Traceable: it exists because of something in the brief or the evidence, and it says which.

**Where the evidence is thin, say so in the SRD** rather than writing a confident requirement over a gap. An explicit assumption is a thing a reviewer can challenge; an invented one is not.

${GATE}`;
}

function judgeAdr(args: Record<string, unknown>): string {
  const run = str(args.run)!;
  const decision = str(args.decision);

  return `Decide ${decision ? `\`${decision}\`` : "the open architectural decisions"} for the run at \`${run}\`, on evidence.

${CORE_RULE}

**Sequence:**

1. \`construct_read\` the evidence already in the dossier for the candidates — do not re-research what you have.
2. \`construct_research_angle\` with \`angle: "tech"\` for a candidate's real docs, and \`angle: "oss"\` for how it behaves in the field: open issues, what people hit, what the maintainers say they will not fix.
3. \`construct_research_angle\` with \`angle: "so"\` for the pitfalls that only show up in production.
4. Write the ADR: the decision, the alternatives, the consequences — each citing what you found.
5. \`construct_check\` and \`construct_review\`.

**Judge candidates on what they DO, not what they are known for.** A library's reputation is three years stale; its open issue list is not. The question is never "which is best" but "which fits THIS constraint" — the one the brief said is not negotiable.

**Record what you gave up.** An ADR whose consequences section is empty has not made a decision, it has expressed a preference. And where the evidence genuinely does not separate two candidates, say that and pick on a stated tiebreak — that is an honest ADR.

${GATE}`;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

// Every tool a prompt tells the model to call must actually be declared —
// otherwise a prompt survives a tool rename as a set of instructions that
// cannot be followed. Exported so the test can assert it.
const DECLARED = new Set([...TOOLS, ...WRITE_TOOLS].map((t) => t.name));

export function toolNamesReferencedBy(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/construct_[a-z_]+/g)) if (DECLARED.has(m[0])) found.add(m[0]);
  return [...found].sort();
}

export function unknownToolNamesIn(text: string): string[] {
  const bad = new Set<string>();
  for (const m of text.matchAll(/construct_[a-z_]+/g)) if (!DECLARED.has(m[0])) bad.add(m[0]);
  return [...bad].sort();
}
