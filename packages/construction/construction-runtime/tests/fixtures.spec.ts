import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { calculateCost } from '../src/cost.ts'
import { calculateSchedule } from '../src/schedule.ts'
import type { CostInput, ScheduleInput } from '../src/types.ts'

const ASSETS = fileURLToPath(new URL('../assets/', import.meta.url))

/** One parsed skill fixture file. */
interface SkillFixture {
  /** Fixture prose. */
  readonly description?: string
  /** Engine or model input payload. */
  readonly inputs?: unknown
  /** Expected output, either engine-checkable values or model-facing prose. */
  readonly expected_output?: Record<string, unknown>
}

function fixture(skill: string, name: string): SkillFixture {
  return JSON.parse(readFileSync(join(ASSETS, 'skills', skill, 'fixtures', `${name}.json`), 'utf8')) as SkillFixture
}

/** Assert that every listed field of one object fixture entry is a string. */
function expectStringFields(entry: unknown, fields: readonly string[], label: string): void {
  expect(typeof entry, label).toBe('object')
  for (const field of fields) {
    expect(typeof (entry as Record<string, unknown>)[field], `${label}.${field}`).toBe('string')
  }
}

/** Assert that one fixture value is an array of strings. */
function expectStringArray(value: unknown, label: string): void {
  expect(Array.isArray(value), label).toBe(true)
  for (const [index, entry] of (value as unknown[]).entries()) {
    expect(typeof entry, `${label}[${index}]`).toBe('string')
  }
}

describe('skill fixtures', () => {
  it('reproduces the normal three-task schedule fixture exactly', () => {
    const { inputs } = fixture('construction-schedule', 'normal-three-task') as { inputs: ScheduleInput }
    const result = calculateSchedule(inputs)
    expect(result.critical_path).toEqual(['A', 'B', 'C', 'D'])
    expect(result.unresolved).toEqual([])
    const dates = Object.fromEntries(result.tasks.map(task => [task.id, {
      start: task.start,
      finish: task.finish,
      float: task.total_float,
      critical: task.is_critical,
    }]))
    expect(dates).toEqual({
      A: { start: '2026-03-02', finish: '2026-03-03', float: 0, critical: true },
      B: { start: '2026-03-04', finish: '2026-03-10', float: 0, critical: true },
      C: { start: '2026-03-11', finish: '2026-03-11', float: 0, critical: true },
      D: { start: '2026-03-12', finish: '2026-03-12', float: 0, critical: true },
    })
    expect(result.tasks.find(task => task.id === 'C')?.is_milestone).toBe(true)
  })

  it('rejects the cycle fixture naming it and reports the unsupported relation unrewritten', () => {
    const { inputs } = fixture('construction-schedule', 'exceptional-cycle-and-unsupported') as { inputs: ScheduleInput }
    expect(() => calculateSchedule(inputs)).toThrow('cycle detected: E -> F -> E')

    // Without the circular link the unsupported SS relation is reported, never
    // rewritten as finish-to-start, and no critical path is claimed.
    const acyclic: ScheduleInput = {
      ...inputs,
      ...inputs.links === undefined
        ? {}
        : { links: inputs.links.filter(link => !(link.from === 'F' && link.to === 'E')) },
    }
    const result = calculateSchedule(acyclic)
    expect(result.links).toEqual([
      { from: 'E', to: 'F', lag: 0, supported: true },
      { from: 'E', to: 'F', lag: 0, supported: false },
    ])
    expect(result.unresolved).toContain('SS link E -> F is unsupported and was not rewritten as finish-to-start')
    expect(result.critical_path).toBeNull()
  })

  it('flags blanks and duplicates in the exceptional cost fixture through the engine', () => {
    const { inputs } = fixture('construction-cost', 'exceptional-blank-and-duplicate') as { inputs: CostInput }
    const result = calculateCost(inputs, 2)
    const item = (code: string) => result.items.find(entry => entry.code === code)
    const concrete = result.items.filter(entry => entry.code === '0202')

    // Blank unit price: an unresolved entry, and the rate and amount stay
    // absent instead of becoming zero.
    expect(result.unresolved).toContain('0203: resource "rebar" has a blank consumption or unit price; a blank is not zero, so the line is excluded')
    expect(item('0203')?.unit_rate).toBeUndefined()
    expect(item('0203')?.amount).toBeUndefined()
    expect(item('0203')?.trace.some(line => line.includes('blank (excluded, not zero)'))).toBe(true)

    // Duplicate code: flagged and both entries stay evaluated separately.
    expect(result.unresolved).toContain('0202: appears 2 times under one code; confirm the entries are intended or they will double-count')
    expect(concrete).toHaveLength(2)
    expect(concrete[0]?.amount).toBe('126990.00')
    expect(concrete[1]?.amount).toBe('51163.20')
    expect(result.totals.amount).toBe('178153.20')
  })

  it('keeps the safety fixture expected outputs structurally valid', () => {
    for (const name of ['normal-excavation', 'exceptional-scanned-evidence']) {
      const { expected_output: expected } = fixture('construction-safety', name) as { expected_output: Record<string, unknown> }
      expect(typeof expected.shape, `${name}.shape`).toBe('string')
      expect(Array.isArray(expected.issues), `${name}.issues`).toBe(true)
      for (const [index, issue] of (expected.issues as unknown[]).entries()) {
        expectStringFields(issue, ['severity', 'issue', 'evidence', 'proposed_control'], `${name}.issues[${index}]`)
      }
      expectStringArray(expected.unresolved, `${name}.unresolved`)
      if (expected.prohibited !== undefined) expect(typeof expected.prohibited, `${name}.prohibited`).toBe('string')
    }
  })

  it('keeps the quality fixture expected outputs structurally valid', () => {
    for (const name of ['normal-concrete-tests', 'exceptional-blank-and-contradiction']) {
      const { expected_output: expected } = fixture('construction-quality', name) as { expected_output: Record<string, unknown> }
      expect(typeof expected.shape, `${name}.shape`).toBe('string')
      expect(Array.isArray(expected.checked_properties), `${name}.checked_properties`).toBe(true)
      for (const [index, checked] of (expected.checked_properties as unknown[]).entries()) {
        expectStringFields(checked, ['property', 'requirement', 'source_ref', 'result'], `${name}.checked_properties[${index}]`)
        const measured = (checked as Record<string, unknown>).measured
        expect(measured === null || typeof measured === 'string', `${name}.checked_properties[${index}].measured`).toBe(true)
      }
      expect(Array.isArray(expected.nonconformities), `${name}.nonconformities`).toBe(true)
      expectStringArray(expected.unresolved, `${name}.unresolved`)
      if (expected.prohibited !== undefined) expect(typeof expected.prohibited, `${name}.prohibited`).toBe('string')
    }
  })
})
