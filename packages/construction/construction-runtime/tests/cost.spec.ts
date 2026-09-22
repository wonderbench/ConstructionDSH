import { readFile } from 'node:fs/promises'
import { symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { bootRuntime, callTool, seedWorkspace, workspace } from './helpers.ts'
import { buildDifferences, calculateCost } from '../src/cost.ts'
import type { CostDifference, CostInput, CostItemInput, CostItemResult, CostResult } from '../src/types.ts'

const UNIT_RATE_INPUT: CostInput = {
  variant: 'unit_rate',
  currency: 'CNY',
  items: [
    {
      code: '0101',
      description: 'manual excavation, class III soil',
      unit: 'm3',
      quantity: '1200',
      resources: [
        { kind: 'labor', name: 'excavation crew', consumption: '0.5', unit_price: '180' },
        { kind: 'material', name: 'disposal bags', consumption: '2', unit_price: '1.5' },
        { kind: 'equipment', name: 'small compactor', consumption: '0.1', unit_price: '320' },
      ],
      fees: [{ name: 'overhead', base: 'resources', rate: '0.1' }],
    },
  ],
}

/** One concrete item at a quantity and unit price, for difference fixtures. */
function makeConcrete(quantity: string, price: string, code: string): CostItemInput {
  return {
    code,
    unit: 'm3',
    quantity,
    resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: price }],
    fees: [],
  }
}

function textOf(result: { content: readonly { type: string; text?: string }[] }): string {
  return result.content.map(block => (block.type === 'text' ? block.text ?? '' : '')).join('\n')
}

/**
 * Parse the canonical frozen result out of a calculate tool's rendered text,
 * the way a model reading only the render output would.
 */
function frozenJsonOf(text: string): unknown {
  const marker = text.indexOf('Frozen result JSON — ')
  if (marker === -1) throw new Error('frozen JSON label missing from render')
  return JSON.parse(text.slice(text.indexOf('\n', marker) + 1))
}

describe('cost engine', () => {
  it('reproduces the fixed unit-rate example at declared precision', () => {
    const result = calculateCost(UNIT_RATE_INPUT, 2)
    const item = result.items[0]
    expect(item?.resource_cost).toBe('125.00')
    expect(item?.fees[0]?.amount).toBe('12.50')
    expect(item?.unit_rate).toBe('137.50')
    expect(item?.amount).toBe('165000.00')
    expect(result.totals).toEqual({ resources: '125.00', fees: '12.50', amount: '165000.00' })
    expect(item?.trace.join('\n')).toContain('labor[excavation crew]=0.5×180.00=90.00')
    expect(result.unresolved).toEqual([])
  })

  it('rounds half up at the declared precision', () => {
    const result = calculateCost({
      variant: 'unit_rate',
      items: [
        {
          code: 'R1',
          unit: 'm2',
          quantity: '0.5',
          resources: [{ kind: 'material', name: 'tile', consumption: '1', unit_price: '0.25' }],
          fees: [],
        },
      ],
    }, 2)
    expect(result.items[0]?.amount).toBe('0.13')
  })

  it('honors a configurable precision', () => {
    const result = calculateCost({
      variant: 'unit_rate',
      items: [
        {
          code: 'P1',
          unit: 'm',
          quantity: '3',
          resources: [{ kind: 'material', name: 'pipe', consumption: '1', unit_price: '1.005' }],
          fees: [],
        },
      ],
    }, 3)
    expect(result.items[0]?.unit_rate).toBe('1.005')
    expect(result.items[0]?.amount).toBe('3.015')
  })

  it('treats blanks as unresolved, never zero', () => {
    const result = calculateCost({
      variant: 'unit_rate',
      items: [
        {
          code: '0203',
          unit: 't',
          quantity: '40',
          resources: [{ kind: 'material', name: 'rebar', consumption: '1.05', unit_price: null }],
          fees: [],
        },
        {
          code: '0204',
          unit: 't',
          quantity: null,
          resources: [{ kind: 'material', name: 'wire', consumption: '1', unit_price: '10' }],
          fees: [],
        },
      ],
    }, 2)
    expect(result.items[0]?.amount).toBeUndefined()
    expect(result.items[1]?.amount).toBeUndefined()
    expect(result.totals.amount).toBe('0.00')
    expect(result.unresolved.some(note => note.includes('0203') && note.includes('blank'))).toBe(true)
    expect(result.unresolved.some(note => note.includes('0204') && note.includes('quantity is blank'))).toBe(true)
  })

  it('flags duplicate codes instead of silently double-counting', () => {
    const item = UNIT_RATE_INPUT.items[0]
    if (item === undefined) throw new Error('unit-rate fixture has no item')
    const result = calculateCost({ variant: 'unit_rate', items: [item, { ...item }] }, 2)
    expect(result.unresolved.some(note => note.includes('0101') && note.includes('2 times'))).toBe(true)
  })

  it('keeps invalid numbers as unresolved instead of crashing', () => {
    const result = calculateCost({
      variant: 'unit_rate',
      items: [
        {
          code: 'BAD',
          unit: 'm3',
          quantity: '12x',
          resources: [{ kind: 'labor', name: 'crew', consumption: '1', unit_price: '100' }],
          fees: [],
        },
      ],
    }, 2)
    expect(result.items[0]?.amount).toBeUndefined()
    expect(result.unresolved.length).toBeGreaterThan(0)
  })

  it('keeps BOQ codes as text', () => {
    const result = calculateCost({
      variant: 'unit_rate',
      items: [
        {
          code: '0010',
          unit: 'm',
          quantity: '2',
          resources: [{ kind: 'material', name: 'cable', consumption: '1', unit_price: '5' }],
          fees: [],
        },
      ],
    }, 2)
    expect(result.items[0]?.code).toBe('0010')
  })

  it('covers blank strings, missing fields, and unresolved fee bases', () => {
    const result = calculateCost({
      variant: 'unit_rate',
      items: [
        {
          code: 'N1',
          description: 'partial data',
          quantity: 3,
          resources: [
            { kind: 'material', name: 'blank price', consumption: '1', unit_price: '' },
            { kind: 'labor', name: 'crew', consumption: 2, unit_price: 50 },
          ],
          fees: [
            { name: 'overhead', base: 'resources', rate: null },
          ],
        },
        {
          code: 'N2',
          quantity: '1',
          resources: [
            { kind: 'material', name: 'blank consumption', consumption: null, unit_price: '10' },
          ],
          fees: [
            { name: 'orphan fee', base: 'resources', rate: '0.1' },
          ],
        },
        {
          code: 'N3',
          quantity: '1',
        },
        {
          code: 'N4',
          quantity: '1',
          resources: [
            { kind: 'labor', name: 'crew', consumption: '1', unit_price: '10' },
          ],
          fees: [
            { name: 'blank rate fee', base: 'resources', rate: null },
          ],
        },
      ],
    }, 2)
    const byCode = new Map(result.items.map(item => [item.code, item]))
    // N1: a blank resource line nullifies the item base; the fee has no computable base.
    expect(byCode.get('N1')?.resource_cost).toBeUndefined()
    expect(byCode.get('N1')?.amount).toBeUndefined()
    expect(result.unresolved.some(note => note.includes('N1') && note.includes('blank price'))).toBe(true)
    expect(result.unresolved.some(note => note.includes('N1') && note.includes('no computable base'))).toBe(true)
    // N2: blank consumption nullifies the base; the fee has no computable base.
    expect(byCode.get('N2')?.resource_cost).toBeUndefined()
    expect(result.unresolved.some(note => note.includes('N2') && note.includes('blank consumption'))).toBe(true)
    expect(result.unresolved.some(note => note.includes('N2') && note.includes('no computable base'))).toBe(true)
    // N3: no resources at all.
    expect(result.unresolved.some(note => note.includes('N3') && note.includes('no resources supplied'))).toBe(true)
    // N4: valid base, blank fee rate.
    expect(byCode.get('N4')?.resource_cost).toBe('10.00')
    expect(result.unresolved.some(note => note.includes('N4') && note.includes('blank rate fee') && note.includes('rate is blank'))).toBe(true)
  })

  it('reports tender runs without a baseline and unresolved baseline items', () => {
    const noBaseline = calculateCost({
      variant: 'tender',
      items: [
        {
          code: 'T1',
          unit: 'm3',
          quantity: '1',
          resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '400' }],
          fees: [],
        },
      ],
    }, 2)
    expect(noBaseline.differences).toEqual([{ code: 'T1', compared_amount: '400.00', status: 'only_in_compared' }])
    expect(noBaseline.unresolved.some(note => note.includes('no baseline items supplied'))).toBe(true)

    const blankBaseline = calculateCost({
      variant: 'settlement',
      items: [
        {
          code: 'T1',
          unit: 'm3',
          quantity: '1',
          resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '400' }],
          fees: [],
        },
        {
          code: 'T2',
          unit: 'm3',
          quantity: null,
          resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '400' }],
          fees: [],
        },
      ],
      baseline: [
        {
          code: 'T2',
          unit: 'm3',
          quantity: null,
          resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '400' }],
          fees: [],
        },
        {
          code: 'T3',
          unit: 'm3',
          quantity: null,
          resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: null }],
          fees: [],
        },
      ],
    }, 2)
    expect(blankBaseline.unresolved.some(note => note.startsWith('baseline T2') && note.includes('quantity is blank'))).toBe(true)
    expect(blankBaseline.differences?.some(row => row.code === 'T2' && row.status === 'unresolved')).toBe(true)
    expect(blankBaseline.differences?.some(row => row.code === 'T1' && row.status === 'only_in_compared')).toBe(true)
    expect(blankBaseline.differences).toContainEqual({ code: 'T3', status: 'only_in_baseline' })
  })

  it('builds tender difference tables against the baseline', () => {
    const result = calculateCost({
      variant: 'tender',
      items: [
        {
          code: 'A1',
          unit: 'm3',
          quantity: '10',
          resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '400' }],
          fees: [],
        },
        {
          code: 'B1',
          unit: 'm3',
          quantity: '5',
          resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '410' }],
          fees: [],
        },
      ],
      baseline: [
        {
          code: 'A1',
          unit: 'm3',
          quantity: '10',
          resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '400' }],
          fees: [],
        },
        {
          code: 'C1',
          unit: 'm3',
          quantity: '2',
          resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '300' }],
          fees: [],
        },
      ],
    }, 2)
    const byCode = new Map(result.differences?.map(row => [row.code, row]))
    expect(byCode.get('A1')).toMatchObject({ status: 'matching', baseline_amount: '4000.00', compared_amount: '4000.00', difference: '0.00' })
    expect(byCode.get('B1')).toMatchObject({ status: 'only_in_compared', compared_amount: '2050.00' })
    expect(byCode.get('C1')).toMatchObject({ status: 'only_in_baseline', baseline_amount: '600.00' })
  })

  it('reports quantity-driven and price-driven differences separately', () => {
    const rows = buildDifferences(
      calculateCost({ variant: 'settlement', items: [makeConcrete('12', '400', 'Q'), makeConcrete('10', '410', 'P')] }, 2).items,
      calculateCost({ variant: 'settlement', items: [makeConcrete('10', '400', 'Q'), makeConcrete('10', '400', 'P')] }, 2).items,
      2,
    )
    const byCode = new Map(rows.map(row => [row.code, row]))
    expect(byCode.get('Q')?.status).toBe('quantity_diff')
    expect(byCode.get('P')?.status).toBe('price_diff')
    expect(byCode.get('Q')?.difference).toBe('800.00')
  })

  it('decomposes difference rows into quantity and price effects that reconcile exactly', () => {
    const rows = buildDifferences(
      calculateCost({ variant: 'settlement', items: [makeConcrete('12', '410', 'Q'), makeConcrete('10', '410', 'P'), makeConcrete('4', '400', 'M')] }, 2).items,
      calculateCost({ variant: 'settlement', items: [makeConcrete('10', '400', 'Q'), makeConcrete('10', '400', 'P'), makeConcrete('4', '400', 'M')] }, 2).items,
      2,
    )
    const byCode = new Map(rows.map(row => [row.code, row]))

    // Quantity-driven row: (12 − 10) × 400.00 baseline rate = 800.00, leaving
    // 120.00 of price movement from the 410.00 versus 400.00 rate change.
    const quantityRow = byCode.get('Q')
    expect(quantityRow).toMatchObject({
      status: 'quantity_diff',
      difference: '920.00',
      quantity_effect: '800.00',
      price_effect: '120.00',
    })
    // Price-driven row: equal quantities put the whole difference on price.
    const priceRow = byCode.get('P')
    expect(priceRow).toMatchObject({ status: 'price_diff', difference: '100.00', quantity_effect: '0.00', price_effect: '100.00' })
    // Matching rows carry no effects.
    expect(byCode.get('M')).toMatchObject({ status: 'matching', difference: '0.00' })
    expect(byCode.get('M')).not.toHaveProperty('quantity_effect')
    expect(byCode.get('M')).not.toHaveProperty('price_effect')

    for (const row of [quantityRow, priceRow]) {
      if (row?.quantity_effect === undefined || row.price_effect === undefined || row.difference === undefined) throw new Error('effects missing')
      // quantity_effect + price_effect reconciles exactly with the rounded difference.
      expect(new Decimal(row.quantity_effect).plus(row.price_effect).toFixed(2)).toBe(row.difference)
    }

    // One-sided and unresolved rows never carry effects.
    const oneSided = buildDifferences(
      calculateCost({ variant: 'tender', items: [makeConcrete('2', '400', 'S')] }, 2).items,
      calculateCost({ variant: 'tender', items: [makeConcrete('2', '400', 'S'), makeConcrete('1', '300', 'T')] }, 2).items,
      2,
    )
    const unresolved = buildDifferences(
      calculateCost({ variant: 'tender', items: [makeConcrete('2', '400', 'S')] }, 2).items,
      calculateCost({ variant: 'tender', items: [makeConcrete('2', '400', 'S'), { ...makeConcrete('1', '300', 'T'), quantity: null }] }, 2).items,
      2,
    )
    for (const row of [...oneSided, ...unresolved]) {
      expect(row).not.toHaveProperty('quantity_effect')
      expect(row).not.toHaveProperty('price_effect')
    }

    // Effects are omitted when a quantity or a unit rate is missing on either
    // side, even though the row still classifies as a price difference.
    const syntheticCompared: CostItemResult[] = [
      { code: 'NQ', quantity: '2', unit_rate: '100.00', amount: '200.00', fees: [], resources: [], trace: [] },
      { code: 'NR', quantity: '1', amount: '100.00', fees: [], resources: [], trace: [] },
    ]
    const syntheticBaseline: CostItemResult[] = [
      { code: 'NQ', unit_rate: '100.00', amount: '150.00', fees: [], resources: [], trace: [] },
      { code: 'NR', quantity: '1', unit_rate: '100.00', amount: '90.00', fees: [], resources: [], trace: [] },
    ]
    const synthetic = new Map(buildDifferences(syntheticCompared, syntheticBaseline, 2).map(row => [row.code, row]))
    expect(synthetic.get('NQ')).toMatchObject({ status: 'price_diff', difference: '50.00' })
    expect(synthetic.get('NQ')).not.toHaveProperty('quantity_effect')
    expect(synthetic.get('NR')).toMatchObject({ status: 'price_diff', difference: '10.00' })
    expect(synthetic.get('NR')).not.toHaveProperty('quantity_effect')
  })

  it('values a variation from supplied build-up only', () => {
    const result = calculateCost({
      variant: 'variation',
      items: [
        {
          code: 'V1',
          unit: 'm3',
          quantity: '-25',
          resources: [{ kind: 'material', name: 'ready-mix', consumption: '1.02', unit_price: '415' }],
          fees: [{ name: 'overhead', base: 'resources', rate: '0.1' }],
        },
      ],
    }, 2)
    expect(result.items[0]?.unit_rate).toBe('465.63')
    expect(result.items[0]?.amount).toBe('-11640.75')
  })
})

describe('cost tools through the executor', () => {
  it('requires an active cost task (B04 denial)', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      const denied = await callTool(ctx, dir, 'construction_cost_calculate', { input: UNIT_RATE_INPUT })
      expect(denied.isError).toBe(true)
      expect(denied.content[0]?.type === 'text' ? denied.content[0].text : '').toContain('no active construction task')
    } finally {
      await fiber.dispose()
    }
  })

  it('denies stale task ids through the executor (B04)', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-cost', { cwd: dir })
      const first = await callTool(ctx, dir, 'construction_cost_calculate', { input: UNIT_RATE_INPUT })
      expect(first.isError).toBe(false)
      await ctx.skills.get('construction-cost', { cwd: dir })
      const stale = await callTool(ctx, dir, 'construction_cost_calculate', { input: UNIT_RATE_INPUT, task_id: 'task-1' })
      expect(stale.isError).toBe(true)
      const text = stale.content[0]?.type === 'text' ? stale.content[0].text : ''
      expect(text).toContain('stale or unknown')
    } finally {
      await fiber.dispose()
    }
  })

  it('calculates, compares, and exports with an active cost task (B06)', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-cost', { cwd: dir })
      const calculated = await callTool(ctx, dir, 'construction_cost_calculate', { input: UNIT_RATE_INPUT })
      expect(calculated.isError).toBe(false)
      const result = (calculated as { value: CostResult }).value
      expect(result.totals.amount).toBe('165000.00')

      const compared = await callTool(ctx, dir, 'construction_cost_compare', { result, baseline: result })
      expect(compared.isError).toBe(false)
      expect((compared as { value: { total_difference: string } }).value.total_difference).toBe('0.00')

      // A comparison with one-sided and priced rows sums only matched rows and
      // lists the one-sided codes for confirmation.
      const priced = calculateCost({
        variant: 'tender',
        items: [
          {
            code: 'A1',
            unit: 'm3',
            quantity: '1',
            resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '400' }],
            fees: [],
          },
          {
            code: 'B1',
            unit: 'm3',
            quantity: '1',
            resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '500' }],
            fees: [],
          },
        ],
      }, 2)
      const baseline = calculateCost({
        variant: 'tender',
        items: [
          {
            code: 'A1',
            unit: 'm3',
            quantity: '1',
            resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '300' }],
            fees: [],
          },
          {
            code: 'C1',
            unit: 'm3',
            quantity: '1',
            resources: [{ kind: 'material', name: 'concrete', consumption: '1', unit_price: '100' }],
            fees: [],
          },
        ],
      }, 2)
      const differing = await callTool(ctx, dir, 'construction_cost_compare', { result: priced, baseline })
      expect(differing.isError).toBe(false)
      interface ComparisonValue {
        total_difference: string
        requires_confirmation: string[]
        differences: CostDifference[]
      }
      const comparison = (differing as { value: ComparisonValue }).value
      expect(comparison.total_difference).toBe('100.00')
      expect(comparison.requires_confirmation).toContain('B1: only_in_compared')
      expect(comparison.requires_confirmation).toContain('C1: only_in_baseline')
      expect(comparison.requires_confirmation).toContain('A1: price_diff')
      // Difference rows carry the quantity/price decomposition through the tool.
      const a1 = comparison.differences.find(row => row.code === 'A1')
      expect(a1).toMatchObject({
        status: 'price_diff',
        difference: '100.00',
        quantity_effect: '0.00',
        price_effect: '100.00',
      })

      const exported = await callTool(ctx, dir, 'construction_cost_export', { result })
      expect(exported.isError).toBe(false)
      const exportValue = (exported as { value: { path: string; summary: string } }).value
      expect(exportValue.path).toContain('cost')
      expect(exportValue.summary).toContain('unit_rate')
      const written = await readFile(join(dir, '.dsh', 'construction', 'cost', exportValue.path.split(/[\\/]/).pop() ?? ''), 'utf8')
      expect(written).toContain('165000.00')
      expect(written).toContain('labor[excavation crew]=0.5×180.00=90.00')
    } finally {
      await fiber.dispose()
    }
  })

  it('chains calculate to export, compare, and report through the rendered frozen JSON', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-cost', { cwd: dir })
      const calculated = await callTool(ctx, dir, 'construction_cost_calculate', { input: UNIT_RATE_INPUT })
      expect(calculated.isError).toBe(false)
      // The model sees only the rendered text: recover the frozen result from
      // that text, never from an in-test object.
      const frozen = frozenJsonOf(textOf(calculated as never))

      const exported = await callTool(ctx, dir, 'construction_cost_export', { result: frozen })
      expect(exported.isError).toBe(false)
      const exportValue = (exported as { value: { path: string } }).value
      const written = await readFile(join(dir, '.dsh', 'construction', 'cost', exportValue.path.split(/[\\/]/).pop() ?? ''), 'utf8')
      expect(written).toContain('labor[excavation crew]=0.5×180.00=90.00')

      const compared = await callTool(ctx, dir, 'construction_cost_compare', { result: frozen, baseline: frozen })
      expect(compared.isError).toBe(false)
      expect((compared as { value: { total_difference: string } }).value.total_difference).toBe('0.00')

      const reported = await callTool(ctx, dir, 'construction_report_export', { result: { kind: 'cost', data: frozen } })
      expect(reported.isError).toBe(false)
    } finally {
      await fiber.dispose()
    }
  })

  it('denies fabricated cost results with a model-facing error instead of crashing', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-cost', { cwd: dir })
      // Passes the parameter schema (every present field has the right type)
      // but items lack the trace arrays only a real calculator freeze carries.
      const fabricated = {
        schema_version: 1,
        calculator_version: 'construction-cost/1.0.0',
        variant: 'unit_rate',
        precision: 2,
        items: [{ code: 'A1' }],
        totals: { resources: '1.00', fees: '0.00', amount: '1.00' },
        unresolved: [],
      }
      const denial = 'is not a frozen cost result from construction_cost_calculate'

      const exported = await callTool(ctx, dir, 'construction_cost_export', { result: fabricated })
      expect(exported.isError).toBe(true)
      expect(textOf(exported as never)).toContain(`result ${denial}`)

      const badResult = await callTool(ctx, dir, 'construction_cost_compare', { result: fabricated, baseline: fabricated })
      expect(badResult.isError).toBe(true)
      expect(textOf(badResult as never)).toContain(`result ${denial}`)

      const badBaseline = await callTool(ctx, dir, 'construction_cost_compare', { result: calculateCost(UNIT_RATE_INPUT, 2), baseline: fabricated })
      expect(badBaseline.isError).toBe(true)
      expect(textOf(badBaseline as never)).toContain(`baseline ${denial}`)

      // Traces without the calculator version, and null items, are denied too.
      const traced = { ...fabricated, items: [{ code: 'A1', trace: [] }] }
      const foreign = await callTool(ctx, dir, 'construction_cost_export', { result: { ...traced, calculator_version: 'foreign/1.0.0' } })
      expect(textOf(foreign as never)).toContain(`result ${denial}`)
      const nullItem = await callTool(ctx, dir, 'construction_cost_export', { result: { ...fabricated, items: [null] } })
      expect(textOf(nullItem as never)).toContain(`result ${denial}`)
    } finally {
      await fiber.dispose()
    }
  })

  it('exports partially priced results with unresolved rows and fee lines', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-cost', { cwd: dir })
      const partial = calculateCost({
        variant: 'unit_rate',
        items: [
          {
            code: 'F1',
            unit: 'm3',
            quantity: '2',
            resources: [{ kind: 'labor', name: 'crew', consumption: '1', unit_price: '100' }],
            fees: [{ name: 'overhead', base: 'resources', rate: '0.1' }],
          },
          {
            code: 'F2',
            unit: 't',
            quantity: '5',
            resources: [{ kind: 'material', name: 'rebar', consumption: '1', unit_price: null }],
            fees: [],
          },
        ],
      }, 2)
      const exported = await callTool(ctx, dir, 'construction_cost_export', { result: partial })
      expect(exported.isError).toBe(false)
      const value = (exported as { value: { path: string } }).value
      const written = await readFile(join(dir, '.dsh', 'construction', 'cost', value.path.split(/[\\/]/).pop() ?? ''), 'utf8')
      expect(written).toContain('| F1 | 100.00 | overhead 10.00 | 110.00 | 220.00 |')
      expect(written).toContain('| F2 | unresolved |  | unresolved | unresolved |')
      expect(written).toContain('- F2: resource "rebar" has a blank consumption or unit price')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects exports without a session workspace', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-cost', { cwd: dir })
      const exported = await callTool(ctx, undefined, 'construction_cost_export', { result: calculateCost(UNIT_RATE_INPUT, 2) })
      expect(exported.isError).toBe(true)
      expect((exported.content[0] as { text?: string }).text).toContain('session workspace is required')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects exports when the artifacts directory escapes the workspace (B11)', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      await ctx.skills.get('construction-cost', { cwd: dir })
      const outside = workspace()
      symlinkSync(outside, join(dir, '.dsh'), process.platform === 'win32' ? 'junction' : 'dir')
      const exported = await callTool(ctx, dir, 'construction_cost_export', { result: calculateCost(UNIT_RATE_INPUT, 2) })
      expect(exported.isError).toBe(true)
      expect((exported.content[0] as { text?: string }).text).toContain('resolves outside the session workspace')
    } finally {
      await fiber.dispose()
    }
  })
})
