/** Copy owned by the read-only construction Gantt sidebar tab. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    constructionGantt: keyof typeof zh
  }
}

/** Simplified Chinese Gantt copy. */
export const zh = {
  title: '进度甘特图',
  description: '以只读甘特图查看当前会话的进度计算结果',
  empty: '当前会话还没有进度计算结果。运行 construction_schedule_calculate 后，结果会显示在这里。',
  calculating: '正在等待进度计算结果…',
  'failure.malformed': '进度结果格式无效，无法绘制图表。',
  'failure.error': '进度计算失败：结果已被标记为错误。',
  'scenario.label': '方案',
  'scale.label': '时间尺度',
  'scale.day': '日',
  'scale.week': '周',
  'scale.month': '月',
  'fit.label': '适应视图',
  'fit.aria': '滚动到计划开始位置',
  'expand.enter': '放大图表',
  'expand.exit': '还原图表',
  'expand.aria': '在标签页内最大化图表',
  'banner.running': '正在等待新的计算结果…',
  'banner.failure': '上一次展示失败：{reason}',
  'partial.assumptions': '计算假设',
  'partial.unresolved': '待确认输入',
  'partial.warnings': '计算警告',
  'partial.entry': '{label}（{count}）',
  'column.tasks': '任务',
  'column.critical': '关键线路',
  'column.milestone': '里程碑',
  'readonly.hint': '只读视图，拖动不会改变进度日期。',
  'name.expand': '展开任务名称',
  'name.collapse': '收起任务名称',
} satisfies Record<string, string>

/** English Gantt copy, checked against the Chinese key set. */
export const en = {
  title: 'Schedule Gantt',
  description: 'View this Session’s schedule calculation results as a read-only Gantt chart',
  empty: 'No schedule result in this Session yet. Run construction_schedule_calculate and the result appears here.',
  calculating: 'Waiting for the schedule calculation result…',
  'failure.malformed': 'The schedule result is malformed and cannot be drawn.',
  'failure.error': 'The schedule calculation failed: the result is marked as an error.',
  'scenario.label': 'Scenario',
  'scale.label': 'Time scale',
  'scale.day': 'Day',
  'scale.week': 'Week',
  'scale.month': 'Month',
  'fit.label': 'Fit view',
  'fit.aria': 'Scroll to the start of the plan',
  'expand.enter': 'Expand chart',
  'expand.exit': 'Restore chart',
  'expand.aria': 'Maximize the chart within this tab',
  'banner.running': 'Waiting for a new calculation result…',
  'banner.failure': 'The last presentation failed: {reason}',
  'partial.assumptions': 'Calculation assumptions',
  'partial.unresolved': 'Unresolved inputs',
  'partial.warnings': 'Calculation warnings',
  'partial.entry': '{label} ({count})',
  'column.tasks': 'Task',
  'column.critical': 'Critical path',
  'column.milestone': 'Milestone',
  'readonly.hint': 'Read-only view; dragging does not change schedule dates.',
  'name.expand': 'Expand task name',
  'name.collapse': 'Collapse task name',
} satisfies Record<keyof typeof zh, string>
