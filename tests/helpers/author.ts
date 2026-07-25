// Turn a rendered SCAFFOLD into an AUTHORED SRD — what the agent does by hand
// during step 4 of the skill's workflow.
//
// Since the requirements lint landed, a freshly rendered `complex` scaffold
// legitimately fails `check`: every FR carries a boilerplate failure-path
// criterion and, unless the brief's notes happened to supply one, a templated
// happy-path criterion too. That is the intended contract — `complex` certifies
// build-readiness, and un-authored criteria certify nothing.
//
// Tests that need a PASSING complex SRD therefore have to author it first.
// Doing that inline in twenty tests would bury what each one is actually
// asserting, so it lives here.
import { readFileSync, writeFileSync } from "node:fs";
import { srdManifestPath } from "../../src/srd.js";
import type { SRD } from "../../src/types.js";

/**
 * Rewrite every scaffold phrasing in `SRD.json` into concrete, verifiable text.
 * Mutates the manifest in place and returns the authored model.
 *
 * The replacements are deliberately specific and bounded — they are what the
 * lint asks for, so a test using this is exercising the real "authored" state
 * rather than a shape that merely dodges the regexes.
 */
export function authorSRD(runDir: string): SRD {
  const path = srdManifestPath(runDir);
  const srd = JSON.parse(readFileSync(path, "utf8")) as SRD;

  srd.functional.forEach((fr, i) => {
    fr.acceptance = fr.acceptance.map((a, j) => ({
      ...a,
      given: a.given?.trim() ? a.given : `a signed-in user on the ${fr.title.toLowerCase()} screen`,
      when: a.when?.trim() ? a.when : `they submit the form`,
      then:
        j === 0
          ? `record ${i + 1} is stored and appears at the top of the list within 2 seconds`
          : `the request is rejected with HTTP 422, the message names the offending field, and no record is written`,
    }));
  });

  for (const iface of srd.architecture.interfaces) {
    iface.summary = `HTTP JSON boundary: GET /${iface.name.toLowerCase().replace(/\W+/g, "-")} returns 200 with a paged list, 503 when the upstream is unreachable.`;
  }

  srd.product.metrics = srd.product.metrics.map((m, i) =>
    /^Define a measurable launch success metric\.$/.test(m) ? `${i + 1},000 monthly active installs within 12 months` : m,
  );

  srd.scope.assumptions = srd.scope.assumptions.map((a) =>
    /^No hard constraints were captured/.test(a) ? "One full-stack developer, 8 weeks, no paid infrastructure beyond $10/month." : a,
  );

  writeFileSync(path, JSON.stringify(srd, null, 2));
  return srd;
}
