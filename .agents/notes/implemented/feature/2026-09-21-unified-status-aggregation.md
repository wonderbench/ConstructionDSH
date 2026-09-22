# Agent Note: Unified session status aggregation

Status: implemented

English | [中文](2026-09-21-unified-status-aggregation.zh.md)

## Problem

Pending confirmations, the session goal, plan state, subagent rows, and background jobs each live in their own surface. UI-IMPROVEMENT-PLAN item P4 requires one read-only aggregation on top of the existing data sources, showing only real state — no percentages without totals, no stop buttons, and no conflation of "tool call finished" with "business task succeeded".

## Decision

The aggregation extends the existing `ui-jobs` popover rather than adding a new surface: the popover already carries the batch-1 goal slice, and all four real sources are reachable from its props shares with zero new registrations.

Sections render top to bottom, each hidden when its source is absent: pending confirmation first (highest-precedence `PendingInteraction` from the standard session-status seat, keeping confirmations prominent), then the current goal (existing slice), then plan mode (active/pending from the standard `plan` projection, folded exactly like the composer plan chip so the two never disagree), then subagent rows from the `subagentCatalog` session projection through `projectionsBySession` (mode chip, label with durable-id fallback mirroring the header lineage, activity folded from session status and Host summaries; the projection materializes complete children only — an undetermined mode rows as the unknown chip, while corrupt or unreadable descriptors surface through the list-agents tool and the `subagent/catalog-diagnostic` remote error rather than this panel), then the existing ordered background-job rows.

Two plan fields stay omitted for lack of a real source: workflow state has no session-addressed projection (only chat-event folding inside `ui-workflow-run`), and a deliverables count has no projection (`ui-deliverables` derives per-turn data from conversation nodes). The README records exactly where they slot in; no projection was invented.

Subagent rows activate only after another consumer loads the catalog projection (the ui-jobs package issues no RPC by contract); eager projection reads stay a subagent-package decision, not a ui-jobs change.

## Alternatives considered

**A new sidebar tab or aggregation package.** Rejected: the popover already hosts the slice, keeps the change registration-free, and matches the plan's read-only-jump scope.

**Stop buttons on job rows.** Rejected by the plan: cancellation involves the model-side `job_kill` contract and is a separate program.

**Author workflow/deliverables projections to fill the fields.** Rejected for this slice: new Host projections are outside the aggregation's presentation scope; the fields activate when their sources ship.

## Consequences

The popover chrome changed from a list to a menu wrapper (the jobs list keeps its list label); 14 locale keys were added; the ui-jobs README documents the section-by-section sources and the two deferred fields. No percentages, no stop buttons, and no fake zero states appear anywhere in the panel.
