---
description: "Construction engineering Host tools: shared Word/Excel/PDF reading with source references, mechanical PDF splitting, deterministic costing, CPM scheduling, and the four business Skills with lightweight task checks."
kind: "package-reference"
---

# @deepseek-ai/dsh-construction-runtime

[English](README.md) | 中文

## 概述

挂载 `dsh-construction-runtime` 后，一个 Agent 即获得带覆盖状态与来源引用的只读 Word/Excel/PDF 文件工具、机械式图纸 PDF 拆分（`construction_pdf_split`）、确定性小数计价、纯日期 CPM 进度计算，以及按任务过滤的报表导出。它以只读 Provider 内容打包四个业务 Skill（`construction-safety`、`construction-quality`、`construction-cost`、`construction-schedule`），并在任一 Skill 加载时铸造轻量任务绑定。两个配置开关 `drawing` 与 `business`（默认均开启）把套件分为 drawing 面（文件工具、PDF 拆分）与 business 面（Skills、命令、计价、进度、报表、任务指引）；业务工具通过执行器拒绝跨域调用与过期任务标识。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与 deferred 工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在任何已提供 `tools`、`fs` 与 `systemPrompt` 的组合中挂载 `dsh-construction-runtime`；同时挂载 `dsh-skill` 即注册四个打包的业务 Skill。`assets/scripts/` 中固定的 Python 脚本需要一个合格的解释器（Windows 上使用 `py`，其他平台使用 `python3`，或通过 `pythonPath` 显式指定）。

### 最小组合

```yaml
- name: '@deepseek-ai/dsh-tools'
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-construction-runtime'
```

### 工具

| 组 | 工具 | 活动任务 |
|---|---|---|
| 只读文件 | `construction_files_inspect` | 无要求 |
| 只读文件 | `construction_files_read` | 无要求 |
| 只读文件 | `construction_files_search` | 无要求 |
| 机械拆分 | `construction_pdf_split` | 无要求 |
| 计价 | `construction_cost_calculate` | `cost` |
| 计价 | `construction_cost_compare` | `cost` |
| 计价 | `construction_cost_export` | `cost` |
| 进度 | `construction_schedule_calculate` | `schedule` |
| 进度 | `construction_schedule_present` | `schedule` |
| 报表 | `construction_report_export` | 任意业务任务 |

通过 `skill` 工具（或用户显式调用 Skill）加载四个业务 Skill 之一即启动对应任务；业务工具在执行前校验活动任务类型，新的调用会取代旧的绑定。

### Composer 菜单命令

当组合中同时存在命令注册表与 Skill 注册表且 business 面启用时，运行时为每个打包业务 Skill（`construction-safety`、`construction-quality`、`construction-cost`、`construction-schedule`）注册一条命令，其名称与描述取自 Skill Provider 所使用的同一份 SKILL.md frontmatter，并为每个 Skill 分配稳定的 `definitionId`，使有能力的客户端无论目录文案如何都能本地化该行。每条命令声明参数输入并归入“功能”菜单分组：点选该行会像 `/goal` 与 `/plan` 一样认领 composer 草稿（保留 `/name ` 以等待参数），提交认领后执行处理器，处理器入队由此产生的 `/<name> [参数]` 用户行。菜单路径与键盘路径汇聚到同一条流水线：pre-step 的 Skill 调用边界加载该 Skill、铸造任务绑定、追加渲染后的 `<skill_content>` 正文，并把键入的参数保留为紧随其后的用户文本。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `pythonPath` | 平台启动器 | 固定 Python 脚本使用的解释器或启动器。 |
| `scriptTimeoutMs` | `60000` | 杀掉子进程前的 worker 超时时间。 |
| `maxFileBytes` | `20971520` | 可接受输入文件的最大字节数。 |
| `maxOutputChars` | `200000` | 可接受的 worker 标准输出最大字符数。 |
| `costPrecision` | `2` | 计价输出的声明精度（小数位）。 |
| `artifactsDir` | `.dsh/construction` | 工件目录，相对于会话工作区。 |
| `weeklyRestDays` | `[6, 0]` | 进度计算的默认每周休息日。 |
| `holidays` | `[]` | 进度计算的默认节假日 ISO 日期。 |
| `skillsProviderName` | `construction` | 打包只读 Skill Provider 的名称。 |
| `drawing` | `true` | 注册 drawing 面：只读文件工具与 `construction_pdf_split`。 |
| `business` | `true` | 注册 business 面：打包的 Skill Provider、composer 菜单命令、计价、进度与报表工具，以及任务绑定提示词章节。 |
| `assetRoot` | 打包的 `assets/` | 重定位应用使用的绝对 assets 目录。 |

无效配置在加载时大声失败；同时关闭两个面会被拒绝，且每个面只要求自身的 assets（`drawing` 要求 worker 脚本，`business` 要求四个 `SKILL.md` 文件）。仅 drawing 挂载（`business: false`）不注册 Skill Provider、composer 菜单命令、业务工具或任务绑定章节；仅 business 挂载（`drawing: false`）不注册文件工具，且任务绑定指引不渲染文件工具段落。

### 失败与恢复

Worker 失败、加密 PDF 与损坏的 Office 包会变成显式结果状态或 `Error: <message>` 工具失败——绝不静默成功。只读拒绝（`unsupported`、`rejected`、`failed` 覆盖状态）在 `errors` 中携带原因；业务工具拒绝是模型可读、可通过加载正确 Skill 恢复的普通工具错误。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部结构 — 点击展开</summary>

本节说明该包如何实现上述行为；可观察契约见 [Use this package](#use-this-package)。

### 设计理念

一个插件组装四条能力缝：由固定 Python worker 支撑的只读文件工具、确定性小数计价引擎、纯日期 CPM 引擎，以及轻量任务绑定存储。每个模型可见的值都是冻结结果（`DocumentResult`、`SplitResult`、`CostResult`、`ScheduleResult`），带显式覆盖或未决状态，因此结果绝不声称超出其输入所支持的内容。路径筛查（通过 `ctx.fs` realpath 包含关系的工作区约束、大小上限、针对旧格式与宏启用格式的扩展名筛查）在任何 worker 打开文件之前执行，工件通过同样的包含关系检查写入会话工作区内配置的目录。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置校验、assets 检查、工具与 Provider 注册、绑定监听、系统提示词引导。 |
| [`src/types.ts`](src/types.ts) | 冻结结果与输入类型（`DocumentResult`、`SplitResult`、`CostResult`、`ScheduleResult`、`DocumentSummaryResult`、`TaskBinding`）。 |
| [`src/python.ts`](src/python.ts) | Python 运行器：作业文件传递、净化环境、超时与中止处理、结构化错误映射。 |
| [`src/tasks.ts`](src/tasks.ts) | 任务绑定存储：铸造、按作用域取代，以及共享的 `requireTask` 拒绝辅助函数。 |
| [`src/files.ts`](src/files.ts) | 共享路径筛查与三个只读文件工具。 |
| [`src/split.ts`](src/split.ts) | 机械式 PDF 拆分，含原始页码映射与显式不支持状态。 |
| [`src/cost.ts`](src/cost.ts) | 小数计价引擎与三个计价工具。 |
| [`src/schedule.ts`](src/schedule.ts) | 纯日期 CPM 引擎、结果展示存储与两个进度工具。 |
| [`src/report.ts`](src/report.ts) | 按任务类型过滤的 Markdown 报表导出；document 类型数据校验为 `DocumentSummaryResult`。 |
| [`src/artifacts.ts`](src/artifacts.ts) | 共享的工作区工件路径解析。 |
| [`assets/scripts/construction_read.py`](assets/scripts/construction_read.py) | 固定的 Word/Excel/PDF 读取 worker（python-docx、openpyxl、pypdf）。 |
| [`assets/scripts/construction_pdf_split.py`](assets/scripts/construction_pdf_split.py) | 固定的 pypdf 页面复制拆分 worker。 |
| [`assets/skills/`](assets/skills/) | 四个业务 Skill，含 fixtures 与输出模板。 |
| — | 未发布运行时 invariant 伴随包：任务绑定拒绝与路径筛查在工具管道内执行，其模型可见结果已由工具测试固定。 |

### 任务绑定

当业务 Skill 正文通过打包 Provider 的 `get()` 回调加载时铸造 `TaskBinding`——这是每条调用路径（面向模型的 `skill` 工具与用户显式调用）都会经过的单一节点——并在 `tools/result` 上观察到成功的 `skill` 工具结果时按调用 Agent 的作用域重新铸造。每个作用域只有一个活动绑定；铸造会取代前一个绑定，因此旧任务标识会过期。业务工具调用共享的 `requireTask` 辅助函数，它对缺失任务、错误任务类型或过期标识抛出模型可读的拒绝（渲染为普通工具错误）。

### Python worker 协议

运行器将 JSON 作业写入临时文件，以净化环境（PATH、SYSTEMROOT、`PYTHONIOENCODING=utf-8`、`PYTHONDONTWRITEBYTECODE=1`）启动一个固定脚本，通过杀掉子进程强制执行配置的超时与调用方中止信号，并解析单个 JSON 结果。Worker 错误以 `{"error": {"code", "message"}}` 形式携带非零退出码返回，并保留 worker 错误码成为 `PythonJobError`；读取工具将其映射为失败状态结果，拆分工具将其呈现为模型可读的拒绝。

### 计价引擎

四个变体（`unit_rate`、`tender`、`variation`、`settlement`）共享一套条目求值：资源行按声明精度以 decimal.js 计算 `consumption × unit_price`（ROUND_HALF_UP），显式费用行以声明费率乘以声明基数，单价与金额携带逐行 trace 表达式。空白输入是未决条目，绝不当零；BOQ 编码保持文本；差异表按编码匹配，并分类为匹配、价差、量差、单侧与未决行。分类为 `quantity_diff` 或 `price_diff` 的行还携带 `quantity_effect`——（比较量 − 基线量）× 基线单价——以及作为差额余量的 `price_effect`，两者之和始终与该行 `difference` 精确对账。

### 进度引擎

全部日期运算都是 ISO 日历日期上的整数运算——不使用 `Date`，涉及时区。一个工作历（每周休息日加节假日）定义工作时间；工期与延迟是以包含起点、排除终点边界计算的完整工作日，显示的完成日期是完成边界之前的最后一个工作日。校验拒绝重复标识、悬空引用、循环（列出循环路径）、非法工期与延迟、格式错误日期以及约束冲突。不支持的关系在 `links` 与 `unresolved` 中报告，绝不改写为完成到开始；仅当每个任务都由受支持的逻辑或开始约束锚定时才声称关键路径。

</details>

<a id="further-exploration"></a>
## 进一步探索

包级契约对大多数消费者已经足够；需要周边领域时阅读这些资料。

- [最小首次发布范围 Agent Note](../../../.agents/notes/implemented/feature/2026-09-21-construction-dsh-minimal-first-release.zh.md) — 本包实现的 S1–S7 范围、工具清单与轻量任务校验。
- [完整开发计划](../../../.agents/notes/implemented/feature/2026-09-21-construction-dsh-development-plan.zh.md) — 保留的设计权威：来源引用形状、覆盖状态、小数运算与工作日边界。
- [Adding a tool cookbook](../../../docs/cookbook/adding-a-tool.zh.md) — 这些工具遵循的工具编写契约。
- [`dsh-tool-fs`](../../fs/tool-fs/README.zh.md) — 本包构建其上的工作区文件访问与筛查模型。
- [`dsh-skill-office`](../../skill/skill-office/README.zh.md) — 本包适配的 Python assets 与打包 Skill 模式。

<a id="model-experience"></a>
## 模型体验

### 系统提示词

#### 模型所见

仅当 business 面启用且其工具之一对调用作用域可见时，才会出现可见性匹配的章节 `construction:task-binding`；仅 drawing 配置不注册该章节。

##### 此字段的逐字文本

```markdown
Construction engineering tools are available in this session.
The file tools construction_files_inspect, construction_files_read, and construction_files_search work without a business task and read Word, Excel, and PDF files with source references and coverage states; act on coverage warnings instead of assuming a file was fully read. construction_pdf_split splits an oversized or drawing-set PDF by page range, per page, or top-level bookmark so the file tools can read the parts; structured-decomposition modes return unsupported.
The business tools construction_cost_calculate, construction_cost_compare, construction_cost_export, construction_schedule_calculate, construction_schedule_present, and construction_report_export run only while a matching business task is active: load the construction-cost, construction-schedule, construction-safety, or construction-quality skill with the skill tool to start one. Loading a business skill supersedes the previous task, so older task ids stop working.
Never treat a blank cell or missing price as zero, and never invent rates, dates, or a critical path.
```

#### 令牌效果

章节可见期间为每请求固定成本；隐藏所有工程工具的限制会移除整个章节。

#### KV 缓存效果

只要章节文本与可见性不变即为前缀稳定；工具注册、注销或作用域限制可能从第一个变化的提示词令牌起使复用失效。

### 工具 schema

#### 模型所见

每个可见工具的准确名称、描述与参数 schema；十个工具记录在生成的[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-construction-runtime)中。业务工具描述声明所需的活动任务类型，当模型提供时，`task_id` 参数携带绑定标识。

#### 令牌效果

每请求固定成本，与可见工程定义数量成正比；对某作用域隐藏工具会移除这些工具的整个 schema 成本。

#### KV 缓存效果

只要可见定义集合与顺序不变即为前缀稳定；注册或注销可能从第一个变化的 schema 令牌起使复用失效。

### 文件工具结果

#### 模型所见

`construction_files_inspect`、`construction_files_read` 与 `construction_files_search` 返回 `DocumentResult`：带 SHA-256 的文件标识、显式覆盖状态（`complete`、`partial`、`needs_review`、`failed`）及请求与实际覆盖和警告、内容（结构、块、单元格或页面）、`source_refs`（从 1 开始的 PDF 页码、Excel 工作表与单元格区域，或带段落、表格位置的 Word 章节路径）以及错误。公式单元格报告公式文本与生产者缓存值，并给出显式 `formula_cache` 状态——worker 从不求值公式。搜索结果为每个匹配携带其来源引用；没有可提取文本的页面被标记 `needs_visual_read`。

#### 令牌效果

数据相关，且在压缩前重复发送；截断读取（`max_chars`）与单元格上限以显式的部分覆盖警告约束保留内容。

#### KV 缓存效果

仅追加；新可见结果跟随可复用的请求前缀。

### 计价与进度结果

#### 模型所见

`construction_cost_calculate` 渲染一份紧凑的分析摘要——变体、合计、每项一行（含资源成本、单价、金额）与未决说明——随后在以 `Frozen result JSON — pass it back verbatim to construction_cost_export, construction_cost_compare, or construction_report_export; never retype, round, or edit its values.` 为标签的行下给出规范冻结 `CostResult` 的缩进 JSON。模型将该 JSON 块原样传回：它是唯一携带 `schema_version`、`calculator_version`、每项 `trace` 以及下游工具所校验其他字段的呈现面；其中的 `price_diff` 与 `quantity_diff` 行携带 `quantity_effect` 与 `price_effect` 字符串，两者之和与该行 `difference` 精确对账。`construction_schedule_calculate` 以同样方式渲染——场景、任务表、关键路径、假设与未决说明——随后给出以 `Frozen result JSON — pass it back verbatim to construction_schedule_present or construction_report_export; never retype, round, or edit its values.` 为标签的冻结 `ScheduleResult` JSON。`construction_schedule_present` 返回 `result_id`（规范结果的 SHA-256）与场景元数据，以及客户端图表从记录的工具结果折叠得到的 `gantt` 提示。

#### 令牌效果

数据相关，与条目、任务数量成正比；两个引擎输出可追溯的紧凑表格而非散文。

#### KV 缓存效果

新计算仅追加；重复展示相同场景复用同一结果标识。

### 文档汇总结果

#### 模型所见

`construction_report_export` 仅接受 `kind: "document"` 的 `DocumentSummaryResult` 数据：`{ schema_version: 1, summary, sections }`，其中 `sections` 将允许的章节名（`issues`、`evidence`、`controls`、`checks`、`nonconformities`）映射为字符串数组，并以 `## Issues` 式标题加要点呈现；`sections.unresolved` 进入 `## Unresolved items`。格式错误的数据会以普通工具错误失败并指明预期结构，数据中不被活动任务类型允许的章节键列入报表的省略章节说明。

#### 令牌效果

数据相关，每次导出发送一次；呈现的报表内容约束保留令牌。

#### KV 缓存效果

仅追加；新可见内容跟随可复用的请求前缀。

### 任务绑定拒绝

#### 模型所见

被活动任务检查拒绝的业务工具以普通工具错误失败，消息稳定且面向模型：`no active construction task: load one of the "construction-safety", "construction-quality", "construction-cost", "construction-schedule" skills with the skill tool before calling this tool`、`task "<id>" is stale or unknown; the active task is "<id>" (<type>), minted when its skill was loaded — reload the skill to start a new task`，以及 `task "<id>" is a <type> task and cannot run this <allowed> tool; load the matching business skill first`。文件筛查拒绝报告 `file must be a non-empty path`、`a session workspace is required to read construction files`、`"<path>" resolves outside the session workspace; only files inside the workspace can be read`、`"<path>" was not found in the session workspace`、`"<path>" is not a regular file`、`"<path>" is <size> bytes, above the <limit> byte limit; split it with construction_pdf_split or extract the needed part first`，以及针对旧版 `.doc`/`.xls`、宏启用文件和损坏或加密输入的显式格式状态。

#### 令牌效果

只有被拒绝或失败的调用会增加这些保留令牌。

#### KV 缓存效果

仅追加；新可见内容跟随可复用的请求前缀。

## 已知限制与 deferred 工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定该包何时需要特别的运维关注。它们是当前包的约束，而不是任务积压。

- **结构化图纸拆解 deferred** — 本发布未集成 MinerU；带 `mode: structure`/`mineru` 的 `construction_pdf_split` 返回显式不支持状态，绝不触达结构化提取器。
- **Excel 进度网络导出 deferred** — 基于 Graphviz 的节点式工作簿不在范围内；侧边栏甘特图仅消费 `ScheduleResult`。
- **加固的任务绑定子系统 deferred** — 每个作用域一个活动绑定、重载取代、执行器强制拒绝现已交付；作用域注册竞争、MCP 重连与对抗性防护矩阵等待多 Agent 编排。
- **标准检索是可选的** — 工程 Bundle 通过 MCP 客户端配置挂载标准 RAG；服务器不可达时，文件、计价与进度任务仍可完成并将检索报告为不可用。
- **同一时间只有一个业务任务** — 加载第二个业务 Skill 会取代第一个绑定；并行多领域工作是完整计划的功能。
- **展示结果存储是插件实例内的内存存储** — 首个发布不需要跨会话持久化：甘特图从当前会话记录的工具结果折叠，回放从会话日志派生，而非持久存储。
- **Worker 输出以文本为界** — 拆分 PDF 是二进制，因此拆分输出通过工件目录解析后的进程路径写入，而非 `writeText`；使用非本地文件系统后端的部署需要 `processPath` 可达 worker 主机的后端。
- **旧格式与受保护格式保持显式** — `.doc`/`.xls` 获得显式不支持状态，宏启用文件被拒绝，加密或损坏输入报告失败覆盖而非部分成功。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>供维护者使用的工作上下文 — 点击展开</summary>

None.

</details>

**Runtime invariant:** 不发布 `./invariant` 伴随包。该包拥有的每条执行关系（工具注册、Provider 注册、绑定监听、子进程生命周期）都由 tools 与 skills 注册表以及运行器的超时与中止处理在其提交点检查；不存在可能产生分歧的独立观察流，而[包 invariant 规则](../../AGENTS.md)称这必须是伴随包的唯一正当理由。
