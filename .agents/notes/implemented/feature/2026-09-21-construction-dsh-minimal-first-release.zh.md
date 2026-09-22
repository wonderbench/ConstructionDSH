# Agent Note: ConstructionDSH 最小首版范围

Status: implemented

[English](2026-09-21-construction-dsh-minimal-first-release.md) | 中文

## 问题

[完整开发方案](2026-09-21-construction-dsh-development-plan.zh.md)定义了完整的首版设计：规范 RAG、共用文件工具、四个业务 Skill、基于 MinerU 的图纸拆分、造价、进度、侧栏横道图、Excel 网络图以及智慧工地/BIM 预留。对照仓库自身的检查，这一范围对单次交付过大：三个外部集成（MinerU、Graphviz、Frappe Gantt）、一套强化的任务绑定子系统、十五个模型工具和十八条验收条件，在获得任何用户反馈之前就要各自承担逐文件覆盖率、无密钥快照和双语文档成本。

本说明将首版收窄为能够交付可验证工程成果的最小端到端闭环：先完成再完美。完整方案继续作为所有保留规则的设计依据；本说明只负责收窄后的范围、简化的执行强度和重新基准化的验收。

## 决策

**首版交付：通过 MCP 配置接入规范 RAG、共用的 Word/Excel/轻量 PDF 读取、机械 PDF 拆分、带轻量任务校验的四个业务 Skill、确定性造价、CPM 排程和只读侧栏横道图。延后：MinerU 图纸拆解、Excel 网络图导出、强化的任务绑定子系统和全部智慧工地/BIM 接口。**

### 范围

| 编号 | 首版交付 | 延后至完整方案 |
|---|---|---|
| S1 | 规范 RAG 通过现有 MCP 客户端配置接入 [R4]；`web_search`/`web_fetch` 保持独立 | 重建 RAG、强制检索、项目资料入库 |
| S2 | 共用的 Word/Excel/轻量 PDF 只读工具，带 `SourceRef` 与明确的覆盖状态；`.doc`/`.xls` 返回明确的不支持提示 | 历史格式无损转换 |
| S3 | 用 pypdf 按页段、逐页或书签机械拆分 [E1]，交付拆分文件、`index.json` 和原页映射 | MinerU 结构化拆解、图纸任务持久化与恢复 |
| S4 | 四个 Skill 的内容建设，外加一个共用的逐工具任务类型校验 | `TaskBinding` 管理器、阶段快照、对抗性守卫矩阵 |
| S5 | 一个确定性十进制造价引擎，覆盖综合单价、投标报价、变更估价和结算审核 | 全国定额库、自动定价 |
| S6 | CPM 排程计算和由 `ScheduleResult` 驱动的固定只读侧栏横道图 [E4] | Excel 网络图导出（Graphviz）、拖拽排程、资源优化 |
| S7 | 无 | 全部智慧工地/BIM 接口、权限字段和 Mock |

### 仓库落点与复用

首版遵循仓库的插件、Profile、Bundle 机制；不修改 `agent-loop`，不新增绕过 `dsh` 的启动路径。[R2] [R3] [R8]

| 位置 | 责任 |
|---|---|
| `packages/construction/construction-runtime/` | Host 工具、任务类型校验辅助、文件/造价/排程模块，以及作为包资产的固定 Python 读取脚本 |
| `packages/client/ui-construction-gantt/` | 固定的横道图侧栏组件；命名与位置经客户端包检查验证 |
| `packages/bundle/construction/` | 显式的工程组合；上游默认 Profile 不变 |
| `apps/cli/config/examples/construction/cordis.yml` | 与现有示例目录并列的示例组合，经 Loader 测试验证 |
| `packages/preset/agent-presets/presets/drawing-split/` | 图纸拆解 Agent 模式，随首屏模式选择改造以出厂预设形式新增 |

先复用再建设：文档脚本复用 `skill-office` 的 Python 资产模式 [R10]；工作区文件访问复用 `tool-fs` [R11]；规范 RAG 复用 `mcp-client` [R4]；横道图页签复用 `ui-sidebar-right` 注册机制 [R7]；成果交付复用现有文件交付工具 [R12]。现有 `packages/schedule/` 组负责定时跟进任务，保持不动。

### 完整方案保留的内容

完整方案继续负责：`SourceRef` 的格式与各格式质量规则；pypdf、pdfplumber、pypdfium2 的轻量 PDF 分工 [E1] [E2] [E3]；公式缓存、字段映射和空白不为零规则；十进制运算与工作日边界约定；路径、符号链接、附件文字视为数据和密钥的安全规则；以及所有延后项。本说明只收窄范围与执行强度，不改动这些内容。

### 最小工具清单

| 工具组 | 工具 |
|---|---|
| 文件只读 | `construction_files_inspect`、`construction_files_read`、`construction_files_search` |
| 机械拆分 | `construction_pdf_split` |
| 造价 | `construction_cost_calculate`、`construction_cost_compare`、`construction_cost_export` |
| 进度 | `construction_schedule_calculate`、`construction_schedule_present` |
| 成果文档 | `construction_report_export` |

四个图纸任务工具和 `construction_schedule_export_network` 与对应功能一起留在首版之外。请求结构化图纸拆解时返回明确的不支持状态，不会落入隐藏的兜底路径。

### 轻量任务校验

Bundle 只组合工程工具，因此工程 Profile 通过显式禁用承载它们的 base 行来排除面向模型的任意 Shell、代码执行与插件安装（`tool-bash`、`tool-pwsh`、`tool-workflow`、`workflow-ptc`、`ptc-runtime` 携带 `disabled: true`；插件管理工具在 `dsh-base` 中本已禁用）。每个业务工具执行前通过一个共用辅助校验当前任务类型；跨域调用和失效任务标识被拒绝。完整方案中针对对抗性绕过的 `restrict`/`guard` 强化——局部注册、MCP 重连、并行阶段竞争——留待多智能体编排出现时再建。[R5] Skill 从受控只读来源加载，使用 `includeDefaultRoots: false`。[R6]

### 开发顺序

首版按既定顺序分三个阶段交付：先交付运行时包、Bundle、示例覆盖配置、文件工具、机械拆分、RAG 配置和业务 Skill；再交付覆盖四个子流程的造价引擎与报告导出；最后交付 CPM 排程和侧栏横道图。横道图组件使用固定 `ScheduleResult` 样例与前两个阶段并行开发。

## 考虑过的替代方案

**一次性实施完整方案：不采用。**三个外部集成和强化的绑定子系统会推迟每一个可验证闭环，而仓库门禁会在首次用户会话前放大每个新包和每个工具的成本。

**砍业务 Skill 而非砍机制：不采用。**四个工作流是面向用户的价值；被延后的机制防御的是单智能体首版并不存在的多智能体并行与对抗性调用威胁。

**首版保留 MinerU：不采用。**鉴定一个已安装版本、其真实接口、任务持久化与恢复是独立工作流；机械拆分已覆盖明确的页段请求，其余诉求返回明确的不支持状态。

**进度只交付表格不上横道图：不采用。**可读图表是进度工作流的主要成果；组件保持固定、只读且仅由 `ScheduleResult` 驱动，成本因此受限。

**只用提示词声明工具白名单：不采用。**组合加逐工具任务校验是软件真正执行的最廉价强制。

## 验证

[construction-runtime 测试套件](../../../../packages/construction/construction-runtime/tests/)（135 个测试）固定文件工具、机械拆分、覆盖四个子流程的十进制造价引擎、CPM 计算、任务绑定拒绝、Skill 命令入口和 Python 工作进程协议，包括固定的造价与排程样例。[ui-construction-gantt 测试套件](../../../../packages/client/ui-construction-gantt/tests/)（103 个测试）固定方案折叠、图表配置与渲染，包括在 420px、720px 侧栏和全屏下的 105 任务可读性样例。[Loader 测试](../../../../apps/cli/tests/construction-config.spec.ts)验证示例组合；[boot profile 测试](../../../../packages/boot/app-boot/tests/profile.spec.ts)固定随附的 `construction` profile 模板。[construction-cost-calculate](../../../../snapshots/session/construction-cost-calculate/)、[construction-schedule-present](../../../../snapshots/session/construction-schedule-present/) 和 [construction-task-denial](../../../../snapshots/session/construction-task-denial/) 三个无密钥录制会话场景经无头 profile 回放随附工具。三个包的双语 README 对与一致性记录、新包源码的逐文件覆盖率门禁和 `verify-package-*` 检查全部通过。

## 后果

每个 Skill 随附 `SKILL.md`、输出模板和至少一个正常与一个异常去标识样例；完整方案 Skill 包中的以下内容组件在本版裁剪，仍由完整方案交付：每个造价子流程与每个 Skill 的四类样例矩阵（正常/缺输入/格式错误/证据冲突）、逐 Skill 字段字典、逐 Skill 独立绑定声明和独立校验规则文件。延后项是用户可见的缺口：首版文档说明图纸拆解、Excel 网络图和平台对接尚不可用，不暗示已具备。DSH 接口处于预稳定阶段；升级 DSH 前复测 MCP、工具注册、Skill 发现和侧栏行为。任一延后项进入交付时，同一变更更新完整方案，使两份说明保持一致。

## 参考依据

仓库链接指向当前文件。外部链接为项目官方仓库或文档，记录选型依据而非已完成的集成测试。

[R2]: ../../../../AGENTS.md

[R3]: ../../../../pnpm-workspace.yaml

[R4]: ../../../../packages/mcp/mcp-client/src/index.ts

[R5]: ../../../../packages/core/tools/README.zh.md

[R6]: ../../../../packages/skill/skill-filesystem/src/index.ts

[R7]: ../../../../packages/client/ui-sidebar-right/README.zh.md

[R8]: ../../../../packages/AGENTS.md

[R10]: ../../../../packages/skill/skill-office/README.zh.md

[R11]: ../../../../packages/fs/tool-fs/README.zh.md

[R12]: ../../../../packages/deliverables/tool-present/README.zh.md

[E1]: https://github.com/py-pdf/pypdf

[E2]: https://github.com/jsvine/pdfplumber

[E3]: https://github.com/pypdfium2-team/pypdfium2

[E4]: https://github.com/frappe/gantt
