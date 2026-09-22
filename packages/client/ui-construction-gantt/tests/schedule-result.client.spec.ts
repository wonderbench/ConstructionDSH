/** Schedule-result text validation: valid payloads pass, everything else fails closed. */
import { describe, expect, it } from 'vitest'
import { makeScheduleResult } from './fixtures.client.ts'
import { parseScheduleResult, resultText, validateScheduleResult } from '../src/client/schedule-result.ts'

describe('validateScheduleResult', () => {
  it('accepts the fixture payload', () => {
    expect(validateScheduleResult(makeScheduleResult())).toBeDefined()
  })

  it.each([
    ['non-object', 42],
    ['array', []],
    ['wrong schema version', { ...makeScheduleResult(), schemaVersion: 2 }],
    ['missing resultId', { ...makeScheduleResult(), resultId: 42 }],
    ['missing scenarioLabel', { ...makeScheduleResult(), scenarioLabel: undefined }],
    ['non-string scenario id', { ...makeScheduleResult(), scenarioId: 7 }],
    ['calendar that is not an object', { ...makeScheduleResult(), calendar: 'weekends' }],
    ['calendar with string rest days', { ...makeScheduleResult(), calendar: { weeklyRestDays: ['6'], holidays: [] } }],
    ['calendar with non-string holidays', { ...makeScheduleResult(), calendar: { weeklyRestDays: [6, 0], holidays: [1] } }],
    ['date range that is not an object', { ...makeScheduleResult(), dateRange: ['2026-10-01'] }],
    ['date range with bad start', { ...makeScheduleResult(), dateRange: { start: '10/01/2026', finish: '2026-11-16' } }],
    ['date range with bad finish', { ...makeScheduleResult(), dateRange: { start: '2026-10-01', finish: '20261116' } }],
    ['empty task list', { ...makeScheduleResult(), tasks: [] }],
    ['task that is not an object', { ...makeScheduleResult(), tasks: [42] }],
    ['task with empty id', { ...makeScheduleResult(), tasks: [{ ...makeScheduleResult().tasks[0]!, id: '' }] }],
    ['task with non-string name', { ...makeScheduleResult(), tasks: [{ ...makeScheduleResult().tasks[0]!, name: 7 }] }],
    ['task with non-date start', { ...makeScheduleResult(), tasks: [{ ...makeScheduleResult().tasks[0]!, start: 'yesterday' }] }],
    ['task with bad finish', { ...makeScheduleResult(), tasks: [{ ...makeScheduleResult().tasks[0]!, finish: 'next Friday' }] }],
    ['task with NaN duration', { ...makeScheduleResult(), tasks: [{ ...makeScheduleResult().tasks[0]!, duration: Number.NaN }] }],
    ['task with string float', { ...makeScheduleResult(), tasks: [{ ...makeScheduleResult().tasks[0]!, totalFloat: '0' }] }],
    ['task with missing locked flag', { ...makeScheduleResult(), tasks: [{ ...makeScheduleResult().tasks[0]!, locked: undefined }] }],
    ['link to unknown task', { ...makeScheduleResult(), links: [{ from: 'T1', to: 'TX', lagDays: 0 }] }],
    ['link with non-string endpoints', { ...makeScheduleResult(), links: [{ from: 1, to: 'T2', lagDays: 0 }] }],
    ['link with NaN lag', { ...makeScheduleResult(), links: [{ from: 'T1', to: 'T2', lagDays: Number.NaN }] }],
    ['link with non-object entry', { ...makeScheduleResult(), links: ['T1>T2'] }],
    ['non-string critical path', { ...makeScheduleResult(), criticalPath: [1] }],
    ['non-string assumptions', { ...makeScheduleResult(), assumptions: [1] }],
    ['non-string unresolved', { ...makeScheduleResult(), unresolved: [{}] }],
    ['non-string warnings', { ...makeScheduleResult(), warnings: [true] }],
  ])('rejects %s', (_name, value) => {
    expect(validateScheduleResult(value)).toBeUndefined()
  })

  it('rejects a link list that is not an array', () => {
    expect(validateScheduleResult({ ...makeScheduleResult(), links: { from: 'T1' } })).toBeUndefined()
  })
})

describe('parseScheduleResult', () => {
  it('parses valid JSON text', () => {
    const result = makeScheduleResult()
    expect(parseScheduleResult(JSON.stringify(result))?.resultId).toBe(result.resultId)
  })

  it('returns undefined for non-JSON text', () => {
    expect(parseScheduleResult('not json at all')).toBeUndefined()
  })
})

describe('resultText', () => {
  it('extracts the first text block', () => {
    expect(resultText([{ type: 'text', text: 'hello' }])).toBe('hello')
  })

  it('skips non-text blocks', () => {
    expect(resultText([{ type: 'image' }, { type: 'text', text: 'world' }])).toBe('world')
  })

  it('returns undefined without a text block or without an array', () => {
    expect(resultText([{ type: 'image' }])).toBeUndefined()
    expect(resultText('plain string')).toBeUndefined()
  })
})
