# Agent Note: ConstructionDSH minimal first-release scope

Status: implemented

English | [中文](2026-09-21-construction-dsh-minimal-first-release.zh.md)

## Problem

The [full development plan](2026-09-21-construction-dsh-development-plan.md) defines the complete first-release design: standards RAG, shared file tools, four business Skills, MinerU-based drawing splitting, costing, scheduling, a sidebar Gantt, Excel network export, and smart-site/BIM preparation. Measured against the repository's own gates, that surface is too large for one delivery: three external integrations (MinerU, Graphviz, Frappe Gantt), a hardened task-binding subsystem, fifteen model tools, and eighteen acceptance criteria each carry per-file coverage, keyless snapshot, and bilingual documentation costs before any user feedback exists.

This note narrows the first release to the smallest end-to-end slice that delivers verifiable engineering work: completion before sophistication. The full plan remains the design authority for every retained rule; this note owns the reduced scope, the simplified enforcement, and the shipped verification evidence.

## Decision

**The first release delivers standards RAG through MCP configuration, shared Word/Excel/lightweight-PDF reading, mechanical PDF splitting, the four business Skills with lightweight task checks, deterministic costing, CPM scheduling, and a read-only sidebar Gantt. MinerU drawing decomposition, Excel network export, the hardened task-binding subsystem, and every smart-site/BIM interface stay deferred to the full plan.**

### Scope

| ID | First release delivers | Deferred to the full plan |
|---|---|---|
| S1 | Standards RAG mounted through the existing MCP client configuration [R4]; `web_search`/`web_fetch` stay separate | RAG rebuilds, forced retrieval, project-file ingestion |
| S2 | Shared read-only Word/Excel/lightweight PDF tools with `SourceRef` and explicit coverage states; `.doc`/`.xls` receive an explicit unsupported report | Lossless legacy conversion |
| S3 | Mechanical PDF splitting by page range, per page, or bookmark with pypdf [E1], delivering split files, `index.json`, and original-page mapping | MinerU structured decomposition, drawing job persistence and recovery |
| S4 | The four Skills as content, plus one shared per-tool task-type check | `TaskBinding` manager, stage snapshots, the adversarial guard matrix |
| S5 | One deterministic decimal cost engine covering unit-rate, tender, variation, and settlement workflows | National quota databases, automatic pricing |
| S6 | CPM schedule calculation and a fixed read-only sidebar Gantt fed by `ScheduleResult` [E4] | Excel network export (Graphviz), drag scheduling, resource optimization |
| S7 | Nothing | All smart-site/BIM interfaces, authorization fields, and Mocks |

### Repository placement and reuse

The first release follows the plugin, Profile, and Bundle mechanisms; no `agent-loop` changes and no launch path outside `dsh`. [R2] [R3] [R8]

| Location | Responsibility |
|---|---|
| `packages/construction/construction-runtime/` | Host tools, the task-type check helper, file/cost/schedule modules, and pinned Python reader scripts as package assets |
| `packages/client/ui-construction-gantt/` | The fixed Gantt sidebar component; the client package gates verify the name and placement |
| `packages/bundle/construction/` | Explicit engineering composition; upstream default Profiles unchanged |
| `apps/cli/config/examples/construction/cordis.yml` | An example composition beside the existing example directories, validated by Loader tests |
| `packages/preset/agent-presets/presets/drawing-split/` | The drawing-split agent mode, added as a shipped agent preset with the hero mode-selection rework |

Reuse before building: the `skill-office` Python-asset pattern for document scripts [R10]; `tool-fs` workspace file access [R11]; `mcp-client` for standards RAG [R4]; `ui-sidebar-right` registration for the Gantt tab [R7]; the existing file-delivery tool for results [R12]. The existing `packages/schedule/` group owns scheduled agent follow-ups and stays untouched.

### What the full plan still owns

The full plan keeps authority over `SourceRef` shapes and per-format quality rules; the lightweight PDF library division across pypdf, pdfplumber, and pypdfium2 [E1] [E2] [E3]; formula-cache, field-mapping, and blanks-are-not-zero rules; decimal arithmetic and working-day boundary conventions; the security rules for paths, symlinks, attachment text as data, and credentials; and every deferred item. This note narrows scope and enforcement strength, nothing else.

### Minimal tool inventory

| Group | Tools |
|---|---|
| Read-only files | `construction_files_inspect`, `construction_files_read`, `construction_files_search` |
| Mechanical splitting | `construction_pdf_split` |
| Costing | `construction_cost_calculate`, `construction_cost_compare`, `construction_cost_export` |
| Scheduling | `construction_schedule_calculate`, `construction_schedule_present` |
| Reports | `construction_report_export` |

The four drawing-job tools and `construction_schedule_export_network` stay out of the first release together with their features. A request for structured drawing decomposition returns an explicit unsupported status instead of reaching a hidden fallback.

### Lightweight task checks

The bundle composes only construction tools, so the engineering Profile excludes model-facing arbitrary shell, code execution, and plugin installation by disabling the base rows that carry them (`tool-bash`, `tool-pwsh`, `tool-workflow`, `workflow-ptc`, and `ptc-runtime` carry `disabled: true`; the plugin-manager tools are already disabled in `dsh-base`). Each business tool verifies the active task type through one shared helper before executing; cross-domain calls and stale task identifiers are denied. The full plan's `restrict`/`guard` hardening against adversarial bypass — scoped registrations, MCP reconnection, parallel stage races — stays deferred until multi-agent orchestration exists. [R5] Skills load from controlled read-only sources with `includeDefaultRoots: false`. [R6]

### Implementation order

The release shipped in three stages in the planned order: the runtime package, bundle, example overlay, file tools, mechanical split, RAG configuration, and the business Skills first; the cost engine with its four variants and report export second; CPM scheduling and the sidebar Gantt third. The Gantt component developed against fixed `ScheduleResult` fixtures in parallel with the first two stages.

## Alternatives considered

**Implementing the full plan in one pass: rejected.** Three external integrations and the hardened binding subsystem would delay every verifiable slice, and the repository gates multiply the cost of each new package and tool before the first user session.

**Cutting business Skills instead of machinery: rejected.** The four workflows are the user-facing value; the deferred machinery protects against parallel-agent and adversarial-call threats the single-agent first release does not have.

**Keeping MinerU in the first release: rejected.** Qualifying one installed version, its real endpoints, job persistence, and recovery is a standalone workstream; mechanical splitting covers explicit page-range requests, and everything else returns an explicit unsupported status.

**Delivering schedule results as tables only: rejected.** A readable chart is the schedule workflow's primary output; the component stays fixed, read-only, and fed only by `ScheduleResult`, which bounds its cost.

**Prompt-only tool allowlists: rejected.** Composition plus a per-tool task check is the cheapest enforcement that software actually executes.

## Verification

The [construction-runtime test suite](../../../../packages/construction/construction-runtime/tests/) (135 tests) pins the file tools, mechanical split, decimal cost engine across the four variants, CPM calculation, task-binding denials, the skill-command entries, and the Python worker protocol, including the fixed cost and schedule fixtures. The [ui-construction-gantt test suite](../../../../packages/client/ui-construction-gantt/tests/) (103 tests) pins the scenario fold, chart options, and rendering, including the 105-task readability fixture at 420px and 720px sidebar widths and fullscreen. [Loader tests](../../../../apps/cli/tests/construction-config.spec.ts) validate the example composition, and [boot profile tests](../../../../packages/boot/app-boot/tests/profile.spec.ts) pin the shipped `construction` profile template. Three keyless recorded-session scenarios — [construction-cost-calculate](../../../../snapshots/session/construction-cost-calculate/), [construction-schedule-present](../../../../snapshots/session/construction-schedule-present/), and [construction-task-denial](../../../../snapshots/session/construction-task-denial/) — replay the shipped tools through the headless profile. The bilingual README pairs with their consistency records, the per-file coverage gate on the new package sources, and the `verify-package-*` gates pass for all three packages.

## Consequences

Each Skill ships its `SKILL.md`, output templates, and at least one normal and one exceptional de-identified fixture; the following content components from the full plan's Skill package are trimmed in this release and remain the full plan's to deliver: the four-class fixture matrix (normal / missing-input / malformed-format / conflicting-evidence) per costing variant and per Skill, the per-Skill field dictionary, the standalone per-Skill binding declaration, and standalone validation-rules files. Deferred items are user-visible gaps: first-release documentation states that drawing decomposition, Excel networks, and platform integration are unavailable instead of implying them. DSH interfaces are pre-stable; MCP, tool registration, Skill discovery, and sidebar behavior are retested before any DSH upgrade. When a deferred item graduates into a release, the same change updates the full plan so the two notes stay consistent.

## References

Repository links identify current files. External links are official project repositories or documentation and record selection rationale, not completed integration tests.

[R2]: ../../../../AGENTS.md

[R3]: ../../../../pnpm-workspace.yaml

[R4]: ../../../../packages/mcp/mcp-client/src/index.ts

[R5]: ../../../../packages/core/tools/README.md

[R6]: ../../../../packages/skill/skill-filesystem/src/index.ts

[R7]: ../../../../packages/client/ui-sidebar-right/README.md

[R8]: ../../../../packages/AGENTS.md

[R10]: ../../../../packages/skill/skill-office/README.md

[R11]: ../../../../packages/fs/tool-fs/README.md

[R12]: ../../../../packages/deliverables/tool-present/README.md

[E1]: https://github.com/py-pdf/pypdf

[E2]: https://github.com/jsvine/pdfplumber

[E3]: https://github.com/pypdfium2-team/pypdfium2

[E4]: https://github.com/frappe/gantt
