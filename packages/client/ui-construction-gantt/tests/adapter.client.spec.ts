// @vitest-environment jsdom
/** Pure adapter: bar rows, scale defaults, options, and scenario titles. */
import { describe, expect, it } from 'vitest'
import { makeLargeScheduleResult, makeScheduleResult } from './fixtures.client.ts'
import {
  GANTT_BAR_HEIGHT, GANTT_HEADER_HEIGHT, GANTT_PADDING, GANTT_ROW_HEIGHT,
  defaultViewMode, ganttOptions, scenarioTitle, toGanttTasks,
} from '../src/client/gantt-adapter.ts'
import { makeScenario } from './fixtures.client.ts'

describe('toGanttTasks', () => {
  it('maps links to comma-separated predecessors in display order', () => {
    const tasks = toGanttTasks(makeScheduleResult())
    expect(tasks.map(task => task.id)).toEqual(['T1', 'T2', 'M1'])
    expect(tasks.map(task => task.dependencies)).toEqual(['', 'T1', 'T2'])
  })

  it('marks critical and milestone bars with single wrapper-class tokens', () => {
    const tasks = toGanttTasks(makeScheduleResult())
    expect(tasks[0]?.custom_class).toBe('cg-critical')
    expect(tasks[1]?.custom_class).toBe('cg-critical')
    expect(tasks[2]?.custom_class).toBe('cg-critical-milestone')
  })

  it('passes a non-critical, non-milestone task through with no class', () => {
    const tasks = toGanttTasks(makeScheduleResult({
      tasks: [{ id: 'N1', name: 'Ordinary', duration: 2, start: '2026-10-01', finish: '2026-10-05', totalFloat: 3, isCritical: false, isMilestone: false, locked: false }],
      links: [],
      criticalPath: [],
    }))
    expect(tasks[0]?.custom_class).toBe('')
  })

  it('marks a milestone that is not critical with the milestone class', () => {
    const tasks = toGanttTasks(makeScheduleResult({
      tasks: [{ id: 'M9', name: 'Milestone only', duration: 0, start: '2026-10-01', finish: '2026-10-01', totalFloat: 2, isCritical: false, isMilestone: true, locked: false }],
      links: [],
      criticalPath: [],
    }))
    expect(tasks[0]?.custom_class).toBe('cg-milestone')
  })

  it('passes schedule dates through unchanged (finish is the exclusive boundary)', () => {
    const tasks = toGanttTasks(makeScheduleResult())
    expect(tasks[0]).toMatchObject({ start: '2026-10-02', end: '2026-10-16', progress: 0 })
  })
})

describe('defaultViewMode', () => {
  it('defaults to Week for ordinary plans', () => {
    expect(defaultViewMode(makeScheduleResult())).toBe('Week')
  })

  it('defaults to Month for long plans', () => {
    expect(defaultViewMode(makeLargeScheduleResult())).toBe('Month')
  })
})

describe('ganttOptions', () => {
  it('pins read-only behavior and the shared row geometry', () => {
    const options = ganttOptions('Week')
    expect(options).toMatchObject({
      view_mode: 'Week',
      view_mode_select: false,
      today_button: false,
      readonly: true,
      readonly_dates: true,
      readonly_progress: true,
      popup: false,
      bar_height: GANTT_BAR_HEIGHT,
      padding: GANTT_PADDING,
      container_height: 'auto',
      lines: 'both',
      scroll_to: 'start',
    })
    expect(GANTT_ROW_HEIGHT).toBe(34)
    expect(GANTT_HEADER_HEIGHT).toBe(85)
  })
})

describe('scenarioTitle', () => {
  it('shows the label with the short result hash', () => {
    expect(scenarioTitle(makeScenario(1))).toBe('Baseline (sha256-b)')
  })
})
