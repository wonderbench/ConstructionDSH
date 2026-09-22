import { describe, expect, it } from 'vitest'
import { bootRuntime, callTool, seedWorkspace, workspace } from './helpers.ts'
import { calculateSchedule, ScheduleResultStore } from '../src/schedule.ts'
import type { ScheduleInput, ScheduleResult } from '../src/types.ts'

const BASE: ScheduleInput = {
  project_start: '2026-03-02', // a Monday
  tasks: [{ id: 'A', name: 'mobilize', duration: 1 }],
  links: [],
}

function task(result: ScheduleResult, id: string) {
  const found = result.tasks.find(entry => entry.id === id)
  expect(found, `task ${id}`).toBeDefined()
  return found as NonNullable<typeof found>
}

describe('schedule engine', () => {
  it('calculates a single-day task with inclusive start and exclusive finish', () => {
    const result = calculateSchedule(BASE)
    expect(task(result, 'A')).toMatchObject({ start: '2026-03-02', finish: '2026-03-02', duration: 1, is_milestone: false })
  })

  it('spans weekends in working days only', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [
        { id: 'B', name: 'excavate', duration: 5 },
        { id: 'C', name: 'follow', duration: 1 },
      ],
      links: [{ from: 'B', to: 'C' }],
    })
    expect(task(result, 'B')).toMatchObject({ start: '2026-03-02', finish: '2026-03-06' })
    // The exclusive finish boundary is Monday 2026-03-09, so the successor starts there.
    expect(task(result, 'C')).toMatchObject({ start: '2026-03-09', finish: '2026-03-09' })
  })

  it('crosses the year boundary without timezone effects', () => {
    const result = calculateSchedule({
      project_start: '2025-12-31', // a Wednesday
      tasks: [{ id: 'Y', name: 'pour', duration: 3 }],
    })
    expect(task(result, 'Y')).toMatchObject({ start: '2025-12-31', finish: '2026-01-02' })
  })

  it('places zero-duration milestones on the finish boundary and honors lags', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [
        { id: 'B', name: 'excavate', duration: 5 },
        { id: 'M', name: 'inspect', duration: 0 },
        { id: 'D', name: 'blinding', duration: 1 },
      ],
      links: [
        { from: 'B', to: 'M' },
        { from: 'M', to: 'D', lag: 1 },
      ],
    })
    expect(task(result, 'M')).toMatchObject({ start: '2026-03-09', finish: '2026-03-09', is_milestone: true, is_critical: true })
    expect(task(result, 'D')).toMatchObject({ start: '2026-03-10', finish: '2026-03-10' })
    expect(result.critical_path).toEqual(['B', 'M', 'D'])
  })

  it('computes total float and the critical path only on the driving chain', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [
        { id: 'A', name: 'start', duration: 2 },
        { id: 'B', name: 'long', duration: 5 },
        { id: 'P', name: 'parallel', duration: 2 },
      ],
      links: [{ from: 'A', to: 'B' }, { from: 'A', to: 'P' }],
    })
    expect(task(result, 'A').total_float).toBe(0)
    expect(task(result, 'B').total_float).toBe(0)
    expect(task(result, 'P').total_float).toBe(3)
    expect(task(result, 'P').is_critical).toBe(false)
    expect(result.critical_path).toEqual(['A', 'B'])
  })

  it('rejects cycles and names the cycle', () => {
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'E', duration: 4 }, { id: 'F', duration: 3 }],
      links: [{ from: 'E', to: 'F' }, { from: 'F', to: 'E' }],
    })).toThrow('cycle detected: E -> F -> E')
  })

  it('rejects duplicate ids, dangling links, and bad durations with reasons', () => {
    expect(() => calculateSchedule({
      tasks: [{ id: 'A', duration: 1 }, { id: 'A', duration: 2 }],
    })).toThrow('duplicate task id "A"')
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'A', duration: 1 }],
      links: [{ from: 'A', to: 'missing' }],
    })).toThrow('references an unknown task')
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'A', duration: -1 }],
    })).toThrow('nonnegative integer')
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'A', duration: 1 }],
      links: [{ from: 'A', to: 'A', lag: -2 }],
    })).toThrow('lag -2 is not a nonnegative integer')
  })

  it('rejects malformed dates and bad calendar configuration', () => {
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'A', duration: 1, start_no_earlier_than: '03/02/2026' }],
    })).toThrow('not a valid ISO date')
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      weekly_rest_days: [7],
      tasks: [{ id: 'A', duration: 1 }],
    })).toThrow('between 0 (Sunday) and 6 (Saturday)')
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      holidays: ['not-a-date'],
      tasks: [{ id: 'A', duration: 1 }],
    })).toThrow('not a valid ISO date')
    expect(() => calculateSchedule({
      project_start: '2026-13-40',
      tasks: [{ id: 'A', duration: 1 }],
    })).toThrow('not a valid ISO date')
    expect(() => calculateSchedule({
      project_start: '2026-02-30',
      tasks: [{ id: 'A', duration: 1 }],
    })).toThrow('not a valid ISO date')
  })

  it('rejects empty task lists and tasks without ids', () => {
    expect(() => calculateSchedule({ project_start: '2026-03-02', tasks: [] })).toThrow('at least one task is required')
    expect(() => calculateSchedule({ project_start: '2026-03-02', tasks: [{ id: '  ', duration: 1 }] })).toThrow('every task requires a non-empty id')
  })

  it('rejects schedules without any anchor date', () => {
    expect(() => calculateSchedule({ tasks: [{ id: 'A', duration: 1 }] })).toThrow('provide project_start')
  })

  it('rejects finish constraint conflicts', () => {
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'A', duration: 5, finish_no_later_than: '2026-03-04' }],
    })).toThrow('constraint conflict')
  })

  it('moves rest-day starts to the next working day and records the assumption', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'A', duration: 1, start_no_earlier_than: '2026-03-07' }],
    })
    expect(task(result, 'A').start).toBe('2026-03-09')
    expect(result.assumptions.some(note => note.includes('moved from'))).toBe(true)
  })

  it('moves the project start itself when the earliest supplied date is a rest day', () => {
    const result = calculateSchedule({
      tasks: [{ id: 'A', duration: 1, start_no_earlier_than: '2026-03-07' }],
    })
    expect(task(result, 'A').start).toBe('2026-03-09')
    expect(result.assumptions.some(note => note.includes('the earliest supplied date falls on a non-working day'))).toBe(true)
  })

  it('advances and retreats lags across weekend rest days', () => {
    const result = calculateSchedule({
      project_start: '2026-03-04', // a Wednesday
      tasks: [
        { id: 'A', duration: 1 },
        { id: 'M', duration: 0 },
        { id: 'B', duration: 1 },
      ],
      links: [
        { from: 'A', to: 'M' },
        { from: 'M', to: 'B', lag: 2 },
      ],
    })
    // M sits on the Thursday boundary; a two-working-day lag crosses the
    // weekend and lands on Tuesday.
    expect(task(result, 'M')).toMatchObject({ start: '2026-03-05', finish: '2026-03-05' })
    expect(task(result, 'B')).toMatchObject({ start: '2026-03-09', finish: '2026-03-09' })
    // The backward pass retreats across the same weekend for the float.
    expect(task(result, 'A').total_float).toBe(0)
    expect(task(result, 'M').total_float).toBe(0)
    expect(result.critical_path).toEqual(['A', 'M', 'B'])
  })

  it('handles tasks with several predecessors and orders same-start critical tasks by id', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [
        { id: 'A', duration: 1 },
        { id: 'B', duration: 1 },
        { id: 'Z', duration: 1 },
        { id: 'Y', duration: 1 },
      ],
      links: [
        { from: 'A', to: 'Z' },
        { from: 'B', to: 'Z' },
        { from: 'A', to: 'Y' },
      ],
    })
    // Z waits for both A and B; the extra Y path decides the project finish.
    expect(task(result, 'Z').start).toBe('2026-03-03')
    // Y and Z share a start and both carry zero float; the path order is by id.
    expect(task(result, 'Y').total_float).toBe(0)
    expect(task(result, 'Z').total_float).toBe(0)
    expect(result.critical_path).toEqual(['A', 'B', 'Y', 'Z'])
  })

  it('names cycles found after scanning finished branches', () => {
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      tasks: [
        { id: 'A', duration: 1 },
        { id: 'B', duration: 1 },
        { id: 'C', duration: 1 },
        { id: 'D', duration: 1 },
        { id: 'E', duration: 1 },
        { id: 'F', duration: 1 },
      ],
      links: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'D' },
        { from: 'A', to: 'C' },
        { from: 'C', to: 'D' },
        { from: 'E', to: 'F' },
        { from: 'F', to: 'E' },
      ],
    })).toThrow('cycle detected: E -> F -> E')
  })

  it('honors satisfied finish constraints on tasks and milestones', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [
        { id: 'A', duration: 1, finish_no_later_than: '2026-03-10' },
        { id: 'M', duration: 0, finish_no_later_than: '2026-03-03' },
      ],
      links: [{ from: 'A', to: 'M' }],
    })
    expect(task(result, 'A')).toMatchObject({ finish: '2026-03-02' })
    expect(task(result, 'M')).toMatchObject({ start: '2026-03-03', finish: '2026-03-03', is_milestone: true })
    // The milestone finish constraint bounds the backward pass.
    expect(task(result, 'A').total_float).toBe(0)
  })

  it('treats missing durations as milestones with an assumption', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'A', duration: 1 }, { id: 'M' }],
      links: [{ from: 'A', to: 'M' }],
    })
    expect(task(result, 'M').is_milestone).toBe(true)
  })

  it('reports unsupported relations without rewriting them and claims no critical path', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'A', duration: 2 }, { id: 'B', duration: 2 }],
      links: [{ from: 'A', to: 'B', relation: 'SS' }],
    })
    expect(result.links).toEqual([{ from: 'A', to: 'B', lag: 0, supported: false }])
    expect(result.critical_path).toBeNull()
    expect(result.unresolved.some(note => note.includes('SS link A -> B'))).toBe(true)
    // Dates are still reported from the start anchor.
    expect(task(result, 'A').start).toBe('2026-03-02')
  })

  it('claims no critical path when tasks lack logic or start constraints', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [{ id: 'A', duration: 2 }, { id: 'B', duration: 3 }],
    })
    expect(result.critical_path).toBeNull()
    expect(result.assumptions.some(note => note.includes('logic is incomplete'))).toBe(true)
  })

  it('keeps locked tasks on their recorded dates and schedules successors from them', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      tasks: [
        { id: 'A', duration: 2, locked_start: '2026-04-06', locked_finish: '2026-04-07' },
        { id: 'B', duration: 1 },
      ],
      links: [{ from: 'A', to: 'B' }],
    })
    expect(task(result, 'A')).toMatchObject({ start: '2026-04-06', finish: '2026-04-07', locked: true, is_critical: false })
    expect(task(result, 'B')).toMatchObject({ start: '2026-04-08', finish: '2026-04-08' })
  })

  it('rejects locked dates that conflict with the logic', () => {
    expect(() => calculateSchedule({
      project_start: '2026-03-02',
      tasks: [
        { id: 'A', duration: 2, locked_start: '2026-03-02', locked_finish: '2026-03-03' },
        { id: 'B', duration: 5, locked_start: '2026-03-03', locked_finish: '2026-03-03' },
      ],
      links: [{ from: 'A', to: 'B' }],
    })).toThrow('locked task "B"')
  })

  it('honors holidays as non-working days', () => {
    const result = calculateSchedule({
      project_start: '2026-03-02',
      holidays: ['2026-03-03'],
      tasks: [{ id: 'A', duration: 2 }],
    })
    expect(task(result, 'A')).toMatchObject({ start: '2026-03-02', finish: '2026-03-04' })
  })

  it('is pure near date boundaries regardless of host timezone', () => {
    // The engine never reads the clock; two runs agree and match the civil calendar.
    const input: ScheduleInput = { project_start: '2026-01-01', tasks: [{ id: 'A', duration: 1 }] }
    expect(calculateSchedule(input)).toEqual(calculateSchedule(input))
    expect(task(calculateSchedule(input), 'A').start).toBe('2026-01-01')
  })
})


describe('schedule tools through the executor', () => {
  it('denies calculation without an active schedule task (B04)', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      const denied = await callTool(ctx, dir, 'construction_schedule_calculate', { input: BASE })
      expect(denied.isError).toBe(true)
      const text = denied.content[0]?.type === 'text' ? denied.content[0].text : ''
      expect(text).toContain('no active construction task')
    } finally {
      await fiber.dispose()
    }
  })

  it('denies cost tools while a schedule task is active (B04 cross-domain)', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-schedule', { cwd: dir })
      const denied = await callTool(ctx, dir, 'construction_cost_calculate', {
        input: { variant: 'unit_rate', items: [] },
      })
      expect(denied.isError).toBe(true)
      const text = denied.content[0]?.type === 'text' ? denied.content[0].text : ''
      expect(text).toContain('cannot run this cost tool')
    } finally {
      await fiber.dispose()
    }
  })

  it('calculates and presents a scenario, keyed by content hash', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-schedule', { cwd: dir })
      const calculated = await callTool(ctx, dir, 'construction_schedule_calculate', { input: BASE })
      expect(calculated.isError).toBe(false)
      const result = (calculated as { value: ScheduleResult }).value
      const first = await callTool(ctx, dir, 'construction_schedule_present', { result })
      const second = await callTool(ctx, dir, 'construction_schedule_present', { result })
      expect(first.isError).toBe(false)
      const a = (first as { value: { result_id: string; task_count: number; date_range: { start: string; finish: string } } }).value
      const b = (second as { value: { result_id: string } }).value
      expect(a.result_id).toBe(b.result_id)
      expect(a.task_count).toBe(1)
      expect(a.date_range).toEqual({ start: '2026-03-02', finish: '2026-03-02' })
      expect(a.result_id).toHaveLength(64)
    } finally {
      await fiber.dispose()
    }
  })

  it('chains calculate to present and report through the rendered frozen JSON', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-schedule', { cwd: dir })
      const calculated = await callTool(ctx, dir, 'construction_schedule_calculate', { input: BASE })
      expect(calculated.isError).toBe(false)
      // The model sees only the rendered text: recover the frozen result from
      // that text, never from an in-test object.
      const text = calculated.content.map(block => (block.type === 'text' ? block.text ?? '' : '')).join('\n')
      const marker = text.indexOf('Frozen result JSON — ')
      expect(marker).toBeGreaterThan(-1)
      const frozen: unknown = JSON.parse(text.slice(text.indexOf('\n', marker) + 1))

      const presented = await callTool(ctx, dir, 'construction_schedule_present', { result: frozen })
      expect(presented.isError).toBe(false)
      expect((presented as { value: { result_id: string } }).value.result_id).toHaveLength(64)

      const reported = await callTool(ctx, dir, 'construction_report_export', { result: { kind: 'schedule', data: frozen } })
      expect(reported.isError).toBe(false)
    } finally {
      await fiber.dispose()
    }
  })

  it('presents empty and multi-task scenarios for the date range', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-schedule', { cwd: dir })
      const empty = await callTool(ctx, dir, 'construction_schedule_present', {
        result: {
          schema_version: 1,
          calculator_version: 'construction-schedule/1.0.0',
          scenario_id: 'empty',
          tasks: [],
          links: [],
          assumptions: [],
          unresolved: [],
          warnings: [],
        },
      })
      expect(empty.isError).toBe(false)
      expect((empty as { value: { date_range: { start: string; finish: string } } }).value.date_range).toEqual({ start: '', finish: '' })

      const multi = calculateSchedule({
        project_start: '2026-03-02',
        tasks: [
          { id: 'A', duration: 2 },
          { id: 'B', duration: 3 },
        ],
        links: [{ from: 'A', to: 'B' }],
      })
      const presented = await callTool(ctx, dir, 'construction_schedule_present', { result: multi })
      expect((presented as { value: { date_range: { start: string; finish: string } } }).value.date_range).toEqual({ start: '2026-03-02', finish: '2026-03-06' })

      // Reverse date order exercises both reduce directions in the range fold.
      const reversed = await callTool(ctx, dir, 'construction_schedule_present', {
        result: {
          schema_version: 1,
          calculator_version: 'construction-schedule/1.0.0',
          scenario_id: 'reversed',
          tasks: [
            { id: 'X', name: 'x', duration: 1, start: '2026-03-05', finish: '2026-03-05', total_float: 0, is_critical: false, is_milestone: false, locked: false },
            { id: 'Y', name: 'y', duration: 1, start: '2026-03-02', finish: '2026-03-02', total_float: 0, is_critical: false, is_milestone: false, locked: false },
          ],
          links: [],
          critical_path: null,
          assumptions: [],
          unresolved: [],
          warnings: [],
        },
      })
      expect((reversed as { value: { date_range: { start: string; finish: string } } }).value.date_range).toEqual({ start: '2026-03-02', finish: '2026-03-05' })
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects presenting a value that is not a frozen schedule result', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-schedule', { cwd: dir })
      const denied = await callTool(ctx, dir, 'construction_schedule_present', {
        result: {
          schema_version: 1,
          calculator_version: 'some-other-calculator/9.9',
          scenario_id: 'foreign',
          tasks: [],
          links: [],
          assumptions: [],
          unresolved: [],
          warnings: [],
        },
      })
      expect(denied.isError).toBe(true)
      const text = denied.content[0]?.type === 'text' ? denied.content[0].text : ''
      expect(text).toContain('not a frozen schedule result')
    } finally {
      await fiber.dispose()
    }
  })
})

describe('ScheduleResultStore', () => {
  it('stores results under the canonical JSON hash', () => {
    const store = new ScheduleResultStore()
    const result = calculateSchedule(BASE)
    const first = store.put(result)
    expect(store.get(first.resultId)).toBe(result)
    expect(store.get('unknown')).toBeUndefined()
    const again = store.put(result)
    expect(again.resultId).toBe(first.resultId)
  })
})
