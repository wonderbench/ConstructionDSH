/**
 * Pure adapter from a validated `ScheduleResultData` to the read-only
 * frappe-gantt 1.2.2 surface: bar rows, scale choice, and the shared row
 * geometry that keeps the fixed name column exactly aligned with the bars.
 */
import type { FrappeGanttOptions, FrappeGanttTask } from 'frappe-gantt'
import type { ScheduleResultData, ScheduleScenario } from './contract.ts'

/** Bar height in px; paired with {@link GANTT_PADDING} to form the row height. */
export const GANTT_BAR_HEIGHT = 26
/** Vertical space above and below each bar inside its row. */
export const GANTT_PADDING = 8
/** One chart row in px; the name column repeats this height per task. */
export const GANTT_ROW_HEIGHT = GANTT_BAR_HEIGHT + GANTT_PADDING
/** Upper date-header band height in px. */
export const GANTT_UPPER_HEADER_HEIGHT = 45
/** Lower date-header band height in px. */
export const GANTT_LOWER_HEADER_HEIGHT = 30
/** Total sticky header height in px, including the library's 10px seam. */
export const GANTT_HEADER_HEIGHT = GANTT_UPPER_HEADER_HEIGHT + GANTT_LOWER_HEADER_HEIGHT + 10
/** Fixed name-column width in px. */
export const GANTT_NAME_COLUMN_WIDTH = 168

/** Selectable timeline scales. */
export type GanttViewMode = 'Day' | 'Week' | 'Month'

const DAY_MS = 86_400_000
/** Plans longer than this span default to the monthly scale. */
const MONTHLY_THRESHOLD_DAYS = 120

/** CSS classes added to bar wrappers; styled through the module CSS `:global` blocks. */
const CLASS_CRITICAL = 'cg-critical'
const CLASS_MILESTONE = 'cg-milestone'
/** frappe-gantt 1.2.2 accepts one custom class token per bar; combined states share one token. */
const CLASS_CRITICAL_MILESTONE = 'cg-critical-milestone'

function dayCount(start: string, finish: string): number {
  return Math.round((Date.parse(finish) - Date.parse(start)) / DAY_MS)
}

/**
 * Choose the initial scale: weekly by default, monthly for long plans.
 * @param scenario - Validated schedule payload.
 * @returns the default view mode.
 */
export function defaultViewMode(scenario: ScheduleResultData): GanttViewMode {
  return dayCount(scenario.dateRange.start, scenario.dateRange.finish) > MONTHLY_THRESHOLD_DAYS
    ? 'Month'
    : 'Week'
}

/**
 * Map schedule activities to read-only frappe rows. A task's `finish` is the
 * exclusive working-day boundary, which matches the library's exclusive `end`;
 * milestone activities (zero duration, `start === finish`) render one column
 * wide and receive the milestone marker class.
 * @param scenario - Validated schedule payload.
 * @returns one immutable bar row per activity, in display order.
 */
export function toGanttTasks(scenario: ScheduleResultData): FrappeGanttTask[] {
  const predecessors = new Map<string, string[]>()
  for (const link of scenario.links) {
    const list = predecessors.get(link.to) ?? []
    list.push(link.from)
    predecessors.set(link.to, list)
  }
  return scenario.tasks.map((task) => {
    const customClass = task.isCritical && task.isMilestone
      ? CLASS_CRITICAL_MILESTONE
      : task.isCritical ? CLASS_CRITICAL : task.isMilestone ? CLASS_MILESTONE : ''
    return {
      id: task.id,
      name: task.name,
      start: task.start,
      end: task.finish,
      progress: 0,
      dependencies: (predecessors.get(task.id) ?? []).join(','),
      custom_class: customClass,
    }
  })
}

/**
 * Build the fixed read-only option set for one scale.
 * @param mode - Selected timeline scale.
 * @returns options pinning geometry, disabling every editing interaction.
 */
export function ganttOptions(mode: GanttViewMode): FrappeGanttOptions {
  return {
    view_mode: mode,
    view_mode_select: false,
    today_button: false,
    readonly: true,
    readonly_dates: true,
    readonly_progress: true,
    popup: false,
    infinite_padding: true,
    bar_height: GANTT_BAR_HEIGHT,
    padding: GANTT_PADDING,
    upper_header_height: GANTT_UPPER_HEADER_HEIGHT,
    lower_header_height: GANTT_LOWER_HEADER_HEIGHT,
    container_height: 'auto',
    lines: 'both',
    scroll_to: 'start',
  }
}

/**
 * Scenario title shown in the toolbar selector.
 * @param scenario - Folded scenario.
 * @returns the label followed by the short result hash.
 */
export function scenarioTitle(scenario: ScheduleScenario): string {
  return `${scenario.scenarioLabel} (${scenario.resultId.slice(0, 8)})`
}
