# Agent Note: ConstructionDSH first-release development plan

Status: implemented

English | [中文](2026-09-21-construction-dsh-development-plan.zh.md)

## Problem

Engineering users need one conversation for Word, PDF and Excel inputs, on-demand standards retrieval, and safety, quality, costing and scheduling work. The first-release risks are incomplete extraction, incorrect tool selection, inconsistent monetary or date conventions, and results that cannot be checked against their sources.

This plan prioritizes completion over premature sophistication. It reuses DSH and maintained file libraries to deliver verifiable document workflows and engineering outputs, rather than a complete construction-management platform. Later clarifications supersede earlier discussion; this document remains the design authority for the complete delivery scope, while the narrowed first-release range ships per [the minimal first-release scope note](2026-09-21-construction-dsh-minimal-first-release.md).

## Decision

**The design delivers on-demand standards RAG, shared file tools, four engineering business Skills, a separate drawing-splitting workflow, reproducible cost and schedule calculations, sidebar Gantt charts, and Excel schedule-network files requested by the user. The first release ships the narrowed S1–S7 range of the minimal note; the drawing-splitting workflow with MinerU, the Excel network export, and the smart-site/BIM interfaces stay deferred with their retained design below.**

### Frozen scope

This table defines the complete design scope; the minimal note records which rows the first release ships.

| ID | Complete-scope requirement | Excluded or deferred |
|---|---|---|
| F1 | MCP access to the existing engineering-standards RAG alongside native web search | Rebuilding RAG, mandatory retrieval, automatic ingestion of project files |
| F2 | Shared Word, Excel and lightweight PDF adapters with source locations | Lossless conversion of every legacy format and complex object |
| F3 | A separate workflow for splitting multiple long design PDFs, using local MinerU when needed | Drawing review, quantity takeoff, summaries, change detection, automatic ingestion |
| F4 | Safety, quality, costing and scheduling Skills bound to tools | Parallel multi-agent orchestration and domain microservices |
| F5 | User-data-based unit rates, tender checks, variation valuation and settlement differences | National quota databases, automatic pricing, tender submission or settlement approval |
| F6 | Gantt charts generated from analysis and calculation, shown in the sidebar | Reconstructing imported Gantt images, drag scheduling, advanced resource optimization |
| F7 | On-demand Excel activity-on-node logical network files | Sidebar networks, activity-on-arrow or time-scaled networks, native draggable Excel nodes |
| F8 | Smart-site/BIM adapter interfaces, authorization fields and Mock tests | Live platform writes, equipment control and comprehensive integration |

One primary agent runs sequential task stages. The four business Skills are `construction-safety`, `construction-quality`, `construction-cost` and `construction-schedule`; the `construction-drawing-split` tool workflow stays separate. Ordinary document reading is not another engineering business agent.

### Overall workflow

```text
User request + attachments
  -> inspect files and identify task intent
  -> activate one trusted task binding
  -> read only the required content
  -> optionally retrieve standards or public information
  -> validate business data and calculate
  -> create a versioned result
  -> deliver a report / workbook / sidebar Gantt

Explicit drawing-split request
  -> inspect -> optional MinerU structure extraction -> PDF splitting
  -> deliver split files + index + status -> STOP
```

## Repository placement and reuse

The release uses the repository plugin, Profile and Bundle mechanisms. It does not modify `agent-loop` and adds no Node application entrypoint that bypasses `dsh`. The shipped packages register dependencies, compiler entries, documentation and tests, not merely directories. [R2] [R3] [R10]

| Shipped location | Responsibility |
|---|---|
| `packages/construction/construction-runtime/` | Host tools, task binding, document/cost/schedule modules; fixed Python scripts and locked dependencies live in package assets |
| `packages/client/ui-construction-gantt/` | Engineering result presentation, Gantt sidebar, status presentation and localized copy |
| `packages/bundle/construction/` | Explicit engineering composition without changing the capabilities of upstream default Profiles |
| `apps/cli/config/examples/construction/cordis.yml` | An engineering overlay using existing launch paths, validated by Loader tests |
| Package `tests/` and Skill asset directories | Templates, input/output definitions, normal fixtures, exceptional fixtures and regression tests |
| `packages/preset/agent-presets/presets/drawing-split/` | The drawing-split agent mode shipped as an agent preset with the hero mode-selection rework |

The existing `packages/schedule/` group handles scheduled agent follow-ups, not construction scheduling. Construction schedule calculations live in the construction module. [R2]

The first release is one engineering feature set, not six services. Internal packages follow repository naming checks and remain private; they do not publish under the upstream organization namespace. Fixed tools run the Python document worker through host-managed subprocesses. The repository Python SDK keeps its purpose; the model gets no arbitrary Python or shell execution.

Every tool name, task-binding field and result format in this plan ships as an implemented interface. Only DSH interfaces supported by repository references were verified existing capabilities. Configuration validates with schemas; file-size, timeout, page-batch and chart-size limits are deployment settings rather than hardcoded policy.

## Standards RAG and web search

Engineering standards stay in the existing RAG. The target read-only operations are `standards_search` and `standards_read`: retrieve clauses, then read a selected clause with necessary context. They map to the actual service through the existing MCP client rather than rebuilding the knowledge base. DSH namespaces MCP tools by server; only transports and configuration fields accepted by the client source are used. [R4]

`web_search` and `web_fetch` stay available; RAG does not replace web search. Standards, current attachments and public web information have distinct entrypoints. Rewriting, calculations with sufficient inputs and drawing splitting do not require retrieval. Public updates may be checked online, but internal attachment content is not sent to public services automatically.

The retrieval returns the standard title, identifier, version, clause, text and source location. It reports jurisdiction, discipline and validity only when available; otherwise it marks them unknown. A match does not establish applicability; it reports insufficient evidence when necessary. It returns small excerpts before expanding. Registered schemas still consume context, so the design promises neither zero token competition nor a dynamic retrieval-routing system.

## Shared file tools and input quality

### Separate originals, reading content and calculation data

Originals stay read-only. Reading content retains sections, paragraphs, tables and image references; calculation data retains field types, units, values, formulas and source locations. Files do not convert wholesale to Markdown before calculating. A cache keys by content hash, parser version and parameters, isolated by project/workspace; changed content requires new processing.

A common `SourceRef` identifies the original file, one-based page and available region for PDF; sheet and cell range for Excel; section path, paragraph or table location for Word. Word page numbers are not invented without pagination, nor exact PDF regions from plain-text extraction. Extracted, calculated, inferred and human-confirmed values stay distinguishable.

| Format | Route | Quality requirements |
|---|---|---|
| `.docx` | Native OOXML/Word adapter | Preserve body/table order; check headings, merged/nested tables and headers/footers; report tracked changes, comments or unsupported objects rather than silently omitting them |
| `.xlsx` | Native workbook adapter | Retain sheets, headers, merges, hidden content, formulas and cached values; do not substitute OCR or PDF conversion |
| `.pdf` | Lightweight PDF module | Read pages, text, regions or tables on demand; drawing splitting has a separate entrypoint |
| `.doc`, `.xls` | Separate compatibility adapter interfaces | Target text/table import; request a converted copy when an adapter is unavailable or fidelity is insufficient |
| Encrypted, macro-enabled or damaged files | Inspect, then explicitly reject or report handling requirements | No password cracking, macro execution or empty results reported as success |

Workbook fields map before calculation. BOQ codes stay text; blanks are not zero. Currency scales, percentages versus fractions, and calendar versus working days stay distinguishable. Merged values expand only within identified ranges, and subtotals are not added to their underlying detail again. Only ambiguous mappings that affect the result prompt the user, not a complete reformatting of the source.

openpyxl does not evaluate formulas. [E4] The tools retain formulas and available cached values without calling the cache a fresh recalculation. The deterministic calculator recomputes authoritative business amounts; unverifiable external links or complex formulas are flagged. New files export rather than overwrite originals, and user-provided strings write safely as text instead of accidentally creating formulas from prefixes such as `=`.

Results carry explicit states such as `complete`, `partial`, `needs_review` and `failed`, with requested coverage, actual coverage and warnings. Critical omissions in text, tables or amounts do not feed an apparently complete final calculation. Structural validity does not establish layout, semantic or formula correctness.

## Two PDF routes

### Ordinary documents: lightweight first

Ordinary contracts, reports, plans, notices and BOQs use lightweight parsing. File count, page count or lightweight extraction failure does not automatically select MinerU. Explicit mechanical splitting by page range or one file per page uses lightweight page operations without a content model.

| Dependency | Fixed responsibility | Selection basis |
|---|---|---|
| pypdf | Inspection, basic text and splitting by copying original PDF pages | Maintained page operations instead of a custom PDF engine [E1] |
| pdfplumber | Positioned text and table extraction | Designed for PDFs with text layers; not an OCR engine [E2] |
| pypdfium2 | Rendering selected pages/regions and checking split-page appearance | Dedicated page rendering [E3] |
| Local MinerU | Structured decomposition required by the drawing workflow | Thin adapter around the existing installation, never a fallback for ordinary PDFs |

The tool chooses its parser internally; the model does not combine independent library outputs arbitrarily. If basic reading produces no usable text, the result is `needs_visual_read`, rendering selected pages for an authorized vision model when available. Batch OCR is a separate optional capability; the design adds no OCR service and never silently switches to MinerU.

Pages process in bounded batches with memory, time and output limits. Scanned pages, unreadable text, broken tables and encryption are distinguished instead of reporting generic success. One clause does not process an entire document, and partial matches do not claim a complete review.

### Drawing splitting: separate entrypoint and explicit completion

This route opens only for an explicit request to decompose multiple long engineering-design PDFs or a trusted drawing-split UI action. The workflow inspects originals and splitting rules, calls MinerU when structured output is needed, then uses pypdf to copy original pages into split PDFs. MinerU content parsing and PDF page splitting are separate operations with separate recorded outcomes. [E1] [E7] The first release defers this route: `construction_pdf_split` handles mechanical splitting only and returns an explicit unsupported status for structured decomposition.

The design supports grouping by source file, explicit page ranges, one page per output and existing bookmark boundaries. Without reliable boundaries, it preserves original pages or explicit ranges instead of guessing discipline volumes. It does not automatically crop multiple details from one page, rasterize originals for rewriting, or alter page size, rotation or scale. A split file does not claim that a source digital signature remains valid.

Delivery is split PDFs, `index.json`, a readable index table and a processing report, recording source hashes, original page numbers, output locations, parser version and coverage. Existing MinerU structured output may accompany the files, but no automatic summaries, reviews, takeoff, change detection, standards retrieval or ingestion follow. The workflow waits for a new user request after delivery.

The design qualifies one installed MinerU version and its actual endpoints rather than promising every version. It does not copy an unverified route such as `/file_parse`. Submission returns an application `job_id` promptly; separate calls obtain status/results or request cancellation. A timeout does not prove the worker stopped. DSH MCP tool timeouts do not replace persistent job management. [R4]

Job state persists in the project workspace, including a remote MinerU job identifier when provided. Recovery queries the original job when supported; otherwise it reports interruption and requires a retry rather than silently resubmitting. Retries process only known failed ranges. Coverage checks verify each requested page against its expected output, separately identifying intentional overlapping ranges.

## Skill content and tool binding

### Content for the four business Skills

| Skill | Required workflow | Outputs and prohibited behavior |
|---|---|---|
| `construction-safety` | Establish activity/location and coverage; retrieve standards when needed; compare risk evidence, controls and missing inputs | Issues, evidence, source locations, proposed controls and unresolved items; no work permits or fabricated safety approval |
| `construction-quality` | Identify inspection objects, samples, units and requirements; check measured data against material/test records | Missing evidence, contradictions, nonconformities and review actions; no passing result without measurements |
| `construction-cost` | Select unit-rate/tender/variation/settlement workflow; identify file roles; map BOQ fields; calculate or compare | Analysis/difference tables and adopted evidence; no invented prices or unauthorized approval/submission |
| `construction-schedule` | Extract or create tasks, durations, relationships and calendars; validate assumptions; calculate scenarios | Schedule results, duration analysis, Gantt and requested networks; no invented critical path when logic is missing |

Each Skill ships with `SKILL.md`, a binding declaration, field dictionary, output templates, validation rules and fixtures. Safety and quality each include at least one de-identified real workflow; costing covers its four variants; scheduling covers creation and revision. Each variant includes normal, missing-input, malformed-format and conflicting-evidence fixtures with expectations reviewed by domain professionals.

Standards text stays in RAG; Skills contain procedures rather than duplicate standards. Business Skills interpret fields, while shared adapters read file structures. Release instructions, templates and tests ship together, and distinguish facts, recommendations, assumptions and unresolved items.

### Enforce bindings in software, not prompts

Native Skill invocation controls are not tool authorization. The full design owns an engineering task manager with a host-owned `TaskBinding` containing task identity, Skill version, stage, permitted tools and input types; an `allowed-tools` field in `SKILL.md` is not DSH-enforced authorization. [R5] [R6] The first release ships the lightweight form — one active binding per scope, supersession on reload, and executor-enforced denials — and defers the hardened manager.

The hardened design narrows inherited global-tool visibility with `ctx.tools.restrict(filter)` and denies with `ctx.tools.guard(...)` so later listeners cannot override. The repository explicitly leaves scoped registrations visible under restrict, so the engineering guard and tool executor also check the active task, file access and input format. [R5] These checks stay deferred with multi-agent orchestration; the first release's engineering Profile excludes model-facing arbitrary shell, code execution and plugin installation by disabling the base rows that carry them (`tool-bash`, `tool-pwsh`, `tool-workflow`, `workflow-ptc`, and `ptc-runtime` carry `disabled: true`; the plugin-manager tools are already disabled in `dsh-base`).

The engineering entrypoint creates a trusted task and loads its Skill before exposing bound tools in the next model step. Stage changes wait for the current call batch to settle and execute against a binding snapshot; authority does not change or accumulate during parallel calls in one batch. The model may propose declared task types, not arbitrary tool sets or self-issued `approved=true`; drawing mode additionally requires explicit user intent.

Engineering mode disables model-facing arbitrary shell/code, generic HTTP, plugin installation and capability escalation; fixed workers remain executable through approved tools. The same checks cover local tools, tools rediscovered after MCP reconnection, direct calls and later subcalls. The development Profile stays separate; these business guards do not claim to isolate administrators, user terminals or people with host access.

Engineering Skills load from controlled read-only sources. The local provider supports `includeDefaultRoots: false` with explicit directories to prevent workspace-name overrides; other mounted providers need inspection as well because this setting does not disable every provider. Registrations, listeners, connections and active authority release on unload or task transition; historical Skill text does not restore permissions. [R6]

### Model tools and binding inventory

The model tools use underscore names. Internal module names may contain dots, but unverified names such as `pdf.read` are not model tools. Common implementations are shared while cross-scenario use of business tools is prevented.

| Group | Entrypoints | Allowed tasks |
|---|---|---|
| Read-only files | `construction_files_inspect`, `construction_files_read`, `construction_files_search` | Ordinary reading and four business Skills; dispatch to Word/Excel/lightweight PDF by parameters, never implicitly to MinerU |
| Mechanical splitting | `construction_pdf_split` | Explicit page-splitting requests or the drawing workflow |
| Drawing jobs | `construction_drawing_submit`, `construction_drawing_status`, `construction_drawing_result`, `construction_drawing_cancel` | Drawing splitting only; deferred with the drawing workflow |
| Costing | `construction_cost_calculate`, `construction_cost_compare`, `construction_cost_export` | Costing only |
| Scheduling | `construction_schedule_calculate`, `construction_schedule_present`, `construction_schedule_export_network` | Scheduling only; network export additionally requires a user request and stays deferred |
| Reports | `construction_report_export` | Templates and result types permitted by the active business binding |
| Standards and public web | Read-only standards tools under their actual MCP namespace, plus `web_search` and `web_fetch` | Business tasks that need them; not automatic follow-on drawing actions |

## Costing implementation

The four costing scenarios share item matching and deterministic calculation rather than four pricing systems. Inputs may combine contract Word documents, variation PDFs, BOQ and tender workbooks. Files receive business roles before confirming item fields, quantities, prices, fee bases, tax conventions and rounding.

Labor, material and equipment consumption normalize per BOQ measurement unit; `resource_cost = sum(consumption * unit_price)`, then explicitly supplied fee rules apply. Decimal fixed-precision arithmetic carries the calculation. Fee composition and bases for overhead, profit, risk and tax come from user inputs or explicit settings, not a purported universal national formula.

| Variant | Calculation or check | Output |
|---|---|---|
| Unit rate | Unit conversion, consumption, tax-inclusive/exclusive prices and explicit fee bases/rates | Rate build-up, expressions, calculated values and missing inputs |
| Tender pricing | BOQ matching, omissions/duplicates, descriptions/units and totals | Tender differences and items requiring confirmation |
| Variation valuation | Change evidence, quantity deltas and applicable contract rates or explicit new build-up method | Valuation details, method and evidence |
| Settlement review | Contract/change/settlement quantities, rates, amounts and duplicate inclusion | Candidate increases/decreases, evidence and unresolved items |

Source data, mappings, calculation details, difference totals and unresolved items are retained. Quantities, prices, fees and expressions are traceable. One BOQ item may map to several operations; name similarity alone does not establish equivalence. Missing prices are not filled from model memory. Ambiguous evidence produces a draft, not a final determination. Exported authoritative amounts come from the frozen `CostResult`, not unevaluated Excel formula caches.

## Schedule calculation and outputs

### Calculate before drawing

Requests and attachments are analysis inputs, not Gantt charts to import unchanged. The calculation builds tasks, durations, dependencies, calendars, milestones and constraints, then produces a `ScheduleResult`. Colored-cell recognition and PDF Gantt reconstruction are out of scope; existing schedule tables are only task-data sources.

The calculator supports one project working calendar, whole-working-day durations, finish-to-start (FS) links with explicit nonnegative working-day lags, zero-duration milestones, specified start/finish constraints and locked completed tasks. Leads, SS/FF/SF links, mixed resource calendars and advanced remaining-duration treatment stay deferred; unsupported inputs are preserved and reported rather than converted silently to FS.

Validation rejects duplicate task IDs, dangling references, cycles, duration/date unit errors, malformed dates and constraint conflicts, naming the cycle. With complete supported logic, forward/backward passes, floats and critical paths compute; with dates only, the result reports date/milestone differences without claiming network analysis. Remaining work on in-progress tasks is separately confirmed unscheduled work so historical actual progress is not rescheduled.

Working-time boundaries stay consistent internally: inclusive start and exclusive finish boundary. A positive-duration task displays the last working date before that boundary; a zero-duration milestone is an instant. Calculation runs in the project calendar without browser-timezone shifts. Component date conventions convert through an adapter, and single-day, weekend-spanning, year-boundary and milestone fixtures pin the behavior.

A revision creates a new scenario without overwriting the baseline or completed tasks. It reports duration changes, affected tasks, relationship changes, assumptions and unresolved conflicts. Resource suggestions are not validated optimal solutions. Duration calculations do not decide contractual responsibility, extensions or claims.

### Sidebar Gantt chart

A fixed client component consumes `ScheduleResult`, adopting Frappe Gantt with adapters for the DSH theme, task-name area and scenario selection. [E5] The model does not generate arbitrary HTML/JavaScript charts, and the chart component does not reschedule business dates. The display is read-only without drag scheduling.

Integration runs through `ctx.sidebarRightTabs.register(...)`, the `sidebar.right.pane.tab` slot and `ctx.sidebarRight.openTab(...)`. These are client APIs, not model tools callable directly from the Host. `construction_schedule_present` returns a persisted result identifier and display metadata; the client result card opens the tab in the current session. Replaying history does not repeatedly reopen windows. [R7]

| UI element | Design and acceptance |
|---|---|
| Toolbar | One row for scenario, day/week/month, fit and fullscreen; no stacked control cards |
| Task area | Fixed names, truncation with expansion and exact row/bar alignment |
| Timeline | Default weekly scale, monthly scale for long plans, sticky header and no endlessly shrinking fonts |
| Styling | DSH theme variables and localized dictionaries; one primary color, neutral gray and limited warnings with text/icons |
| Space | Configurable 12–13px body text and 32–36px rows; compact/fullscreen mode rather than unusably thin charts |
| Updates | Refresh after a new calculation result; select previous scenarios; no cross-session data leakage |
| States | Separate empty, calculating, partial, unconfirmed-assumption and failure states |
| Tests | 420px/720px sidebars and fullscreen; long names, month boundaries, milestones and at least 100 tasks without obstruction |

### Excel schedule-network file

The Excel network export stays deferred (F7); this is its retained design. It exports only when the user requests a network, producing an activity-on-node logical diagram from the same `ScheduleResult` version as the Gantt chart. It does not invent a network without reliable dependencies. Activity-on-arrow and time-scaled networks report as unsupported rather than mislabeling an ordinary relationship graph.

Graphviz `dot` provides layered directed-graph layout and openpyxl writes images and data into the workbook; Graphviz handles layout, not scheduling. [E4] [E6] The workbook includes network, tasks, relationships and notes sheets. The diagram is a high-resolution PNG. Data cells are editable, but nodes are not native draggable Excel shapes; the diagram regenerates after editing data.

Layout runs left to right with consistent node dimensions, spacing and fonts, wrapped names and stable IDs. Essential information stays in the diagram and detailed dates/parameters in the task table. Critical-task emphasis comes from calculation results and includes line weight or text legends, not color alone. External labels escape as text; Graphviz labels cannot inject file paths or links.

Printing defaults to landscape. Page capacity is determined from readable text before choosing paper and pagination; a large network is never squeezed onto one page. Splitting by stage/subnetwork into pages or sheets retains target IDs and sheet references for every cross-page edge. Chinese glyphs, clipping, edges through nodes, print bounds and page breaks are checked in actual Excel and WPS fixtures. Acceptable rendering differences are documented rather than promising identical behavior.

## Data, interfaces and operational constraints

Results persist `schema_version`, `task_id`, input hashes, rule/calculator versions, source references, status, warnings and artifact identifiers. `DocumentResult`, `SplitResult`, `CostResult` and `ScheduleResult` are defined separately. Exporters accept only their declared type/version; cross-domain handoff requires an explicit conversion rather than treating arbitrary JSON as interchangeable.

Artifacts write to a dedicated workspace directory, validate as temporary files, then publish completion. Published scenarios receive new versions rather than overwrite. Session logs retain model-visible calls, summaries and locations while files hold large data. Ordinary tool results and existing file delivery are reused rather than introducing a session-storage format for charts or using browser localStorage as authoritative business storage. [R2] [R7]

`file_id` resolves to an authorized workspace and traversal, symlinks, size, archive expansion and media type are checked. Parsing workers have no default public-network access, and credentials stay out of prompts/results. Project or RAG content may still reach the selected model, so local MinerU/RAG does not establish an end-to-end local system; deployments declare model endpoints and allowed outbound data classes.

Attachment text, standards excerpts and MCP responses are data: they cannot activate Skills, change task bindings or elevate privileges. Workspace ownership for task and drawing job identifiers is rechecked on every read or cancellation.

Minimum dependencies are repository-declared Node/pnpm, a qualified Python environment, pinned file libraries, Graphviz for network export and on-demand access to RAG/MinerU. Versions that pass fixtures are pinned. Startup diagnostics distinguish required and optional components: offline MinerU does not block ordinary PDFs, and missing Graphviz disables only network export.

## Smart-site and BIM extension preparation

Smart-site/BIM interfaces stay deferred (F8); this is their retained design. It retains the original platform-integration requirement without making live platforms prerequisites. Minimal project/element/task queries, issue proposals and approved submission interfaces carry de-identified Mocks and input/output tests. Adapters are disabled by default and do not return fabricated success without real credentials.

Interfaces carry `project_id`, object IDs, source platform, model/record versions, `expected_version` and idempotency keys. Live integration verifies user, project and operation authority server-side; the model cannot declare its own identity or approve its writes. The first release performs no production writes, arbitrary SQL/HTTP access or machinery/safety-interlock control.

## Implementation order and deliverables

The release shipped the stage work packages in the planned dependency order: the composition, binding, result types, fixtures, file tools, RAG configuration and business Skills first; the cost engine with its four variants second; CPM scheduling and the sidebar Gantt third. The UI developed in parallel against fixed `ScheduleResult` fixtures. The drawing entrypoint with its MinerU adapter, the Excel network export, and the platform Mocks remain deferred with their design above; each stage delivered an executable end-to-end slice with its Skill content, templates, fixtures and documentation.

## Alternatives considered

**MinerU for every PDF: rejected.** It conflicts with lightweight daily processing and the dedicated drawing-split boundary, and makes an optional local service mandatory for every file task.

**A custom PDF engine or large document platform: rejected.** pypdf, pdfplumber and pypdfium2 cover the required baseline. Own adapters, source locations, quality checks and access rules instead; review dependency licensing and distribution notices before packaging. [E1] [E2] [E3]

**Copying file tools per Skill or using prompt-only allowlists: rejected.** Duplication multiplies fixes, while prose cannot block execution. Share implementations and enforce task bindings at execution.

**Importing existing Gantt graphics, drag editing and resource optimization in release one: rejected.** First establish task analysis, reproducible scheduling and fixed-component display. Conversational revisions create a new calculated version.

**A sidebar network editor or native Excel connector system: deferred.** Deliver automatically laid-out images with editable data tables and explicit regeneration requirements. Native node editing and other network types require separate implementation.

## Verification

The [construction-runtime test suite](../../../../packages/construction/construction-runtime/tests/) (135 tests) pins the file tools, mechanical split, decimal cost engine across the four variants, CPM calculation, task-binding denials, the skill-command entries, and the Python worker protocol, including the fixed cost and schedule fixtures. The [ui-construction-gantt test suite](../../../../packages/client/ui-construction-gantt/tests/) (103 tests) pins the scenario fold, chart options, and rendering, including the 105-task readability fixture at 420px and 720px sidebar widths and fullscreen. [Loader tests](../../../../apps/cli/tests/construction-config.spec.ts) validate the example composition, and [boot profile tests](../../../../packages/boot/app-boot/tests/profile.spec.ts) pin the shipped `construction` profile template. Three keyless recorded-session scenarios — [construction-cost-calculate](../../../../snapshots/session/construction-cost-calculate/), [construction-schedule-present](../../../../snapshots/session/construction-schedule-present/), and [construction-task-denial](../../../../snapshots/session/construction-task-denial/) — replay the shipped tools through the headless profile. The bilingual README pairs with their consistency records, the per-file coverage gate on the new package sources, and the `verify-package-*` gates pass for all three packages.

## Consequences

Each Skill ships as its `SKILL.md`, output templates and normal/exceptional de-identified fixtures; the four-class fixture matrix per costing variant, the per-Skill field dictionary, the standalone per-Skill binding declaration and standalone validation-rules files remain this plan's to deliver. DSH interfaces are pre-stable; MCP, guards, Skill discovery, multi-session sidebar behavior and unload are retested before any DSH upgrade. Business task bindings do not replace operating-system isolation or enterprise authorization. Standards retrieval does not decide professional applicability, and safety, quality, costing or schedule outputs do not automatically become approved records. When a deferred item graduates into a release, the same change updates the full plan so the two notes stay consistent.

## References

Repository links identify current files. External links are official project repositories or documentation and support selection decisions rather than claims of completed integration tests.

[R2]: ../../../../AGENTS.md

[R3]: ../../../../pnpm-workspace.yaml

[R4]: ../../../../packages/mcp/mcp-client/src/index.ts

[R5]: ../../../../packages/core/tools/README.md

[R6]: ../../../../packages/skill/skill-filesystem/src/index.ts

[R7]: ../../../../packages/client/ui-sidebar-right/README.md

[R10]: ../../../../packages/AGENTS.md

[E1]: https://github.com/py-pdf/pypdf

[E2]: https://github.com/jsvine/pdfplumber

[E3]: https://github.com/pypdfium2-team/pypdfium2

[E4]: https://openpyxl.readthedocs.io/en/stable/simple_formulae.html

[E5]: https://github.com/frappe/gantt

[E6]: https://graphviz.org/docs/layouts/dot/

[E7]: https://github.com/opendatalab/MinerU
