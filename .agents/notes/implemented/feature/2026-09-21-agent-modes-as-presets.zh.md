# Agent Note: 以预设承载 Agent 模式

Status: implemented

[English](2026-09-21-agent-modes-as-presets.md) | 中文

## Problem

新会话从空白 composer 开始，UI-IMPROVEMENT-PLAN 的 P2 条目要求首屏提供显式的场景入口，让用户不必先知道产品能做什么。但只预填草稿的入口与 agent preset 已经表达的内容重复——preset 本来就组装会话的工具、提示词段落与 skills——而且 Hero 上第二条模式选择面与已交付的 agent 预设选择 chip 互相竞争，无法组合。

## Decision

blank Session Hero 上的模式选择就是工作区选择器旁的 agent 预设选择 chip（`conversation.hero.agentPreset`，由 `ui-agent-preset` 负责）。`standard` 保持部署默认；有特殊需要的用户在发送前切换 chip，暂存的组装就是下一个 blank 会话运行的内容。Hero 自身不再构建任何场景入口面。

内置的 `drawing-split` 预设以组装承载图纸 PDF 拆解工作流，取代场景草稿模板：`construction-runtime` 插件（文件检查、`construction_pdf_split` 与四个内置业务 Skills）、承载 Skills 加载的 `skill-filesystem` + `tool-skill`、`tool-todo`、`tool-ask-user`、`present`，以及沿用 `standard` 预设的 compaction 组。其 persona 固定了工作流契约：先逐份检查 PDF；仅通过 `construction_pdf_split` 按显式页范围、逐页或书签拆分；交付输出文件与索引后即停止——不做汇总、不检索标准、不做结构化拆解（MinerU 不可用，对它的请求得到明确的不可用状态）；缺省与缺失的输入一律询问，绝不臆造。组合中逐一注释的刻意排除：无 shell、无 web、无子代理与工作流、无计划模式。

## Alternatives considered

**Hero 场景入口按钮。** 已拒绝：它们把 agent 预设选择器复制成第二条更弱的模式选择面（预填草稿无法改变会话的工具与提示词），且入口条破坏了 Hero 「标题＋composer」的简洁性。P2 机制——`HERO_SCENARIOS`、入口条组件与样式、草稿模板语言档键、仅用于把键盘还给 composer 的 `focusComposer` 注入成员——在同一变更中移除。

**仅提示词的模式选择（保留入口、丢弃组装）。** 已拒绝：草稿模板让会话仍运行完整的 `standard` 工具集，所谓「模式」只是模型可以无视的建议；preset 在组装层面强制执行。

## Consequences

hero web golden 失去「任务入口」组，所有列出预设名单的 golden（chip 菜单、设置区块）新增 `drawing-split` 行；settings-chrome golden 不列出预设行，保持不变。内置预设的展示文案归属 `dsh-agent-presets/display` 折叠与 `ui-agent-preset` 字典，并扩展了 `drawing-split` 的名称与描述。顺序调整（`drawing-split` 为 2，其后为 `ptc`、`minimal`、`cordis`）仅为预设元数据。
