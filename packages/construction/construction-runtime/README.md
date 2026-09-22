---
description: "Construction engineering Host tools: shared Word/Excel/PDF reading with source references, mechanical PDF splitting, deterministic costing, CPM scheduling, and the four business Skills with lightweight task checks."
kind: "package-reference"
---

# @deepseek-ai/dsh-construction-runtime

English | [中文](README.zh.md)

## Summary

Mount `dsh-construction-runtime` to give one agent read-only Word/Excel/PDF file tools with coverage states and source references, mechanical drawing-PDF splitting (`construction_pdf_split`), deterministic decimal costing, pure-date CPM scheduling, and task-filtered report export. It bundles the four business Skills (`construction-safety`, `construction-quality`, `construction-cost`, `construction-schedule`) as read-only provider content and mints a lightweight task binding when one loads. Two config gates, `drawing` and `business` (both default on), split the suite into the drawing surface (file tools, PDF split) and the business surface (skills, commands, costing, scheduling, reports, task guidance); business tools deny cross-domain and stale task calls through the executor.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount `dsh-construction-runtime` in any composition that already provides `tools`, `fs`, and `systemPrompt`; mounting `dsh-skill` alongside registers the four bundled business Skills. The pinned Python workers in `assets/scripts/` need one qualified interpreter (`py` on Windows, `python3` elsewhere, or an explicit `pythonPath`).

### Minimal composition

```yaml
- name: '@deepseek-ai/dsh-tools'
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-construction-runtime'
```

### The tools

| Group | Tool | Active task |
|---|---|---|
| Read-only files | `construction_files_inspect` | none required |
| Read-only files | `construction_files_read` | none required |
| Read-only files | `construction_files_search` | none required |
| Mechanical splitting | `construction_pdf_split` | none required |
| Costing | `construction_cost_calculate` | `cost` |
| Costing | `construction_cost_compare` | `cost` |
| Costing | `construction_cost_export` | `cost` |
| Scheduling | `construction_schedule_calculate` | `schedule` |
| Scheduling | `construction_schedule_present` | `schedule` |
| Reports | `construction_report_export` | any business task |

Loading one of the four business Skills with the `skill` tool (or a user-explicit skill invocation) starts the matching task; business tools verify the active task type before executing, and a newer invocation supersedes the older binding.

### Composer-menu commands

When both a command registry and a skill registry are composed and the business surface is enabled, the runtime registers one command per bundled business Skill (`construction-safety`, `construction-quality`, `construction-cost`, `construction-schedule`), derived from the same SKILL.md frontmatter the skills provider lists, under a stable `definitionId` per Skill so capable clients can localize the row regardless of its catalog copy. Each command declares argument input and advertises the Functions menu section: picking the row claims the composer draft (`/name ` kept for arguments) like `/goal` and `/plan`, and submitting the claim executes the handler, which enqueues the resulting `/name [args]` user line. Menu and keyboard paths converge on one injection pipeline: the pre-step skill-invocation boundary loads the Skill, mints its task binding, appends the rendered `<skill_content>` body, and keeps any typed arguments as trailing user text.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `pythonPath` | platform launcher | Interpreter or launcher for the pinned Python workers. |
| `scriptTimeoutMs` | `60000` | Worker timeout before the child is killed. |
| `maxFileBytes` | `20971520` | Maximum accepted input file size in bytes. |
| `maxOutputChars` | `200000` | Maximum worker stdout characters accepted. |
| `costPrecision` | `2` | Declared cost output precision in decimal places. |
| `artifactsDir` | `.dsh/construction` | Artifacts directory, relative to the session workspace. |
| `weeklyRestDays` | `[6, 0]` | Default weekly rest days for schedule calculations. |
| `holidays` | `[]` | Default holiday ISO dates for schedule calculations. |
| `skillsProviderName` | `construction` | Name of the bundled read-only skills provider. |
| `drawing` | `true` | Register the drawing surface: the read-only file tools and `construction_pdf_split`. |
| `business` | `true` | Register the business surface: the bundled skills provider, the composer commands, the costing, scheduling, and report tools, and the task-binding prompt section. |
| `assetRoot` | packaged `assets/` | Absolute assets directory for relocated applications. |

Invalid configuration fails loud at load; disabling both surfaces is rejected, and each surface requires only its own assets (the worker scripts for `drawing`, the four `SKILL.md` files for `business`). A drawing-only mount (`business: false`) registers no skill provider, no composer commands, no business tools, and no task-binding section; a business-only mount (`drawing: false`) registers no file tools and renders task-binding guidance without the file-tool paragraph.

### Failures and recovery

Worker failures, encrypted PDFs, and damaged packages become explicit result states or `Error: <message>` tool failures — never silent success. Read-only refusals (`unsupported`, `rejected`, `failed` coverage states) carry the reason in `errors`; business-tool denials are ordinary tool errors the model can read and recover from by loading the right Skill.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the package realizes the behavior above; the observable contract is covered in [Use this package](#use-this-package).

### Design concept

One plugin assembles four capability seams: read-only file tools backed by pinned Python workers, a deterministic decimal cost engine, a pure-date CPM engine, and a lightweight task-binding store. Every model-visible value is a frozen result (`DocumentResult`, `SplitResult`, `CostResult`, `ScheduleResult`) with explicit coverage or unresolved states, so a result never claims more than its inputs support. Path screening (workspace confinement through `ctx.fs` realpath containment, size caps, extension screening for legacy and macro-enabled formats) runs before any worker opens a file, and artifacts are written under the configured directory inside the session workspace through the same containment check.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config validation, asset checks, tool and provider registration, binding listeners, system-prompt guidance. |
| [`src/types.ts`](src/types.ts) | Frozen result and input types (`DocumentResult`, `SplitResult`, `CostResult`, `ScheduleResult`, `DocumentSummaryResult`, `TaskBinding`). |
| [`src/python.ts`](src/python.ts) | The Python runner: job-file handoff, scrubbed environment, timeout and abort handling, structured error mapping. |
| [`src/tasks.ts`](src/tasks.ts) | The task binding store: minting, per-scope supersession, and the shared `requireTask` denial helper. |
| [`src/files.ts`](src/files.ts) | Shared path screening plus the three read-only file tools. |
| [`src/split.ts`](src/split.ts) | Mechanical PDF splitting with original-page mapping and the explicit unsupported status. |
| [`src/cost.ts`](src/cost.ts) | The decimal cost engine and the three costing tools. |
| [`src/schedule.ts`](src/schedule.ts) | The pure-date CPM engine, the presented-result store, and the two scheduling tools. |
| [`src/report.ts`](src/report.ts) | Task-filtered markdown report export; document-kind data is validated as a `DocumentSummaryResult`. |
| [`src/artifacts.ts`](src/artifacts.ts) | Shared workspace-artifacts path resolution. |
| [`assets/scripts/construction_read.py`](assets/scripts/construction_read.py) | Pinned Word/Excel/PDF reader worker (python-docx, openpyxl, pypdf). |
| [`assets/scripts/construction_pdf_split.py`](assets/scripts/construction_pdf_split.py) | Pinned pypdf page-copy splitting worker. |
| [`assets/skills/`](assets/skills/) | The four business Skills with fixtures and output templates. |
| — | No runtime invariant companion is published: task-binding denials and path screening execute inside the tool pipeline, whose model-visible results the tool tests already pin. |

### Task binding

A `TaskBinding` is minted when a business Skill body loads through the bundled provider's `get()` callback — the single point every invocation path (the model-facing `skill` tool and user-explicit invocation) passes through — and re-minted under the calling agent's scope when a successful `skill` tool result is observed on `tools/result`. One binding is active per scope; minting supersedes the previous one, so older task identifiers go stale. Business tools call the shared `requireTask` helper, which throws a model-facing denial (rendered as an ordinary tool error) for a missing task, a wrong task type, or a stale supplied identifier.

### Python worker protocol

The runner writes the JSON job to a temporary file, launches one pinned script with a scrubbed environment (PATH, SYSTEMROOT, `PYTHONIOENCODING=utf-8`, `PYTHONDONTWRITEBYTECODE=1`), enforces the configured timeout and the caller's abort signal by killing the child, and parses the single JSON result. Worker errors arrive as `{"error": {"code", "message"}}` with a nonzero exit and become `PythonJobError` with the worker's code preserved; read tools map them to failed-state results, and the split tool surfaces them as model-facing refusals.

### Cost engine

One item evaluation backs the four variants (`unit_rate`, `tender`, `variation`, `settlement`): resource lines are `consumption × unit_price` on decimal.js at the configured precision with ROUND_HALF_UP, explicit fee lines multiply a declared base by a declared rate, and the unit rate and amount carry per-line trace expressions. Blank inputs are unresolved items, never zeros; BOQ codes stay text; difference tables match by code and classify matched, price, quantity, one-sided, and unresolved rows. Rows classified `quantity_diff` or `price_diff` also carry `quantity_effect` — (comparedQuantity − baselineQuantity) × baseline unit rate — and `price_effect`, the remaining difference, so the two effects reconcile exactly with the row's `difference`.

### Schedule engine

All date arithmetic is integer arithmetic on ISO calendar dates — no `Date`, no timezone math. One working calendar (weekly rest days plus holidays) defines working time; durations and lags are whole working days on inclusive-start/exclusive-finish boundaries, and the displayed finish is the last working date before the finish boundary. Validation rejects duplicate ids, dangling references, cycles (naming the cycle), bad durations and lags, malformed dates, and constraint conflicts. Unsupported relations are reported in `links` and `unresolved`, never rewritten as finish-to-start; a critical path is claimed only when every task is anchored by supported logic or a start constraint.

</details>

<a id="further-exploration"></a>
## Further Exploration

The package-level contract is enough for most consumers; read these when you need the surrounding domain.

- [The minimal first-release scope note](../../../.agents/notes/implemented/feature/2026-09-21-construction-dsh-minimal-first-release.md) — the S1–S7 scope, tool inventory, and lightweight enforcement this package implements.
- [The full development plan](../../../.agents/notes/implemented/feature/2026-09-21-construction-dsh-development-plan.md) — retained design authority: source reference shapes, coverage states, decimal arithmetic, and working-day boundaries.
- [Adding a tool cookbook](../../../docs/cookbook/adding-a-tool.md) — the tool authoring contract these tools follow.
- [`dsh-tool-fs`](../../fs/tool-fs/README.md) — the workspace file-access and screening model this package builds on.
- [`dsh-skill-office`](../../skill/skill-office/README.md) — the Python-asset and bundled-skill pattern this package adapts.

<a id="model-experience"></a>
## Model Experience

### System prompt

#### What the model sees

One visibility-matched section, `construction:task-binding`, appears only when the business surface is enabled and one of its tools is visible to the calling scope; the drawing-only configuration registers no section.

##### Verbatim text for this field

```markdown
Construction engineering tools are available in this session.
The file tools construction_files_inspect, construction_files_read, and construction_files_search work without a business task and read Word, Excel, and PDF files with source references and coverage states; act on coverage warnings instead of assuming a file was fully read. construction_pdf_split splits an oversized or drawing-set PDF by page range, per page, or top-level bookmark so the file tools can read the parts; structured-decomposition modes return unsupported.
The business tools construction_cost_calculate, construction_cost_compare, construction_cost_export, construction_schedule_calculate, construction_schedule_present, and construction_report_export run only while a matching business task is active: load the construction-cost, construction-schedule, construction-safety, or construction-quality skill with the skill tool to start one. Loading a business skill supersedes the previous task, so older task ids stop working.
Never treat a blank cell or missing price as zero, and never invent rates, dates, or a critical path.
```

#### Token effect

Fixed per-request cost while the section is visible; restrictions that hide every construction tool remove the entire section.

#### KV Cache effect

Prefix-stable while the section text and visibility are unchanged; tool registration, disposal, or a scoped restriction may invalidate reuse from the first changed prompt token.

### Tool schemas

#### What the model sees

Each visible tool's exact name, description, and parameter schema; the ten tools are recorded in the generated [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-construction-runtime). Business tool descriptions state the required active task type, and the `task_id` parameter carries the binding identifier when the model supplies one.

#### Token effect

Fixed per-request cost proportional to the visible construction definitions; hiding tools removes their entire schema cost for that scope.

#### KV Cache effect

Prefix-stable while the visible definition set and order are unchanged; registration or disposal may invalidate reuse from the first changed schema token.

### File tool results

#### What the model sees

`construction_files_inspect`, `construction_files_read`, and `construction_files_search` return a `DocumentResult`: file identity with SHA-256, an explicit coverage state (`complete`, `partial`, `needs_review`, `failed`) with requested versus actual coverage and warnings, content (structure, blocks, cells, or pages), `source_refs` (one-based PDF pages, Excel sheet and cell range, or Word section path with paragraph or table location), and errors. Formula cells report the formula text and the producer-cached value with an explicit `formula_cache` state — the workers never evaluate formulas. Search results carry each match with its source reference; pages without extractable text are flagged `needs_visual_read`.

#### Token effect

Data-dependent and resent until compaction; truncated reads (`max_chars`) and capped cell output bound the retained content with explicit partial-coverage warnings.

#### KV Cache effect

Append-only; newly visible results follow the reusable request prefix.

### Cost and schedule results

#### What the model sees

`construction_cost_calculate` renders a compact analysis summary — variant, totals, one line per item with resource cost, unit rate, and amount, and unresolved notes — followed by the canonical frozen `CostResult` as indented JSON under the label `Frozen result JSON — pass it back verbatim to construction_cost_export, construction_cost_compare, or construction_report_export; never retype, round, or edit its values.` The model passes that JSON block back verbatim: it is the only surface carrying `schema_version`, `calculator_version`, per-item `trace`, and the other fields the downstream tools validate, and its `price_diff` and `quantity_diff` rows carry `quantity_effect` and `price_effect` strings that reconcile exactly with the row's `difference`. `construction_schedule_calculate` renders the same way — scenario, task table, critical path, assumptions, and unresolved notes — followed by the frozen `ScheduleResult` JSON labeled `Frozen result JSON — pass it back verbatim to construction_schedule_present or construction_report_export; never retype, round, or edit its values.` `construction_schedule_present` returns a `result_id` (the SHA-256 of the canonical result) with scenario metadata and a `gantt` hint that client charts fold from the logged tool result.

#### Token effect

Data-dependent and proportional to item and task counts; both engines emit traceable, compact tables rather than prose.

#### KV Cache effect

Append-only for new calculations; re-presenting an identical scenario reuses the same result identifier.

### Document summary results

#### What the model sees

`construction_report_export` accepts `kind: "document"` data only as a `DocumentSummaryResult`: `{ schema_version: 1, summary, sections }`, where `sections` maps permitted section names (`issues`, `evidence`, `controls`, `checks`, `nonconformities`) to string arrays rendered as bullets under `## Issues`-style headings, and `sections.unresolved` feeds `## Unresolved items`. Malformed data fails as an ordinary tool error naming the expected shape, and section keys not permitted for the active task type are listed in the report's omitted-sections notice.

#### Token effect

Data-dependent and sent once per export; the rendered report content bounds the retained tokens.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix.

### Task binding denials

#### What the model sees

Business tools denied by the active task check fail as ordinary tool errors with stable, model-facing messages: `no active construction task: load one of the "construction-safety", "construction-quality", "construction-cost", "construction-schedule" skills with the skill tool before calling this tool`, `task "<id>" is stale or unknown; the active task is "<id>" (<type>), minted when its skill was loaded — reload the skill to start a new task`, and `task "<id>" is a <type> task and cannot run this <allowed> tool; load the matching business skill first`. File screening refusals report `file must be a non-empty path`, `a session workspace is required to read construction files`, `"<path>" resolves outside the session workspace; only files inside the workspace can be read`, `"<path>" was not found in the session workspace`, `"<path>" is not a regular file`, `"<path>" is <size> bytes, above the <limit> byte limit; split it with construction_pdf_split or extract the needed part first`, and the explicit format states for legacy `.doc`/`.xls`, macro-enabled files, and damaged or encrypted inputs.

#### Token effect

Only a denied or failed call adds these retained tokens.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the package needs special operational care. They are current package constraints, not a task backlog.

- **Structured drawing decomposition is deferred** — MinerU is not integrated in this release; `construction_pdf_split` with `mode: structure`/`mineru` returns an explicit unsupported status and never reaches a structure extractor.
- **Excel schedule-network export is deferred** — Graphviz-based activity-on-node workbooks stay out of scope; the sidebar Gantt consumes `ScheduleResult` only.
- **The hardened task-binding subsystem is deferred** — one active binding per scope, supersession on reload, and executor-enforced denials ship now; scoped-registration races, MCP reconnection, and the adversarial guard matrix wait for multi-agent orchestration.
- **Standards retrieval is optional** — the engineering bundle mounts standards RAG through the MCP client configuration; with the server unreachable, file, costing, and schedule tasks still complete and report retrieval as unavailable.
- **One active business task at a time** — loading a second business Skill supersedes the first binding; parallel multi-domain work is a full-plan feature.
- **The presented-result store is in-memory per plugin instance** — the first release needs no cross-session persistence: the Gantt chart folds from the logged tool result in the current session, and replay derives from the session log rather than a durable store.
- **Worker output is text-bounded** — split PDFs are binary, so split outputs are written through the resolved process path of the artifacts directory rather than `writeText`; deployments with a non-local filesystem backend need a backend whose `processPath` reaches the worker host.
- **Legacy and protected formats stay explicit** — `.doc`/`.xls` receive an explicit unsupported state, macro-enabled files are rejected, and encrypted or damaged inputs report failed coverage instead of partial success.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No `./invariant` companion is published. Every execution relation this package owns (tool registration, provider registration, binding listeners, child-process lifetimes) is checked at its own commit point by the tools and skills registries and by the runner's timeout and abort handling; there is no independent observation stream that could diverge, which the [package invariant rules](../../AGENTS.md) say must be the only justification for a companion.
