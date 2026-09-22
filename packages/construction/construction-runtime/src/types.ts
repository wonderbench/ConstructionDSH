/**
 * Result and input types for the construction runtime tools.
 *
 * These types are the persisted, model-visible shapes: a `DocumentResult`
 * reports what was read and how completely, a `SplitResult` reports mechanical
 * PDF splitting, a `CostResult` freezes a deterministic cost calculation, and
 * a `ScheduleResult` freezes a CPM calculation. Every result carries explicit
 * coverage or unresolved states instead of implying completeness.
 *
 * @module @deepseek-ai/dsh-construction-runtime/src/types
 */

/** Explicit coverage state for one tool result. */
export type CoverageState = 'complete' | 'partial' | 'needs_review' | 'failed'

/** Requested versus actual coverage plus the warnings that explain the gap. */
export interface Coverage {
  /** Overall coverage state. */
  readonly state: CoverageState
  /** What the caller asked to cover. */
  readonly requested: string
  /** What the tool actually covered. */
  readonly actual: string
  /** Human-readable warnings; empty when coverage is complete. */
  readonly warnings: readonly string[]
}

/** Location of a PDF source: one-based page plus an optional region. */
export interface PdfSourceRef {
  readonly kind: 'pdf'
  /** Original file path as supplied. */
  readonly file: string
  /** One-based page number. */
  readonly page: number
}

/** Location of an Excel source: sheet plus a cell range or single cell. */
export interface ExcelSourceRef {
  readonly kind: 'excel'
  /** Original file path as supplied. */
  readonly file: string
  /** Worksheet name. */
  readonly sheet: string
  /** Cell range such as `B2` or `A1:C12`. */
  readonly range: string
}

/** Word table location within a section path. */
export interface WordTableRef {
  /** Zero-based table index within the document body. */
  readonly index: number
  /** Zero-based row for a cell-level reference. */
  readonly row?: number
  /** Zero-based column for a cell-level reference. */
  readonly col?: number
  /** Row count observed for a table-level reference. */
  readonly row_count?: number
  /** Column count observed for a table-level reference. */
  readonly col_count?: number
}

/** Location of a Word source: section path plus paragraph or table position. */
export interface WordSourceRef {
  readonly kind: 'word'
  /** Original file path as supplied. */
  readonly file: string
  /** Heading path leading to the content, for example `["Scope"]`. */
  readonly section_path: readonly string[]
  /** Zero-based body paragraph index for a paragraph-level reference. */
  readonly paragraph?: number
  /** Table location for a table-level or cell-level reference. */
  readonly table?: WordTableRef
}

/** Source location for one reported value or excerpt. */
export type SourceRef = PdfSourceRef | ExcelSourceRef | WordSourceRef

/** Detected file format after extension mapping. */
export type DocumentFormat = 'docx' | 'xlsx' | 'pdf' | 'doc' | 'xls' | 'macro' | 'unknown'

/** File identity block carried by every document result. */
export interface DocumentFileInfo {
  /** Path as resolved for display. */
  readonly path: string
  /** Basename. */
  readonly name: string
  /** Byte size when statable. */
  readonly size_bytes: number | null
  /** Mapped format. */
  readonly format: DocumentFormat
  /** SHA-256 of the content, or null when the file could not be hashed. */
  readonly sha256: string | null
}

/** One search match with its source location. */
export interface SearchMatch {
  /** Location of the match. */
  readonly source_ref: SourceRef
  /** Short excerpt around the match. */
  readonly excerpt: string
}

/** Result of `construction_files_inspect`, `construction_files_read`, and `construction_files_search`. */
export interface DocumentResult {
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

/** One output file of a mechanical PDF split. */
export interface SplitOutput {
  /** Path of the written split file. */
  readonly file: string
  /** Original one-based page numbers copied into this output, in order. */
  readonly pages: readonly number[]
  /** Number of pages in this output. */
  readonly page_count: number
}

/** Result of `construction_pdf_split`. */
export interface SplitResult {
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

/** Cost workflow variant. */
export type CostVariant = 'unit_rate' | 'tender' | 'variation' | 'settlement'

/** Resource kind for a consumption line. */
export type ResourceKind = 'labor' | 'material' | 'equipment'

/** One consumption line per BOQ measurement unit. */
export interface CostResourceInput {
  /** Resource kind. */
  readonly kind: ResourceKind
  /** Resource name. */
  readonly name: string
  /** Consumption per BOQ unit; blank when unknown (never treated as zero). */
  readonly consumption: string | number | null
  /** Unit price; blank when unknown (never treated as zero). */
  readonly unit_price: string | number | null
}

/** One explicit fee line; the base names what the rate applies to. */
export interface CostFeeInput {
  /** Fee name such as `overhead` or `tax`. */
  readonly name: string
  /** Base the rate multiplies: `resources` is the item resource cost. */
  readonly base: 'resources'
  /** Rate as a decimal fraction, for example `0.1` for ten percent. */
  readonly rate: string | number | null
}

/** One BOQ item in a cost calculation input. */
export interface CostItemInput {
  /** BOQ item code; kept as text. */
  readonly code: string
  /** Item description. */
  readonly description?: string
  /** BOQ measurement unit. */
  readonly unit?: string
  /** Item quantity; blank when unknown (never treated as zero). */
  readonly quantity: string | number | null
  /** Consumption lines normalized per BOQ unit. */
  readonly resources?: readonly CostResourceInput[]
  /** Explicit fee rules applied on top of the resource cost. */
  readonly fees?: readonly CostFeeInput[]
}

/** Input of `construction_cost_calculate`. */
export interface CostInput {
  /** Workflow variant. */
  readonly variant: CostVariant
  /** Optional currency label; recorded, never converted. */
  readonly currency?: string
  /** Items to calculate. */
  readonly items: readonly CostItemInput[]
  /** Baseline items for tender and settlement comparison. */
  readonly baseline?: readonly CostItemInput[]
}

/** One evaluated resource line with its trace. */
export interface CostResourceLine {
  /** Resource kind. */
  readonly kind: ResourceKind
  /** Resource name. */
  readonly name: string
  /** Consumption per BOQ unit as given. */
  readonly consumption: string
  /** Unit price as given. */
  readonly unit_price: string
  /** consumption × unit_price at the declared precision. */
  readonly amount: string
  /** Trace expression, for example `labor[crew]=0.5×180.00=90.00`. */
  readonly expression: string
}

/** One evaluated fee line with its base and trace. */
export interface CostFeeLine {
  /** Fee name. */
  readonly name: string
  /** Base the rate multiplied. */
  readonly base: 'resources'
  /** Rate as a decimal fraction. */
  readonly rate: string
  /** Base amount the rate applied to. */
  readonly base_amount: string
  /** Rounded fee amount. */
  readonly amount: string
  /** Trace expression. */
  readonly expression: string
}

/** One evaluated BOQ item. */
export interface CostItemResult {
  /** BOQ item code as text. */
  readonly code: string
  /** Item description when supplied. */
  readonly description?: string
  /** BOQ measurement unit when supplied. */
  readonly unit?: string
  /** Quantity as given; absent when blank. */
  readonly quantity?: string
  /** Σ consumption × unit_price at the declared precision; absent when blank inputs remain. */
  readonly resource_cost?: string
  /** Evaluated fee lines. */
  readonly fees: readonly CostFeeLine[]
  /** resource_cost + fees; absent when resource_cost is absent. */
  readonly unit_rate?: string
  /** unit_rate × quantity at the declared precision; absent when not fully priced. */
  readonly amount?: string
  /** Resource lines with traces. */
  readonly resources: readonly CostResourceLine[]
  /** Trace expressions for this item. */
  readonly trace: readonly string[]
}

/** One row of a cost difference table. */
export type CostDifference = {
  /** BOQ item code as text. */
  readonly code: string
  /** Baseline amount when evaluated. */
  readonly baseline_amount?: string
  /** Compared amount when evaluated. */
  readonly compared_amount?: string
  /** compared − baseline at the declared precision, when both sides exist. */
  readonly difference?: string
  /**
   * (comparedQuantity − baselineQuantity) × baseline unit rate at the declared
   * precision; present only on `quantity_diff` and `price_diff` rows when both
   * amounts, both quantities, and both unit rates exist.
   */
  readonly quantity_effect?: string
  /**
   * The remaining `difference − quantity_effect` at the declared precision, so
   * `quantity_effect + price_effect` reconciles exactly with `difference`;
   * present only when `quantity_effect` is.
   */
  readonly price_effect?: string
  /** Row classification. */
  readonly status: 'matching' | 'price_diff' | 'quantity_diff' | 'only_in_baseline' | 'only_in_compared' | 'unresolved'
}

/** Frozen result of `construction_cost_calculate`. */
export interface CostResult {
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

/** One task in a schedule input. */
export interface ScheduleTaskInput {
  /** Unique task id. */
  readonly id: string
  /** Task name. */
  readonly name?: string
  /** Whole-working-day duration; 0 or omitted for a milestone. */
  readonly duration?: number
  /** Locked start date (ISO) for completed work; the task is not rescheduled. */
  readonly locked_start?: string
  /** Locked finish date (ISO) for completed work. */
  readonly locked_finish?: string
  /** Start constraint (no earlier than this ISO date). */
  readonly start_no_earlier_than?: string
  /** Finish constraint (no later than this ISO date, display basis). */
  readonly finish_no_later_than?: string
}

/** One link in a schedule input. */
export interface ScheduleLinkInput {
  /** Predecessor task id. */
  readonly from: string
  /** Successor task id. */
  readonly to: string
  /** Finish-to-start lag in whole working days; must be nonnegative. */
  readonly lag?: number
  /** Link relation; only `FS` is supported. */
  readonly relation?: string
}

/** Input of `construction_schedule_calculate`. */
export interface ScheduleInput {
  /** Scenario identifier; defaults to a generated id. */
  readonly scenario_id?: string
  /** ISO date anchoring the calculation when no constraint or locked start exists. */
  readonly project_start?: string
  /** Weekly rest days as JavaScript weekday numbers (0 Sunday, 6 Saturday). */
  readonly weekly_rest_days?: readonly number[]
  /** Holiday ISO dates excluded from working time. */
  readonly holidays?: readonly string[]
  /** Tasks. */
  readonly tasks: readonly ScheduleTaskInput[]
  /** Links. */
  readonly links?: readonly ScheduleLinkInput[]
}

/** One calculated task in a `ScheduleResult`. */
export interface ScheduleTaskResult {
  /** Task id. */
  readonly id: string
  /** Task name. */
  readonly name: string
  /** Whole-working-day duration. */
  readonly duration: number
  /** Inclusive start date (ISO). */
  readonly start: string
  /** Displayed finish: the last working date before the finish boundary (ISO). */
  readonly finish: string
  /** Total float in whole working days; 0 when critical. */
  readonly total_float: number
  /** Whether the task is on the critical path; false when no path is claimed. */
  readonly is_critical: boolean
  /** Whether this zero-duration task is a milestone. */
  readonly is_milestone: boolean
  /** Whether the task dates were locked and left unscheduled. */
  readonly locked: boolean
}

/** One reported link in a `ScheduleResult`. */
export interface ScheduleLinkResult {
  /** Predecessor task id. */
  readonly from: string
  /** Successor task id. */
  readonly to: string
  /** Lag in whole working days. */
  readonly lag: number
  /** Whether the relation is supported (`FS`) and used in the calculation. */
  readonly supported: boolean
}

/** Frozen result of `construction_schedule_calculate`. */
export interface ScheduleResult {
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

/** Result of `construction_schedule_present`. */
export interface SchedulePresentResult {
  /** Result schema version; bumped on structural change. */
  readonly schema_version: 1
  /** Store key: sha256 of the canonical ScheduleResult JSON. */
  readonly result_id: string
  /** Scenario identifier. */
  readonly scenario_id: string
  /** Calculator version. */
  readonly calculator_version: string
  /** Number of tasks in the stored scenario. */
  readonly task_count: number
  /** First start and last finish across the scenario (ISO dates). */
  readonly date_range: { readonly start: string; readonly finish: string }
  /** Hint telling the client how to fold this into the sidebar chart. */
  readonly gantt: { readonly kind: 'schedule-result'; readonly result_id: string }
}

/**
 * Frozen document summary produced by the model for safety and quality
 * document reviews and passed back to `construction_report_export` as
 * `kind: "document"` data. Section names come from the permitted section
 * vocabulary of the active task type; every section value is a list of
 * markdown bullet bodies (without the `- ` marker).
 */
export interface DocumentSummaryResult {
  /** Result schema version; bumped on structural change. */
  readonly schema_version: 1
  /** One-paragraph summary of the reviewed document. */
  readonly summary: string
  /** Review sections keyed by section name; `unresolved` carries open items. */
  readonly sections: Readonly<Record<string, readonly string[]>>
}

/** Task types bound to the four business skills. */
export type TaskType = 'safety' | 'quality' | 'cost' | 'schedule'

declare const taskIdBrand: unique symbol

/** Opaque monotonic task binding identifier. */
export type TaskId = string & { readonly [taskIdBrand]: 'TaskId' }

/** Host-owned binding minted when a business skill is invoked. */
export interface TaskBinding {
  /** Monotonic binding identifier. */
  readonly task_id: TaskId
  /** Bound business task type. */
  readonly task_type: TaskType
  /** Skill version metadata when the skill declares one. */
  readonly skill_version?: string
  /** Invocation time, milliseconds since the Unix epoch. */
  readonly issued_at: number
}

/** Result of `construction_cost_export` and `construction_report_export`. */
export interface ExportResult {
  /** Result schema version; bumped on structural change. */
  readonly schema_version: 1
  /** Path of the written report file. */
  readonly path: string
  /** One-line summary of the exported content. */
  readonly summary: string
  /** Unresolved items carried into the export. */
  readonly unresolved: readonly string[]
}

/** Result of `construction_cost_compare`. */
export interface CostCompareResult {
  /** Result schema version; bumped on structural change. */
  readonly schema_version: 1
  /** Declared output precision of the compared results. */
  readonly precision: number
  /** One row per matched or unmatched item code. */
  readonly differences: readonly CostDifference[]
  /** Aggregate compared − baseline over matched rows. */
  readonly total_difference: string
  /** Rows a reviewer must confirm. */
  readonly requires_confirmation: readonly string[]
}
