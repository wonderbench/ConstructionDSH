# Agent Note: P7 sidebar layout memory (width preference and restore re-validation)

Status: implemented

English | [中文](2026-09-21-p7-sidebar-layout-memory.zh.md)

## Problem

UI-IMPROVEMENT-PLAN P7 asks that the right Sidebar's viewing state survive a reload: first the panel width and expansion, then the open and active tabs, then read positions. At baseline the per-Session layout (tabs, selection, splits, presentation, expansion) already persisted browser-locally through the validated `dsh.sidebar-right.v1.<sessionId>` envelope — but the frame-level right panel width lived only in the ui-layout root store (reset to the 45% first-open default on reload), and a restored tab whose file had been deleted came back as a permanently dead tab that every subsequent reload resurrected.

## Decision

**Width preference (ui-layout).** The root-scoped layout store now persists only `layoutInfo.rightbar` to `dsh.ui-layout.v1` and adopts it on window boot through the same drag-clamped write entry (`setRightbar`), so a narrower reloaded frame re-clamps the saved width. The document is one positive integer, shape-validated by hand (no zod: ui-layout keeps a dependency-free browser face and zod is not resolvable from this package without an install), corrupt data clears its own key and falls back silently, and storage failures leave the in-memory layout usable. The left sidebar's drag width, frame measurements, and the occupant's presentation reports stay in memory. Expansion needed nothing: it is a recorded fact of each Session's surface and already crossed the reload inside the existing envelope.

**Restore re-validation (ui-sidebar-right).** Tabs present when a Session's store is minted came from persisted storage; each `dsh-resource://` tab's address is watched through the already-injected `ctx.resources.source` until the resource settles. A first `live` frame confirms the file and ends the watch; `none` (no provider registered) is unverifiable and left alone; a `failed` frame carrying the workspace-file protocol's definitive `workspace-file/not-found` code closes the tab through the controller's normal close path (close handlers, sole-tab column collapse, persisted rewrite) and adds one entry to a plugin-owned `RestoreNoticeSink`. A new `shell.overlay` occupant renders the sink as one dismissible alert per tab (`role="alert"`, locale-owned `sidebarRight` copy, mirroring ui-sidebar-terminal's cleanup overlay). Transient failures keep the tab — its body already explains and retries. Only the not-found code auto-closes; transport and lookup failures may recover. Watches ride until settle or the plugin's teardown, so HMR releases them.

## Alternatives considered

**Route layout memory through the settings channel (`ctx.settingsScope`).** Rejected with evidence: the settings document is one user-level YAML at the harness home (`packages/settings/settings-file`), not workspace-scoped, and no workspace-scoped client settings channel exists (the workspace-controller client persists nothing). Per-Session tab layouts and window-level widths in a user-edited global document would leak file paths across contexts, break the documented window-local semantics, and grow unbounded — the repo already sanctions the validated browser-local channel for exactly this data class (ui-sidebar-right README, "Browser-local layout" limitation).

**Keep unrestorable tabs open with their in-tab failure line.** Rejected: the plan asks restore to re-validate and explain; a dead tab that every reload resurrects is the failure mode P7 targets. The tab record is intentionally not preserved once its file is confirmed gone — the notice names what was lost and why.

**Validate via `remote.workspaceFiles.stat` from ui-sidebar-right.** Rejected: it would add a namespace dependency from a base package to a feature API and re-stat what the already-pinned resource stream reports; `ctx.resources.source` is the sanctioned read channel and is already injected.

**Persist PDF page and text scroll positions in this batch.** Deferred (blocked): both live in ui-sidebar-documentpreview's per-Session stores (`PdfStore`, text store `scrollTop`), which are private to that package; restoring them requires that package's store factory and bodies, outside this batch's permitted touch set. No ui-sidebar-right public interface carries viewing positions.

## Consequences

A reload now restores the right panel width (re-clamped), the per-Session expansion, tabs, and active tab (pre-existing), and closes plus explains tabs whose files no longer exist. Two localStorage keys hold layout memory (`dsh.ui-layout.v1`, `dsh.sidebar-right.v1.*`); both are versioned, size-bounded, and carry ids/paths only — never content. `apps/web/tests/navigation-panes.e2e.ts` exercises the collapse toggle and is unaffected (Session ids are minted per run, so no stale restore state matches); replayed snapshots need no update because rendering is unchanged. Step 3 (PDF page restore) lands as a follow-up batch in ui-sidebar-documentpreview: persist `PdfState` per Session in the store factory's `create(scopeKey)`, keyed like the sidebar envelope, and adopt before bodies render; text `scrollTop` follows the same pattern where the file version still matches.
