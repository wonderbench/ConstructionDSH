/** `job` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'job'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'count.live.one': '{count} 个后台任务运行中',
  'count.live.other': '{count} 个后台任务运行中',
  'count.idle.one': '{count} 个后台任务',
  'count.idle.other': '{count} 个后台任务',
  'list.aria': '后台任务',
  'status.running': '运行中',
  'status.stopping': '正在停止',
  'status.completed': '已完成',
  'status.killed': '已取消',
  'status.failed': '已失败',
  'duration.seconds': '{seconds}秒',
  'duration.minutes': '{minutes}分{seconds}秒',
  'duration.hours': '{hours}小时{minutes}分',
  'duration.title.live': '已运行 {duration}',
  'duration.title.done': '耗时 {duration}',
  'goal.section': '当前目标',
  'goal.phase.active': '进行中',
  'goal.phase.paused': '已暂停',
  'goal.phase.blocked': '已阻塞',
  'pending.section': '待确认事项',
  'pending.label': '需要你确认',
  'plan.section': '计划',
  'plan.modeOn': '计划模式',
  'subagent.section': '子代理',
  'subagent.mode.one-shot': '一次性',
  'subagent.mode.continuable': '可继续',
  'subagent.activity.running': '运行中',
  'subagent.activity.inactive': '未运行',
  'subagent.reason.corrupt': '记录损坏',
  'subagent.reason.unavailable': '暂不可读',
  'subagent.reason.unsupported': '无法支持',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<JobKey, string> = {
  'count.live.one': '{count} background job running',
  'count.live.other': '{count} background jobs running',
  'count.idle.one': '{count} background job',
  'count.idle.other': '{count} background jobs',
  'list.aria': 'Background jobs',
  'status.running': 'running',
  'status.stopping': 'stopping',
  'status.completed': 'completed',
  'status.killed': 'cancelled',
  'status.failed': 'failed',
  'duration.seconds': '{seconds}s',
  'duration.minutes': '{minutes}m {seconds}s',
  'duration.hours': '{hours}h {minutes}m',
  'duration.title.live': 'Running for {duration}',
  'duration.title.done': 'Took {duration}',
  'goal.section': 'Current goal',
  'goal.phase.active': 'active',
  'goal.phase.paused': 'paused',
  'goal.phase.blocked': 'blocked',
  'pending.section': 'Pending confirmation',
  'pending.label': 'Needs your confirmation',
  'plan.section': 'Plan',
  'plan.modeOn': 'Plan mode',
  'subagent.section': 'Subagents',
  'subagent.mode.one-shot': 'one-shot',
  'subagent.mode.continuable': 'continuable',
  'subagent.activity.running': 'running',
  'subagent.activity.inactive': 'not running',
  'subagent.reason.corrupt': 'record damaged',
  'subagent.reason.unavailable': 'unreadable',
  'subagent.reason.unsupported': 'unsupported',
}

/** Key domain of the `job` namespace (zh is the source of truth). */
export type JobKey = keyof typeof zh
