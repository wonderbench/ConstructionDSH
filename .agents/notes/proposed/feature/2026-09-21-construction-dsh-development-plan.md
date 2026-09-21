# Agent Note: ConstructionDSH first-release development plan

Status: proposed

English | [中文](2026-09-21-construction-dsh-development-plan.zh.md)

## Problem

Engineering users need one conversation for Word, PDF and Excel inputs, on-demand standards retrieval, and safety, quality, costing and scheduling work. The first-release risks are incomplete extraction, incorrect tool selection, inconsistent monetary or date conventions, and results that cannot be checked against their sources.

This proposal prioritizes completion over premature sophistication. Reuse DSH and maintained file libraries to deliver verifiable document workflows and engineering outputs, rather than a complete construction-management platform. Later clarifications supersede earlier discussion; this document is the design authority for this delivery scope and its acceptance criteria.

## Proposal

Document version: 1.0. Review date: 2026-09-21. Target repository: `wonderbench/ConstructionDSH`; reviewed branch: `master`; reviewed version: `0.1.6-alpha.2`. The repository [package.json][R1] owns the runtime and version declarations. `Status: proposed` means that implementation remains outstanding, not that the design is unfinished.

**Deliver on-demand standards RAG, shared file tools, four engineering business Skills, a separate drawing-splitting workflow, reproducible cost and schedule calculations, sidebar Gantt charts, and Excel schedule-network files requested by the user.**

### Frozen scope

| ID | Required first-release delivery | Excluded or deferred |
|---|---|---|
| F1 | MCP access to the existing engineering-standards RAG alongside native web search | Rebuilding RAG, mandatory retrieval, automatic ingestion of project files |
| F2 | Shared Word, Excel and lightweight PDF adapters with source locations | Lossless conversion of every legacy format and complex object |
| F3 | A separate workflow for splitting multiple long design PDFs, using local MinerU when needed | Drawing review, quantity takeoff, summaries, change detection, automatic ingestion |
| F4 | Safety, quality, costing and scheduling Skills bound to tools | Parallel multi-agent orchestration and domain microservices |
| F5 | User-data-based unit rates, tender checks, variation valuation and settlement differences | National quota databases, automatic pricing, tender submission or settlement approval |
| F6 | Gantt charts generated from analysis and calculation, shown in the sidebar | Reconstructing imported Gantt images, drag scheduling, advanced resource optimization |
| F7 | On-demand Excel activity-on-node logical network files | Sidebar networks, activity-on-arrow or time-scaled networks, native draggable Excel nodes |
| F8 | Smart-site/BIM adapter interfaces, authorization fields and Mock tests | Live platform writes, equipment control and comprehensive integration |

Use one primary agent and sequential task stages. The four business Skills are `construction-safety`, `construction-quality`, `construction-cost` and `construction-schedule`; add the `construction-drawing-split` tool workflow separately. Ordinary document reading is not another engineering business agent.

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

Use the repository plugin, Profile and Bundle mechanisms. Do not modify `agent-loop` or add a Node application entrypoint that bypasses `dsh`. Proposed package locations match `packages/*/*`; implementation must also register dependencies, compiler entries, documentation and tests rather than merely creating directories. [R2] [R3] [R10]

| Proposed location | Responsibility |
|---|---|
| `packages/construction/construction-runtime/` | Host tools, task binding, document/cost/schedule modules and MinerU adapter; fixed Python scripts and locked dependencies live in package assets |
| `packages/construction/construction-client/` | Engineering result cards, Gantt sidebar, status presentation and localized copy |
| `packages/bundle/construction/` | Explicit engineering composition without changing the capabilities of upstream default Profiles |
| `apps/cli/config/examples/construction.overlay.yml` | An engineering overlay using existing launch paths; actual fields require Loader tests |
| Package `tests/` and Skill asset directories | Templates, input/output definitions, normal fixtures, exceptional fixtures and regression tests |

The existing `packages/schedule/` group handles scheduled agent follow-ups, not construction scheduling. Keep construction schedule calculations in the new construction module. [R2]

The first release is one engineering feature set, not six services. Internal packages follow repository naming checks and remain private; do not publish them under the upstream organization namespace. Fixed tools run the Python document worker through host-managed subprocesses. Do not repurpose the repository Python SDK or expose arbitrary Python or shell execution to the model.

Every new tool name, task-binding field and result format in this proposal is an interface to implement. Only DSH interfaces supported by repository references are verified existing capabilities. Validate configuration with schemas; file-size, timeout, page-batch and chart-size limits are deployment settings rather than hardcoded policy.

## Standards RAG and web search

Keep engineering standards in the existing RAG. The target read-only operations are `standards_search` and `standards_read`: retrieve clauses, then read a selected clause with necessary context. Map these to the actual service through the existing MCP client rather than rebuilding the knowledge base. DSH namespaces MCP tools by server; use only transports and configuration fields accepted by the client source. [R4]

Retain `web_search` and `web_fetch`; do not install RAG as a replacement web-search provider. Standards, current attachments and public web information have distinct entrypoints. Rewriting, calculations with sufficient inputs and drawing splitting do not require retrieval. Public updates may be checked online, but internal attachment content must not be sent to public services automatically.

Return the standard title, identifier, version, clause, text and source location. Report jurisdiction, discipline and validity only when available; otherwise mark them unknown. A match does not establish applicability; report insufficient evidence when necessary. Return small excerpts before expanding. Registered schemas still consume context, so the first release promises neither zero token competition nor a dynamic retrieval-routing system.

## Shared file tools and input quality

### Separate originals, reading content and calculation data

Preserve originals read-only. Reading content retains sections, paragraphs, tables and image references; calculation data retains field types, units, values, formulas and source locations. Do not convert every file to Markdown before calculating. Cache by content hash, parser version and parameters, isolated by project/workspace; changed content requires new processing.

Use a common `SourceRef`: original file, one-based page and available region for PDF; sheet and cell range for Excel; section path, paragraph or table location for Word. Do not invent Word page numbers without pagination or exact PDF regions from plain-text extraction. Distinguish extracted, calculated, inferred and human-confirmed values.

| Format | First-release route | Quality requirements |
|---|---|---|
| `.docx` | Native OOXML/Word adapter | Preserve body/table order; check headings, merged/nested tables and headers/footers; report tracked changes, comments or unsupported objects rather than silently omitting them |
| `.xlsx` | Native workbook adapter | Retain sheets, headers, merges, hidden content, formulas and cached values; do not substitute OCR or PDF conversion |
| `.pdf` | Lightweight PDF module | Read pages, text, regions or tables on demand; drawing splitting has a separate entrypoint |
| `.doc`, `.xls` | Separate compatibility adapter interfaces | Target text/table import; request a converted copy when an adapter is unavailable or fidelity is insufficient |
| Encrypted, macro-enabled or damaged files | Inspect, then explicitly reject or report handling requirements | No password cracking, macro execution or empty results reported as success |

Map workbook fields before calculation. Keep BOQ codes as text; blanks are not zero. Distinguish currency scales, percentages from fractions, and calendar from working days. Expand merged values only within identified ranges, and do not add subtotals to their underlying detail again. Ask only for ambiguous mappings that affect the result, not a complete reformatting of the source.

openpyxl does not evaluate formulas. [E4] Retain formulas and available cached values without calling the cache a fresh recalculation. Recompute authoritative business amounts with the supported deterministic calculator; flag unverifiable external links or complex formulas. Export new files rather than overwriting originals, and write user-provided strings safely as text instead of accidentally creating formulas from prefixes such as `=`.

Return explicit states such as `complete`, `partial`, `needs_review` and `failed`, with requested coverage, actual coverage and warnings. Critical omissions in text, tables or amounts must not feed an apparently complete final calculation. Structural validity does not establish layout, semantic or formula correctness.

## Two PDF routes

### Ordinary documents: lightweight first

Ordinary contracts, reports, plans, notices and BOQs use lightweight parsing. File count, page count or lightweight extraction failure must not automatically select MinerU. Explicit mechanical splitting by page range or one file per page uses lightweight page operations without a content model.

| Dependency | Fixed responsibility | Selection basis |
|---|---|---|
| pypdf | Inspection, basic text and splitting by copying original PDF pages | Maintained page operations instead of a custom PDF engine [E1] |
| pdfplumber | Positioned text and table extraction | Designed for PDFs with text layers; not an OCR engine [E2] |
| pypdfium2 | Rendering selected pages/regions and checking split-page appearance | Dedicated page rendering [E3] |
| Local MinerU | Structured decomposition required by the drawing workflow | Thin adapter around the existing installation, never a fallback for ordinary PDFs |

The tool chooses its parser internally; the model does not combine independent library outputs arbitrarily. If basic reading produces no usable text, return `needs_visual_read` and render selected pages for an authorized vision model when available. Batch OCR is a separate optional capability; the first release adds no OCR service and never silently switches to MinerU.

Process pages in bounded batches with memory, time and output limits. Distinguish scanned pages, unreadable text, broken tables and encryption instead of reporting generic success. Do not process an entire document for one clause or claim a complete review from partial matches.

### Drawing splitting: separate entrypoint and explicit completion

Allow this route only for an explicit request to decompose multiple long engineering-design PDFs or a trusted drawing-split UI action. Inspect originals and splitting rules, call MinerU when structured output is needed, then use pypdf to copy original pages into split PDFs. MinerU content parsing and PDF page splitting are separate operations with separate recorded outcomes. [E1] [E7]

Support grouping by source file, explicit page ranges, one page per output and existing bookmark boundaries. Without reliable boundaries, preserve original pages or explicit ranges instead of guessing discipline volumes. Do not automatically crop multiple details from one page, rasterize originals for rewriting, or alter page size, rotation or scale. A split file must not claim that a source digital signature remains valid.

Deliver split PDFs, `index.json`, a readable index table and a processing report. Record source hashes, original page numbers, output locations, parser version and coverage. Existing MinerU structured output may accompany the files, but no automatic summaries, reviews, takeoff, change detection, standards retrieval or ingestion follow. Wait for a new user request after delivery.

Qualify one installed MinerU version and its actual endpoints for the first release rather than promising every version. Do not copy an unverified route such as `/file_parse`. Submission returns an application `job_id` promptly; separate calls obtain status/results or request cancellation. A timeout does not prove the worker stopped. DSH MCP tool timeouts do not replace persistent job management. [R4]

Persist job state in the project workspace, including a remote MinerU job identifier when provided. Query the original job when recovery is supported; otherwise report interruption and require a retry rather than silently resubmitting. Retry only known failed ranges. Coverage checks verify each requested page against its expected output, separately identifying intentional overlapping ranges.

## Skill content and tool binding

### Content for the four business Skills

| Skill | Required workflow | Outputs and prohibited behavior |
|---|---|---|
| `construction-safety` | Establish activity/location and coverage; retrieve standards when needed; compare risk evidence, controls and missing inputs | Issues, evidence, source locations, proposed controls and unresolved items; no work permits or fabricated safety approval |
| `construction-quality` | Identify inspection objects, samples, units and requirements; check measured data against material/test records | Missing evidence, contradictions, nonconformities and review actions; no passing result without measurements |
| `construction-cost` | Select unit-rate/tender/variation/settlement workflow; identify file roles; map BOQ fields; calculate or compare | Analysis/difference tables and adopted evidence; no invented prices or unauthorized approval/submission |
| `construction-schedule` | Extract or create tasks, durations, relationships and calendars; validate assumptions; calculate scenarios | Schedule results, duration analysis, Gantt and requested networks; no invented critical path when logic is missing |

Deliver each Skill with `SKILL.md`, a binding declaration, field dictionary, output templates, validation rules and fixtures. Safety and quality each include at least one de-identified real workflow; costing covers its four variants; scheduling covers creation and revision. Each variant includes normal, missing-input, malformed-format and conflicting-evidence fixtures with expectations reviewed by domain professionals.

Keep standards text in RAG; Skills contain procedures rather than duplicate standards. Business Skills interpret fields, while shared adapters read file structures. Release instructions, templates and tests together, and distinguish facts, recommendations, assumptions and unresolved items.

### Enforce bindings in software, not prompts

Native Skill invocation controls are not tool authorization. Add an engineering task manager with a host-owned `TaskBinding` containing task identity, Skill version, stage, permitted tools and input types. Adding an `allowed-tools` field to `SKILL.md` must not be treated as DSH-enforced authorization. [R5] [R6]

Use `ctx.tools.restrict(filter)` to narrow inherited global-tool visibility and `ctx.tools.guard(...)` for denials that later listeners cannot override. The repository explicitly leaves scoped registrations visible under restrict, so the engineering guard and tool executor must also check the active task, file access and input format. [R5]

The engineering entrypoint creates a trusted task and loads its Skill before exposing bound tools in the next model step. Stage changes wait for the current call batch to settle and execute against a binding snapshot; do not change or accumulate authority during parallel calls in one batch. The model may propose declared task types, not arbitrary tool sets or self-issued `approved=true`; drawing mode additionally requires explicit user intent.

Engineering mode disables model-facing arbitrary shell/code, generic HTTP, plugin installation and capability escalation; fixed workers remain executable through approved tools. Apply the same checks to local tools, tools rediscovered after MCP reconnection, direct calls and later subcalls. Keep the development Profile separate; do not claim these business guards isolate administrators, user terminals or people with host access.

Load engineering Skills from controlled read-only sources. The local provider supports `includeDefaultRoots: false` with explicit directories to prevent workspace-name overrides; inspect other mounted providers as well because this setting does not disable every provider. Release registrations, listeners, connections and active authority on unload or task transition; historical Skill text must not restore permissions. [R6]

### Model tools and binding inventory

The following proposed model tools use underscore names. Internal module names may contain dots, but unverified names such as `pdf.read` must not be used directly as model tools. Share common implementations while preventing cross-scenario use of business tools.

| Group | Proposed entrypoints | Allowed tasks |
|---|---|---|
| Read-only files | `construction_files_inspect`, `construction_files_read`, `construction_files_search` | Ordinary reading and four business Skills; dispatch to Word/Excel/lightweight PDF by parameters, never implicitly to MinerU |
| Mechanical splitting | `construction_pdf_split` | Explicit page-splitting requests or the drawing workflow |
| Drawing jobs | `construction_drawing_submit`, `construction_drawing_status`, `construction_drawing_result`, `construction_drawing_cancel` | Drawing splitting only |
| Costing | `construction_cost_calculate`, `construction_cost_compare`, `construction_cost_export` | Costing only |
| Scheduling | `construction_schedule_calculate`, `construction_schedule_present`, `construction_schedule_export_network` | Scheduling only; network export additionally requires a user request |
| Reports | `construction_report_export` | Templates and result types permitted by the active business binding |
| Standards and public web | Read-only standards tools under their actual MCP namespace, plus `web_search` and `web_fetch` | Business tasks that need them; not automatic follow-on drawing actions |

## Costing implementation

The four costing scenarios share item matching and deterministic calculation rather than four pricing systems. Inputs may combine contract Word documents, variation PDFs, BOQ and tender workbooks. Assign business roles to files before confirming item fields, quantities, prices, fee bases, tax conventions and rounding.

Normalize labor, material and equipment consumption per BOQ measurement unit, calculate `resource_cost = sum(consumption * unit_price)`, then apply explicitly supplied fee rules. Use decimal or equivalent fixed-precision arithmetic. Fee composition and bases for overhead, profit, risk and tax must come from user inputs or explicit settings, not a purported universal national formula.

| Variant | Calculation or check | Output |
|---|---|---|
| Unit rate | Unit conversion, consumption, tax-inclusive/exclusive prices and explicit fee bases/rates | Rate build-up, expressions, calculated values and missing inputs |
| Tender pricing | BOQ matching, omissions/duplicates, descriptions/units and totals | Tender differences and items requiring confirmation |
| Variation valuation | Change evidence, quantity deltas and applicable contract rates or explicit new build-up method | Valuation details, method and evidence |
| Settlement review | Contract/change/settlement quantities, rates, amounts and duplicate inclusion | Candidate increases/decreases, evidence and unresolved items |

Retain source data, mappings, calculation details, difference totals and unresolved items. Quantities, prices, fees and expressions must be traceable. One BOQ item may map to several operations; name similarity alone does not establish equivalence. Do not fill missing prices from model memory. Ambiguous evidence produces a draft, not a final determination. Authoritative exported amounts come from the frozen `CostResult`, not unevaluated Excel formula caches.

## Schedule calculation and outputs

### Calculate before drawing

Requests and attachments are analysis inputs, not Gantt charts to import unchanged. Build tasks, durations, dependencies, calendars, milestones and constraints, then calculate a `ScheduleResult`. Do not implement colored-cell recognition or PDF Gantt reconstruction; existing schedule tables are only task-data sources.

Initially support one project working calendar, whole-working-day durations, finish-to-start (FS) links with explicit nonnegative working-day lags, zero-duration milestones, specified start/finish constraints and locked completed tasks. Leads, SS/FF/SF links, mixed resource calendars and advanced remaining-duration treatment are deferred; preserve and report unsupported inputs rather than converting them silently to FS.

Validate unique task IDs, referential completeness, cycles, duration/date units, constraint conflicts and missing fields. With complete supported logic, compute forward/backward passes, floats and critical paths; with dates only, report date/milestone differences without claiming network analysis. Model remaining work on in-progress tasks as separately confirmed unscheduled work so historical actual progress is not rescheduled.

Use consistent working-time boundaries internally: inclusive start and exclusive finish boundary. For a positive-duration task, display the last working date before that boundary; a zero-duration milestone is an instant. Calculate in the project calendar without browser-timezone shifts. Convert component date conventions through an adapter and test single-day, weekend-spanning, year-boundary and milestone fixtures.

A revision creates a new scenario without overwriting the baseline or completed tasks. Report duration changes, affected tasks, relationship changes, assumptions and unresolved conflicts. Resource suggestions are not validated optimal solutions. Duration calculations do not decide contractual responsibility, extensions or claims.

### Sidebar Gantt chart

Use a fixed client component consuming `ScheduleResult`. Adopt Frappe Gantt with adapters for the DSH theme, task-name area and scenario selection. [E5] Do not let the model generate arbitrary HTML/JavaScript charts or allow the chart component to reschedule business dates. Default to read-only display without drag scheduling.

Integrate through `ctx.sidebarRightTabs.register(...)`, the `sidebar.right.pane.tab` slot and `ctx.sidebarRight.openTab(...)`. These are client APIs, not model tools callable directly from the Host. The new `construction_schedule_present` returns a persisted result identifier and display metadata; the client result card opens the tab in the current session. Replaying history must not repeatedly reopen windows. [R7]

| UI element | First-release design and acceptance |
|---|---|
| Toolbar | One row for scenario, day/week/month, fit and fullscreen; no stacked control cards |
| Task area | Fixed names, truncation with expansion and exact row/bar alignment |
| Timeline | Default weekly scale, monthly scale for long plans, sticky header and no endlessly shrinking fonts |
| Styling | DSH theme variables and localized dictionaries; one primary color, neutral gray and limited warnings with text/icons |
| Space | Start with configurable 12–13px body text and 32–36px rows; compact/fullscreen mode rather than unusably thin charts |
| Updates | Refresh after a new calculation result; select previous scenarios; no cross-session data leakage |
| States | Separate empty, calculating, partial, unconfirmed-assumption and failure states |
| Tests | Check 420px/720px sidebars and fullscreen; long names, month boundaries, milestones and at least 100 tasks without obstruction |

### Excel schedule-network file

Export only when the user requests a network. The first release produces an activity-on-node logical diagram from the same `ScheduleResult` version as the Gantt chart. Do not invent a network without reliable dependencies. Explicitly report activity-on-arrow and time-scaled networks as unsupported rather than mislabeling an ordinary relationship graph.

Use Graphviz `dot` for layered directed-graph layout and openpyxl to write images and data into the workbook; Graphviz handles layout, not scheduling. [E4] [E6] Include network, tasks, relationships and notes sheets. The first-release diagram is a high-resolution PNG. Data cells are editable, but nodes are not native draggable Excel shapes; regenerate the diagram after editing data.

Lay out left to right with consistent node dimensions, spacing and fonts, wrapped names and stable IDs. Keep essential information in the diagram and detailed dates/parameters in the task table. Critical-task emphasis comes from calculation results and includes line weight or text legends, not color alone. Escape external labels as text; do not permit Graphviz labels to inject file paths or links.

Default to landscape printing. Determine page capacity from readable text before choosing paper and pagination; never squeeze a large network onto one page. Split by stage/subnetwork into pages or sheets, retaining target IDs and sheet references for every cross-page edge. Check Chinese glyphs, clipping, edges through nodes, print bounds and page breaks in actual Excel and WPS fixtures. Document acceptable rendering differences rather than promising identical behavior.

## Data, interfaces and operational constraints

Persist `schema_version`, `task_id`, input hashes, rule/calculator versions, source references, status, warnings and artifact identifiers. Define separate `DocumentResult`, `DrawingSplitResult`, `CostResult` and `ScheduleResult` formats. Exporters accept only their declared type/version; cross-domain handoff requires an explicit conversion rather than treating arbitrary JSON as interchangeable.

Write artifacts to a dedicated workspace directory, validate temporary files, then publish completion. Published scenarios receive new versions rather than overwrite. Session logs retain model-visible calls, summaries and locations while files hold large data. Reuse ordinary tool results and existing file delivery rather than introducing a session-storage format for charts or using browser localStorage as authoritative business storage. [R2] [R7]

Resolve `file_id` to an authorized workspace and check traversal, symlinks, size, archive expansion and media type. Parsing workers have no default public-network access, and credentials stay out of prompts/results. Project or RAG content may still reach the selected model, so local MinerU/RAG does not establish an end-to-end local system; deployment must declare model endpoints and allowed outbound data classes.

Treat attachment text, standards excerpts and MCP responses as data: they cannot activate Skills, change task bindings or elevate privileges. Recheck workspace ownership for task and drawing job identifiers on every read or cancellation.

Minimum dependencies are repository-declared Node/pnpm, a qualified Python environment, pinned file libraries, Graphviz for network export and on-demand access to RAG/MinerU. Pin versions that pass fixtures. Startup diagnostics distinguish required and optional components: offline MinerU must not block ordinary PDFs, and missing Graphviz disables only network export.

## Smart-site and BIM extension preparation

Retain the original platform-integration requirement without making live platforms prerequisites. Define minimal project/element/task queries, issue proposals and approved submission interfaces with de-identified Mocks and input/output tests. Adapters are disabled by default and must not return fabricated success without real credentials.

Include `project_id`, object IDs, source platform, model/record versions, `expected_version` and idempotency keys. Live integration must verify user, project and operation authority server-side; the model cannot declare its own identity or approve its writes. The first release performs no production writes, arbitrary SQL/HTTP access or machinery/safety-interlock control.

## Implementation order and deliverables

| Stage | Work package | Exit condition |
|---|---|---|
| M0 | Engineering composition, task binding, result types, fixtures and empty UI states | Valid/unauthorized-call tests run without cross-domain tool exposure |
| M1 | Word/Excel/lightweight PDF, RAG integration, safety and quality Skills | Mixed inputs work with optional standards retrieval, clear sources and missing-data reports |
| M2 | Drawing entrypoint, thin MinerU adapter, split index and job recovery | Ordinary PDFs never trigger MinerU; drawing coverage is correct and delivery ends the workflow |
| M3 | Four costing workflows, mapping/calculation and templates | Fixed examples reproduce quantities, rates and fees without invented inputs |
| M4 | Task modeling, scheduling, sidebar Gantt and Excel networks | Both diagrams share one result, dates agree and layout/session-isolation tests pass |
| M5 | Integration regression, dependency packaging notes and platform Mocks | Documentation, dependency diagnostics, failure handling and first-release acceptance pass |

Develop the UI in parallel against fixed `ScheduleResult` fixtures. Each stage delivers an executable end-to-end slice, not a national rules database, elaborate service infrastructure or complete BIM platform. Deliver Skill content, templates, configuration examples, dependency locks, fixtures and usage documentation with the code.

## Alternatives considered

**MinerU for every PDF: rejected.** It conflicts with lightweight daily processing and the dedicated drawing-split boundary, and makes an optional local service mandatory for every file task.

**A custom PDF engine or large document platform: rejected.** pypdf, pdfplumber and pypdfium2 cover the required baseline. Own adapters, source locations, quality checks and access rules instead; review dependency licensing and distribution notices before packaging. [E1] [E2] [E3]

**Copying file tools per Skill or using prompt-only allowlists: rejected.** Duplication multiplies fixes, while prose cannot block execution. Share implementations and enforce task bindings at execution.

**Importing existing Gantt graphics, drag editing and resource optimization in release one: rejected.** First establish task analysis, reproducible scheduling and fixed-component display. Conversational revisions create a new calculated version.

**A sidebar network editor or native Excel connector system: deferred.** Deliver automatically laid-out images with editable data tables and explicit regeneration requirements. Native node editing and other network types require separate implementation.

## Acceptance criteria

The following are implementation acceptance tests, not functional tests already executed for this document. Prepare at least three normal and two exceptional de-identified fixtures per primary format, professionally reviewed expected cost/schedule values, and fixed-data UI screenshot comparisons.

| ID | Observable passing condition |
|---|---|
| A01 | One session can use standards RAG and native web independently without mandatory retrieval for ordinary editing |
| A02 | Key Word/Excel/PDF content has source locations; unprocessed ranges, revisions and formula-cache issues are visible |
| A03 | Multiple long ordinary PDFs, scanned ordinary PDFs and extraction failures never automatically invoke MinerU |
| A04 | Mechanical splitting avoids MinerU; drawing jobs operate within approved coverage with original-page mapping |
| A05 | Drawing completion triggers no automatic standards retrieval, summary, takeoff, review or ingestion |
| A06 | Safety/quality cannot use costing tools, costing cannot use drawing services, and stale task authority is denied |
| A07 | Scoped registrations, MCP reconnection, direct calls to old names and parallel stage changes cannot bypass bindings |
| A08 | Normal, missing-input, malformed-format and conflicting-evidence fixtures produce expected outputs or denials for each Skill |
| A09 | Fixed rate, variation and settlement examples match the declared precision without blank-value or subtotal errors |
| A10 | Single-day, weekend/year-boundary, milestone, cycle and conflicting-constraint cases calculate or reject as expected |
| A11 | Missing relationships produce no false critical path and unsupported relations are not rewritten as FS |
| A12 | Gantt charts derive from calculations, remain readable in sidebar/fullscreen and isolate sessions/scenarios across refresh |
| A13 | Network export requires a request, shares the Gantt result version and preserves cross-page dependencies |
| A14 | Chinese network labels and print output are readable; image-editing and regeneration limitations are explicit |
| A15 | Path traversal, escaping symlinks, macros, malicious labels and oversized inputs are rejected or safely handled |
| A16 | Missing MinerU/Graphviz does not break unrelated capabilities; cancellation, retries and partial failures never report false success |
| A17 | Unload, HMR and real Loader-composition tests pass without leaked registrations, listeners or subprocesses |
| A18 | Smart-site/BIM Mocks are distinguished from production writes and absent configuration never reports success |

## Repository review and this submission

This static design review uses source and maintained documentation from the target repository. Archived notes are not treated as current implementation, and previously proposed tools are not presented as existing APIs. The following corrections are incorporated.

| Review item | Corrected decision | Evidence/reason |
|---|---|---|
| Document placement | Proposed Agent Note with English/Chinese files and consistency record, not shipped-feature documentation | Proposal and bilingual rules [R8] [R9] |
| Package structure | Three engineering packages using `packages/*/*` and existing `dsh` launch paths | Workspace and application rules [R2] [R3] [R10] |
| Tool binding | restrict narrows visibility; guard and executor deny calls, including scoped tools | Current tool registry documentation [R5] |
| Skill sources | Controlled providers; invocation metadata is not an authorization allowlist | Current filesystem provider source [R6] |
| MCP and long jobs | Real connection fields with independent application job state rather than assuming call timeouts manage drawing jobs | MCP configuration and call responsibilities [R4] |
| Sidebar integration | Host returns result metadata and Client opens tabs without cross-process sidebar calls | Current sidebar documentation [R7] |
| Dates and drawing | One schedule calculator; Gantt/Excel adapters share result versions and date boundaries | Avoid divergent calculations and rendering conventions |
| Excel network | Embedded PNG and data tables with explicit non-draggable/non-refreshing limitations | Align first-release implementation with user expectations |
| Drawing boundary | No ordinary-PDF MinerU fallback; separate content extraction from page splitting and stop after delivery | Final user clarification and PDF-library capabilities [E1] |

This submission contains design documentation, not feature code. Review covers scope, repository interfaces, failure handling and testable acceptance. Local checks cover only new-document formatting, bilingual structure, consistency hashes, the reference inventory and requirement coverage; they do not establish a successful DSH build or runtime test.

The execution environment cannot clone the full repository over the network, so source was read through the GitHub connection. Full-repository `pnpm run doc-sync`, lint, builds, Loader tests, MinerU/RAG integration and real Excel/WPS visual acceptance were not run. Execute them in a dependency-equipped environment or CI and do not mark them passed before results exist. Push this documentation to a separate branch; merging into the default branch remains subject to repository checks. [R11]

## Risks

DSH interfaces are pre-stable. Develop against the reviewed version rather than automatically following upstream. Before upgrading, retest MCP, guards, Skill discovery, multi-session sidebar behavior and unload. Business task bindings do not replace operating-system isolation or enterprise authorization.

Before implementation, obtain the installed MinerU version/endpoint, actual RAG tool schema, target operating system, permitted model data flows and de-identified fixture set. These qualify integration and tests without expanding scope. Do not promise unknown-format coverage, drawing-recognition accuracy or resource optimality; declare support only after representative fixtures pass.

Pin dependencies and review licensing, native binaries and font notices during packaging. This proposal includes no third-party font files, credentials or original project data. Standards retrieval does not decide professional applicability, and safety, quality, costing or schedule outputs do not automatically become approved records.

## References

Repository links identify current files; the reviewed version is stated above. External links are official project repositories or documentation and support selection decisions rather than claims of completed integration tests.

[R1]: ../../../../package.json

[R2]: ../../../../AGENTS.md

[R3]: ../../../../pnpm-workspace.yaml

[R4]: ../../../../packages/mcp/mcp-client/src/index.ts

[R5]: ../../../../packages/core/tools/README.md

[R6]: ../../../../packages/skill/skill-filesystem/src/index.ts

[R7]: ../../../../packages/client/ui-sidebar-right/README.md

[R8]: ../../README.md

[R9]: ../../../../docs/i18n/README.md

[R10]: ../../../../packages/AGENTS.md

[R11]: ../../../skills/dsh-pre-push-checks/SKILL.md

[E1]: https://github.com/py-pdf/pypdf

[E2]: https://github.com/jsvine/pdfplumber

[E3]: https://github.com/pypdfium2-team/pypdfium2

[E4]: https://openpyxl.readthedocs.io/en/stable/simple_formulae.html

[E5]: https://github.com/frappe/gantt

[E6]: https://graphviz.org/docs/layouts/dot/

[E7]: https://github.com/opendatalab/MinerU
