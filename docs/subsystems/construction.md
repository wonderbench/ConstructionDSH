# Construction

English | [中文](construction.zh.md)

The construction subsystem turns a dsh profile into a construction engineering assistant: shared read-only Word/Excel/PDF file tools that report coverage states and source locations, mechanical PDF splitting that copies original pages, deterministic decimal costing across the unit-rate, tender, variation, and settlement variants, CPM schedule calculation, report export, and the four business Skills (`construction-safety`, `construction-quality`, `construction-cost`, `construction-schedule`) as bundled read-only provider content. Two validated config gates, `drawing` and `business` (both default on), split the runtime into the drawing surface (the file tools and `construction_pdf_split`) and the business surface (the skills provider, the composer commands, the costing, scheduling, and report tools, and the task-binding guidance); the shipped `drawing-split` preset mounts the runtime drawing-only, while `engineering` mounts both. The Host runtime lives in the [construction package group](../../packages/construction/README.md); the ten model tools and their JSON Schemas are catalogued in the [tool catalog](../tool-catalog.md#deepseek-aidsh-construction-runtime). The scope and every deferred item (drawing decomposition, Excel network export, the hardened task-binding subsystem, smart-site/BIM interfaces) are owned by the [minimal first-release scope](../../.agents/notes/implemented/feature/2026-09-21-construction-dsh-minimal-first-release.md) and the [first-release development plan](../../.agents/notes/implemented/feature/2026-09-21-construction-dsh-development-plan.md) Agent Notes.

Sources: [`packages/construction/construction-runtime/src/types.ts`](../../packages/construction/construction-runtime/src/types.ts), [`packages/construction/construction-runtime/src/tasks.ts`](../../packages/construction/construction-runtime/src/tasks.ts)

## `DocumentResult` — one file read report

Every file tool (`construction_files_inspect`, `construction_files_read`, `construction_files_search`) returns one `DocumentResult`: an explicit `status` (`ok`, `unsupported`, `rejected`, `failed`), the file identity with its content hash, a `Coverage` block naming requested versus actual coverage with warnings, format-specific `content`, and one `SourceRef` per reported value. Legacy `.doc`/`.xls` inputs and macro-enabled files map to `unsupported` or `rejected` instead of being parsed, and a blank cell or missing price is reported, never treated as zero.

```ts type-equiv
/** Result of `construction_files_inspect`, `construction_files_read`, and `construction_files_search`. */
interface DocumentResult {
  /** Result schema version; bumped on structural change. */
  readonly schema_version: 1
  /** Reader version that produced the result. */
  readonly parser_version: string
  /** `ok` when content was produced; `unsupported`, `rejected`, or `failed` otherwise. */
  readonly status: 'ok' | 'unsupported' | 'rejected' | 'failed'
  /** File identity. */
  readonly file: DocumentFileInfo
  /** Coverage; null only when the file was rejected before parsing. */
  readonly coverage: Coverage | null
  /** Format-specific content (structure, blocks, cells, or pages). */
  readonly content: unknown
  /** Source locations for the reported content. */
  readonly source_refs: readonly SourceRef[]
  /** Errors explaining a non-ok status. */
  readonly errors: readonly string[]
}
```

## `SplitResult` — one mechanical PDF split

`construction_pdf_split` copies original pages with pypdf into split files plus an `index.json` with original-page mapping; grouping is by explicit page range, one page per output, or bookmark. A request for structured drawing decomposition returns `status: 'unsupported'` with a reason and never reaches MinerU, which the first release defers.

```ts type-equiv
/** Result of `construction_pdf_split`. */
interface SplitResult {
  /** Result schema version; bumped on structural change. */
  readonly schema_version: 1
  /** Splitter version that produced the result. */
  readonly parser_version: string
  /** `ok`, or `unsupported` for structured-decomposition requests. */
  readonly status: 'ok' | 'unsupported'
  /** Reason for an unsupported status. */
  readonly reason?: string
  /** Identifier of the split job. */
  readonly job_id?: string
  /** Directory holding the split files and index.json. */
  readonly output_dir?: string
  /** Path of the written index.json. */
  readonly index_file?: string
  /** Source identity: path, sha256, and page count. */
  readonly source?: { readonly file: string; readonly sha256: string; readonly page_count: number }
  /** Split mode actually used. */
  readonly split_by?: 'range' | 'per_page' | 'bookmark'
  /** Written output files with original-page mapping. */
  readonly outputs?: readonly SplitOutput[]
  /** Coverage of the requested split. */
  readonly coverage?: Coverage
}
```

## `CostResult` — one frozen cost calculation

`construction_cost_calculate` evaluates resource lines (`consumption × unit_price`) and explicit fee rules with decimal arithmetic at the declared `precision`, freezes the totals, per-item trace expressions, the difference table for tender and settlement comparison, and an `unresolved` list of inputs that could not be priced. `quantity_diff` and `price_diff` rows also carry a decomposition of the change: `quantity_effect` is (comparedQuantity − baselineQuantity) × baseline unit rate, and `price_effect` is the remaining difference, so the two effects reconcile exactly with the row's `difference`. `construction_cost_compare` diffs two frozen results by item code, and `construction_cost_export` writes the frozen values to a report file; authoritative amounts always come from the `CostResult`, never from unevaluated workbook formula caches.

```ts type-equiv
/** Frozen result of `construction_cost_calculate`. */
interface CostResult {
  /** Result schema version; bumped on structural change. */
  readonly schema_version: 1
  /** Calculator version that produced the result. */
  readonly calculator_version: string
  /** Workflow variant. */
  readonly variant: CostVariant
  /** Currency label when supplied. */
  readonly currency?: string
  /** Declared output precision (decimal places). */
  readonly precision: number
  /** Evaluated items with full traceability. */
  readonly items: readonly CostItemResult[]
  /** Totals over fully priced items only. */
  readonly totals: { readonly resources: string; readonly fees: string; readonly amount: string }
  /** Difference table for tender/settlement variants. */
  readonly differences?: readonly CostDifference[]
  /** Inputs that could not be priced or confirmed; never silently zeroed. */
  readonly unresolved: readonly string[]
}
```

## `ScheduleResult` — one frozen CPM calculation

`construction_schedule_calculate` runs forward and backward passes over whole-working-day durations and finish-to-start links with nonnegative lags in one project calendar, honoring locked completed tasks and start/finish constraints. Dates use the inclusive-start, exclusive-finish boundary: a positive-duration task displays the last working date before its finish boundary, and a zero-duration task is a milestone. Unsupported relations are reported with `supported: false`, never rewritten as FS, and `critical_path` is `null` when the logic is incomplete instead of claiming a path. `construction_schedule_present` persists the canonical result under a content-hash `result_id` and returns `SchedulePresentResult` display metadata with a `gantt` hint that the client Gantt tab folds into a scenario.

```ts type-equiv
/** Frozen result of `construction_schedule_calculate`. */
interface ScheduleResult {
  /** Result schema version; bumped on structural change. */
  readonly schema_version: 1
  /** Calculator version that produced the result. */
  readonly calculator_version: string
  /** Scenario identifier. */
  readonly scenario_id: string
  /** Working calendar used for the calculation. */
  readonly calendar: { readonly weekly_rest_days: readonly number[]; readonly holidays: readonly string[] }
  /** Calculated tasks. */
  readonly tasks: readonly ScheduleTaskResult[]
  /** Reported links, including unsupported relations never rewritten as FS. */
  readonly links: readonly ScheduleLinkResult[]
  /** Critical path task ids in order; null when logic is incomplete. */
  readonly critical_path: readonly string[] | null
  /** Stated assumptions. */
  readonly assumptions: readonly string[]
  /** Inputs that could not be honored, with reasons. */
  readonly unresolved: readonly string[]
  /** Non-fatal observations. */
  readonly warnings: readonly string[]
}
```

## `DocumentSummaryResult` — one frozen document review

`construction_report_export` accepts `kind: "document"` data only as a `DocumentSummaryResult`, frozen by the model during a safety or quality document review: a one-paragraph `summary` plus `sections` keyed by the permitted section names of the active task type (`issues`, `evidence`, `controls`, `checks`, `nonconformities`, and `unresolved`) whose string arrays render as bullets under `## Issues`-style headings. The tool validates the shape at execution time and rejects malformed data with a model-facing error naming the expected shape; section keys not permitted for the active task type are listed in the report's omitted-sections notice instead of being rendered.

```ts type-equiv
/**
 * Frozen document summary produced by the model for safety and quality
 * document reviews and passed back to `construction_report_export` as
 * `kind: "document"` data. Section names come from the permitted section
 * vocabulary of the active task type; every section value is a list of
 * markdown bullet bodies (without the `- ` marker).
 */
interface DocumentSummaryResult {
  /** Result schema version; bumped on structural change. */
  readonly schema_version: 1
  /** One-paragraph summary of the reviewed document. */
  readonly summary: string
  /** Review sections keyed by section name; `unresolved` carries open items. */
  readonly sections: Readonly<Record<string, readonly string[]>>
}
```

## `TaskBinding` — the active business task

```ts type-equiv
/** Host-owned binding minted when a business skill is invoked. */
interface TaskBinding {
  /** Monotonic binding identifier. */
  readonly task_id: TaskId
  /** Bound business task type. */
  readonly task_type: TaskType
  /** Skill version metadata when the skill declares one. */
  readonly skill_version?: string
  /** Invocation time, milliseconds since the Unix epoch. */
  readonly issued_at: number
}
```

## Task-binding semantics

Loading one of the four business Skills mints a `TaskBinding`: the bundled read-only skills provider mints at the guaranteed floor whenever a skill body is loaded, and a `tools/result` observation additionally mints one scoped to the calling agent when the load goes through the `skill` tool. Bindings are keyed by calling agent with a single plugin-level fallback, and minting supersedes the previous binding in the same scope, so older task identifiers go stale. Each business tool calls `TaskBindings.requireTask` before executing: with no active task the denial names the skill to load first, a supplied id that no longer matches the active binding is reported as stale, and a type mismatch (for example a safety task calling a costing tool) names both types. The denial throws a model-facing error that the tool pipeline renders as an ordinary tool failure, never a crash. The costing tools accept only `cost` tasks, the scheduling tools only `schedule` tasks, and `construction_report_export` accepts any of the four task types.

## Composition

The [`@deepseek-ai/dsh-construction`](../../packages/bundle/construction/README.md) bundle layers a patch over `dsh-base`: it mounts the construction runtime, exposes the four bundled Skills through the runtime's own read-only provider while `skill-filesystem` drops its default roots, attaches the standards RAG server over the MCP client with an env-driven command that never blocks the profile when unreachable, adds the [`ui-construction-gantt`](../../packages/client/ui-construction-gantt/README.md) client row, and disables model-facing arbitrary shell and code execution while keeping `web_search` and `web_fetch`. The `construction` entry in the boot profile templates ships that pair of bundles, and the [example overlay](../../apps/cli/config/examples/construction/cordis.yml) shows the same patch layered over another base-backed profile. The Gantt tab is read-only: it folds every `construction_schedule_present` result logged in the current Session into selectable scenarios keyed by result id, renders the selected one with frappe-gantt behind a fixed task-name column, and never edits business dates.
