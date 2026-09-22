# Agent Note: Business/expert interface mode — setting, attribute contract, and sidebar entry visibility

Status: implemented

English | [中文](2026-09-21-ui-mode-business-expert-switch.zh.md)

## Problem

DSH's UI always showed every technical surface (terminal, plugin management, tool parameters). The UI-improvement plan's P1 introduces a presentation mode — `business` (default) emphasizing projects, deliverables, and pending confirmations, and `expert` showing every technical detail — without changing features or permissions. The mode needs one durable setting, one published document contract, and one reactive consumption channel that ui-conversation/ui-tool can key off.

## Decision

The mode lives in the `ui-theme` settings namespace, reusing the exact pipeline fontSize/outputDenoise already own:

- Schema field `uiMode: 'business' | 'expert'`, default `'business'`; persistence and restart ride the existing settings scope — no new machinery.
- `ThemeSnapshot.uiMode` is the single published source; `ThemeRuntime.setUiMode` is the only write entry (unknown values throw, same-value is a no-op).
- The document contract is `body[data-dsw-ui-mode]` (value is the mode; an absent attribute reads as `'business'`), written on both existing paths: the Host boot script (before first paint) and ui-layout's theme presenter (snapshot-driven).
- A pure read contract `readUiMode()` is exported from `@deepseek-ai/dsh-client-ui-theme/client` for non-React consumers; ui-tool's denoise layering reads the mode through a local attribute helper rather than a cross-package import.
- ui-sidebar receives the mode through its injected `hooks` compartment (a `createSnapshotStore` mirror of the theme snapshot, bound as `useUiMode`), so components carry no subscription machinery and re-render on `theme/change`.
- Technical entries are marked by a stable panel-id set (`TECHNICAL_PANEL_IDS`: `plugins` today, `terminal` reserved): business mode does not render those rows; expert mode renders every registered row. The marker is the same id that addresses the `main` keyed slot, so a package opts its entry in by id and the shell never imports the registrant.
- A settings row (`UiModeRow`, 「通用」 section, after the output-denoise row) exposes the mode; presentation-only copy states that approvals and permissions are unaffected.

## Alternatives considered

### Why not a separate settings package or new persistence?

A new namespace would duplicate the snapshot/publish/adopt machinery the theme pipeline already runs for every client surface, and the mode is appearance state by ownership. Riding `ui-theme` keeps one write entry, one snapshot, and one presenter projection.

### Why id-set marking instead of per-registration metadata?

Panel rows are derived from `sidebar.panellist` registrations whose owners live in other packages the shell must not import; adding a metadata flag would require touching every registrant for a presentation concern the shell can own by id. The id set is the minimal stable marker; a registration-level flag remains possible if third-party panels need self-service opt-in.

## Verification

Package specs pin the schema default, both write paths, the `readUiMode()` fallback, the row's registration, and the sidebar filtering (business hides the plugins row, the settings seat stays, approvals never filter); ui-theme/src carries 100% coverage on the gated files. Web goldens for the settings dialog and lifecycle chrome were refreshed through the sanctioned replay/refresh mechanism, and the plugin-management e2e scenarios set `uiMode: 'expert'` in their scaffold before navigating the Plugins page. The default business mode changes rendered chrome as predicted; everything touched replays green.

## Consequences

The default business mode changes existing web snapshots (the sidebar loses the Plugins row; the settings General section gains the mode row). An active technical panel whose row is hidden stays displayed until the user navigates away; collapsing it on mode switch is deliberate follow-up. When a terminal main-panel entry lands, it is already marked in `TECHNICAL_PANEL_IDS`.
