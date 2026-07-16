# 短剧节点画布实现说明

## 边界

节点画布是独立新链路，入口为 `/workspace/[projectId]/canvas`。旧短剧生产页仍以 `/workspace/[projectId]` 和 `modes/novel-promotion` 为事实入口，画布只通过 `refType/refId` 引用现有业务对象，不复制原文、分镜、媒体或编辑器数据。

## 数据模型

- `ProductionCanvas`：画布文档、视口和全局配置。
- `ProductionCanvasNode`：节点实例、布局、状态、引用对象和节点私有配置。
- `ProductionCanvasEdge`：节点依赖连线。
- `ProductionCanvasSnapshot`：保存布局和节点配置快照，不回滚旧业务数据。
- `ProductionNodeTemplate`：节点模板，为后续 Skill/Agent 扩展保留。
- `ProductionWorkflowTemplate`：工作流模板，当前内置短剧默认链路。

## 第一版节点

默认链路包含：

`项目设置 -> 原文/剧本 -> 分集 -> 当前集 -> 剧本/片段 -> 分镜脚本 -> 分镜图片 -> 视频片段 -> 时间线编辑 -> 导出成片`

角色资产、场景资产、配音/字幕以辅助依赖节点连接到主链路。

## 已接入的可执行动作

- `episode-split / split`：提交 `EPISODE_SPLIT_LLM`
- `script / generate`：提交 `STORY_TO_SCRIPT_RUN`
- `storyboard / generate`：提交 `SCRIPT_TO_STORYBOARD_RUN`
- `export / render`：提交 `EDITOR_RENDER`

这些动作复用现有 `submitTask`、`Task`、`GraphRun` 和 worker 队列，不在画布内重新实现生产逻辑。

## 暂不自动执行的动作

分镜生图、视频片段生成、配音生成需要选择具体 panel、voice line 或更细粒度参数。第一版保留为打开旧功能页或待后续节点细化，避免画布用错误默认值触发成本型任务。

## 状态来源

节点状态由当前短剧业务数据和 active task 共同计算：

- 有产物：`done`
- 满足前置条件：`ready`
- 有 queued/processing 任务：`running`
- 缺前置条件：`idle` 或 `blocked`

## 后续扩展点

1. 将 panel 级节点做成可展开子图。
2. 为生图、生视频、配音补充选择器和参数面板后再接入真实任务。
3. 将 `ProductionNodeTemplate` 的 schema 暴露到管理后台。
4. Agent 侧只调用 canvas action，不直接调用旧业务 API。
