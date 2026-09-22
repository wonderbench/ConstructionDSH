---
description: "construction 包组：面向主机的工程工具，提供文件读取、机械式 PDF 拆分、确定性计价与 CPM 进度计算，并以包资产形式提供四个业务 Skill。"
kind: "package-group"
---

# packages/construction

[English](README.md) | 中文

## 概述

DeepSeek Harness 的工程建设包：Host 运行时提供共享工程文件工具、机械式 PDF 拆分、确定性计价与 CPM 进度计算，并以包资产形式提供四个业务 Skill。

## 包列表

| 包 | 职责 |
|---|---|
| [`construction-runtime`](construction-runtime/) | Host 工具、任务类型校验、文件/计价/进度模块，以及作为包资产的固定版本 Python 读取脚本 |

## 文档

- [Construction 子系统](../../docs/subsystems/construction.zh.md)——`DocumentResult`、`SplitResult`、`CostResult` 与 `ScheduleResult` 词汇表、任务绑定语义，以及 bundle 组合方式。
