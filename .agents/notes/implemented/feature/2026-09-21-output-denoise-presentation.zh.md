# Agent Note: 输出降噪呈现（回合尾部散文折叠与工具字段分层）

Status: implemented

[English](2026-09-21-output-denoise-presentation.md) | 中文

## 问题

模型输出带有淹没结论的噪音：解释性段落、堆叠的免责说明、原始字段罗列，以及自我声明式的「已圆满完成」。UI-IMPROVEMENT-PLAN 的 P9 条目要求在呈现层回答：折叠而非删除、结构优先于散文、完成判定（工具结果与交付事件）与完成声明分离——全部挂在批次 1 已交付的 `outputDenoise` Beta 开关（默认关闭）之下。

## 决策

降噪行为严格按开关分支，关闭状态与改动前的呈现完全一致。

回合尾部聚合落在 `ui-chat`（真正渲染 Assistant 正文与回合尾部的包；计划文档写的是 `ui-conversation`，其在制的 skeleton 改动不触碰）。`AssistantNodeView` 在渲染时从 body 属性读取呈现模式——`data-dsw-output-denoise`（ui-theme）与 `data-dsw-ui-mode`（业务/专家，默认业务）——只有已关闭轮次中已结算的正文且处于业务模式时才路由到 `AssistantDenoise`。超过三个非空源文本行的散文折叠为逐字第一行加 locale 自有的「查看说明/View explanation」展开控件；展开渲染未改动的 `AssistantMarkdown` 与原始块，因此逐字保证由构造成立。思考、图片与工具调用头保持可见；展开状态是会话内的本地状态。结论行是逐字切片，绝不推导状态，「圆满完成」式声明只作为正文呈现。渲染时读取属性（无订阅）与跨包模式读取的协作契约一致；切换设置后由下一次席位驱动的重渲染生效。

工具字段分层落在 `ui-tool`，是一个可组合机制：一个 `TechnicalDetails` 折叠区（locale 自有的 `tool` 命名空间，由本包注册，因为在制的 `ui-conversation` 字典无法接收新键）加上共享 `ToolRow` 的 `technical` prop，重新包裹同一张 IN/OUT 卡片。通用兜底卡片与 Bash 行（终端全量记录）率先接入；专家模式传 `defaultOpen: true`。`tTool` 翻译函数经现有 slot inject 面注入（`ctx.locale.bind` 每命名空间稳定，调用时读取当前语言）。

## 备选方案

**为业务模式重写每个工具渲染器。** 否决：计划要求单一可组合层；共享 `technical` prop 让各行增量接入，不动卡片模型。

**仅用 CSS 折叠。** CSS 可以按属性选择器隐藏散文，但按回合计的展开状态、逐字结论行与专家/业务矩阵仍需要组件；严格的 JS 分支更能钉住关闭状态的完全一致。

**把降噪文案放进 `conversation` locale 命名空间。** 本批次否决：该字典归 `ui-conversation` 所有且正被在制 skeleton 工作编辑；Tool 自有的 `tool` 命名空间使改动无冲突。

**从 Conversation Node 状态或 store 驱动折叠。** 否决：折叠是对已折叠节点数据的纯呈现，本地渲染状态足够；不涉及 node 的 `match`/`update`，也不跨条目。

## 后果

开关关闭时两个表面的像素与 DOM 完全一致（严格分支；有测试钉住分层前形态）。Web 回放快照无需更新，因为默认关闭且回放中属性不存在。开关转正时，渲染时属性读取是要替换的唯一接缝（若需要会话内即时生效，可换成响应式席位）。需要分层的行只接两个 prop（`technical` + `tTool`）；`ui-tool` 测试覆盖分层机制、两个接入方与降噪 × 界面模式矩阵。`ui-chat/src/client/chat` 与 `ui-tool/src` 仍在仓库 GUI 债务覆盖豁免之下；改动过的 `ui-chat/chat` 文件在限定运行中测得 100%。
