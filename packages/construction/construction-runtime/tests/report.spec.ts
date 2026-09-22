import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bootRuntime, callTool, seedWorkspace, workspace } from './helpers.ts'
import { calculateCost } from '../src/cost.ts'
import { calculateSchedule } from '../src/schedule.ts'
import { PERMITTED_SECTIONS } from '../src/report.ts'
import type { CostInput } from '../src/types.ts'

const COST_INPUT: CostInput = {
  variant: 'unit_rate',
  items: [
    {
      code: '0101',
      unit: 'm3',
      quantity: '2',
      resources: [{ kind: 'labor', name: 'crew', consumption: '1', unit_price: '100' }],
      fees: [],
    },
  ],
}

function textOf(result: { content: readonly { type: string; text?: string }[] }): string {
  return result.content.map(block => (block.type === 'text' ? block.text ?? '' : '')).join('\n')
}

describe('construction_report_export', () => {
  it('requires any active business task', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      const denied = await callTool(ctx, dir, 'construction_report_export', {
        result: { kind: 'cost', data: calculateCost(COST_INPUT, 2) },
      })
      expect(denied.isError).toBe(true)
      expect(textOf(denied as never)).toContain('no active construction task')
    } finally {
      await fiber.dispose()
    }
  })

  it('filters sections by the active task type and omits unpermitted ones', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-cost', { cwd: dir })
      const result = calculateCost(COST_INPUT, 2)
      const exported = await callTool(ctx, dir, 'construction_report_export', {
        result: { kind: 'cost', data: result },
        sections: ['summary', 'items', 'totals', 'tasks'],
      })
      expect(exported.isError).toBe(false)
      const value = (exported as { value: { path: string; summary: string } }).value
      expect(value.summary).toContain('summary, items, totals')
      const written = await readFile(join(dir, '.dsh', 'construction', 'reports', value.path.split(/[\\/]/).pop() ?? ''), 'utf8')
      expect(written).toContain('## Items')
      expect(written).toContain('200.00')
      expect(written).not.toContain('## Tasks')
      expect(written).toContain('Sections omitted because the active task is a cost task: tasks')
    } finally {
      await fiber.dispose()
    }
  })

  it('exports schedule sections only for a schedule task', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-schedule', { cwd: dir })
      const schedule = calculateSchedule({ project_start: '2026-03-02', tasks: [{ id: 'A', duration: 1 }] })
      const exported = await callTool(ctx, dir, 'construction_report_export', {
        result: { kind: 'schedule', data: schedule },
      })
      expect(exported.isError).toBe(false)
      const value = (exported as { value: { path: string } }).value
      const written = await readFile(join(dir, '.dsh', 'construction', 'reports', value.path.split(/[\\/]/).pop() ?? ''), 'utf8')
      expect(written).toContain('## Tasks')
      expect(written).toContain('## Critical path')
      expect(written).toContain('## Calendar')
      expect(written).not.toContain('## Items')
    } finally {
      await fiber.dispose()
    }
  })

  it('renders document sections with their bullets for a safety task', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-safety', { cwd: dir })
      const exported = await callTool(ctx, dir, 'construction_report_export', {
        result: {
          kind: 'document',
          data: {
            schema_version: 1,
            summary: 'Excavation support is incomplete past the first 20 m.',
            sections: {
              issues: ['trench deeper than 1.5 m with shoring recorded only for the first 20 m'],
              evidence: ['inspection-record.docx paragraph stating support extent'],
              controls: ['extend shoring or bench the remaining trench length'],
              unresolved: ['whether the utility survey covers the last 50 m'],
            },
          },
        },
      })
      expect(exported.isError).toBe(false)
      const value = (exported as { value: { path: string; summary: string; unresolved: string[] } }).value
      expect(value.summary).toBe('safety report with sections summary, issues, evidence, controls, unresolved')
      expect(value.unresolved).toEqual(['whether the utility survey covers the last 50 m'])
      const written = await readFile(join(dir, '.dsh', 'construction', 'reports', value.path.split(/[\\/]/).pop() ?? ''), 'utf8')
      expect(written).toContain('## Summary')
      expect(written).toContain('Excavation support is incomplete past the first 20 m.')
      expect(written).toContain('## Issues')
      expect(written).toContain('- trench deeper than 1.5 m with shoring recorded only for the first 20 m')
      expect(written).toContain('## Evidence')
      expect(written).toContain('## Controls')
      expect(written).toContain('## Unresolved items')
      expect(written).toContain('- whether the utility survey covers the last 50 m')
      expect(written).not.toContain('## Checks')
      expect(written).not.toContain('## Document summary')
      expect(written).not.toContain('Sections omitted')

      // Default sections request every permitted section; keys the data does
      // not carry are skipped instead of rendering empty headings.
      const partial = await callTool(ctx, dir, 'construction_report_export', {
        result: { kind: 'document', data: { schema_version: 1, summary: 'Partial review.', sections: { issues: ['one issue'] } } },
      })
      expect(partial.isError).toBe(false)
      const partialValue = (partial as { value: { path: string; summary: string } }).value
      expect(partialValue.summary).toBe('safety report with sections summary, issues, unresolved')
      const partialText = await readFile(join(dir, '.dsh', 'construction', 'reports', partialValue.path.split(/[\\/]/).pop() ?? ''), 'utf8')
      expect(partialText).toContain('## Issues')
      expect(partialText).not.toContain('## Evidence')
      expect(partialText).not.toContain('## Controls')
      expect(partialText).toContain('## Unresolved items')
    } finally {
      await fiber.dispose()
    }
  })

  it('lists requested and data-carried non-permitted sections in the omitted notice', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-safety', { cwd: dir })
      const exported = await callTool(ctx, dir, 'construction_report_export', {
        result: {
          kind: 'document',
          data: {
            schema_version: 1,
            summary: 'Review summary.',
            sections: {
              issues: ['an issue'],
              nonconformities: ['a nonconformity carried in the data'],
            },
          },
        },
        sections: ['issues', 'totals'],
      })
      expect(exported.isError).toBe(false)
      const value = (exported as { value: { path: string; summary: string } }).value
      expect(value.summary).toBe('safety report with sections issues')
      const written = await readFile(join(dir, '.dsh', 'construction', 'reports', value.path.split(/[\\/]/).pop() ?? ''), 'utf8')
      expect(written).toContain('## Issues')
      expect(written).not.toContain('## Nonconformities')
      expect(written).toContain('Sections omitted because the active task is a safety task: totals, nonconformities')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects malformed document data with a model-facing shape error', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-safety', { cwd: dir })
      const cases: unknown[] = [
        null,
        'text',
        { schema_version: 2, summary: 'x', sections: {} },
        { schema_version: 1, summary: '  ', sections: {} },
        { schema_version: 1, summary: 'x' },
        { schema_version: 1, summary: 'x', sections: [] },
        { schema_version: 1, summary: 'x', sections: { issues: 'not-an-array' } },
        { schema_version: 1, summary: 'x', sections: { issues: [42] } },
      ]
      for (const data of cases) {
        const denied = await callTool(ctx, dir, 'construction_report_export', { result: { kind: 'document', data } })
        expect(denied.isError).toBe(true)
        expect(textOf(denied as never)).toContain('DocumentSummaryResult')
      }
      const notObject = await callTool(ctx, dir, 'construction_report_export', { result: { kind: 'document', data: null } })
      expect(textOf(notObject as never)).toContain('{ schema_version: 1, summary:')
    } finally {
      await fiber.dispose()
    }
  })

  it('denies a report export for a stale task id', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-quality', { cwd: dir })
      await ctx.skills.get('construction-quality', { cwd: dir })
      const denied = await callTool(ctx, dir, 'construction_report_export', {
        result: { kind: 'document', data: {} },
        task_id: 'task-1',
      })
      expect(denied.isError).toBe(true)
      expect(textOf(denied as never)).toContain('stale or unknown')
    } finally {
      await fiber.dispose()
    }
  })

  it('declares the permitted section map for all four task types', () => {
    expect(PERMITTED_SECTIONS.cost).toContain('totals')
    expect(PERMITTED_SECTIONS.schedule).toContain('critical_path')
    expect(PERMITTED_SECTIONS.safety).toContain('controls')
    expect(PERMITTED_SECTIONS.quality).toContain('nonconformities')
  })

  it('renders every section branch across task types and result kinds', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    const readReport = async (call: unknown): Promise<string> => {
      const value = (call as { value: { path: string } }).value
      return readFile(join(dir, '.dsh', 'construction', 'reports', value.path.split(/[\\/]/).pop() ?? ''), 'utf8')
    }
    try {
      // Cost task, default sections: every cost branch including a tender
      // difference table with matched, decomposed, and one-sided rows plus
      // unresolved items.
      await ctx.skills.get('construction-cost', { cwd: dir })
      const tender = calculateCost({
        variant: 'tender',
        currency: 'CNY',
        items: [
          {
            code: 'A1',
            unit: 'm3',
            quantity: '2',
            resources: [{ kind: 'labor', name: 'crew', consumption: '1', unit_price: '100' }],
            fees: [],
          },
          {
            code: 'D1',
            unit: 'm3',
            quantity: '4',
            resources: [{ kind: 'labor', name: 'crew', consumption: '1', unit_price: '100' }],
            fees: [],
          },
          {
            code: 'A2',
            unit: 't3',
            quantity: null,
            resources: [{ kind: 'labor', name: 'crew', consumption: '1', unit_price: '100' }],
            fees: [],
          },
          {
            code: 'A3',
            unit: 't',
            quantity: '3',
            resources: [{ kind: 'material', name: 'rebar', consumption: '1', unit_price: null }],
            fees: [],
          },
        ],
        baseline: [
          {
            code: 'A1',
            unit: 'm3',
            quantity: '2',
            resources: [{ kind: 'labor', name: 'crew', consumption: '1', unit_price: '100' }],
            fees: [],
          },
          {
            code: 'D1',
            unit: 'm3',
            quantity: '2',
            resources: [{ kind: 'labor', name: 'crew', consumption: '1', unit_price: '100' }],
            fees: [],
          },
        ],
      }, 2)
      const costReport = await callTool(ctx, dir, 'construction_report_export', { result: { kind: 'cost', data: tender } })
      const costText = await readReport(costReport)
      expect(costText).toContain('## Summary')
      expect(costText).toContain('tender cost result, 4 item(s), total 600.00 CNY')
      expect(costText).toContain('## Items')
      expect(costText).toContain('A2: unit rate 100.00, amount unresolved')
      expect(costText).toContain('A3: unit rate unresolved, amount unresolved')
      expect(costText).toContain('## Totals')
      expect(costText).toContain('## Differences')
      expect(costText).toContain('A1: matching (0.00)')
      expect(costText).toContain('D1: quantity_diff (200.00, quantity effect 200.00, price effect 0.00)')
      expect(costText).toContain('A2: only_in_compared')
      expect(costText).toContain('## Unresolved items')
      expect(costText).toContain('A2: quantity is blank')

      // Cost task, summary only: the cost section branches stay closed, and a
      // document-kind result skips the document branches too.
      const summaryOnly = await callTool(ctx, dir, 'construction_report_export', {
        result: { kind: 'document', data: { schema_version: 1, summary: 'Document review.', sections: {} } },
        sections: ['summary'],
      })
      const summaryText = await readReport(summaryOnly)
      expect(summaryText).toContain('## Summary')
      expect(summaryText).not.toContain('## Items')
      expect(summaryText).not.toContain('## Issues')
      expect(summaryText).not.toContain('## Document summary')

      // Cost task, differences and unresolved only: the item and total
      // branches stay closed.
      const differencesOnly = await callTool(ctx, dir, 'construction_report_export', {
        result: { kind: 'cost', data: tender },
        sections: ['differences', 'unresolved'],
      })
      const differencesText = await readReport(differencesOnly)
      expect(differencesText).not.toContain('## Items')
      expect(differencesText).not.toContain('## Totals')
      expect(differencesText).toContain('## Differences')
      expect(differencesText).toContain('## Unresolved items')

      // Schedule task: restricted sections close every schedule branch; a
      // no-critical-path result and empty holidays take the alternate lines.
      await ctx.skills.get('construction-schedule', { cwd: dir })
      const open = calculateSchedule({
        project_start: '2026-03-02',
        tasks: [
          { id: 'A', duration: 2 },
          { id: 'P', duration: 3 },
          { id: 'Q', duration: 1 },
        ],
        links: [{ from: 'A', to: 'P' }, { from: 'A', to: 'Q' }],
      })
      const scheduleReport = await callTool(ctx, dir, 'construction_report_export', { result: { kind: 'schedule', data: open } })
      const scheduleText = await readReport(scheduleReport)
      expect(scheduleText).toContain('## Tasks')
      expect(scheduleText).toContain('A: 2026-03-02 -> 2026-03-03, float 0, critical')
      expect(scheduleText).toContain('Q: 2026-03-04 -> 2026-03-04, float 2')
      expect(scheduleText).not.toContain('Q: 2026-03-04 -> 2026-03-04, float 2, critical')
      expect(scheduleText).toContain('holidays: none')
      expect(scheduleText).toContain('## Critical path')
      expect(scheduleText).toContain('A -> P')

      const restricted = await callTool(ctx, dir, 'construction_report_export', {
        result: { kind: 'schedule', data: open },
        sections: ['summary'],
      })
      const restrictedText = await readReport(restricted)
      expect(restrictedText).not.toContain('## Tasks')
      expect(restrictedText).not.toContain('## Calendar')
      expect(restrictedText).not.toContain('## Critical path')

      const incomplete = calculateSchedule({
        project_start: '2026-03-02',
        holidays: ['2026-03-03'],
        tasks: [{ id: 'A', duration: 2 }, { id: 'B', duration: 2 }],
      })
      const incompleteReport = await callTool(ctx, dir, 'construction_report_export', { result: { kind: 'schedule', data: incomplete } })
      const incompleteText = await readReport(incompleteReport)
      expect(incompleteText).toContain('holidays: 2026-03-03')
      expect(incompleteText).toContain('Not claimed: the logic is incomplete.')

      // Quality and safety tasks reach the document branches through their own
      // section names; a section carried by the data but not requested stays
      // unrendered.
      await ctx.skills.get('construction-quality', { cwd: dir })
      const qualityReport = await callTool(ctx, dir, 'construction_report_export', {
        result: {
          kind: 'document',
          data: {
            schema_version: 1,
            summary: 'Quality review.',
            sections: { checks: ['28-day strength conforms'], issues: ['a safety-section issue carried in the data'] },
          },
        },
        sections: ['checks'],
      })
      const qualityText = await readReport(qualityReport)
      expect(qualityText).toContain('## Checks')
      expect(qualityText).toContain('- 28-day strength conforms')
      expect(qualityText).not.toContain('## Issues')
      expect(qualityText).not.toContain('- a safety-section issue carried in the data')
      expect(qualityText).toContain('Sections omitted because the active task is a quality task: issues')

      await ctx.skills.get('construction-safety', { cwd: dir })
      const safetyReport = await callTool(ctx, dir, 'construction_report_export', {
        result: {
          kind: 'document',
          data: { schema_version: 1, summary: 'Safety review.', sections: { evidence: ['record paragraph 4'] } },
        },
        sections: ['evidence'],
      })
      const safetyText = await readReport(safetyReport)
      expect(safetyText).toContain('## Evidence')
      expect(safetyText).toContain('- record paragraph 4')
      expect(safetyText).not.toContain('Sections omitted')
    } finally {
      await fiber.dispose()
    }
  })
})
