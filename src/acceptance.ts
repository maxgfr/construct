import { createHash } from "node:crypto";
import type { AcceptanceResult, BuildPlanDoc, SRD } from "./types.js";

export interface CommandObservation {
  command: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  timedOut: boolean;
  signal: string | null;
  error?: string;
}

/** Fresh execution only: saved reports are never imported as successful evidence. */
export function executeAcceptance(
  srd: SRD,
  plan: BuildPlanDoc,
  run: ((command: string, timeoutMs?: number) => CommandObservation) | undefined,
): { results: AcceptanceResult[]; errors: string[] } {
  const errors: string[] = [];
  const results: AcceptanceResult[] = [];
  const requirementIds = new Set<string>();
  for (const fr of srd.functional) {
    if (requirementIds.has(fr.id)) errors.push(`Duplicate requirement id ${fr.id}.`);
    requirementIds.add(fr.id);
    if (!fr.acceptance.length) errors.push(`${fr.id}: no acceptance criteria; an empty requirement cannot pass execution verification.`);
  }
  const entries = plan.tasks.flatMap((task) => {
    if (task.verify.criteria !== undefined && !Array.isArray(task.verify.criteria)) {
      errors.push(`${task.id}: verify.criteria must be an array.`);
      return [];
    }
    return (task.verify.criteria ?? []).map((binding) => ({ task, binding }));
  });
  const keys = new Set(srd.functional.flatMap((fr) => fr.acceptance.map((_, index) => `${fr.id}:${index}`)));
  for (const { task, binding } of entries) {
    if (!binding || !keys.has(`${binding.frId}:${binding.index}`)) errors.push(`${task.id}: unknown acceptance criterion binding.`);
  }
  for (const fr of srd.functional) {
    for (const [index, criterion] of fr.acceptance.entries()) {
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ version: 1, requirement: fr, index, criterion }))
        .digest("hex");
      const row: AcceptanceResult = { frId: fr.id, index, fingerprint, criterion, status: "not-tested" };
      results.push(row);
      const matches = entries.filter(({ binding }) => binding?.frId === fr.id && binding.index === index);
      const match = matches[0];
      if (matches.length !== 1 || !match) row.reason = matches.length ? "Duplicate criterion mappings." : "Missing criterion command mapping.";
      else if (match.binding.fingerprint !== fingerprint)
        row.reason = "Stale criterion fingerprint: review the current requirement and rebind its dedicated test.";
      else if (match.task.status !== "done" || !match.task.acceptance.some((ref) => ref.frId === fr.id && ref.index === index)) {
        row.reason = "Criterion mapping must belong to a done task declaring this acceptance reference.";
      } else if (typeof match.binding.command !== "string" || !match.binding.command.trim() || match.binding.command.includes("\0")) {
        row.reason = "Missing or invalid criterion command.";
      } else if (
        match.binding.timeoutMs !== undefined &&
        (!Number.isInteger(match.binding.timeoutMs) || match.binding.timeoutMs < 1 || match.binding.timeoutMs > 600_000)
      ) {
        row.reason = "Criterion timeoutMs must be an integer between 1 and 600000.";
      } else {
        row.command = match.binding.command;
        if (!run) row.reason = "Execution requires --run-tests and an existing app directory.";
        else {
          const observation = run(match.binding.command, match.binding.timeoutMs);
          Object.assign(row, {
            command: observation.command,
            exitCode: observation.exitCode,
            stdout: observation.stdout,
            stderr: observation.stderr,
            timedOut: observation.timedOut,
            signal: observation.signal,
            error: observation.error,
            outputTruncated: observation.outputTruncated,
          });
          row.status = observation.ok && !observation.outputTruncated ? "passed" : "failed";
          if (row.status === "failed") row.reason = "Dedicated command failed, timed out, or exceeded the output limit.";
        }
      }
      if (row.status !== "passed") errors.push(`${fr.id}[${index}] ${row.status}: ${row.reason}`);
    }
  }
  if (!results.length) errors.push("Acceptance execution requires at least one current criterion; an empty suite is not proof.");
  return { results, errors };
}
