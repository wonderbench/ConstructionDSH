// @vitest-environment jsdom
/** Gantt tab body: state views, scenario switching, refresh, isolation, and toolbar. */
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ConstructionGanttSnapshot } from '../src/client/contract.ts'
import { EMPTY_CONSTRUCTION_GANTT_SNAPSHOT } from '../src/client/contract.ts'
import { GanttBody, type GanttBodyProps } from '../src/client/GanttBody.tsx'
import { GanttTitle } from '../src/client/GanttTitle.tsx'
import { en } from '../src/client/locales.ts'
import { makeScenario } from './fixtures.client.ts'

// jsdom does not implement SVG layout APIs; frappe-gantt 1.2.2 calls getBBox
// from requestAnimationFrame label placement and from initial scroll positioning.
;(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
  ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) })

afterEach(cleanup)

function snapshot(
  scenarios: readonly ReturnType<typeof makeScenario>[],
  rest: Partial<ConstructionGanttSnapshot> = {},
): ConstructionGanttSnapshot {
  return { ...EMPTY_CONSTRUCTION_GANTT_SNAPSHOT, scenarios, ...rest }
}

function bodyProps(value: ConstructionGanttSnapshot, fullscreen = false): GanttBodyProps {
  const useConstructionGantt: GanttBodyProps['useConstructionGantt'] = selector => selector(value)
  const useTabInfo = (() => ({ sidebar: { expanded: true, fullscreen } })) as GanttBodyProps['useTabInfo']
  return { useConstructionGantt, useTabInfo, t: makeTranslate(en) } as unknown as GanttBodyProps
}

function titleProps(value: ConstructionGanttSnapshot): Parameters<typeof GanttTitle>[0] {
  const useConstructionGantt = (selector: (snapshot: ConstructionGanttSnapshot) => unknown) => selector(value)
  return { useConstructionGantt, t: makeTranslate(en) } as unknown as Parameters<typeof GanttTitle>[0]
}

it('renders the empty state without any schedule call', () => {
  const view = render(<GanttBody {...bodyProps(snapshot([]))} />)
  expect(view.getByRole('status').textContent).toBe(en.empty)
})

it('renders the calculating state while a call is open', () => {
  const view = render(<GanttBody {...bodyProps(snapshot([], { running: true }))} />)
  expect(view.getByRole('status').textContent).toBe(en.calculating)
})

it.each(['malformed', 'error'] as const)('renders the failure state for a %s result', (reason) => {
  const view = render(<GanttBody {...bodyProps(snapshot([], { failures: [{ callId: 'c1', reason, seq: 2 }] }))} />)
  expect(view.getByRole('alert').textContent)
    .toBe(reason === 'error' ? en['failure.error'] : en['failure.malformed'])
})

it('renders the toolbar and chart for the latest scenario', () => {
  const scenario = makeScenario(1)
  const view = render(<GanttBody {...bodyProps(snapshot([scenario]))} />)
  const select = view.getByRole('combobox', { name: en['scenario.label'] }) as HTMLSelectElement
  expect(select.value).toBe(scenario.resultId)
  expect(view.container.querySelector('svg.gantt')).not.toBeNull()
  expect(view.getByText(en['readonly.hint'])).not.toBeNull()
  expect(view.container.querySelector('[data-task-id="T1"]')).not.toBeNull()
})

it('switches to a previous scenario selected by the user', () => {
  const first = makeScenario(2, { resultId: 'sha256-second', scenarioLabel: 'Accelerated' })
  const second = makeScenario(1)
  const view = render(<GanttBody {...bodyProps(snapshot([first, second]))} />)
  const select = view.getByRole('combobox', { name: en['scenario.label'] }) as HTMLSelectElement
  fireEvent.change(select, { target: { value: second.resultId } })
  expect(select.value).toBe(second.resultId)
  expect(view.container.querySelector('[data-task-id="T1"]')).not.toBeNull()
})

it('refreshes to a newly arrived result while keeping a stable selection', () => {
  const initial = makeScenario(1)
  const view = render(<GanttBody {...bodyProps(snapshot([initial]))} />)
  const select = view.getByRole('combobox', { name: en['scenario.label'] }) as HTMLSelectElement
  expect(select.value).toBe(initial.resultId)
  const latest = makeScenario(3, { resultId: 'sha256-latest', scenarioLabel: 'Revised' })
  view.rerender(<GanttBody {...bodyProps(snapshot([latest, initial]))} />)
  expect(select.value).toBe(latest.resultId)
  const picked = makeScenario(1)
  fireEvent.change(select, { target: { value: picked.resultId } })
  const newest = makeScenario(4, { resultId: 'sha256-newest' })
  view.rerender(<GanttBody {...bodyProps(snapshot([newest, latest, initial]))} />)
  expect(select.value).toBe(picked.resultId)
})

it('never mixes another session’s scenarios', () => {
  const sessionA = makeScenario(1, { resultId: 'sha256-session-a', scenarioLabel: 'Session A plan' })
  const sessionB = makeScenario(1, { resultId: 'sha256-session-b', scenarioLabel: 'Session B plan' })
  const a = render(<GanttBody {...bodyProps(snapshot([sessionA]))} />)
  const b = render(<GanttBody {...bodyProps(snapshot([sessionB]))} />)
  const optionsOf = (view: ReturnType<typeof render>): string[] =>
    [...view.container.querySelectorAll('option')].map(option => option.textContent ?? '')
  expect(optionsOf(a)).toEqual(['Session A plan (sha256-s)'])
  expect(optionsOf(b)).toEqual(['Session B plan (sha256-s)'])
  expect(a.container.textContent).not.toContain('Session B')
})

it('shows assumptions, unresolved inputs, and warnings for a partial scenario', () => {
  const scenario = makeScenario(1)
  const view = render(<GanttBody {...bodyProps(snapshot([scenario]))} />)
  expect(view.getByText('Calculation assumptions (1)')).not.toBeNull()
  const unresolvedRow = view.getByText('Unresolved inputs (1)').closest('[data-disclosure-row]')!
  const toggle = within(unresolvedRow as HTMLElement).getByRole('button')
  fireEvent.click(toggle)
  expect(view.getByText('Confirm rebar delivery date')).not.toBeNull()
  fireEvent.click(toggle)
  expect(view.queryByText('Confirm rebar delivery date')).toBeNull()
})

it.each([
  ['unresolved', { assumptions: [], unresolved: ['Pick a crane'], warnings: [] }],
  ['warnings', { assumptions: [], unresolved: [], warnings: ['Rain season near the end'] }],
] as const)('treats a scenario with only %s as partial too', (_kind, overrides) => {
  const scenario = makeScenario(1, overrides)
  const view = render(<GanttBody {...bodyProps(snapshot([scenario]))} />)
  expect(view.container.querySelector('[data-construction-gantt-chart]')).not.toBeNull()
  expect(view.getByText(overrides.unresolved.length > 0 ? 'Unresolved inputs (1)' : 'Calculation warnings (1)')).not.toBeNull()
})

it('shows the running banner above the chart while recalculating', () => {
  const view = render(<GanttBody {...bodyProps(snapshot([makeScenario(1)], { running: true }))} />)
  expect(view.getByRole('status').textContent).toBe(en['banner.running'])
  expect(view.container.querySelector('svg.gantt')).not.toBeNull()
})

it('shows the failure banner beside an older successful scenario', () => {
  const value = snapshot([makeScenario(1)], { failures: [{ callId: 'c2', reason: 'malformed', seq: 5 }] })
  const view = render(<GanttBody {...bodyProps(value)} />)
  expect(view.getByRole('alert').textContent)
    .toBe(`The last presentation failed: ${en['failure.malformed']}`)
  expect(view.container.querySelector('svg.gantt')).not.toBeNull()
})

it('names the error reason when the failed result carried a tool error', () => {
  const value = snapshot([makeScenario(1)], { failures: [{ callId: 'c2', reason: 'error', seq: 5 }] })
  const view = render(<GanttBody {...bodyProps(value)} />)
  expect(view.getByRole('alert').textContent)
    .toBe(`The last presentation failed: ${en['failure.error']}`)
})

it('switches the Day/Week/Month scale from the toolbar', () => {
  const view = render(<GanttBody {...bodyProps(snapshot([makeScenario(1)]))} />)
  const day = view.getByRole('button', { name: en['scale.day'] })
  expect(day.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(day)
  expect(view.getByRole('button', { name: en['scale.day'] }).getAttribute('aria-pressed')).toBe('true')
  expect(view.getByRole('button', { name: en['scale.week'] }).getAttribute('aria-pressed')).toBe('false')
})

it('re-fits the chart from the toolbar without changing the scale', () => {
  const view = render(<GanttBody {...bodyProps(snapshot([makeScenario(1)]))} />)
  fireEvent.click(view.getByRole('button', { name: en['fit.aria'] }))
  expect(view.getByRole('button', { name: en['scale.week'] }).getAttribute('aria-pressed')).toBe('true')
})

it('expands the chart inside the tab and restores it', () => {
  const view = render(<GanttBody {...bodyProps(snapshot([makeScenario(1)]))} />)
  fireEvent.click(view.getByRole('button', { name: en['expand.aria'] }))
  expect(view.container.querySelector('[data-expanded="true"]')).not.toBeNull()
  const exitButtons = view.getAllByRole('button', { name: en['expand.aria'] })
  fireEvent.click(exitButtons[exitButtons.length - 1]!)
  expect(view.container.querySelector('[data-expanded="true"]')).toBeNull()
})

it('hides the expand control while the sidebar is already fullscreen', () => {
  const view = render(<GanttBody {...bodyProps(snapshot([makeScenario(1)]), true)} />)
  expect(view.queryByRole('button', { name: en['expand.aria'] })).toBeNull()
  expect(view.container.querySelector('svg.gantt')).not.toBeNull()
})

it.each([420, 720] as const)('keeps the toolbar and chart usable at %ipx sidebar width', (width) => {
  const view = render(
    <div style={{ width: `${width}px` }}>
      <GanttBody {...bodyProps(snapshot([makeScenario(1)]))} />
    </div>,
  )
  expect(view.getByRole('combobox', { name: en['scenario.label'] })).not.toBeNull()
  expect(view.container.querySelector('svg.gantt')).not.toBeNull()
})

it('names the title from the latest scenario, independent of the body selection', () => {
  const latest = makeScenario(2, { resultId: 'sha256-title', scenarioLabel: 'Title plan' })
  const earlier = makeScenario(1)
  const view = render(<GanttTitle {...titleProps(snapshot([latest, earlier]))} />)
  expect(view.container.textContent).toBe(`${en.title} · Title plan (sha256-t)`)
  const empty = render(<GanttTitle {...titleProps(snapshot([]))} />)
  expect(empty.container.textContent).toBe(en.title)
})
