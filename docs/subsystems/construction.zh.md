# Construction（工程）

[English](construction.md) | 中文

construction 子系统把一个 dsh profile 变成工程建设助手：共享的只读 Word/Excel/PDF 文件工具，报告覆盖状态与来源位置；机械式 PDF 拆分，原样复制原始页面；覆盖单价、招投标、变更与结算四种模式的确定性小数计价；CPM 进度计算；报告导出；以及以只读提供方内容随包的四个业务 Skill（`construction-safety`、`construction-quality`、`construction-cost`、`construction-schedule`）。两个经校验的配置开关 `drawing` 与 `business`（默认均开启）把运行时分为两个面：drawing 面（文件工具与 `construction_pdf_split`）与 business 面（Skill Provider、composer 菜单命令、计价、进度与报表工具，以及任务绑定指引）；shipped 的 `drawing-split` preset 仅以 drawing 面挂载运行时，`engineering` 则挂载两个面。Host 运行时位于 [construction 包组](../../packages/construction/README.zh.md)；十个模型工具及其 JSON Schema 收录在[工具目录](../tool-catalog.zh.md#deepseek-aidsh-construction-runtime)。范围与所有延期项（图纸分解、Excel 网络图导出、强化任务绑定子系统、智慧工地/BIM 接口）由[最小首次发布范围](../../.agents/notes/implemented/feature/2026-09-21-construction-dsh-minimal-first-release.zh.md)与[首次发布开发计划](../../.agents/notes/implemented/feature/2026-09-21-construction-dsh-development-plan.zh.md)两篇 Agent Note 负责。

源码：[`packages/construction/construction-runtime/src/types.ts`](../../packages/construction/construction-runtime/src/types.ts)、[`packages/construction/construction-runtime/src/tasks.ts`](../../packages/construction/construction-runtime/src/tasks.ts)

## `DocumentResult`：一次文件读取报告

每个文件工具（`construction_files_inspect`、`construction_files_read`、`construction_files_search`）返回一个 `DocumentResult`：显式的 `status`（`ok`、`unsupported`、`rejected`、`failed`）、带内容哈希的文件身份、`Coverage` 块（写明请求覆盖与实际覆盖并附警告）、按格式而定的 `content`，以及每个报告值对应的一个 `SourceRef`。旧版 `.doc`/`.xls` 输入与宏启用文件映射为 `unsupported` 或 `rejected` 而不被解析；空白单元格或缺失价格会被报告，绝不会被当作零。

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

## `SplitResult`：一次机械式 PDF 拆分

`construction_pdf_split` 用 pypdf 原样复制原始页面到拆分文件，并生成带原始页码映射的 `index.json`；分组方式按显式页码范围、每页一个输出或书签。结构化图纸分解请求返回 `status: 'unsupported'` 并说明原因，绝不会触达 MinerU——后者属于首次发布延期项。

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

## `CostResult`：一份冻结的计价结果

`construction_cost_calculate` 按声明的 `precision` 用小数算术求值资源行（`consumption × unit_price`）与显式取费规则，冻结合计、每项的追溯表达式、招投标与结算对比的差价表，以及无法定价输入的 `unresolved` 列表。`quantity_diff` 与 `price_diff` 行还携带变化的分解：`quantity_effect` 为（比较量 − 基线量）× 基线单价，`price_effect` 为差额余量，两者之和与该行 `difference` 精确对账。`construction_cost_compare` 按清单项编码对比两份冻结结果，`construction_cost_export` 把冻结值写入报告文件；权威金额始终来自 `CostResult`，绝不来自未求值的工作簿公式缓存。

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

## `ScheduleResult`：一份冻结的 CPM 计算结果

`construction_schedule_calculate` 在一个项目日历内，对整数工作日时长与带非负时距的完成到开始关系做前推与反推，尊重锁定的已完成任务与开始/完成约束。日期采用含起点、排终点边界：正时长任务显示其完成边界之前的最后一个工作日，零时长任务是里程碑。不支持的关系以 `supported: false` 报告，绝不会被改写为 FS；逻辑不完整时 `critical_path` 为 `null`，而不是虚构一条关键路径。`construction_schedule_present` 按内容哈希 `result_id` 持久化规范化结果，并返回带 `gantt` 提示的 `SchedulePresentResult` 展示元数据，客户端 Gantt 页签据此折叠出场景。

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

## `DocumentSummaryResult`：一份冻结的文档审查结果

`construction_report_export` 仅接受 `kind: "document"` 的 `DocumentSummaryResult` 数据，它由模型在安全或质量文档审查中冻结：一段单段 `summary`，加上按活动任务类型允许的章节名（`issues`、`evidence`、`controls`、`checks`、`nonconformities` 与 `unresolved`）为键的 `sections`，其字符串数组以 `## Issues` 式标题加要点呈现。工具在执行时校验该结构，格式错误的数据以指明预期结构的模型可见错误拒绝；数据中不被活动任务类型允许的章节键列入报表的省略章节说明而不被呈现。

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

## `TaskBinding`：当前业务任务

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

## 任务绑定语义

加载四个业务 Skill 之一会铸造一个 `TaskBinding`：内建只读 skills 提供方在 Skill 正文加载时按保底路径铸造；当加载经由 `skill` 工具发生时，`tools/result` 观察还会按调用 agent 铸造一个绑定。绑定以调用 agent 为键，并有一个插件级兜底绑定；同一作用域内新绑定取代旧绑定，因此旧任务标识符随即失效。每个业务工具在执行前调用 `TaskBindings.requireTask`：没有活动任务时，拒绝信息指明应先加载哪个 Skill；传入的标识符与活动绑定不一致时被报告为已过期；类型不匹配（例如安全任务调用计价工具）时同时指明两种类型。拒绝以模型可见的错误抛出，由工具管道渲染为普通工具失败，绝不崩溃。计价工具只接受 `cost` 任务，进度工具只接受 `schedule` 任务，`construction_report_export` 接受四种任务类型中的任意一种。

## 组合方式

[`@deepseek-ai/dsh-construction`](../../packages/bundle/construction/README.zh.md) bundle 在 `dsh-base` 之上叠加一层 patch：挂载 construction 运行时；通过运行时自带的只读提供方暴露四个内建 Skill，同时让 `skill-filesystem` 丢弃默认根目录；经 MCP 客户端接入标准 RAG 服务器，其命令由环境变量驱动，不可达时绝不阻塞 profile；加入 [`ui-construction-gantt`](../../packages/client/ui-construction-gantt/README.zh.md) 客户端行；禁用模型可见的任意 shell 与代码执行，同时保留 `web_search` 与 `web_fetch`。启动 profile 模板中的 `construction` 条目即装载这一对 bundle，[示例 overlay](../../apps/cli/config/examples/construction/cordis.yml) 展示了同一 patch 叠加到另一个由 base 支撑的 profile 上。Gantt 页签是只读的：它把当前 Session 日志中每个 `construction_schedule_present` 结果折叠为按结果 id 键控的可选场景，在固定任务名列之后用 frappe-gantt 渲染所选场景，绝不修改业务日期。
