# Agent Note: 随附 Agent 预设 roster 服务于工程产品

Status: implemented

[English](2026-09-22-shipped-preset-roster-construction-product.md) | 中文

## Problem

随附的 preset roster 描述的仍是通用编码 Agent 产品：`standard` 之外还有 `ptc` 与 `minimal` 两个变体，而承载整套 construction runtime——文件工具、`construction_pdf_split`、造价、进度以及四个行业 Skills——的是 `drawing-split` 工作流 preset，因为它是最先用上这些能力的 preset。面向工程优先的首发版本，这样的布局把行业能力放错了表面：用户在首页看到的是与工程工作无关的 PTC 模式与极简模式，而四个业务 Skills 只是图纸工作流的副产品，不是一等模式。

## Decision

**随附 roster 为 `standard`、`drawing-split` 与 `engineering`；`cordis` 保留但不出现在首页选择器中；`engineering` preset 独自挂载 construction runtime 的 business 面，`drawing-split` 仅以 drawing 面挂载该 runtime；`ptc` 与 `minimal` preset 被完全移除。**

### Roster

首页选择器顺序为 `standard`（order 1）、`drawing-split`（order 2）、`engineering`（order 3）。`cordis` 保持完全可用——设置页 roster 卡片、只读组装查看器、复制以及创作者草稿流程仍全部可达——但其 `preset.yml` 带有 `picker: false`，这是一个可选的布尔元数据字段，只把 preset 从新建会话菜单中隐藏。hero chip 仅在渲染菜单时过滤 `picker: false` 行，其他地方不过滤：已在运行该 preset 的会话仍显示其标签，设置区块也从不过滤。字段缺省时保持可见，`~/.agent-presets`（`$DSH_HOME/.agent-presets`）下用户自建的 preset 因此不受影响；`picker` 存在却不是布尔值时，元数据解析会响亮报错，而不是默默选边。创作者草稿入口直接经 seat 控制器暂存 `cordis`，从不依赖被过滤的菜单名单。

### construction runtime 的归属

`engineering` preset 即 `standard` 组装——每一行面向模型的配置行，包括本地 skill 发现与 skill 加载器——再加一行 `construction-runtime` 与一段工程行业 persona。它是唯一挂载该 runtime business 面的随附 preset，因此四个业务 Skills（造价、质量、安全、进度）、四条 composer 菜单命令以及任务工具只在该 preset 与选择加入的 CLI `construction` bundle 中生效，后者保持不变。`drawing-split` preset 以 `business: false` 挂载同一 runtime：只有 drawing 面——只读文件工具与 `construction_pdf_split`——在该 preset 注册，不注册 skill provider、命令行或任务绑定提示词章节，因此也不需要 skill 目录相关行。PTC 工具呈现机制（`mode: 'ptc'`、`dsh-ptc-runtime`、`dsh-workflow-ptc`）原样保留：消失的只是钉住它的随附 preset。

### 测试里用什么替代被移除的 preset

把随附 `ptc` 或 `minimal` preset 当作组装来挂载的 Web 与 CLI lane，现在从 `apps/web/tests/fixtures/presets/`（或内嵌的组装常量）以相同内容播种 lane 自有的 preset，让录制会话 fixture 的 `agentPreset` 头保持有效，而不把这两个 preset 复活为随附表面。引用被移除 preset 的录制 Web 场景 `ptc-round` 与 `minimal-preset` 连同其快照目录一并删除；PTC 升级与呈现场景则基于 lane 自有 preset 存活。

## Alternatives considered

**为非工程用户保留 `ptc` 与 `minimal`：否决。** 每个随附 preset 都是产品承诺——locale 文案、设置页位置与首页选择器空间——而本部署的产品是工程助手。想要窄模式或 PTC 呈现的用户，通过复制 `standard` 自建一份即可，这也是所有自定义组装的支持路径。

**在客户端按 id 硬编码隐藏 `cordis`：否决。** 硬编码 id 名单会把 roster 知识劈成 Host 与浏览器两份，一旦部署方用别的 id 自配创作 preset 就会失效。`picker` 字段把决定留在 preset 自己的元数据里，部署方创作 preset 时可以直接读到并复制它。

**让设置页同样过滤 `picker: false`：否决。** 退出选择器的目的是避免新会话被误暂存进运行时编辑；而管理、查看、复制 preset 正是设置页的职责，把它也从设置页隐藏将让任何表面都够不到它。

**拆分 construction runtime，让 `drawing-split` 保留拆分工具但不带 Skills：随后在同一发布中采纳。** runtime 现在暴露两个经校验的配置开关 `drawing` 与 `business`（默认均开启），按面注册：`business: false` 时不注册 skill provider、composer 命令、任务工具与任务绑定章节，因此随附的 `drawing-split` preset 仅以 drawing 面挂载 runtime，其 persona（`construction_files_inspect`、`construction_pdf_split`）重新可执行。四条 composer 菜单命令位于 engineering preset 的 standing 命令层，因此只列出给组装在该 preset 上的会话——这是命令注册表的作用域链合并，而非客户端过滤器。

## Consequences

`drawing-split` 挂载仅 drawing 面的 runtime，其 persona 可以执行它点名的工具与工作流；business 面——Skills、命令、任务工具——仍为 `engineering` 独有，随附 roster 的 spec 钉住两份组装（drawing-split 的行携带 `business: false`；engineering 的行不带配置），拆分不会悄悄漂移。以旧版 `code` preset id 录制的 V2 会话仍在会话格式层迁移为 `ptc`，但已无随附 preset 应答 `ptc`，因此这类会话会以 roster 的 not-found 原因在挂载时失败——迁移机制本身未变，仍由其单元测试覆盖。

## Verification

`dsh-agent-presets` 测试套件（200 个测试）钉住发现、元数据解析（包括 `picker` 的响亮失败）、roster API 暴露该字段、随附组装，以及 preset 作用域内的命令列出（在一个 preset 的 standing 组装内注册的命令只列出给加入该 preset 的会话）；`ui-agent-preset` 客户端套件（165 个测试）钉住 locale 键、仅菜单过滤，以及正在运行的 picker 隐藏 preset 的 chip 标签。Web lane `agent-preset-selection`、`agent-preset-authoring` 与 `settings-chrome` 通过仓库的 refresh 模式再生其 golden，引用被移除 preset 的录制会话场景与其 fixture 一并删除。
