/**
 * Deterministic cost engine and the three costing tools.
 *
 * One shared item evaluation backs the four workflow variants
 * (`unit_rate`, `tender`, `variation`, `settlement`). All arithmetic runs on
 * decimal.js at the configured precision with ROUND_HALF_UP; consumption,
 * prices, quantities, and fee rates come only from the caller; a blank input
 * is an unresolved item, never a zero; BOQ codes stay text. Every amount is
 * traceable through per-line expressions, and exported reports carry the
 * frozen result values.
 *
 * @module @deepseek-ai/dsh-construction-runtime/src/cost
 */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import Decimal from 'decimal.js'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import { resolveArtifactTarget, exportResultSchema } from './artifacts.ts'
import type {
  CostCompareResult,
  CostDifference,
  CostFeeLine,
  CostInput,
  CostItemInput,
  CostItemResult,
  CostResourceLine,
  CostResult,
} from './types.ts'
import type { TaskBindings } from './tasks.ts'

/** Calculator version recorded in every CostResult. */
export const CALCULATOR_VERSION = 'construction-cost/1.0.0'

/** Resolved cost engine settings. */
export interface CostToolSettings {
  /** Artifacts directory, relative to the session workspace. */
  readonly artifactsDir: string
  /** Declared output precision (decimal places). */
  readonly precision: number
}

/** A decimal string or null when the input was blank or unusable. */
function toDecimal(value: string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  try {
    return new Decimal(value)
  } catch {
    return null
  }
}

/** Format one decimal at the declared precision with ROUND_HALF_UP. */
function money(value: Decimal, precision: number): string {
  return value.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP).toFixed(precision)
}

/** Input item schema fragments shared by calculate and the result shapes. */
const decimalInput = {
  oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
} as const

/**
 * Evaluate one BOQ item: resource lines, explicit fees, unit rate, and
 * amount, each with trace expressions. Blank inputs produce unresolved
 * entries and the affected amounts stay absent.
 * @param item - the raw input item.
 * @param precision - declared output precision.
 * @param unresolved - shared unresolved list; this appends reasons.
 * @returns the evaluated item.
 */
export function evaluateItem(item: CostItemInput, precision: number, unresolved: string[]): CostItemResult {
  const result: {
    code: string
    description?: string
    unit?: string
    quantity?: string
    resource_cost?: string
    unit_rate?: string
    amount?: string
    fees: CostFeeLine[]
    resources: CostResourceLine[]
    trace: string[]
  } = { code: item.code, fees: [], resources: [], trace: [] }
  if (item.description !== undefined) result.description = item.description
  if (item.unit !== undefined) result.unit = item.unit

  const quantity = toDecimal(item.quantity)
  if (quantity === null) {
    unresolved.push(`${item.code}: quantity is blank; the item is excluded from totals until a quantity is supplied`)
  } else {
    result.quantity = quantity.toString()
  }

  let resourceCost: Decimal | null = new Decimal(0)
  for (const resource of item.resources ?? []) {
    const consumption = toDecimal(resource.consumption)
    const unitPrice = toDecimal(resource.unit_price)
    if (consumption === null || unitPrice === null) {
      unresolved.push(`${item.code}: resource "${resource.name}" has a blank consumption or unit price; a blank is not zero, so the line is excluded`)
      result.trace.push(`${resource.kind}[${resource.name}]=blank (excluded, not zero)`)
      resourceCost = null
      continue
    }
    const amount = consumption.times(unitPrice)
    const expression = `${resource.kind}[${resource.name}]=${consumption.toString()}×${money(unitPrice, precision)}=${money(amount, precision)}`
    result.resources.push({
      kind: resource.kind,
      name: resource.name,
      consumption: consumption.toString(),
      unit_price: money(unitPrice, precision),
      amount: money(amount, precision),
      expression,
    })
    result.trace.push(expression)
    if (resourceCost !== null) resourceCost = resourceCost.plus(amount)
  }
  if (item.resources === undefined || item.resources.length === 0) {
    unresolved.push(`${item.code}: no resources supplied; the rate cannot be built up from nothing`)
    resourceCost = null
  }

  let feesTotal = new Decimal(0)
  for (const fee of item.fees ?? []) {
    const rate = toDecimal(fee.rate)
    if (resourceCost === null) {
      unresolved.push(`${item.code}: fee "${fee.name}" has no computable base because the resource cost is unresolved`)
      continue
    }
    if (rate === null) {
      unresolved.push(`${item.code}: fee "${fee.name}" rate is blank; the fee is excluded until a rate is supplied`)
      continue
    }
    const amount = resourceCost.times(rate)
    feesTotal = feesTotal.plus(amount)
    const expression = `fee[${fee.name}]=${money(resourceCost, precision)}×${rate.toString()}=${money(amount, precision)}`
    result.fees.push({
      name: fee.name,
      base: 'resources',
      rate: rate.toString(),
      base_amount: money(resourceCost, precision),
      amount: money(amount, precision),
      expression,
    })
    result.trace.push(expression)
  }

  if (resourceCost !== null) {
    result.resource_cost = money(resourceCost, precision)
    const unitRate = resourceCost.plus(feesTotal)
    result.unit_rate = money(unitRate, precision)
    result.trace.push(`unit_rate[${item.code}]=${result.resource_cost}+${money(feesTotal, precision)}=${result.unit_rate}`)
    if (quantity !== null) {
      const amount = unitRate.times(quantity)
      const amountText = money(amount, precision)
      result.amount = amountText
      result.trace.push(`amount[${item.code}]=${money(unitRate, precision)}×${quantity.toString()}=${amountText}`)
    }
  }
  return result
}

/**
 * Detect duplicate item codes, which double-count in difference tables and
 * settlement roll-ups.
 * @param items - the input items.
 * @returns one unresolved entry per duplicated code.
 */
export function duplicateCodeNotes(items: readonly CostItemInput[]): string[] {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.code, (counts.get(item.code) ?? 0) + 1)
  const notes: string[] = []
  for (const [code, count] of counts) {
    if (count > 1) notes.push(`${code}: appears ${count} times under one code; confirm the entries are intended or they will double-count`)
  }
  return notes
}

/** Amount lookup over evaluated items; duplicate codes keep the last evaluation. */
function amountByCode(items: readonly CostItemResult[]): Map<string, string | undefined> {
  const amounts = new Map<string, string | undefined>()
  for (const item of items) amounts.set(item.code, item.amount)
  return amounts
}

/** Unit-rate lookup over evaluated items, mirroring {@link amountByCode}. */
function unitRateByCode(items: readonly CostItemResult[]): Map<string, string | undefined> {
  const rates = new Map<string, string | undefined>()
  for (const item of items) rates.set(item.code, item.unit_rate)
  return rates
}

/**
 * Assert that one value is a frozen cost result from this calculator, so a
 * fabricated or edited value is denied cleanly instead of crashing a tool.
 * @param value - the model-supplied frozen result.
 * @param role - which parameter is being validated, named in the denial.
 */
function assertCostResult(value: unknown, role = 'result'): asserts value is CostResult {
  const candidate = value as Partial<CostResult> | null
  if (candidate === null || typeof candidate !== 'object'
    || candidate.schema_version !== 1
    || typeof candidate.calculator_version !== 'string'
    || !candidate.calculator_version.startsWith('construction-cost/')
    || !Array.isArray(candidate.items)
    || !candidate.items.every(item => typeof item === 'object' && item !== null && Array.isArray((item as { trace?: unknown }).trace))) {
    throw new Error(`${role} is not a frozen cost result from construction_cost_calculate`)
  }
}

/**
 * Build the difference table for tender and settlement variants by matching
 * item codes between the compared and baseline evaluations.
 * @param compared - evaluated current items.
 * @param baseline - evaluated baseline items.
 * @param precision - declared output precision.
 * @returns one row per code seen on either side.
 */
export function buildDifferences(
  compared: readonly CostItemResult[],
  baseline: readonly CostItemResult[],
  precision: number,
): CostDifference[] {
  const comparedAmounts = amountByCode(compared)
  const baselineAmounts = amountByCode(baseline)
  const comparedRates = unitRateByCode(compared)
  const baselineRates = unitRateByCode(baseline)
  const codes = [...new Set([...comparedAmounts.keys(), ...baselineAmounts.keys()])].sort()
  const rows: CostDifference[] = []
  for (const code of codes) {
    const comparedAmount = comparedAmounts.get(code)
    const baselineAmount = baselineAmounts.get(code)
    const comparedQuantity = compared.find(item => item.code === code)?.quantity
    const baselineQuantity = baseline.find(item => item.code === code)?.quantity
    if (!comparedAmounts.has(code)) {
      rows.push({
        code,
        ...(baselineAmount !== undefined ? { baseline_amount: baselineAmount } : {}),
        status: 'only_in_baseline',
      })
      continue
    }
    if (!baselineAmounts.has(code)) {
      rows.push({
        code,
        ...(comparedAmount !== undefined ? { compared_amount: comparedAmount } : {}),
        status: 'only_in_compared',
      })
      continue
    }
    if (comparedAmount === undefined || baselineAmount === undefined) {
      rows.push({ code, status: 'unresolved' })
      continue
    }
    const difference = new Decimal(comparedAmount).minus(baselineAmount)
    const status: CostDifference['status'] = difference.isZero()
      ? 'matching'
      : comparedQuantity !== undefined && baselineQuantity !== undefined && comparedQuantity !== baselineQuantity
        ? 'quantity_diff'
        : 'price_diff'
    const differenceText = money(difference, precision)
    const comparedRate = comparedRates.get(code)
    const baselineRate = baselineRates.get(code)
    if (status !== 'matching' && comparedQuantity !== undefined && baselineQuantity !== undefined && comparedRate !== undefined && baselineRate !== undefined) {
      const quantityEffectText = money(new Decimal(comparedQuantity).minus(baselineQuantity).times(baselineRate), precision)
      // price_effect is the residual of the rounded values, so the two effects
      // always reconcile exactly with the row's rounded difference.
      const priceEffectText = money(new Decimal(differenceText).minus(quantityEffectText), precision)
      rows.push({
        code,
        baseline_amount: baselineAmount,
        compared_amount: comparedAmount,
        difference: differenceText,
        quantity_effect: quantityEffectText,
        price_effect: priceEffectText,
        status,
      })
      continue
    }
    rows.push({ code, baseline_amount: baselineAmount, compared_amount: comparedAmount, difference: differenceText, status })
  }
  return rows
}

/**
 * Run one cost calculation input and freeze the result.
 * @param input - the caller-supplied cost input.
 * @param precision - declared output precision.
 * @returns the frozen cost result with full traceability.
 */
export function calculateCost(input: CostInput, precision: number): CostResult {
  const unresolved: string[] = [...duplicateCodeNotes(input.items)]
  const items = input.items.map(item => evaluateItem(item, precision, unresolved))
  const totals = { resources: new Decimal(0), fees: new Decimal(0), amount: new Decimal(0) }
  for (const item of items) {
    if (item.resource_cost === undefined) continue
    totals.resources = totals.resources.plus(item.resource_cost)
    for (const fee of item.fees) totals.fees = totals.fees.plus(fee.amount)
    if (item.amount !== undefined) totals.amount = totals.amount.plus(item.amount)
  }
  let differences: CostDifference[] | undefined
  if (input.variant === 'tender' || input.variant === 'settlement') {
    const baseline = input.baseline ?? []
    if (baseline.length === 0) {
      unresolved.push(`${input.variant}: no baseline items supplied; the difference table lists only the compared side`)
      differences = buildDifferences(items, [], precision)
    } else {
      const baselineUnresolved: string[] = []
      const evaluatedBaseline = baseline.map(item => evaluateItem(item, precision, baselineUnresolved))
      unresolved.push(...baselineUnresolved.map(note => `baseline ${note}`))
      differences = buildDifferences(items, evaluatedBaseline, precision)
    }
  }
  return {
    schema_version: 1,
    calculator_version: CALCULATOR_VERSION,
    variant: input.variant,
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    precision,
    items,
    totals: {
      resources: money(totals.resources, precision),
      fees: money(totals.fees, precision),
      amount: money(totals.amount, precision),
    },
    ...(differences !== undefined ? { differences } : {}),
    unresolved,
  }
}

const itemParameterSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', required: true, description: 'BOQ item code; kept as text.' },
    description: { type: 'string' },
    unit: { type: 'string' },
    quantity: { ...decimalInput, required: true, description: 'Item quantity; null or blank when unknown (never treated as zero).' },
    resources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['labor', 'material', 'equipment'] },
          name: { type: 'string', required: true },
          consumption: { ...decimalInput, required: true, description: 'Consumption per BOQ unit; blank when unknown.' },
          unit_price: { ...decimalInput, required: true, description: 'Unit price; blank when unknown.' },
        },
      },
    },
    fees: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          base: { type: 'string', required: true, const: 'resources' },
          rate: { ...decimalInput, required: true, description: 'Rate as a decimal fraction, for example 0.1 for ten percent.' },
        },
      },
    },
  },
} as const

const costInputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    variant: { type: 'string', required: true, enum: ['unit_rate', 'tender', 'variation', 'settlement'] },
    currency: { type: 'string' },
    items: { type: 'array', required: true, items: itemParameterSchema },
    baseline: { type: 'array', items: itemParameterSchema },
  },
} as const

function costResultSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      schema_version: { type: 'integer', const: 1 },
      calculator_version: { type: 'string' },
      variant: { type: 'string', enum: ['unit_rate', 'tender', 'variation', 'settlement'] },
      currency: { type: 'string' },
      precision: { type: 'integer' },
      items: { type: 'array', items: { type: 'json' } },
      totals: { type: 'json' },
      differences: { type: 'array', items: { type: 'json' } },
      unresolved: { type: 'array', items: { type: 'string' } },
    },
  } as const
}

/** Render one cost result as a compact analysis table plus the frozen JSON for verbatim pass-back. */
function renderCostResult(value: CostResult): string {
  const lines = [
    `variant: ${value.variant}${value.currency !== undefined ? ` (${value.currency})` : ''}`,
    `totals: resources ${value.totals.resources}, fees ${value.totals.fees}, amount ${value.totals.amount}`,
    ...value.items.map(item => `item ${item.code}: resource_cost ${item.resource_cost ?? 'unresolved'}, unit_rate ${item.unit_rate ?? 'unresolved'}, amount ${item.amount ?? 'unresolved'}`),
    ...value.unresolved.map(note => `unresolved: ${note}`),
  ]
  return [
    lines.join('\n'),
    '',
    'Frozen result JSON — pass it back verbatim to construction_cost_export, construction_cost_compare, or construction_report_export; never retype, round, or edit its values.',
    JSON.stringify(value, null, 2),
  ].join('\n')
}

/** Render one comparison as a difference list. */
function renderCostCompare(value: CostCompareResult): string {
  return [
    `total difference: ${value.total_difference}`,
    ...value.differences.map(row => `${row.code}: ${row.status}${row.difference !== undefined ? ` (${row.difference})` : ''}`),
    ...value.requires_confirmation.map(note => `confirm: ${note}`),
  ].join('\n')
}

/**
 * Register `construction_cost_calculate`, `construction_cost_compare`, and
 * `construction_cost_export`. All three require an active cost task.
 * @param ctx - the plugin context providing `fs`.
 * @param settings - artifacts directory and declared precision.
 * @param bindings - the task binding store.
 */
export function applyCostTools(ctx: Context, settings: CostToolSettings, bindings: TaskBindings): void {
  const requireCost = (exec: ToolExecution, taskId: string | undefined): void => {
    bindings.requireTask(bindings.scopeFor(exec.agent), taskId, ['cost'])
  }

  ctx.tools.register(defineTool({
    name: 'construction_cost_calculate',
    description: 'Calculate a deterministic cost result for the unit_rate, tender, variation, or settlement workflow from explicit items: resource consumption times unit prices, explicit fee bases and rates, and trace expressions for every amount. Blanks are reported as unresolved items, never treated as zero. Requires an active cost task.',
    parameters: {
      input: { ...costInputSchema, required: true, description: 'Cost input: variant, items with resources and fees, and baseline items for tender/settlement.' },
      task_id: { type: 'string', description: 'Active cost task binding id.' },
    },
    output: { schema: costResultSchema(), render: (_args, value) => [{ type: 'text', text: renderCostResult(value as unknown as CostResult) }] },
    execute(args, exec) {
      requireCost(exec, args.task_id)
      // The declared schema is the canonical JSON shape; the engine freezes
      // that shape with readonly views of the same data.
      return Promise.resolve(calculateCost(args.input as unknown as CostInput, settings.precision) as never)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'construction_cost_compare',
    description: 'Compare two frozen cost results by item code and return a difference table with matched, price, quantity, and one-sided rows plus the rows a reviewer must confirm. Requires an active cost task.',
    parameters: {
      result: { ...costResultSchema(), required: true, description: 'The frozen CostResult to compare.' },
      baseline: { ...costResultSchema(), required: true, description: 'The frozen CostResult to compare against.' },
      task_id: { type: 'string', description: 'Active cost task binding id.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          schema_version: { type: 'integer', const: 1 },
          precision: { type: 'integer' },
          differences: { type: 'array', items: { type: 'json' } },
          total_difference: { type: 'string' },
          requires_confirmation: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderCostCompare(value as unknown as CostCompareResult),
      }],
    },
    execute(args, exec) {
      requireCost(exec, args.task_id)
      assertCostResult(args.result)
      assertCostResult(args.baseline, 'baseline')
      const result = args.result as unknown as CostResult
      const baseline = args.baseline as unknown as CostResult
      const differences = buildDifferences(result.items, baseline.items, result.precision)
      const total = differences.reduce(
        (sum, row) => (row.difference !== undefined ? sum.plus(row.difference) : sum),
        new Decimal(0),
      )
      const requiresConfirmation = differences
        .filter(row => row.status === 'only_in_baseline' || row.status === 'only_in_compared' || row.status === 'price_diff')
        .map(row => `${row.code}: ${row.status}`)
      return Promise.resolve({
        schema_version: 1 as const,
        precision: result.precision,
        differences,
        total_difference: money(total, result.precision),
        requires_confirmation: requiresConfirmation,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'construction_cost_export',
    description: 'Export a frozen cost result as a markdown report file under the construction artifacts directory. The report carries the frozen amounts, fee lines, expressions, and unresolved items verbatim. Requires an active cost task.',
    parameters: {
      result: { ...costResultSchema(), required: true, description: 'The frozen CostResult to export.' },
      task_id: { type: 'string', description: 'Active cost task binding id.' },
    },
    output: {
      schema: exportResultSchema(),
      render: (_args, value) => [{ type: 'text', text: `exported cost report: ${value.path}\n${value.summary}` }],
    },
    async execute(args, exec) {
      requireCost(exec, args.task_id)
      assertCostResult(args.result)
      const result = args.result as unknown as CostResult
      const canonical = JSON.stringify(result)
      const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 16)
      const { displayPath, target } = await resolveArtifactTarget(ctx, exec, settings.artifactsDir, `cost/cost-${result.variant}-${hash}.md`)
      const lines = [
        `# Cost report — ${result.variant}`,
        '',
        `- calculator: ${result.calculator_version}`,
        `- precision: ${result.precision}`,
        `- totals: resources ${result.totals.resources}, fees ${result.totals.fees}, amount ${result.totals.amount}`,
        '',
        '| Code | Resource cost | Fees | Unit rate | Amount |',
        '|---|---|---|---|---|',
        ...result.items.map(item => `| ${item.code} | ${item.resource_cost ?? 'unresolved'} | ${item.fees.map(fee => `${fee.name} ${fee.amount}`).join('; ')} | ${item.unit_rate ?? 'unresolved'} | ${item.amount ?? 'unresolved'} |`),
        '',
        '## Expressions',
        '',
        ...result.items.flatMap(item => item.trace.map(trace => `- ${trace}`)),
        '',
        '## Unresolved items',
        '',
        ...result.unresolved.map(note => `- ${note}`),
        '',
      ]
      exec.signal.throwIfAborted()
      await ctx.fs.writeText(target, lines.join('\n'), undefined, exec.signal)
      return {
        schema_version: 1 as const,
        path: displayPath,
        summary: `${result.variant} report with ${result.items.length} item(s), total ${result.totals.amount}`,
        unresolved: [...result.unresolved],
      }
    },
  }))
}
