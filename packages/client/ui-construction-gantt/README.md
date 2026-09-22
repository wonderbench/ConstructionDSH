---
description: "Read-only construction schedule Gantt tab for the right Sidebar: folds construction_schedule_present tool results from the current Session into selectable scenarios and renders them with a fixed task-name column, day/week/month scales, and theme tokens."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-construction-gantt

English | [中文](README.zh.md)

## Summary

The read-only Gantt tab for construction schedules. It folds every `construction_schedule_present` tool result logged in the current Session into validated scenarios keyed by result id, lets the reader pick any previous scenario, and draws the selected one with frappe-gantt 1.2.2 behind a fixed task-name column. The chart never edits: dragging, resizing, progress handles, and the built-in popup are all disabled, and malformed or failed results produce an explicit failure state instead of a fabricated chart.

## Table of Contents

- [What it registers](#what-it-registers)
- [How the snapshot folds](#how-the-snapshot-folds)
- [The chart](#the-chart)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## What it registers

- **The tab type** — `ctx.sidebarRightTabs.register(...)` with id `@deepseek-ai/dsh-client-ui-construction-gantt`, kind `construction-gantt`, band `extension`, a localized title, and one guide entry. Opening the guide entry opens the page through the same public `openTab` path as the strip's add control.
- **The body and title** — the keyed `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title` seats under the type's id, both through `ctx.slots.inject`, so they install only while the Sidebar declares those slots and leave with this plugin. The body reads the tab's fullscreen presentation through `useTabInfo()`; the title names the latest scenario.
- **The dictionaries** — one `constructionGantt` namespace with Simplified Chinese as the key-set source of truth and English checked against it.
- **The snapshot source** — a `constructionGantt` hook on the session standard kit through `ctx.uiSession.provide`, resolved per Session binding from this package's Conversation view target.

Components receive only the derived prop shares: the sidebar runtime share (`useTabInfo`), the bound `useConstructionGantt` selector hook, the locale `t` seat, and plain data. No component sees `ctx`, and no business data crosses React props outside those shares.

<a id="how-the-snapshot-folds"></a>
## How the snapshot folds

The fold rides the standard Conversation assembly (`ctx.uiConversation`), the same mechanism the Trajectory view uses. One `ConversationNodeDefinition` matches `tool/call` events whose name is `construction_schedule_present` as context starts and every `tool/result` event as an update keyed by the call id. The update parses the result's first text block as JSON and validates it as a `schemaVersion: 1` schedule payload (`schedule-result.ts`); a tool error or an invalid payload folds into a failure entry with reason `error` or `malformed`. A call without a result yet folds into a running node. A `ConversationViewDefinition` for the `constructionGantt` target reduces the per-call nodes into one immutable snapshot per Session: valid scenarios deduplicated by `resultId` and ordered latest-first, failures latest-first, and a `running` flag that is true only while the newest schedule event is an open call.

Because the snapshot derives from the Session's own event stream through a per-Session binding, replaying history is deterministic and a Session switch shows that Session's scenarios only; one Session's scenarios never leak into another (acceptance B08). Nothing is read from browser storage and nothing is written back to the Session log.

<a id="the-chart"></a>
## The chart

The toolbar carries one scenario selector, Day/Week/Month scale buttons, a fit-to-view action, and an in-tab expand toggle (hidden while the Sidebar panel is already fullscreen, where `useTabInfo()` reports it). The default scale is weekly, switching to monthly for plans longer than 120 days; fit re-renders the current scale, which resets the scroll to the plan start.

The fixed name column repeats the library's exact row geometry — an 85px sticky header and one 34px row per task — beside a single scrollport holding both columns, so names and bars stay aligned at 420px and 720px pane widths and in fullscreen. Long names truncate with an ellipsis and expand in place on click; the full name is always available as the hover title. Critical activities carry a heavier bar outline and a bold name with a leading marker, and milestones render as an outlined diamond, so neither state relies on color alone. Rows keep a 12px body size through `--dsw-*` tokens, and the library's 1.2.2 DOM classes are pinned to those tokens through module-CSS `:global` blocks; no literal colors appear in this package.

The library instance is constructed per scenario and scale with `readonly`, `readonly_dates`, `readonly_progress`, and `popup: false`, which removes every drag, resize, progress handle, and click popup at the source. Schedule dates pass through unchanged: `start` is inclusive and `finish` is the exclusive working-day boundary the library expects, so the last displayed working date is the day before the displayed `finish`.

Separate states cover empty (no schedule call yet), calculating (a call is open), partial (assumptions, unresolved inputs, and warnings listed above the chart), and failure (the latest failure reason, beside older successful scenarios when both exist).

<a id="model-experience"></a>
## Model Experience

Indirectly, through the `construction_schedule_present` results the Host tool logs in the Session log, which this package validates and renders without emitting any tool, prompt section, or session event of its own.

#### KV Cache effect

None; the chart only reads already-logged tool results and sends no provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Read-only by design.** Drag scheduling, date editing, and resource optimization are deferred with the full construction plan; the library interactions that would change dates are disabled at the options level.
- **No dependency lag.** `links[].lagDays` validates but does not shift the drawn bars; the first release draws finish-to-start order only.
- **Toolbar expand is in-tab.** Panel-level fullscreen remains the Sidebar chrome control's job; the toolbar toggle overlays the chart across its own tab body, and hides while the panel is already fullscreen.
- **frappe-gantt is bundled privately.** The library and its DOM-class pins ship inside this package's client bundle; the upstream CSS is not imported because the 1.2.2 export map exposes no subpath, and the community types target the 0.x API, so a local ambient declaration pins the used surface.
- **Scenarios live per Session.** The snapshot folds from the current Session's log only; closing or switching Sessions hides other Sessions' scenarios by construction, and no cross-session history list exists yet.
- **Milestones draw one column wide.** A zero-duration activity has `start === finish`, which the library renders as a single-column bar; the diamond marker distinguishes it visually.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The schedule fold, its registrations, and the per-Session snapshot source are asserted directly by this package's specs, and no independent observation exists to diverge from them.
