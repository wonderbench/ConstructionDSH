# Agent Note: 业务/专家界面模式——设置、属性契约与侧栏入口可见性

Status: implemented

[English](2026-09-21-ui-mode-business-expert-switch.md) | 中文

## 问题

DSH 的界面始终展示所有技术界面（终端、插件管理、工具参数）。界面提升方案的 P1 引入呈现模式——默认 `business` 突出项目、成果与待确认事项，`expert` 展示全部技术细节——但不改变功能与权限。该模式需要一个持久设置、一个发布的文档契约，以及一条 ui-conversation/ui-tool 可消费的响应式通道。

## 决策

模式落在 `ui-theme` 设置命名空间，完整复用 fontSize/outputDenoise 已有的管线：

- schema 字段 `uiMode: 'business' | 'expert'`，默认 `'business'`；持久化与重启走现有 settings scope——不新增机制。
- `ThemeSnapshot.uiMode` 为唯一发布源；`ThemeRuntime.setUiMode` 为唯一写入入口（未知值抛错，同值 no-op）。
- 文档契约为 `body[data-dsw-ui-mode]`（属性值即模式；属性缺省读作 `'business'`），由两条既有路径写入：Host boot 脚本（首帧前）与 ui-layout 的 theme presenter（快照驱动）。
- 纯读取契约 `readUiMode()` 从 `@deepseek-ai/dsh-client-ui-theme/client` 导出，供非 React 消费方使用；ui-tool 的降噪分层经本地属性 helper 读取模式，不做跨包导入。
- ui-sidebar 经注入的 `hooks` 舱位获得模式（主题快照镜像的 `createSnapshotStore`，绑定为 `useUiMode`），组件零订阅机制，随 `theme/change` 重渲染。
- 技术入口以稳定面板 id 集合标记（`TECHNICAL_PANEL_IDS`：当前 `plugins`，`terminal` 预留）：业务模式不渲染这些行，专家模式渲染全部已注册行。标记即寻址 `main` keyed slot 的同一个 id，包按 id 加入过滤，外壳从不 import 注册方。
- 设置行（`UiModeRow`，「通用」分区，位于输出降噪行之后）提供模式切换；呈现层文案说明审批与权限不受影响。

## 考虑过的替代方案

### 为什么不用独立设置包或新持久化？

新命名空间会复制主题管线已为每个客户端界面运行的快照/发布/采纳机制，且模式按归属属于外观状态。沿用 `ui-theme` 保持单一写入入口、单份快照与单一 presenter 投影。

### 为什么用 id 集合而不是逐注册元数据？

面板行由 `sidebar.panellist` 注册派生，其所有方分散在外壳不得 import 的其他包；添加元数据标记需要为外壳可拥有的呈现关切改动每个注册方。id 集合是最小稳定标记；若第三方面板需要自助加入，仍可改用注册级标记。

## 验证

包级规格固定 schema 默认、两条写入路径、`readUiMode()` 缺省回退、设置行注册与侧栏过滤（业务模式隐藏 plugins 行、设置席位保留、审批永不过滤）；ui-theme/src 在受门禁文件上保持 100% 覆盖。设置对话框与生命周期 chrome 的 web goldens 经合规的重放/刷新机制更新，插件管理 e2e 场景在导航 Plugins 页前于 scaffold 设置 `uiMode: 'expert'`。默认业务模式如预期改变渲染 chrome，触及场景重放全绿。

## 后果

默认业务模式改变既有 web 快照（侧栏失去 Plugins 行；设置「通用」区新增模式行）。行被隐藏时仍处于活动状态的技术面板会保持显示，直到用户另行导航；随模式切换收起该面板是有意留存的后续工作。未来出现终端主面板入口时，其标记已在 `TECHNICAL_PANEL_IDS` 中就位。
