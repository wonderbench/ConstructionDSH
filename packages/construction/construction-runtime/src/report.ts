/**
 * Report export tool.
 *
 * `construction_report_export` renders a markdown report from one frozen
 * result (cost, schedule, or document summary) plus its unresolved items and
 * writes it under the configured artifacts directory. It requires any active
 * business task, and the sections it may include are filtered by the active
 * task type: a safety task cannot export cost totals, and so on. Document-kind
 * data is model-supplied JSON and is validated against the
 * `DocumentSummaryResult` shape at execution time.
 *
 * @module @deepseek-ai/dsh-construction-runtime/src/report
 */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import { resolveArtifactTarget, exportResultSchema } from './artifacts.ts'
import type { CostResult, DocumentSummaryResult, ScheduleResult, TaskType } from './types.ts'
import type { TaskBindings } from './tasks.ts'

/** Sections each task type may export. */
export const PERMITTED_SECTIONS: Readonly<Record<TaskType, readonly string[]>> = {
  safety: ['issues', 'evidence', 'controls', 'unresolved'],
  quality: ['checks', 'evidence', 'nonconformities', 'unresolved'],
  cost: ['items', 'totals', 'differences', 'unresolved'],
  schedule: ['tasks', 'calendar', 'critical_path', 'unresolved'],
}

/** Report headings for the document sections a task type may export. */
const DOCUMENT_SECTION_TITLES: Readonly<Record<string, string>> = {
  issues: 'Issues',
  evidence: 'Evidence',
  controls: 'Controls',
  checks: 'Checks',
  nonconformities: 'Nonconformities',
}

/** Settings for the report tool. */
export interface ReportToolSettings {
  /** Artifacts directory, relative to the session workspace. */
  readonly artifactsDir: string
}

/** Sections every report carries regardless of the frozen result kind. */
const COMMON_SECTIONS = ['summary', 'unresolved'] as const

/** Frozen result accepted by the report tool. */
type FrozenResult =
  | { readonly kind: 'cost'; readonly data: CostResult }
  | { readonly kind: 'schedule'; readonly data: ScheduleResult }
  | { readonly kind: 'document'; readonly data: DocumentSummaryResult }

/** Model-facing description of the document summary data shape, used in validation errors. */
const DOCUMENT_SUMMARY_SHAPE = '{ schema_version: 1, summary: "<non-empty text>", sections: { "<section name>": ["<bullet text>", ...] } }'

/**
 * Validate model-supplied document data at the tool JSON boundary.
 * @param raw - the `data` value of a `kind: "document"` result.
 * @returns the validated document summary.
 * @throws Error naming the expected shape when any field violates the contract.
 */
function parseDocumentSummary(raw: unknown): DocumentSummaryResult {
  const shapeError = (field: string): Error => new Error(`document result ${field}; expected a DocumentSummaryResult ${DOCUMENT_SUMMARY_SHAPE}`)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw shapeError('data must be an object')
  const data = raw as Record<string, unknown>
  if (data.schema_version !== 1) throw shapeError('schema_version must be 1')
  if (typeof data.summary !== 'string' || data.summary.trim().length === 0) throw shapeError('summary must be a non-empty string')
  if (typeof data.sections !== 'object' || data.sections === null || Array.isArray(data.sections)) throw shapeError('sections must be an object')
  for (const [name, entries] of Object.entries(data.sections)) {
    if (!Array.isArray(entries) || entries.some(entry => typeof entry !== 'string')) {
      throw shapeError(`sections["${name}"] must be an array of strings`)
    }
  }
  return data as unknown as DocumentSummaryResult
}

/**
 * Register `construction_report_export`.
 * @param ctx - the plugin context providing `fs`.
 * @param settings - the artifacts directory.
 * @param bindings - the task binding store.
 */
export function applyReportTool(ctx: Context, settings: ReportToolSettings, bindings: TaskBindings): void {
  ctx.tools.register(defineTool({
    name: 'construction_report_export',
    description: 'Export a markdown report from one frozen result (cost, schedule, or document summary) plus its unresolved items. Sections are filtered by the active business task type. A document result carries a DocumentSummaryResult: { schema_version: 1, summary: <review summary text>, sections: { <section name>: [<bullet text>] } }. Writes the report under the construction artifacts directory and returns its path. Requires any active business task.',
    parameters: {
      result: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['cost', 'schedule', 'document'] },
          data: { type: 'json', required: true, description: 'The frozen result value from the matching calculate/read tool.' },
        },
      },
      sections: { type: 'array', items: { type: 'string' }, description: 'Requested sections; sections not permitted for the active task type are omitted.' },
      task_id: { type: 'string', description: 'Active business task binding id.' },
    },
    output: {
      schema: exportResultSchema(),
      render: (_args, value) => [{ type: 'text', text: `exported report: ${value.path}\n${value.summary}` }],
    },
    async execute(args, exec) {
      const binding = bindings.requireTask(bindings.scopeFor(exec.agent), args.task_id, ['safety', 'quality', 'cost', 'schedule'])
      const permitted = new Set<string>([...PERMITTED_SECTIONS[binding.task_type], ...COMMON_SECTIONS])
      const requested = args.sections ?? [...permitted]
      const frozen = args.result as unknown as FrozenResult
      const document = frozen.kind === 'document' ? parseDocumentSummary(frozen.data) : undefined
      const omitted = requested.filter(section => !permitted.has(section))
      if (document !== undefined) {
        for (const name of Object.keys(document.sections)) {
          if (!permitted.has(name) && !omitted.includes(name)) omitted.push(name)
        }
      }
      const sections = requested.filter(section => permitted.has(section))
      const canonical = JSON.stringify(frozen)
      const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 16)
      const { displayPath, target } = await resolveArtifactTarget(ctx, exec, settings.artifactsDir, `reports/report-${binding.task_type}-${hash}.md`)

      const lines: string[] = [`# Construction report — ${binding.task_type} task`, '']
      const rendered: string[] = []
      const include = (section: string): boolean => sections.includes(section)
      if (include('summary')) {
        lines.push('## Summary', '', summaryLine(frozen), '')
        rendered.push('summary')
      }
      if (frozen.kind === 'cost') {
        if (include('items')) {
          lines.push('## Items', '', ...frozen.data.items.map(item => `- ${item.code}: unit rate ${item.unit_rate ?? 'unresolved'}, amount ${item.amount ?? 'unresolved'}`), '')
          rendered.push('items')
        }
        if (include('totals')) {
          lines.push('## Totals', '', `- resources ${frozen.data.totals.resources}`, `- fees ${frozen.data.totals.fees}`, `- amount ${frozen.data.totals.amount}`, '')
          rendered.push('totals')
        }
        if (include('differences') && frozen.data.differences !== undefined) {
          lines.push('## Differences', '', ...frozen.data.differences.map((row) => {
            const effects = row.quantity_effect !== undefined && row.price_effect !== undefined
              ? `, quantity effect ${row.quantity_effect}, price effect ${row.price_effect}`
              : ''
            return `- ${row.code}: ${row.status}${row.difference !== undefined ? ` (${row.difference}${effects})` : ''}`
          }), '')
          rendered.push('differences')
        }
      } else if (frozen.kind === 'schedule') {
        if (include('tasks')) {
          lines.push('## Tasks', '', ...frozen.data.tasks.map(task => `- ${task.id}: ${task.start} -> ${task.finish}, float ${task.total_float}${task.is_critical ? ', critical' : ''}`), '')
          rendered.push('tasks')
        }
        if (include('calendar')) {
          lines.push('## Calendar', '', `- rest days: ${frozen.data.calendar.weekly_rest_days.join(', ')}`, `- holidays: ${frozen.data.calendar.holidays.join(', ') || 'none'}`, '')
          rendered.push('calendar')
        }
        if (include('critical_path')) {
          lines.push('## Critical path', '', frozen.data.critical_path === null ? 'Not claimed: the logic is incomplete.' : frozen.data.critical_path.join(' -> '), '')
          rendered.push('critical_path')
        }
      } else {
        for (const [section, title] of Object.entries(DOCUMENT_SECTION_TITLES)) {
          const bullets = frozen.data.sections[section]
          if (!include(section) || bullets === undefined) continue
          lines.push(`## ${title}`, '', ...bullets.map(note => `- ${note}`), '')
          rendered.push(section)
        }
      }
      if (include('unresolved')) {
        lines.push('## Unresolved items', '', ...unresolvedOf(frozen).map(note => `- ${note}`), '')
        rendered.push('unresolved')
      }
      if (omitted.length > 0) {
        lines.push(`Sections omitted because the active task is a ${binding.task_type} task: ${omitted.join(', ')}`, '')
      }

      exec.signal.throwIfAborted()
      await ctx.fs.writeText(target, lines.join('\n'), undefined, exec.signal)
      const unresolved = [...unresolvedOf(frozen)]
      return {
        schema_version: 1 as const,
        path: displayPath,
        summary: `${binding.task_type} report with sections ${rendered.join(', ')}`,
        unresolved,
      }
    },
  }))
}

/** One-line summary of the frozen result. */
function summaryLine(frozen: FrozenResult): string {
  if (frozen.kind === 'cost') return `${frozen.data.variant} cost result, ${frozen.data.items.length} item(s), total ${frozen.data.totals.amount}${frozen.data.currency !== undefined ? ` ${frozen.data.currency}` : ''}.`
  if (frozen.kind === 'schedule') return `Schedule scenario ${frozen.data.scenario_id}, ${frozen.data.tasks.length} task(s).`
  return frozen.data.summary
}

/** Unresolved items carried by the frozen result, when it carries any. */
function unresolvedOf(frozen: FrozenResult): readonly string[] {
  if (frozen.kind === 'cost' || frozen.kind === 'schedule') return frozen.data.unresolved
  return frozen.data.sections.unresolved ?? []
}
