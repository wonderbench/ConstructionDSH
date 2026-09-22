# ConstructionDSH UI 提升方案

日期：2026-09-21 ｜ 基线：`wonderbench/ConstructionDSH` `master` 分支（本地工作区与该分支基线一致）
参照物：`deepseek-ai/deepseek-harness`（DSH 上游）与 `zai-org/ZCode`（zcode.z.ai）
状态：方案文档，实施改动已按各条实施状态注记在本工作区落地。

> **边界声明**：本方案是文档输出。编制时本仓库存在正在实施的任务（`packages/construction/`、`packages/bundle/construction/`、`packages/client/ui-construction-gantt/` 三个新增包，以及 `ui-conversation` EmptyHero/HeroShell、`ui-sidebar` 的未提交改动和 `.agents/notes/implemented/feature/2026-09-21-construction-dsh-*` 设计笔记）。本方案**不触碰上述任何文件**，仅在第五节说明如何与之衔接。

---

## 一、本地复核结论（对原分析的事实核查）

原分析中关于 **DSH 侧** 的关键事实已逐条在本地源码与文档中核实，全部属实：

| 原分析论断 | 本地证据 | 结论 |
|---|---|---|
| DSH 具备完整界面基础设施（工作区、会话、侧栏、预览、交付） | `packages/client/` 下确有 `ui-workspace`、`ui-conversation`、`ui-sidebar`、`ui-sidebar-right`、`ui-sidebar-documentpreview`、`ui-sidebar-browser`、`ui-sidebar-terminal`、`ui-sidebar-files`、`ui-deliverables`、`ui-dockkit`、`ui-layout`、`ui-primitives`、`ui-theme` 等 50+ 界面包 | ✅ 不应重复造轮子 |
| 输入区为 Lexical 编辑器，含草稿与提交状态机 | `ui-conversation/src/client/input/facade.ts`（SessionInputShell）、`skeleton/InputBar.tsx`；`2026-09-14-composer-model-and-draft-editor` 笔记确认组合输入、失败恢复等专门处理 | ✅ 编辑器内核与提交链路不应重写 |
| 右侧面板经 `ctx.sidebarRight` / `ctx.sidebarRightTabs` 扩展，按标签类型注册 | `2026-09-05-sidebar-tab-types-and-navigation` 笔记；`ui-chat/src/client/apply.ts` 中 `openResource(url, { params: { line } })` 实例 | ✅ 新内容应走该注册机制 |
| 右侧面板**刷新后回到收起默认态**，无跨刷新布局持久化 | `ui-sidebar-right/README.md`："a session starts collapsed and empty"；分栏、浮出由 `ui-dockkit` 承担 | ✅ 布局记忆是真实增量点 |
| 字号设置主要作用于会话内容，非全界面字号体系 | `2026-08-18-settings-font-size-control`：ui-theme 拥有 `fontSize`（12–17px），由 ui-layout 写入 `--dsh-content-font-size` | ✅ "界面字号与内容字号分离"是有效借鉴点 |
| `present` 交付机制完整（显式交付、不可变快照、持久事件） | `packages/deliverables/tool-present/`、`deliverables/presented` 事件见 `docs/persistence-schema.json`；`ui-deliverables` 负责渲染 | ✅ 不照搬 ZCode 成果卡片，只加业务语义 |
| 后台作业界面是**只读投影**，无停止入口 | `ui-jobs/README.md`："this package is a read-only projection for the human...issues no RPC of its own"；取消能力在 `ctx.jobs`/`job_kill` 侧且涉及模型侧运行契约 | ✅ 第一轮只做只读汇总+跳转，不做停止按钮 |
| 样式体系：`--dsw-*` 语义令牌、CSS Modules、ui-theme 统一管理 | `--dsw-alias-*`、`--dsw-elevation-*` 令牌见笔记与源码；`ui-theme`/`ui-primitives` 为共享控件来源 | ✅ 不引入第二套样式体系 |
| ZCode（zai-org）真实存在 | zcode.z.ai 官方文档、`github.com/zai-org` 组织及 zcode-plugins 仓库均在线可查 | ✅（组件级文件名未逐文件核对，采信原分析并标注为"上游参考"） |

**复核后的总体判断与原分析一致**：DSH 的界面基础设施已相当完整，值得吸收的是 ZCode 对任务入口、信息层级、非编程界面、工作状态与操作入口的组织方式，而不是再造侧栏、预览或输入框。

---

## 二、总体原则

1. **保留 DSH 插件骨架**：所有改动通过 Cordis 插件、声明式插槽、`ctx.sidebarRight` 标签类型注册接入；不改 `agent-loop`，不新增绕过 `dsh` 的 Node 应用入口。
2. **收起技术细节，不删除技术能力，不降低权限检查**：审批、确认、高风险操作提示在任何模式下保持明显。
3. **单一编辑器、单一提交链路**：输入区只调整外壳与控件排序，Lexical 内核、组合输入、附件上传、草稿恢复、Queue/Steer 语义不动。
4. **只用一套样式体系**：`--dsw-*` 语义令牌 + CSS Modules + `ui-theme`/`ui-primitives`；不引入第二套 Tailwind/颜色变量/组件库。
5. **真实数据驱动展示**：状态字段来自会话事件与工具结果，不展示未取得的状态，不用假 `0/0` 冒充进度。
6. **输出简约、折叠而非删除**：业务模式下默认呈现结论与成果，模型的说明性、免责性长文视觉折叠、展开即全文原文；不自动改写或丢弃模型输出，会话日志与模型可见性完全不变。


---

## 三、九项改进（按优先级）

### P1 业务模式／专家模式（优先级最高）

- **现状**：DSH 面向专业用户，执行细节、终端、工具参数始终可见。
- **借鉴**：ZCode `interfaceMode === "office"` 的条件呈现思想（终端按钮隐藏、Diff 展开行为随模式调整）。
- **做法**：新增"业务工作台（默认）／专家模式（按需开启）"呈现开关，不叫 Office 模式。
  - 业务模式：突出项目、任务、文件、成果、当前步骤、待确认事项、失败原因；
  - 专家模式：技术工作区、执行详情、终端、工具参数、插件配置、运行诊断。
  - 落点：`ui-layout` 呈现开关 + `ui-sidebar`/功能入口可见性 + `ui-settings-general` 设置项（走现有设置 Schema，不硬编码）。
- **红线**：审批与确认 UI 在业务模式下依然完整呈现；模式只影响呈现，不影响权限与能力。

> **实施状态（2026-09-21，批次 2）**：已交付——`uiMode` 设置项（`business` 默认/`expert`，ui-theme settings 命名空间，经既有设置管道持久化）→ `ThemeSnapshot.uiMode` → 双路径发布 `body[data-dsw-ui-mode]`（boot 脚本 + ui-layout 展示转换器）；`@deepseek-ai/dsh-client-ui-theme/client` 导出纯 helper `readUiMode()`；ui-sidebar 经快照镜像订阅，业务模式下隐藏技术面板入口（当前为插件管理入口，terminal 入口已预留标记），审批与设置入口不过滤；设置行位于「通用」分区。与 P9 降噪开关相互独立设置、行为随模式联动（正文折叠仅业务模式生效）。决策笔记：`2026-09-21-ui-mode-business-expert-switch`。

### P2 场景化新任务页

- **现状**：新会话以工作区选择为前提，未选工作区时输入区不可用。
- **借鉴**：ZCode 将工作区、执行模式、模型等上下文集中在输入区附近并提供模板入口（`ChatEmptyState.tsx` / `ConversationDraftEmptyState.tsx`）。
- **做法**：首屏提供少量明确入口——**日常文档处理**（轻量解析流程）、**图纸拆解**（多份长图纸 PDF 拆分，拆完即止）、**自由任务**（通用对话）。点击后进入**同一套**会话界面，仅调整提示、默认能力与必要输入项；不开发多套聊天页面。
- **落点**：`ui-conversation` 空态插槽（EmptyHero/HeroShell 实施中，本项应在其落地后叠加，见第五节）。
- **补充**：可增加"临时工作区"入口（拖入文件即开始），但必须明确工作目录、保存位置与保留规则。

> **实施状态（2026-09-21，方案调整）**：三按钮首屏入口方案**已被否决并移除**——它与 hero 既有的 Agent 预设选择芯片职责重复且破坏首屏简洁度；模式选择收敛为 Agent 预设：日常使用即标准模式（默认预设），特殊需求在 hero 芯片切换到出厂预设「图纸拆解模式」（`drawing-split`，自包含拆分组合，见 `packages/preset/agent-presets/presets/drawing-split/`）。决策与否决理由见 `.agents/notes/implemented/feature/2026-09-21-agent-modes-as-presets.md`。「临时工作区」入口仍未实施（需工作区生命周期决策）。

### P3 输入区信息层级

- **做法**：输入区外壳分三层——上方"当前任务上下文"（项目、任务类型、已选文件）；中间"需求输入"（保持编辑空间）；下方"执行控制"（左：添加资料与常用能力；右：模型、执行策略、发送/停止）。
- **红线**：只做外壳与控件排序；组合输入、附件上传进度、失败恢复草稿、跨会话草稿保留、Queue/Steer 语义全部保持现有行为并有回归测试。

> **实施状态（2026-09-21，批次 1 后续）**：已交付——`ui-conversation` 的 InputBar 卡片分为三层：上层「当前任务上下文」分组（常驻全局 seats 解析出的工作区身份行 + owner `accessory` + 已选文件附件栏；hero 变体保留卡片上方可交互的工作区 chip 行，不在卡内重复），中层 Lexical 编辑面不动，下层执行控制行顺序与归属不变；空上下文层折叠不占行距。层装饰采用 P6 界面字号角色（`--dsw-ui-font-secondary`）。分层仅 DOM 分组 + 排序，既有 InputBar/input/queue 行为规格全绿；含 docked composer 的 web 场景 golden 按新工作区身份行同步刷新。任务类型上下文（计划模式、目标、已认领指令、整队插话）仍由编辑面占位与 hint 表达，未新增重复装饰。

### P4 统一任务摘要

- **现状**：待确认标记、`ui-jobs` 只读作业列表分散在各自区域。
- **借鉴**：ZCode `ConversationStatusPanel` 聚合目标、计划、后台作业、子代理、工作流状态；只展示真实取得的状态，可停止性取决于实际控制句柄。
- **做法**：在现有会话/计划/作业状态**之上**增加只读聚合视图（以 `ui-goal`、`ui-plan`、`ui-jobs` 既有数据源为输入），例如长图纸拆解任务显示"当前步骤 / 已生成数量 / 待确认事项"。
- **红线**：没有总量就不画百分比；不把"工具调用结束"等同于"业务任务成功"。**第一轮不做作业停止按钮**——取消涉及模型侧对任务终止的认知（`job_kill` 运行契约），须连同运行契约一起设计，另行立项。

### P5 业务分组与 Quick Actions

- **做法一：业务分组**——同一工程下的"资料整理、图纸拆解、成果复核"作为任务组织信息，不依赖磁盘目录，不改变文件访问范围或工作区身份。
- **做法二：可执行搜索**——参考 ZCode `quickPickCommands.ts` 的结构（分区、标题、关键词、快捷键、可用状态、执行函数），将"新建图纸拆解""打开成果目录""切换专家模式"接入 DSH 现有命令与导航机制（`ui-commands`），搜索即执行。

> **实施状态（2026-09-21，部分相关交付）**：命令目录已新增「功能」分区（`commands` 类型扩展 `section: add | functions | commands`），construction-runtime 将四个业务 Skill 注册为功能命令（中文行、点击落入草稿等待补全，等效输入 `/construction-cost`）——这是"搜索即执行"机制的一部分。业务分组与可执行搜索本身未开始。

### P6 全界面字号与密度规范

- **借鉴规则**（不是颜色数值）：
  1. 界面字号与内容字号分离——目前只有 `--dsh-content-font-size`（12–17px）作用于会话内容，需增加界面文字字号角色（项目名、菜单、文件名、状态说明）；
  2. 用文字层级区分信息，不靠逐块加边框；
  3. 同类控件（文件卡片、状态卡片、设置项）留白与操作区遵循共同规则。
- **本地化调整**：不照搬 ZCode 字号值；DSH 交付卡片存在 10px 次要文字，对中文长文件名与工程资料应提高重要元信息的可读性。
- **落点**：`ui-theme` 令牌扩展 + `ui-primitives` 共享控件 + 各组件 CSS Modules；全界面生效但不改变页面几何布局。

### P7 分栏记忆与自适应

- **现状**：右侧面板可分栏/浮出，但会话初始收起且空，刷新后回到默认态；字节型预览重新挂载可能回到顶部。
- **做法**：分步实现——先记侧栏宽度与展开状态；再记已打开标签、活动标签；最后 PDF 页码等阅读位置。恢复时重新校验文件存在性与可访问性，无法恢复给出说明；布局持久化数据**不含文件二进制内容**。
- **落点**：`ui-layout` + `ui-sidebar-right`/`ui-dockkit` 状态层，经其公开状态接口实现，不改布局引擎内部。

> **实施状态（2026-09-21，批次 2）**：前两步已交付——右栏宽度经版本化键 `dsh.ui-layout.v1` 持久化（损坏自清、重载按新窗口重新钳制）；展开状态与标签/活动标签本已按会话持久化（`dsh.sidebar-right.v1.<sessionId>`），本次补上了**恢复时存在性重校验**：文件确定缺失的标签走正常关闭路径并给出可关闭的本地化说明。PDF 页码等阅读位置**受阻**：其状态为 ui-sidebar-documentpreview 私有，需该包开放公开状态接口，已在决策笔记 `.agents/notes/implemented/feature/2026-09-21-p7-sidebar-layout-memory.md` 记录后续设计。

### P8 成果卡片业务语义与选区引用（谨慎项）

- **成果卡片**：不移植 ZCode `AssistantPreviewCards.tsx`；在现有 `ui-deliverables` 卡片上按需增加业务信息（"图纸拆解成果""对应源文件""输出数量"）与动作（预览、打开目录、继续处理），字段来自真实交付事件（`deliverables/presented`、workspace-changes），不采信模型自由生成的完成声明。
- **选区追问**：ZCode 的对话选区引用不能直接当作 PDF 页码/Excel 单元格引用。目标应是"选中即携带文件身份与可定位位置"，但 PDF 页码、表格单元格、图纸区域各自需要查看器支持，**列为第三轮独立功能**，与进行中任务定义的 `SourceRef` 方向一致（衔接见第五节）。

### P9 输出降噪：保持简约，抑制"任务圆满"式干扰（Beta 开关，默认关闭，第一轮交付）

**问题分析**

模型输出天然带有"为了让任务显得圆满"的冗余：解释性段落（"为了确保准确性，我首先…然后…"）、免责与注意事项堆叠（"请注意，实际结果可能…"）、字段罗列（把工具返回的状态码、耗时、路径全集原样铺给用户）、以及自我声明式总结（"已圆满完成全部工作"）。对专业使用者这是可扫描的技术轨迹；对工程业务人员，这些内容淹没了真正的结论与成果——**他们要的是"做完了什么、结果在哪、要我做什么"，而不是模型的推理过程和自我辩护**。干扰性内容越多，用户对真实结果的信任反而越低，因为噪音让"哪些话要当真"变得无法分辨。

**三条设计原则**

1. **折叠而非删除**：默认只显示一行结论、成果卡片与待确认事项；说明性长文折叠为"查看说明"，展开即是模型原文，一字不改、一字不丢。会话日志与"Model-visible ⟺ logged"契约完全不受影响——这是纯呈现层策略，不涉及任何提示词或日志改动。
2. **结构优先于散文**：能用结构化字段呈现的信息不依赖模型散文。成果用交付卡片，状态用 P4 摘要，进度用真实事件——模型的描述性文字只承担"结论一句话"的角色。
3. **完成判定与完成声明分离**：成功/失败/部分完成的展示依据永远是工具结果与交付事件；模型的"圆满完成"声明不升级界面状态，只作为可折叠的正文存在。这条与总体原则 5（真实数据驱动）共同封堵"假圆满"。

**具体实施**

- **设置开关（Beta，默认关闭）**：P9 全部行为由一个设置项控制，注册在 `ui-settings-general`（外观区），带 `Beta` 标记，**默认 `off`**。默认状态下界面与现状完全一致、零行为变化——避免"实施后过于极端的简约"影响现有用户；用户手动开启后折叠与字段分层才生效。该开关**独立于 P1 的业务/专家模式开关**，设置相互独立、可任意组合，行为随模式联动（正文折叠仅业务模式生效、专家模式保持全文，工具字段分层两模式均生效、专家模式默认展开）；设置持久化走现有 `ui-theme`/settings 管道（Schema 声明 + 快照发布），不硬编码。Beta 期观察反馈稳定后，再评估是否提升默认值或并入 P1 的业务模式默认行为。
- **回合尾部聚合**（`ui-chat` 回合尾部，`ui-deliverables` 卡片之上）：一回合结束后，正文默认折叠为"一句结论 + 成果卡片 + 待确认事项（若有）"；超过阈值（如 3 行）的解释性正文收进"查看说明"。展开状态按回合计忆，不跨刷新持久。**仅在开关开启时生效**。
- **工具结果字段分层**（`ui-tool` keyed renderer）：业务模式平铺用户可理解的字段（文件名、数量、结果状态、下一步动作）；技术字段（原始 JSON、耗时、完整路径、调用参数）收入"技术详情"折叠区，专家模式默认展开。沿用现有按工具类型注册呈现的机制，不新建渲染框架。
- **与提示词层面划清边界**：让模型少说废话（如"结论—成果—风险"三段式收尾）属于预设/提示词工程，应随进行中任务的 construction bundle 预设一并设计（见第五节），本方案的 P9 全部在呈现层完成、不依赖模型行为改变——**即使模型照旧输出长篇说明，界面依然简约**。

**修改前后对比**

| 场景 | 修改前 | 修改后 |
|---|---|---|
| 一次图纸拆解完成 | 长段"我已经对每份文件进行了…同时提醒您…" + 12 个文件路径列表 | 一行"拆解完成：12 个文件" + 成果卡片（源文件/输出数量/打开目录）+ 折叠的"查看说明" |
| 工具执行中间输出 | 状态码、参数、耗时全量铺开 | 一行业务化状态，技术详情折叠 |
| 模型自称"圆满完成"但部分失败 | 用户被声明误导 | 界面状态由事件判定，显示"部分完成 + 待确认"，声明收进折叠区 |

**验收补充**：开关关闭时呈现与现状逐像素一致（零回归）；开启后折叠/展开行为正确且展开后逐字等于日志原文；专家模式默认全量；成功/失败展示依据为事件而非模型声明；设置项持久化与重启恢复正确；现有快照仅在开关开启的用例中因默认折叠的呈现变化同步更新。

> **实施状态（2026-09-21，批次 1）**：P9 的第一段已交付——`ui-theme` 拥有 `outputDenoise` 设置项（`ui-theme` 命名空间，schema 默认 `false`）与「通用」分区第三行开关（带 Beta 标记）；快照经 `ThemeSnapshot.outputDenoise` 发布，boot 脚本与 ui-layout 展示转换器写入 `body[data-dsw-output-denoise]`。
>
> **实施状态（2026-09-21，批次 2）**：回合尾部聚合与工具字段分层已交付——两者落在 **ui-chat**（助手正文与回合尾部的渲染方）与 ui-tool，严格分支在开关开启时才生效，开关关闭与现状逐字节一致；展开即为日志原文，专家模式技术详情默认展开。实现决策见 `.agents/notes/implemented/feature/2026-09-21-output-denoise-presentation.md`。



---

## 四、实施顺序与验收

### 第一轮：每日主界面（呈现层为主，范围最易控制）

P1 业务/专家模式、P2 场景入口（三按钮方案被否决、收敛为 Agent 预设，见该节注记）、P3 输入区层级、P6 字号与密度规范、P9 输出降噪（Beta 开关、默认关闭）。保留原有预览、交付卡片、审批、排队与执行轨迹。

> **实施状态（2026-09-21，批次 1）**：P6 已交付令牌层——`ui-theme` 新增 `typography.css` 声明界面字号角色（`--dsw-ui-font-strong/base/secondary/caption` 与对应 `--dsw-ui-line-*`）。
>
> **实施状态（2026-09-21，批次 3）**：界面字号角色已完成逐界面采用（92 个 CSS 文件、38 个包；界面文本下限 11px 由 `typography.css` 令牌注释约定，8–10px 字号全部上移；会话内容轴 `--dsh-content-font-size` 不变）。"仅声明、无消费"仅适用于批次 1 时点。
>
> **实施状态（2026-09-21，批次 1→3）**：P4 聚合已扩展为完整只读合并——`ui-jobs` 弹层自上而下为：待确认事项（会话状态座位最高优先级 PendingInteraction）、当前目标（goal 投影）、计划模式（plan 投影，与输入区 plan chip 口径一致）、子代理目录行、后台任务列表；无总量不画百分比、无停止按钮。仅**工作流状态**与**成果数量**因无真实投影源暂未并入，面板留有插入位（见 ui-jobs README 与 `.agents/notes/implemented/feature/2026-09-21-unified-status-aggregation.md`）。

**验收要求（回归底线，逐条检查）**：

- 中文输入法组合输入正常；
- 附件上传、失败恢复草稿、切换会话保留草稿均不回退；
- 执行中 Queue/Steer 发送语义不变；
- 审批与确认在业务模式下依然明显、可理解；
- 窄窗口下主要操作可用（右侧面板 768px 自动全屏行为不回退）；
- 现有 recorded-session 快照与双语预期输出同步更新（`pnpm run test` 与 snapshot 覆盖）。
- P9 专项：业务模式下说明性长文默认折叠、展开逐字等于日志原文；成功/失败展示依据为工具与交付事件，模型的"圆满"声明不升级界面状态。

### 第二轮：长任务与多任务连续工作

P5 业务分组与 Quick Actions 本体、P7 第三步（PDF 页码等阅读位置，待 documentpreview 公开状态接口）、P4 补充（工作流状态与成果数量，待真实投影源）。逐项验证会话切换与刷新恢复；不引入作业停止等运行契约变更。

### 第三轮：工程资料专属交互

带页码/单元格/图纸区域的选区引用（依赖对应查看器与 `SourceRef` 落地）、图纸拆解成果导航、结构化表格定位。这些不是"借组件"能完成的 UI 工作，需与业务流程共同设计。

---

## 五、与进行中任务的衔接（只说明，不改动）

进行中的 `2026-09-21-construction-dsh-development-plan` 已定义：四个业务 Skills、独立图纸拆解流程、`SourceRef` 来源定位、`packages/construction/construction-client/` 承担"工程成果卡片、横道图侧栏、状态显示和本地化文档"。本方案与其关系：

| 本方案条目 | 衔接方式 |
|---|---|
| P2 场景化入口（图纸拆解） | 待 EmptyHero/HeroShell 实施落地后，在其空态之上增加"图纸拆解"入口；入口只调整提示与默认能力，业务流程仍由进行中任务的 `construction-drawing-split` 承担 |
| P4 统一任务摘要 | 摘要字段可消费进行中任务定义的真实状态事件（拆分状态、成果索引），但摘要视图本身属于本方案新增的聚合呈现 |
| P8 成果卡片业务语义 | 业务字段（"图纸拆解成果""输出数量"）应由 `construction-client` 的成果卡按其计划实现；本方案仅约束"字段来自真实结果记录"这一原则 |
| P8 选区引用 | 完全依赖进行中任务的 `SourceRef` 定义，本方案不先行 |
| P9 输出降噪 | 呈现层折叠/分层由本方案承担、不依赖模型行为；"结论—成果—风险"三段式收尾等提示词建议，应随进行中任务的 construction bundle 预设一并设计，本方案不直接改动该任务 |

### 与进行中任务的冲突面与开工顺序（基于 2026-09-21 工作区状态）

进行中改动集中在：`ui-conversation` 的 EmptyHero/HeroShell 与 `contract/slots.ts`、`locales.ts`，`ui-sidebar` 的 SidebarRoot 及其快照/测试，`tsconfig.client.json`/`tsconfig.host.json`，以及 `packages/README*` 和 `snapshots/web/lifecycle-chrome/*`。据此划分：

- **直接冲突，暂缓开工**：P2（空态入口落在 EmptyHero/HeroShell 上，必须等其在制改动落地后叠加）、P3（输入外壳与在制的 composer/draft 重构笔记同一区域，需先等该设计收敛）；
- **部分重叠，需协调**：P1 的侧栏入口可见性涉及 `ui-sidebar`（在制文件），P7 涉及 `ui-layout`/`ui-dockkit` 状态层——等在制 SidebarRoot 改动合入后再动；
- **无冲突，可立即开工**：P6（`ui-theme` 令牌扩展 + `ui-primitives`，在制改动不涉及）、P9（新设置项 + 新呈现组件，默认关闭故不触碰现有快照）、P4（只读聚合呈现，消费既有数据源）、P5（`ui-commands` 动作注册）。

开工顺序建议：第一批 P6 + P9 + P4（全部落在无冲突包上）；在制任务合入后第二批 P1 + P7；最后 P2 + P3 叠加在 EmptyHero 与 composer 成果之上。任何一批都不得修改在制任务正在编辑的文件与其快照预期（`hero.expected.md`、`sidebar-snapshot` 等）。

> **工作区说明（2026-09-21 复核补充）**：上述自我约束在后续实施中被有意突破——当前工作区以单一交付流合并推进：品牌在制改动（EmptyHero/HeroShell 与 `lifecycle-chrome` goldens）与 P1 侧栏改动同处 `ui-sidebar` 的 `SidebarRoot` 与 hero golden 一个 diff 内；P3 的 composer 外壳刷新亦叠加在同批 goldens 上。这是有意的同一工作区并行交付，不是疏漏；提交时建议按关注点拆分提交（品牌 / P1 模式 / P9 降噪 / P3 外壳 / P6 字号 / P7 记忆 / 工程特性），goldens 随其触发变更各自归队。

**不移植边界**：不整体移植 ZCode 的 `App.tsx`、全局 Store（Zustand）和 RPC 依赖——DSH 经 Cordis、声明式插槽与会话绑定组织界面，直接搬模块会引入第二套状态来源。

**许可**：DSH 为 MIT，ZCode 仓库主许可证为 Apache-2.0。若任何实现直接移植 ZCode 代码，须保留许可与归属声明并标记修改；不移用 ZCode 品牌资产。优先按 DSH 公开扩展接口重新实现交互。

---

## 六、落点对照表（设计期建议位置；实施现状以各条实施状态注记为准）

| 借鉴方向 | ZCode 参考（上游） | DSH 落点 |
|---|---|---|
| 业务/专家界面 | `hooks/useInterfaceMode.ts`、`WorkspaceTerminalToggleButton.tsx` | `ui-layout` 呈现开关 + `ui-sidebar`/入口可见性 + `ui-settings-general` 设置项 |
| 新任务与输入区 | `ChatEmptyState.tsx`、`v4/ConversationDraftEmptyState.tsx` | `ui-conversation` 空态插槽（在实施中 EmptyHero 成果之上叠加）；输入外壳 `InputBar` 外层 |
| 状态摘要 | `v4/ConversationStatusPanel.tsx`、`conversationStatusPanelModel.ts` | 以 `ui-goal`/`ui-plan`/`ui-jobs` 数据源为输入的聚合呈现（已并入 `ui-jobs` 弹层） |
| 快捷操作 | `quickpick/quickPickCommands.ts`、`TaskFindDialog.tsx` | `ui-commands` + 工作区导航接入 |
| 字体与视觉规范 | `DESIGN.md` | `ui-theme` 令牌、`ui-primitives`、组件 CSS Modules |
| 分栏连续性 | `app-shell/WorkspaceShellLayout.tsx` | `ui-layout`、`ui-sidebar-right`/`ui-dockkit` 状态层 |
| 成果与阅读交互 | `AssistantPreviewCards.tsx` | `ui-deliverables`、`ui-sidebar-documentpreview`（第三轮结合 `SourceRef`） |
| 输出降噪 | ZCode 条件显示与密度控制（DESIGN.md） | `ui-chat` 回合尾部聚合、`ui-tool` 字段分层呈现 |

---

## 附：复核方法说明

- 本地复核基于 `D:\ConstructionDSH` 工作区源码、包 README、`docs/`、`docs/persistence-schema.json` 与 `.agents/notes/`（implemented/archived）决策笔记；核对点均在第一节表格给出文件级证据。
- ZCode 侧仅核对了产品与官方文档的在线存在性（zcode.z.ai、github.com/zai-org）；其源码内部组件名（`ConversationStatusPanel.tsx` 等）沿引原分析，标注为上游参考，实施前应再次对照其仓库当前状态。
- 未本地运行两套应用；复核时未改动任何代码，后续实施改动见各条实施状态注记。
