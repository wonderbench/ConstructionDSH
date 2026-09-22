// @vitest-environment jsdom
/** The real frappe-gantt 1.2.2 renders read-only bars exactly aligned with the fixed name column. */
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { GanttChart } from '../src/client/GanttChart.tsx'
import { en } from '../src/client/locales.ts'
import { GANTT_HEADER_HEIGHT, GANTT_ROW_HEIGHT } from '../src/client/gantt-adapter.ts'
import { makeLargeScheduleResult, makeScenario } from './fixtures.client.ts'

// jsdom does not implement SVG layout APIs; frappe-gantt 1.2.2 calls getBBox
// from requestAnimationFrame label placement and from initial scroll positioning.
;(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
  ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) })

afterEach(cleanup)

const copy = { columnTitle: en['column.tasks'], expandLabel: en['name.expand'], collapseLabel: en['name.collapse'] }

function renderChart(scenario = makeScenario(1), width: number | 'fullscreen' = 720): ReturnType<typeof render> {
  const style = width === 'fullscreen'
    ? { width: '100vw', height: '100vh' }
    : { width: `${width}px` }
  return render(
    <div style={style}>
      <GanttChart scenario={scenario} mode="Week" fitNonce={0} copy={copy} />
    </div>,
  )
}

it('renders one bar and one name row per task with identical row geometry', () => {
  const view = renderChart()
  const chart = view.container.querySelector('[data-construction-gantt-chart]')!
  const svg = chart.querySelector('svg.gantt')!
  expect(svg).not.toBeNull()
  expect(chart.querySelectorAll('.bar-wrapper')).toHaveLength(3)
  expect(chart.querySelectorAll('[data-task-id]')).toHaveLength(3)
  const gridRows = [...chart.querySelectorAll('.grid-row')].map(row => row.getAttribute('y'))
  for (const [index, taskId] of ['T1', 'T2', 'M1'].entries()) {
    const row = chart.querySelector(`[data-task-id="${taskId}"]`) as HTMLElement
    expect(row.style.height).toBe(`${GANTT_ROW_HEIGHT}px`)
    expect(gridRows).toContain(String(GANTT_HEADER_HEIGHT + index * GANTT_ROW_HEIGHT))
  }
  const header = chart.querySelector('[data-construction-gantt-name-header]') as HTMLElement | null
  expect(header?.style.height).toBe(`${GANTT_HEADER_HEIGHT}px`)
})

it('marks critical tasks and milestones on the bar wrappers', () => {
  const view = renderChart()
  const chart = view.container.querySelector('[data-construction-gantt-chart]')!
  expect(chart.querySelector('.bar-wrapper[data-id="T1"]')?.getAttribute('class')).toBe('bar-wrapper cg-critical')
  expect(chart.querySelector('.bar-wrapper[data-id="T2"]')?.getAttribute('class')).toBe('bar-wrapper cg-critical')
  expect(chart.querySelector('.bar-wrapper[data-id="M1"]')?.getAttribute('class')).toBe('bar-wrapper cg-critical-milestone')
})

it('truncates long names and expands the clicked row without remounting the chart', () => {
  const view = renderChart()
  const chart = view.container.querySelector('[data-construction-gantt-chart]')!
  const nameButton = chart.querySelector('[data-task-id="T1"] button')!
  expect(nameButton.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(nameButton)
  expect(nameButton.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(nameButton)
  expect(nameButton.getAttribute('aria-expanded')).toBe('false')
  expect(chart.querySelectorAll('.bar-wrapper')).toHaveLength(3)
})

it('renders the 105-task fixture without error at 420px, 720px, and fullscreen', () => {
  const scenario = { ...makeScenario(1, makeLargeScheduleResult()), seq: 1 }
  for (const width of [420, 720, 'fullscreen'] as const) {
    const view = renderChart(scenario, width)
    const chart = view.container.querySelector('[data-construction-gantt-chart]')!
    expect(chart.querySelectorAll('.bar-wrapper')).toHaveLength(105)
    expect(chart.querySelectorAll('[data-task-id]')).toHaveLength(105)
    view.unmount()
  }
})

it('re-renders bars when the scenario changes', () => {
  const view = renderChart()
  const chart = view.container.querySelector('[data-construction-gantt-chart]')!
  expect(chart.querySelector('.bar-wrapper[data-id="T1"]')).not.toBeNull()
  const other = makeScenario(2, {
    tasks: [{ id: 'X1', name: 'Other task', duration: 3, start: '2026-10-01', finish: '2026-10-06', totalFloat: 1, isCritical: false, isMilestone: false, locked: false }],
    links: [],
    criticalPath: [],
    resultId: 'sha256-other',
  })
  view.rerender(
    <div style={{ width: '720px' }}>
      <GanttChart scenario={other} mode="Week" fitNonce={0} copy={copy} />
    </div>,
  )
  expect(chart.querySelector('.bar-wrapper[data-id="T1"]')).toBeNull()
  expect(chart.querySelector('.bar-wrapper[data-id="X1"]')).not.toBeNull()
})
