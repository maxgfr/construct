import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchAndExtract } from "../src/research/fetch.js";
import { resetDocLadderCache } from "../src/research/doc.js";

// A real .docx — a ZIP whose first bytes are `PK\x03\x04` and which is full of
// bytes above 0x7F. Committed rather than generated so the regression below is
// pinned to a genuine Office file, not to an approximation of one.
const DOCX = readFileSync(join(__dirname, "fixtures", "docs", "sample.docx"));
const OFFICE_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function binaryRes(bytes: Buffer, contentType: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => bytes.toString("utf8"),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetDocLadderCache();
});

describe("office documents fetched from the web", () => {
  // THE regression. Before the document ladder existed, a .docx was neither a
  // PDF nor HTML, so `extract` fell through its isHtml test and returned
  // res.body verbatim — the ZIP decoded as UTF-8. That got cached and quoted
  // INTO REQUIREMENTS as if it were prose, exactly as the PDF branch's own
  // comment warned about.
  it("never hands back the raw bytes of a .docx as page text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => binaryRes(DOCX, OFFICE_CT)),
    );
    const r = await fetchAndExtract("https://x.test/report.docx");

    expect(r.text).toBe("");
    expect(r.text).not.toContain("PK");
    expect(r.text).not.toContain("�");
    expect(r.note).toMatch(/could not extract text/i);
  });

  it("routes a content-type-only office document (no extension in the URL)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => binaryRes(DOCX, OFFICE_CT)),
    );
    const r = await fetchAndExtract("https://x.test/download?id=7");
    expect(r.text).toBe("");
    expect(r.note).toMatch(/could not extract text/i);
  });
});
