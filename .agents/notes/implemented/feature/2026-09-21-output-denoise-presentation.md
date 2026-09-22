# Agent Note: Output-denoise presentation (turn-tail prose fold and tool field layering)

Status: implemented

English | [中文](2026-09-21-output-denoise-presentation.zh.md)

## Problem

Model output carries noise that hides the conclusion for business users: explanatory paragraphs, stacked caveats, raw field dumps, and self-declared completion ("已圆满完成"). The UI-IMPROVEMENT-PLAN P9 item requires a presentation-layer answer that folds rather than deletes, prefers structure over prose, and separates completion judgement (tool results and deliverable events) from completion claims — all behind the `outputDenoise` Beta switch (default off) shipped in batch 1.

## Decision

The denoise behavior is strictly branched on the flag so the off state is the pre-change rendering exactly.

Turn-tail aggregation lives in `ui-chat` (the package that actually renders assistant prose and the turn tail; the plan text names `ui-conversation`, whose in-flight skeleton work is untouched). `AssistantNodeView` reads the presentation mode from the body attributes at render time — `data-dsw-output-denoise` (ui-theme) and `data-dsw-ui-mode` (business/expert, business default) — and routes only a settled body of a closed Turn in business mode to `AssistantDenoise`. Prose longer than three non-empty source lines folds to the verbatim first line plus a locale-owned 查看说明/View explanation disclosure; expansion renders the untouched `AssistantMarkdown` over the original blocks, so the expanded text is verbatim by construction. Reasoning, images, and tool-call heads stay visible; expansion state is per-render local state (in-session only). The conclusion line is a verbatim slice and never derives status, so a completion claim presents as prose only. A render-time attribute read (no subscription) matches the cross-package mode-read coordination contract; a settings toggle applies on the next seat-driven re-render.

Tool field layering lives in `ui-tool` as one composable mechanism: a `TechnicalDetails` disclosure (locale-owned `tool` namespace, registered by this package because the in-flight `ui-conversation` dictionary cannot take new keys) plus a `technical` prop on the shared `ToolRow` that rewraps the identical IN/OUT card. The generic fallback card and the Bash row (terminal transcript) adopt it; expert mode passes `defaultOpen: true`. The `tTool` translator is injected through existing slot inject faces (`ctx.locale.bind` is stable per namespace and reads the active locale at call time).

## Alternatives considered

**Rewrite every tool renderer for business mode.** Rejected: the plan requires one composable layer; the shared `technical` prop lets rows adopt incrementally without touching card models.

**Fold via CSS only.** CSS can hide prose attribute-selectively, but the per-turn expansion state, the verbatim conclusion line, and the expert/business matrix still need a component; a strict JS branch pins off-state parity more testably.

**Add denoise copy to the `conversation` locale namespace.** Rejected for this batch: that dictionary is owned by `ui-conversation` and is being edited by the in-flight skeleton work; a Tool-owned `tool` namespace keeps the change conflict-free.

**Drive the fold from a Conversation Node state or store.** Rejected: the fold is pure presentation over already-folded node data, so per-render local state suffices; no node `match`/`update` or cross-entry store is involved.

## Consequences

The flag off is pixel- and DOM-identical for both surfaces (strict branch; covered by tests asserting the pre-layer shape). Web replayed snapshots need no update because the default is off and the attributes are absent in replay. When the switch graduates from Beta, the render-time attribute reads are the single seam to replace with a reactive seat if mid-session toggles must apply instantly. Rows that want the layer adopt two props (`technical` + `tTool`); `ui-tool` tests cover the layer, both adopters, and the denoise × ui-mode matrix. `ui-chat/src/client/chat` and `ui-tool/src` remain under the repo's GUI-debt coverage exemption; the changed `ui-chat/chat` files measure 100% in the scoped run.
