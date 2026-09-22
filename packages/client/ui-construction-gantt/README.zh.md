---
description: "右侧 Sidebar 的只读施工进度甘特图 tab：把当前会话的 construction_schedule_present 工具结果折叠为可选方案，用固定任务名列、日/周/月尺度和主题变量绘制。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-construction-gantt

[English](README.md) | 中文

## 概述

施工进度的只读甘特图 tab。它把当前会话记录的每个 `construction_schedule_present` 工具结果校验后按结果 id 折叠为方案，供读者选择任一历史方案，并在固定任务名列后方用 frappe-gantt 1.2.2 绘制所选方案。图表永不修改：拖动、缩放、进度手柄和内置弹窗全部被禁用，格式无效或失败的结果给出明确的失败状态，而不是编造图表。

## 目录

- [注册了什么](#what-it-registers)
- [快照如何折叠](#how-the-snapshot-folds)
- [图表](#the-chart)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="what-it-registers"></a>
## 注册了什么

- **tab 类型** —— `ctx.sidebarRightTabs.register(...)`，id 为 `@deepseek-ai/dsh-client-ui-construction-gantt`，kind `construction-gantt`，档位 `extension`，标题走本地化，并带一个指南入口。打开指南入口与 strip 上的添加控件走同一个公开 `openTab` 路径。
- **正文与标题** —— 以该类型 id 为键的 `sidebar.right.pane.tab` 与 `sidebar.right.pane.tab.title` 座位，都通过 `ctx.slots.inject` 注入，只在 Sidebar 声明这些 slot 期间安装，并随本插件一起移除。正文通过 `useTabInfo()` 读取 tab 的全屏呈现；标题显示最新方案名。
- **词典** —— 一个 `constructionGantt` 命名空间，以简体中文为键集来源，英文按它对齐。
- **快照来源** —— 通过 `ctx.uiSession.provide` 挂在会话标准组件上的 `constructionGantt` hook，按会话绑定从本包的 Conversation 视图目标解析。

组件只接收派生 prop 份额：sidebar 运行时份额（`useTabInfo`）、绑定后的 `useConstructionGantt` 选择 hook、本地化 `t` 座位和普通数据。组件看不到 `ctx`，业务数据也不经由这些份额之外的通道进入 React。

<a id="how-the-snapshot-folds"></a>
## 快照如何折叠

折叠复用标准 Conversation 装配（`ctx.uiConversation`），与 Trajectory 视图同一机制。一个 `ConversationNodeDefinition` 把名为 `construction_schedule_present` 的 `tool/call` 事件匹配为上下文起点，把每个 `tool/result` 事件按 call id 匹配为更新。更新把结果的第一个文本块解析为 JSON，并按 `schemaVersion: 1` 校验为进度载荷（`schedule-result.ts`）；工具错误或无效载荷分别折叠为 `error` 或 `malformed` 原因的失败条目。尚无结果的调用折叠为运行中节点。`constructionGantt` 目标的 `ConversationViewDefinition` 把每个调用的节点归约为每个会话一份的不可变快照：有效方案按 `resultId` 去重、最新在前，失败最新在前，`running` 标志仅当最新的进度事件是未结束的调用时为真。

因为快照来自会话自身的事件流并绑定到每个会话，历史重放是确定性的，切换会话只显示该会话的方案；一个会话的方案绝不泄漏进另一个会话（验收 B08）。组件不读浏览器存储，也不向会话日志写回任何内容。

<a id="the-chart"></a>
## 图表

工具栏一行容纳方案选择器、日/周/月尺度按钮、适应视图操作和 tab 内放大开关（Sidebar 面板已全屏时通过 `useTabInfo()` 感知并隐藏该开关）。默认尺度为周，超过 120 天的计划默认切到月；适应视图会按当前尺度重渲染，从而把滚动复位到计划起点。

固定任务名列复用库自身的行几何：85px 粘性表头加每任务 34px 行高，与图表同处一个滚动口，因此在 420px 与 720px 侧栏宽度以及全屏下名称与条形始终保持对齐。长名称以省略号截断，点击就地展开，悬停 title 始终提供完整名称。关键工作有加粗的条形描边、加粗名称和前置标记，里程碑绘制为描边菱形，两种状态都不只靠颜色区分。行内正文保持 12px，全部走 `--dsw-*` 变量；库 1.2.2 的 DOM 类通过 CSS Modules 的 `:global` 块钉到这些变量，包内不出现字面颜色。

库实例按方案与尺度构造，选项置 `readonly`、`readonly_dates`、`readonly_progress` 与 `popup: false`，从源头移除一切拖动、缩放、进度手柄和点击弹窗。进度日期原样透传：`start` 为包含起点，`finish` 为排他边界，与库的排他 `end` 一致，因此显示的最后一个工作日是所示 `finish` 的前一天。

空（尚无进度调用）、计算中（调用未结束）、部分（图表上方列出假设、待确认输入与警告）与失败（显示最近失败原因，与较早的成功方案并存）各有独立状态。

<a id="model-experience"></a>
## 模型体验

间接通过 Host 工具 `construction_schedule_present` 记录在会话日志中的结果产生影响，本包只校验并渲染这些结果，自身不发出任何工具、提示段落或会话事件。

#### KV Cache 影响

无；图表只读取已记录的工具结果，不发送任何模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>
- **按设计只读。** 拖动排程、日期编辑与资源优化随完整施工计划延期；可能改变日期的库交互已在选项层禁用。
- **依赖时距不生效。** `links[].lagDays` 参与校验但不平移所绘条形；首个版本只绘制完成到开始的顺序。
- **工具栏放大限于 tab 内。** 面板级全屏仍由 Sidebar 外壳控件负责；工具栏开关在本 tab 内覆盖图表，面板已全屏时隐藏。
- **frappe-gantt 私有打包。** 库及其 DOM 类钉随本包 client 包一起发布；由于 1.2.2 的 export map 不暴露子路径，上游 CSS 未被引入，社区类型针对 0.x API，因此用本地 ambient 声明钉住所用的接口面。
- **方案按会话存活。** 快照只从当前会话日志折叠；关闭或切换会话在构造上即隐藏其他会话的方案，尚无跨会话历史列表。
- **里程碑按一列宽绘制。** 零工期活动的 `start === finish`，库渲染为单列条形，菱形标记用于视觉区分。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

无。

</details>

**运行时不变量：** 不发布伴随包。进度折叠、其注册项与每会话快照来源都由本包规格直接断言，不存在可分歧的独立观测。
