// @vitest-environment jsdom
/** Read-only pinning against the frappe-gantt constructor, plus fit and scale changes. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { FrappeGanttOptions } from 'frappe-gantt'
import { GanttChart } from '../src/client/GanttChart.tsx'
import { en } from '../src/client/locales.ts'
import { makeScenario } from './fixtures.client.ts'

const created = vi.hoisted(() => [] as {
  readonly options: FrappeGanttOptions
  readonly change_view_mode: ReturnType<typeof vi.fn>
  readonly refresh: ReturnType<typeof vi.fn>
}[])

vi.mock('frappe-gantt', () => ({
  default: class MockGantt {
    readonly change_view_mode = vi.fn()
    readonly refresh = vi.fn()
    constructor(_wrapper: unknown, _tasks: unknown[], options: unknown) {
      created.push({ options: options as FrappeGanttOptions, change_view_mode: this.change_view_mode, refresh: this.refresh })
    }
  },
}))

afterEach(() => { cleanup(); created.length = 0 })

const copy = { columnTitle: en['column.tasks'], expandLabel: en['name.expand'], collapseLabel: en['name.collapse'] }

it('constructs the chart with every editing interaction disabled', () => {
  render(<GanttChart scenario={makeScenario(1)} mode="Week" fitNonce={0} copy={copy} />)
  expect(created).toHaveLength(1)
  expect(created[0]?.options).toMatchObject({
    readonly: true,
    readonly_dates: true,
    readonly_progress: true,
    popup: false,
    today_button: false,
    view_mode_select: false,
  })
})

it('re-fits by re-rendering the current scale when the fit nonce bumps', () => {
  const scenario = makeScenario(1)
  const view = render(<GanttChart scenario={scenario} mode="Week" fitNonce={0} copy={copy} />)
  view.rerender(<GanttChart scenario={scenario} mode="Week" fitNonce={1} copy={copy} />)
  expect(created[0]?.change_view_mode).toHaveBeenCalledWith('Week')
  expect(created).toHaveLength(1)
})

it('re-creates the chart when the scale or scenario changes', () => {
  const scenario = makeScenario(1)
  const view = render(<GanttChart scenario={scenario} mode="Week" fitNonce={0} copy={copy} />)
  view.rerender(<GanttChart scenario={scenario} mode="Day" fitNonce={0} copy={copy} />)
  expect(created).toHaveLength(2)
  expect(created[1]?.options.view_mode).toBe('Day')
  const next = makeScenario(2, { resultId: 'sha256-next' })
  view.rerender(<GanttChart scenario={next} mode="Day" fitNonce={0} copy={copy} />)
  expect(created).toHaveLength(3)
})
