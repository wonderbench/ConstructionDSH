---
description: "dsh 的施工工程 bundle：把 dsh-base 与只读施工运行时工具、四个内置业务 Skill、基于 MCP 的标准 RAG 以及侧边栏甘特图组合在一起，并禁用面向模型的任意 shell 与代码执行。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-construction

[English](README.md) | 中文

## 概述

`dsh-construction` 把基于 dsh-base 的 dsh profile 变成施工工程助手：它挂载 [`construction-runtime`](../../construction/construction-runtime/README.zh.md) Host 插件（只读的 Word/Excel/PDF 文件工具、确定性算量计价、CPM 进度计划、报告导出），通过运行时自带的只读 provider 暴露四个内置业务 Skill（construction-safety、construction-quality、construction-cost、construction-schedule），通过 MCP 接入标准 RAG 服务器，并添加侧边栏甘特图客户端行。面向模型的任意 shell 与代码执行被禁用；`web_search` 和 `web_fetch` 保持可用。使用 `dsh --profile construction` 运行，或用 `dsh --patch <overlay>` 把该 patch 叠加到其他 profile 上。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

该 bundle 是随附 `construction` profile 的第二层：

```sh
dsh --profile construction
```

该 profile 把 [`dsh-base`](../base/README.zh.md) 与这个 patch 组合在一起。无需任何配置：运行时会相对于插件自身解析打包资源（读取/拆分脚本与四个内置 Skill），每个运行时可调项都保留在插件自身的 Config schema 中，并使用其部署默认值。

### 基于 MCP 的标准 RAG

该 patch 插入一行 `dsh-mcp-client`（`standards-rag`，serverName 为 `standards`，stdio 传输）。服务器命令由环境变量驱动：

| 环境变量 | 含义 |
|---|---|
| `DSH_STANDARDS_RAG_COMMAND` | 启动标准 RAG 服务器的可执行文件 |
| `DSH_STANDARDS_RAG_ARGS` | 传给服务器的空格分隔参数 |

两者默认使用有文档说明的占位值（`standards-rag-mcp-server`，无参数），因此未配置服务器的部署也能启动。`failOnStartupError` 保持 `false`，且关闭重连：不可达的 RAG 服务器只失败一次，然后保持静默，绝不阻塞文件、算量或进度工作。`apps/cli/config/examples/construction/cordis.yml` 展示了相同的行，可作为可选 overlay。

### Skill 隔离

四个业务 Skill 内置于运行时包中，并通过其自带的只读 skills provider 注册。该 patch 以 `includeDefaultRoots: false` 重述 `skill-filesystem` 行，因此不会扫描项目与用户 skill 根目录，目录中只包含内置业务 Skill。由于 patch 会整体替换一行的 `config`，重述的 config 中每个其他 schema 字段都取插件默认值。

### 禁用的行

面向模型的任意执行保持关闭；每个被禁用的行及其原因：

| 行 | 原因 |
|---|---|
| `tool-bash` / `tool-pwsh` | 任意 shell 超出工程文件/算量/进度表层的范围 |
| `tool-workflow` | 任意工作流脚本超出范围 |
| `workflow-ptc` / `ptc-runtime` | 任意代码执行超出范围 |

来自 base 的 `web` 和 `tool-web` 行保持启用：`web_search` 和 `web_fetch` 仍然可用。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

该包的实质是 [`cordis.patch.yml`](cordis.patch.yml)，由 manifest 字段 `dsh.bundle.patch` 声明；[`src/index.ts`](src/index.ts) 不承载任何运行时 API。

### 相对 base 的 patch 面

该 patch 插入使用插件默认值的 `construction-runtime` Host 行、客户端名册行 `ui-construction-gantt`（由包的 `dsh.client` manifest 标记；没有 Web 表层时其 node 半部为空 apply），以及 `standards-rag` MCP 行。它为隔离重述 `skill-filesystem`，并禁用上面列出的五个任意执行行。其他一切都由 base 提供：模型适配器、会话持久化、skills 注册表、权限与沙箱策略，以及 web 工具。

未发布运行时 invariant 伴随包：该 bundle 只承载组合 patch，所有运行时契约都属于被组合的包。

</details>

-----

<a id="model-experience"></a>
## 模型体验

间接通过它所组合的[运行时 README](../../construction/construction-runtime/README.zh.md) 产生影响，后者拥有工具目录、业务任务绑定规则与提示词段落效果。

#### KV Cache 影响

该 patch 不添加自己的请求前缀内容；运行时的系统提示词段落仅在施工工具注册时发出。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **标准 RAG 随附时未配置** —— 在部署设置 `DSH_STANDARDS_RAG_COMMAND` 之前，MCP 服务器命令是占位值；在此之前不会注册任何 `mcp__standards__*` 工具，这是有意设计。
- **Skill 目录被隔离** —— `includeDefaultRoots: false` 时，项目与用户 skill 根目录不再贡献内容；想要本地 Skill 的部署必须显式挂载另一个 provider。
- **没有 Web 表层时客户端行不生效** —— 甘特图标签页只出现在同时组合了 Web 模块名册的 profile 中。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 — 点击展开</summary>

无。

</details>
