/**
 * Read-only frappe-gantt 1.2.2 chart with a fixed task-name column. The name
 * column repeats the library's exact row geometry (header height plus one
 * 34px row per task), so names and bars stay aligned at any sidebar width;
 * the library itself renders with every editing interaction disabled.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import Gantt from 'frappe-gantt'
import type { ScheduleScenario } from './contract.ts'
import {
  GANTT_HEADER_HEIGHT, GANTT_NAME_COLUMN_WIDTH, GANTT_ROW_HEIGHT, ganttOptions, toGanttTasks,
  type GanttViewMode,
} from './gantt-adapter.ts'
import css from './GanttChart.module.css'

/** Localized strings the chart chrome needs, supplied by the owning body. */
export interface GanttChartCopy {
  /** Fixed column header text. */
  readonly columnTitle: string
  /** Accessible name of a truncated name's expand button. */
  readonly expandLabel: string
  /** Accessible name of an expanded name's collapse button. */
  readonly collapseLabel: string
}

/** Pure presentation inputs for the chart. */
export interface GanttChartProps {
  /** Selected validated scenario. */
  readonly scenario: ScheduleScenario
  /** Selected timeline scale. */
  readonly mode: GanttViewMode
  /** Increment to re-scroll the chart to the plan start. */
  readonly fitNonce: number
  /** Localized chrome strings. */
  readonly copy: GanttChartCopy
}

/**
 * Render the read-only bars and the fixed name column for one scenario.
 * @param props - Scenario, scale, fit signal, and localized chrome strings.
 * @returns the scrollable chart grid.
 */
export function GanttChart({ scenario, mode, fitNonce, copy }: GanttChartProps): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Gantt | null>(null)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  useEffect(() => {
    /* oxlint-disable-next-line typescript/no-non-null-assertion -- React sets the DOM ref before effects run. */
    const host = hostRef.current!
    const chart = new Gantt(host, toGanttTasks(scenario), ganttOptions(mode))
    chartRef.current = chart
    return () => {
      chartRef.current = null
      host.replaceChildren()
    }
  }, [scenario, mode])
  useEffect(() => {
    if (fitNonce > 0) chartRef.current?.change_view_mode(mode)
  }, [fitNonce, mode])
  return (
    <div className={css.scrollArea} data-construction-gantt-chart>
      <div className={css.chartGrid}>
        <div className={css.nameColumn} style={{ width: GANTT_NAME_COLUMN_WIDTH }}>
          <div className={css.nameHeader} data-construction-gantt-name-header
            style={{ height: GANTT_HEADER_HEIGHT }}>{copy.columnTitle}</div>
          <div className={css.nameRows}>
            {scenario.tasks.map((task) => {
              const expanded = expandedTaskId === task.id
              return (
                <div key={task.id} data-task-id={task.id} className={clsx(
                  css.nameRow,
                  task.isCritical && css.criticalName,
                  task.isMilestone && css.milestoneName,
                  expanded && css.expandedName,
                )} style={{ height: GANTT_ROW_HEIGHT }} title={task.name}>
                  <button type="button"
                    className={clsx(css.nameText, expanded && css.nameTextExpanded)}
                    aria-label={expanded ? copy.collapseLabel : copy.expandLabel}
                    aria-expanded={expanded}
                    onClick={() => { setExpandedTaskId(expanded ? null : task.id) }}>
                    {task.name}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
        <div className={css.ganttHost} ref={hostRef} />
      </div>
    </div>
  )
}
