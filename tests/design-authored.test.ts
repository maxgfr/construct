import { describe, it, expect } from "vitest";
import { renderDesignTokens, renderScreens } from "../src/templates.js";
import type { DesignSystem } from "../src/types.js";

function ds(extra: Partial<DesignSystem>): DesignSystem {
  return {
    principles: [],
    tokens: [{ category: "color", name: "color.primary", value: "oklch(0.75 0.15 55)", note: "brand" }],
    components: [],
    screens: [{ name: "Screener", purpose: "home", relatedFRs: ["FR-001"] } as never],
    flows: [],
    accessibility: { standard: "WCAG 2.2 AA", requirements: [] },
    contentVoice: [],
    ...extra,
  } as DesignSystem;
}

describe("authored design tokens", () => {
  it("keeps the seed banner when tokens are not marked authored (backward compatible)", () => {
    const md = renderDesignTokens(ds({}));
    expect(md).toContain("Seeded defaults");
  });

  it("suppresses the misleading seed banner when tokensAuthored is true", () => {
    const md = renderDesignTokens(ds({ tokensAuthored: true } as never));
    expect(md).not.toContain("Seeded defaults");
    // still renders the token table
    expect(md).toContain("color.primary");
    expect(md).toContain("oklch(0.75 0.15 55)");
  });
});

describe("shell navigation section", () => {
  it("omits the navigation section when design.navigation is absent (backward compatible)", () => {
    const md = renderScreens(ds({}));
    expect(md).not.toContain("Shell & navigation");
  });

  it("renders a Shell & navigation section from design.navigation", () => {
    const md = renderScreens(ds({ navigation: "Topbar with a Screener/Status/Providers view switcher." } as never));
    expect(md).toContain("## Shell & navigation");
    expect(md).toContain("view switcher");
  });
});
