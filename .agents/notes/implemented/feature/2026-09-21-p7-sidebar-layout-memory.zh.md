# Agent Note: P7 侧栏布局记忆（宽度偏好与恢复重校验）

Status: implemented

[English](2026-09-21-p7-sidebar-layout-memory.md) | 中文

## 问题

UI-IMPROVEMENT-PLAN 的 P7 要求右侧边栏的查看状态跨刷新保留：先记面板宽度与展开状态，再记已打开与活动的标签，最后记阅读位置。基线上每个 Session 的布局（标签、选中项、分栏、呈现方式、展开状态）已经通过经校验的 `dsh.sidebar-right.v1.<sessionId>` 信封浏览器本地持久化——但框架层的右侧面板宽度只存在于 ui-layout 的 root store 中（刷新后回到 45% 的首次打开默认值），且恢复出的标签若文件已被删除，会以永久死标签回来，并在之后每次刷新反复复活。

## 决策

**宽度偏好（ui-layout）。** root 作用域的布局 store 现在只把 `layoutInfo.rightbar` 持久化到 `dsh.ui-layout.v1`，并在窗口启动时经同一条拖动夹紧写入入口（`setRightbar`）采用，因此刷新后更窄的窗口会重新夹紧保存的宽度。文档只有一个正整数字段，用手工形状校验（不用 zod：ui-layout 保持零依赖浏览器面，且不在 install 的前提下 zod 无法从该包解析）；损坏数据只清除自身键并静默回退；存储失败时内存布局仍可用。左侧边栏的拖动宽度、窗口测量值与占用方的呈现报告留在内存中。展开状态无需改动：它是每个 Session 表面的记录事实，本就已随现有信封跨刷新。

**恢复重校验（ui-sidebar-right）。** Session store 被铸造时即在场的标签来自持久化存储；每个 `dsh-resource://` 标签的地址经已注入的 `ctx.resources.source` 观察，直到资源落定。首帧 `live` 确认文件存在并结束观察；`none`（未注册 provider）不可校验，不处理；携带 workspace-file 协议确定性 `workspace-file/not-found` 码的 `failed` 帧经控制器正常关闭路径关闭标签（关闭处理器、唯一标签连带收起、持久化重写），并向插件自有的 `RestoreNoticeSink` 写入一条记录。新的 `shell.overlay` 占用方把 sink 渲染为每条标签一条可关闭提示（`role="alert"`，locale 自有的 `sidebarRight` 文案，与 ui-sidebar-terminal 的清理浮层同构）。瞬时失败保留标签——其正文自带说明与重试。只有 not-found 码自动关闭；传输与查找失败可能恢复。观察持续到落定或插件卸载，HMR 会释放它们。

## 备选方案

**经设置通道（`ctx.settingsScope`）承载布局记忆。** 有据拒绝：设置文档是 harness home 下的单份用户级 YAML（`packages/settings/settings-file`），非工作区作用域，且不存在工作区作用域的客户端设置通道（workspace-controller 客户端不做任何持久化）。每 Session 的标签布局与窗口级宽度进入用户可编辑的全局文档会跨上下文泄漏文件路径、破坏文档化的事实——仓库已为这类数据认可经校验的浏览器本地通道（ui-sidebar-right README 的「Browser-local layout」限制）。

**保留无法恢复的标签，用标签内失败行呈现。** 拒绝：方案要求恢复时重新校验并说明；每次刷新都复活的死标签正是 P7 要解决的问题。文件确认不存在后有意不保留标签记录——提示会说明丢失了什么、为什么。

**从 ui-sidebar-right 经 `remote.workspaceFiles.stat` 校验。** 拒绝：这会把基础包对某个特性 API 的命名空间依赖引进来，并重复 stat 已被钉住的资源流已报告的内容；`ctx.resources.source` 是被认可的读取通道且已注入。

**在本批次持久化 PDF 页码与文本滚动位置。** 推迟（受阻）：两者都存放在 ui-sidebar-documentpreview 的每 Session store（`PdfStore`、文本 store 的 `scrollTop`）中，对该包私有；恢复它们需要该包的 store 工厂与组件，不在本批次允许的触碰集合内。ui-sidebar-right 的公开接口不承载任何阅读位置。

## 后果

刷新后现在恢复右侧面板宽度（重新夹紧）、每 Session 的展开状态、标签与活动标签（既有能力），并关闭加说明文件已不存在的标签。两个 localStorage 键承载布局记忆（`dsh.ui-layout.v1`、`dsh.sidebar-right.v1.*`）；都有版本号、有大小上界，只携带 id/路径——绝不携带内容。`apps/web/tests/navigation-panes.e2e.ts` 涉及收起开关，不受影响（Session id 每次运行新铸，无陈旧恢复状态匹配）；重放快照无需更新，因为呈现未变。第 3 步（PDF 页码恢复）作为后续批次落在 ui-sidebar-documentpreview：在 store 工厂的 `create(scopeKey)` 中按侧栏信封同样的键模式持久化每 Session 的 `PdfState`，在正文渲染前采用；文件版本仍匹配时，文本 `scrollTop` 沿用同一模式。
