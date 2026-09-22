/**
 * Validation of `construction_schedule_present` tool-result payloads.
 *
 * The Session log is a durable, cross-process boundary: result text is parsed
 * and checked here before it ever reaches a component. A payload that fails
 * validation produces a failure entry, never a partially fabricated chart.
 */
import type { ScheduleLink, ScheduleResultData, ScheduleTask } from './contract.ts'

/** Tool whose results feed the Gantt. */
export const SCHEDULE_PRESENT_TOOL = 'construction_schedule_present'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number')
}

function parseTask(value: unknown): ScheduleTask | undefined {
  if (!isRecord(value)) return undefined
  const { id, name, duration, start, finish, totalFloat, isCritical, isMilestone, locked } = value
  if (typeof id !== 'string' || id === '') return undefined
  if (typeof name !== 'string') return undefined
  if (typeof duration !== 'number' || !Number.isFinite(duration)) return undefined
  if (typeof start !== 'string' || !ISO_DATE.test(start)) return undefined
  if (typeof finish !== 'string' || !ISO_DATE.test(finish)) return undefined
  if (typeof totalFloat !== 'number' || !Number.isFinite(totalFloat)) return undefined
  if (typeof isCritical !== 'boolean' || typeof isMilestone !== 'boolean' || typeof locked !== 'boolean') return undefined
  return { id, name, duration, start, finish, totalFloat, isCritical, isMilestone, locked }
}

/**
 * Validate one parsed JSON value as a `schemaVersion: 1` schedule payload.
 * @param value - Parsed tool-result JSON of unknown shape.
 * @returns the validated payload, or `undefined` when any required field fails.
 */
export function validateScheduleResult(value: unknown): ScheduleResultData | undefined {
  if (!isRecord(value)) return undefined
  if (value.schemaVersion !== 1) return undefined
  const { resultId, scenarioId, scenarioLabel, calendar, dateRange, tasks, links, criticalPath } = value
  if (typeof resultId !== 'string' || resultId === '') return undefined
  if (typeof scenarioId !== 'string' || scenarioId === '') return undefined
  if (typeof scenarioLabel !== 'string') return undefined
  if (!isRecord(calendar)) return undefined
  const { weeklyRestDays, holidays } = calendar
  if (!isNumberArray(weeklyRestDays) || !isStringArray(holidays)) return undefined
  if (!isRecord(dateRange)) return undefined
  const { start, finish } = dateRange
  if (typeof start !== 'string' || !ISO_DATE.test(start)) return undefined
  if (typeof finish !== 'string' || !ISO_DATE.test(finish)) return undefined
  if (!Array.isArray(tasks) || tasks.length === 0) return undefined
  const parsedTasks: ScheduleTask[] = []
  for (const task of tasks) {
    const parsed = parseTask(task)
    if (parsed === undefined) return undefined
    parsedTasks.push(parsed)
  }
  if (!Array.isArray(links)) return undefined
  const taskIds = new Set(parsedTasks.map(task => task.id))
  const parsedLinks: ScheduleLink[] = []
  for (const link of links) {
    if (!isRecord(link)) return undefined
    const { from, to, lagDays } = link
    if (typeof from !== 'string' || typeof to !== 'string') return undefined
    if (!taskIds.has(from) || !taskIds.has(to)) return undefined
    if (typeof lagDays !== 'number' || !Number.isFinite(lagDays)) return undefined
    parsedLinks.push({ from, to, lagDays })
  }
  if (!isStringArray(criticalPath)) return undefined
  const assumptions = value.assumptions
  const unresolved = value.unresolved
  const warnings = value.warnings
  if (!isStringArray(assumptions) || !isStringArray(unresolved) || !isStringArray(warnings)) return undefined
  return {
    schemaVersion: 1,
    resultId,
    scenarioId,
    scenarioLabel,
    calendar: { weeklyRestDays, holidays },
    dateRange: { start, finish },
    tasks: parsedTasks,
    links: parsedLinks,
    criticalPath,
    assumptions,
    unresolved,
    warnings,
  }
}

/**
 * Extract the schedule JSON text from a tool-result content block list.
 * @param content - `ToolResultBlock.content` value of the result message.
 * @returns the first text block's text, or `undefined` when there is none.
 */
export function resultText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') return block.text
  }
  return undefined
}

/**
 * Parse and validate raw tool-result text as a schedule payload.
 * @param text - Raw result text logged by `construction_schedule_present`.
 * @returns the validated payload, or `undefined` for non-JSON or invalid data.
 */
export function parseScheduleResult(text: string): ScheduleResultData | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  return validateScheduleResult(value)
}
