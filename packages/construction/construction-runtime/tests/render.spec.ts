import { describe, expect, it } from 'vitest'
import { bootRuntime, seedWorkspace, workspace } from './helpers.ts'

/** Render one tool's output with a hand-built value, covering presentation branches. */
interface RenderableToolRegistry {
  tools: {
    get(name: string): { output: { render(args: unknown, value: unknown): { type: string; text?: string }[] } } | undefined
  }
}

function render(ctx: RenderableToolRegistry, name: string, value: unknown): string {
  const definition = ctx.tools.get(name)
  expect(definition, name).toBeDefined()
  if (definition === undefined) throw new Error(`tool ${name} is not registered`)
  const blocks = definition.output.render({}, value)
  return blocks.map(block => block.text ?? '').join('\n')
}

describe('tool result rendering', () => {
  it('renders document results across all states', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      const base = { schema_version: 1, parser_version: 'p', source_refs: [], errors: [] as string[] }
      expect(render(ctx, 'construction_files_read', {
        ...base,
        status: 'unsupported',
        file: { path: 'legacy.doc', name: 'legacy.doc', size_bytes: null, format: 'doc', sha256: null },
        coverage: null,
        content: null,
        errors: ['legacy'],
      })).toContain('legacy.doc')
      expect(render(ctx, 'construction_files_read', {
        ...base,
        status: 'failed',
        file: { path: 'x.pdf', name: 'x.pdf', size_bytes: null, format: 'pdf', sha256: null },
        coverage: { state: 'failed', requested: 'read', actual: 'none', warnings: [] },
        content: null,
        errors: ['boom'],
      })).toContain('unknown bytes')
      expect(render(ctx, 'construction_files_search', {
        ...base,
        status: 'ok',
        file: { path: 'x.pdf', name: 'x.pdf', size_bytes: 12, format: 'pdf', sha256: 'h' },
        coverage: { state: 'complete', requested: 'search', actual: 'all pages', warnings: ['w1'] },
        content: { matches: [], match_count: 0 },
      })).toContain('matches: 0')
      expect(render(ctx, 'construction_files_read', {
        ...base,
        status: 'ok',
        file: { path: 'x.docx', name: 'x.docx', size_bytes: 5, format: 'docx', sha256: 'h' },
        coverage: { state: 'complete', requested: 'read', actual: 'full document', warnings: [] },
        content: { blocks: [] },
      })).toContain('source_refs: 0')
    } finally {
      await fiber.dispose()
    }
  })

  it('renders split results across supported and unsupported states', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      expect(render(ctx, 'construction_pdf_split', {
        schema_version: 1,
        parser_version: 'p',
        status: 'unsupported',
      })).toContain('PDF splitting unsupported')
      expect(render(ctx, 'construction_pdf_split', {
        schema_version: 1,
        parser_version: 'p',
        status: 'unsupported',
        reason: 'structured decomposition is not available in this release',
      })).toContain('structured decomposition')
      expect(render(ctx, 'construction_pdf_split', {
        schema_version: 1,
        parser_version: 'p',
        status: 'ok',
        job_id: 'j',
        output_dir: 'd',
        index_file: 'd/index.json',
        source: { file: 'src.pdf', sha256: 'h', page_count: 2 },
        split_by: 'per_page',
        outputs: [{ file: 'a.pdf', pages: [1], page_count: 1 }],
        coverage: { state: 'complete', requested: 'per_page', actual: '1 output file(s), 1 page(s) copied', warnings: ['w'] },
      })).toContain('split src.pdf (per_page) into 1 file(s)')
      // Sparse ok values take every fallback in the renderer.
      expect(render(ctx, 'construction_pdf_split', {
        schema_version: 1,
        parser_version: 'p',
        status: 'ok',
      })).toContain('split  (undefined) into 0 file(s)')
    } finally {
      await fiber.dispose()
    }
  })

  it('renders cost results with and without optional fields', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      const item = {
        code: 'A1',
        fees: [] as unknown[],
        resources: [] as unknown[],
        trace: [] as string[],
      }
      expect(render(ctx, 'construction_cost_calculate', {
        schema_version: 1,
        calculator_version: 'v',
        variant: 'unit_rate',
        currency: 'CNY',
        precision: 2,
        items: [item],
        totals: { resources: '1.00', fees: '0.00', amount: '1.00' },
        unresolved: ['u1'],
      })).toContain('(CNY)')
      expect(render(ctx, 'construction_cost_calculate', {
        schema_version: 1,
        calculator_version: 'v',
        variant: 'tender',
        precision: 2,
        items: [{ ...item, description: 'd', unit: 'm3', quantity: '2', resource_cost: '5.00', unit_rate: '5.00', amount: '10.00' }],
        totals: { resources: '5.00', fees: '0.00', amount: '10.00' },
        differences: [],
        unresolved: [],
      })).toContain('item A1: resource_cost 5.00')
      expect(render(ctx, 'construction_cost_compare', {
        schema_version: 1,
        precision: 2,
        differences: [
          { code: 'A1', status: 'matching', difference: '0.00' },
          { code: 'B1', status: 'only_in_compared' },
        ],
        total_difference: '0.00',
        requires_confirmation: ['B1: only_in_compared'],
      })).toContain('confirm: B1: only_in_compared')
      expect(render(ctx, 'construction_cost_export', {
        schema_version: 1,
        path: 'out.md',
        summary: 's',
        unresolved: [],
      })).toContain('out.md')
    } finally {
      await fiber.dispose()
    }
  })

  it('renders schedule results with and without a critical path', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      const task = {
        id: 'A',
        name: 'a',
        duration: 1,
        start: '2026-03-02',
        finish: '2026-03-02',
        total_float: 0,
        is_critical: true,
        is_milestone: false,
        locked: false,
      }
      expect(render(ctx, 'construction_schedule_calculate', {
        schema_version: 1,
        calculator_version: 'construction-schedule/1.0.0',
        scenario_id: 's1',
        calendar: { weekly_rest_days: [6, 0], holidays: [] },
        tasks: [task, { ...task, id: 'M', is_milestone: true, locked: true }],
        links: [],
        critical_path: ['A'],
        assumptions: ['a1'],
        unresolved: ['u1'],
        warnings: [],
      })).toContain('critical path: A')
      expect(render(ctx, 'construction_schedule_calculate', {
        schema_version: 1,
        calculator_version: 'construction-schedule/1.0.0',
        scenario_id: 's2',
        calendar: { weekly_rest_days: [6, 0], holidays: [] },
        tasks: [],
        links: [],
        critical_path: null,
        assumptions: [],
        unresolved: [],
        warnings: [],
      })).toContain('not claimed')
      expect(render(ctx, 'construction_schedule_present', {
        schema_version: 1,
        result_id: 'r'.repeat(64),
        scenario_id: 's1',
        calculator_version: 'construction-schedule/1.0.0',
        task_count: 1,
        date_range: { start: '2026-03-02', finish: '2026-03-02' },
        gantt: { kind: 'schedule-result', result_id: 'r'.repeat(64) },
      })).toContain('presented schedule scenario s1')
    } finally {
      await fiber.dispose()
    }
  })
})
