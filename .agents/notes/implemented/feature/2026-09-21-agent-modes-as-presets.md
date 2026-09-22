# Agent Note: Agent modes as presets

Status: implemented

English | [中文](2026-09-21-agent-modes-as-presets.zh.md)

## Problem

A new Session starts at a blank composer, and UI-IMPROVEMENT-PLAN item P2 asked for explicit first-screen scenario entries so the user does not have to know what the product can do. Entries that only prefill a composer draft duplicate what agent presets already express — a preset composes the session's tools, prompt sections, and skills — and a second mode-selection surface on the Hero competes with the shipped agent-preset picker chip instead of composing with it.

## Decision

Mode selection on the blank-session Hero is the agent-preset picker chip (`conversation.hero.agentPreset`, owned by `ui-agent-preset`) rendered beside the workspace picker. `standard` stays the deployment default; a user with a special need switches the chip to another preset before sending, and the staged composition is what the next blank session runs. The Hero builds no scenario-entry surface of its own.

The shipped `drawing-split` preset carries the drawing-PDF split workflow as a composition, replacing the scenario draft template: the `construction-runtime` plugin (file inspection, `construction_pdf_split`, and the four bundled business Skills), `skill-filesystem` + `tool-skill` so the Skills load, `tool-todo`, `tool-ask-user`, `present`, and the `standard` preset's compaction group. Its persona fixes the workflow contract: inspect each PDF first; split only via `construction_pdf_split` by explicit page ranges, per page, or bookmark; deliver the output files and index; then stop — no summaries, no standards retrieval, no structured decomposition (MinerU is unavailable and requests for it get the explicit unsupported status); blanks and missing inputs are asked about, never invented. Deliberate omissions, each a one-line rationale in the composition: no shell, no web, no delegation or workflows, and no plan mode.

## Alternatives considered

**Hero scenario-entry buttons.** Rejected: they duplicated the agent-preset picker as a second, weaker mode-selection surface (a draft prefill cannot change the session's tools or prompt), and the entry strip broke the Hero's headline-plus-composer simplicity. The P2 machinery — `HERO_SCENARIOS`, the entry strip component and styles, the draft-template locale keys, and the `focusComposer` inject member used only to hand the keyboard back after a pick — is removed in the same change.

**Prompt-only mode selection (keep the entries, drop the composition).** Rejected: a draft template leaves the session running the full `standard` toolset, so the "mode" is unenforced advice the model can ignore; a preset enforces it in the composition.

## Consequences

The hero web golden loses the "Task entries" group, and every golden listing the preset roster (chip menu, settings section) gains the `drawing-split` row; the settings-chrome goldens list no preset rows and stay unchanged. Shipped-preset display copy lives in the `dsh-agent-presets/display` fold and `ui-agent-preset` dictionaries, extended with the `drawing-split` name and description. The order shift (`drawing-split` at 2, then `ptc`, `minimal`, `cordis`) is preset metadata only.
