# Design-system authoring — turning the seeded design into a real one

At `--level complex` (without `--no-design`), `construct render` emits a
`design/` subtree alongside the SRD: design principles, a token scaffold, a
component inventory, a screen/flow map and an accessibility contract — all
**seeded by inference** from the brief and the functional requirements. Like the
data model and interfaces, it starts *structurally complete but generic*. Your
job is to make it the product's real design system.

## What renders (`design/`, complex only)

```
design/PRINCIPLES.md      design principles + content/voice guidelines
design/DESIGN-TOKENS.md   tokens by category (color · typography · spacing ·
                          radius · elevation · motion) + a "seeded defaults" banner
design/design-tokens.json machine-readable token twin ({ category: { name: value } })
design/COMPONENTS.md      component inventory — purpose · states · realised FRs
design/SCREENS.md         screen inventory + the primary user flows
design/ACCESSIBILITY.md   target standard + per-criterion Given/When/Then
```

`check` enforces (only when the design system is present): every
component/screen/flow reference resolves to a real FR, all six token categories
are present, the inventory is non-empty, and the accessibility block names a
standard and carries testable criteria. It **warns** while the tokens still hold
their seeded defaults.

## Where to spend effort

1. **Design tokens.** The scaffold ships brand-neutral defaults (a system font
   stack, an 8-pt spacing scale, neutral/semantic colours). **Replace the
   values with the product's real brand tokens**, then set
   `design.tokensAuthored: true` in `SRD.json` — that drops the seeded-defaults
   banner and clears the `check` warning. Keep `design-tokens.json` in sync
   (re-render with `--from-srd`, or edit both); a build step can import it
   directly.

   Before → after, for a product whose tone is "calm, expert, never noisy":

   ```diff
   - color.bg       #ffffff   Primary surface
   - color.fg       #111827   Primary text
   - color.primary  #2563eb   Primary action / brand accent
   + color.bg       #FBF9F4   Warm paper — long-form reading, not a dashboard
   + color.fg       #1B2A41   Ink; 12.6:1 on the paper surface (AAA body text)
   + color.primary  #C1654A   Muted terracotta; used only for the save action
   - type.font-sans system-ui, sans-serif
   + type.font-sans 'Inter', system-ui, sans-serif
   + type.size-base 1.0625rem  Reading-first: one step above UI default
   ```

   The point is not that the values changed — it is that each one now carries a
   reason a reviewer can argue with, and the contrast figure is stated rather
   than assumed. A token set with no rationale is a palette, not a design system.
   `assets/example-srd/design/` in the repo shows an authored set in full.
2. **Components.** Seeded from the FR text (a base set plus search/list/detail/
   form surfaces where the requirements signal them). Add the components the
   product actually needs, prune ones it doesn't, and verify each `Realises:` FR
   list. Trim the state checklist (`default … error`) to the states each
   component truly has — but cover the real ones (empty, loading, error are the
   commonly-forgotten three).
3. **Screens & flows.** One screen per in-scope FR plus home/settings, and a
   happy-path flow per must-have. Make the flow steps concrete and add the
   failure/edge paths that matter. Every `relatedFRs`/`frIds` must resolve.
4. **Accessibility.** The target standard is derived from the brief
   (`design.accessibilityTarget`, else a standard named in
   `constraints.compliance` / `nfrPriorities`, else **WCAG 2.2 AA**). Sharpen
   the seeded criteria into product-specific, testable statements and add any
   the product needs (forms, media, data tables). This block is the design
   counterpart of the `usability`/`accessibility` NFR — keep them consistent.
5. **Principles & voice.** Tie the principles to the value proposition and the
   content/voice guidelines to the brand's tone (`design.tone`).

## Capturing design intent in the brief

The interview can record design intent in an optional `brief.design` block — all
fields optional, all tolerated:

```json
"design": {
  "platforms": ["web", "ios"],
  "brandConstraints": "existing brand: navy + warm grey, Inter typeface",
  "referenceSystems": ["Material 3", "shadcn/ui"],
  "accessibilityTarget": "RGAA 4.1",
  "tone": "calm, expert, never noisy"
}
```

When absent, the renderer derives sensible defaults from the rest of the brief.

## Keep the model and the tree in sync

`SRD.json` (the `design` block) is the structural source of truth `check` reads.
If you hand-edit a `design/*.md`, mirror it into `SRD.json` (or re-render from an
enriched brief). A `🧠 Decide:` left anywhere under `design/` hard-fails `check`,
exactly like the rest of the SRD.

## Opting out

`construct render --out <run> --level complex --no-design` skips the subtree
entirely (and a re-render clears any previously rendered `design/`). `light`
never renders it.
