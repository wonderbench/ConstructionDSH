/**
 * CPM schedule engine and the two scheduling tools.
 *
 * All date arithmetic is pure integer arithmetic on ISO calendar dates —
 * no `Date`, no timezone math. One project working calendar (weekly rest
 * days plus a holiday list) defines working time; durations and lags are
 * whole working days; boundaries are inclusive start with exclusive finish,
 * and the displayed finish is the last working date before the finish
 * boundary. Unsupported relations are reported, never rewritten as
 * finish-to-start; a critical path is claimed only when the logic is
 * complete.
 *
 * @module @deepseek-ai/dsh-construction-runtime/src/schedule
 */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import type {
  ScheduleInput,
  ScheduleLinkResult,
  SchedulePresentResult,
  ScheduleResult,
  ScheduleTaskResult,
} from './types.ts'
import type { TaskBindings } from './tasks.ts'

/** Calculator version recorded in every ScheduleResult. */
export const SCHEDULE_CALCULATOR_VERSION = 'construction-schedule/1.0.0'

/** A day ordinal; day 0 is 1970-01-01. All arithmetic stays in this integer space. */
type DayOrdinal = number

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Convert an ISO calendar date to a day ordinal. Pure civil arithmetic; the
 * result never depends on the host timezone.
 * @param year - calendar year.
 * @param month - calendar month, 1-12.
 * @param day - calendar day, 1-31.
 * @returns the day ordinal.
 */
function daysFromCivil(year: number, month: number, day: number): DayOrdinal {
  const adjusted = year - (month <= 2 ? 1 : 0)
  const era = Math.floor(adjusted / 400)
  const yearOfEra = adjusted - era * 400
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

/**
 * Convert a day ordinal back to an ISO calendar date.
 * @param ordinal - the day ordinal.
 * @returns `{year, month, day}` civil components.
 */
function civilFromDays(ordinal: DayOrdinal): { year: number; month: number; day: number } {
  const shifted = ordinal + 719468
  const era = Math.floor(shifted / 146097)
  const dayOfEra = shifted - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  )
  const year = yearOfEra + era * 400
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1
  const month = monthPrime + (monthPrime < 10 ? 3 : -9)
  return { year: year + (month <= 2 ? 1 : 0), month, day }
}

/** Format one ordinal as an ISO date. */
function ordinalToIso(ordinal: DayOrdinal): string {
  const { year, month, day } = civilFromDays(ordinal)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
}

/** Parse one ISO date to an ordinal, or null when malformed. */
function isoToOrdinal(iso: string): DayOrdinal | null {
  const match = ISO_DATE.exec(iso)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const civil = civilFromDays(daysFromCivil(year, month, day))
  if (civil.year !== year || civil.month !== month || civil.day !== day) return null
  return daysFromCivil(year, month, day)
}

/** JavaScript-style weekday of one ordinal: 0 is Sunday; day 0 was a Thursday. */
function weekdayOf(ordinal: DayOrdinal): number {
  return (((ordinal % 7) + 4) % 7 + 7) % 7
}

/** One project working calendar as ordinal sets. */
export interface WorkingCalendar {
  /** Rest weekdays (0 Sunday through 6 Saturday). */
  readonly restDays: ReadonlySet<number>
  /** Holiday ordinals. */
  readonly holidays: ReadonlySet<DayOrdinal>
}

/**
 * Build the working calendar from input, rejecting invalid weekdays and
 * malformed holiday dates.
 * @param input - the schedule input.
 * @returns the calendar.
 * @throws Error listing every invalid entry.
 */
export function buildCalendar(input: ScheduleInput): WorkingCalendar {
  const restDays = new Set<number>(input.weekly_rest_days ?? [6, 0])
  const errors: string[] = []
  for (const day of restDays) {
    if (!Number.isInteger(day) || day < 0 || day > 6) errors.push(`weekly rest day ${String(day)} is not an integer between 0 (Sunday) and 6 (Saturday)`)
  }
  const holidays = new Set<DayOrdinal>()
  for (const iso of input.holidays ?? []) {
    const ordinal = isoToOrdinal(iso)
    if (ordinal === null) errors.push(`holiday "${iso}" is not a valid ISO date`)
    else holidays.add(ordinal)
  }
  if (errors.length > 0) throw new Error(`invalid schedule calendar: ${errors.join('; ')}`)
  return { restDays, holidays }
}

/**
 * Whether one ordinal is a working day in the calendar.
 * @param calendar - the project working calendar.
 * @param ordinal - the day ordinal to test.
 * @returns whether the day is a working day.
 */
export function isWorkingDay(calendar: WorkingCalendar, ordinal: DayOrdinal): boolean {
  return !calendar.restDays.has(weekdayOf(ordinal)) && !calendar.holidays.has(ordinal)
}

/**
 * The first working day at or after one ordinal.
 * @param calendar - the project working calendar.
 * @param ordinal - the day ordinal to move from.
 * @returns the first working day at or after the ordinal.
 */
export function nextWorkingDay(calendar: WorkingCalendar, ordinal: DayOrdinal): DayOrdinal {
  let day = ordinal
  while (!isWorkingDay(calendar, day)) day += 1
  return day
}

/** The last working day at or before one ordinal. */
function prevWorkingDay(calendar: WorkingCalendar, ordinal: DayOrdinal): DayOrdinal {
  let day = ordinal
  while (!isWorkingDay(calendar, day)) day -= 1
  return day
}

/** The last occupied working day of a task with positive duration starting on a working day. */
function lastOccupiedDay(calendar: WorkingCalendar, start: DayOrdinal, duration: number): DayOrdinal {
  let day = start
  let occupied = 0
  while (true) {
    if (isWorkingDay(calendar, day)) occupied += 1
    if (occupied === duration) return day
    day += 1
  }
}

/**
 * The exclusive finish boundary: for positive duration, the first working
 * day after the last occupied day; a zero-duration milestone finishes at its
 * (working-day) start instant.
 */
function finishBoundary(calendar: WorkingCalendar, start: DayOrdinal, duration: number): DayOrdinal {
  if (duration === 0) return start
  return nextWorkingDay(calendar, lastOccupiedDay(calendar, start, duration) + 1)
}

/** Move a finish boundary forward by a whole-working-day lag. */
function advanceByLag(calendar: WorkingCalendar, boundary: DayOrdinal, lag: number): DayOrdinal {
  let day = boundary
  let moved = 0
  while (moved < lag) {
    day += 1
    if (isWorkingDay(calendar, day)) moved += 1
  }
  return day
}

/** Move a start boundary back by a whole-working-day lag; the inverse of {@link advanceByLag}. */
function retreatByLag(calendar: WorkingCalendar, boundary: DayOrdinal, lag: number): DayOrdinal {
  let day = boundary
  let moved = 0
  while (moved < lag) {
    day -= 1
    if (isWorkingDay(calendar, day)) moved += 1
  }
  return day
}

/** Count working days in the half-open range [start, end). */
function workingDaysBetween(calendar: WorkingCalendar, start: DayOrdinal, end: DayOrdinal): number {
  let count = 0
  for (let day = start; day < end; day += 1) {
    if (isWorkingDay(calendar, day)) count += 1
  }
  return count
}

/** One supported finish-to-start edge in the calculation graph. */
interface SupportedLink {
  readonly from: string
  readonly to: string
  readonly lag: number
}

/** Validated and normalized task ready for the passes. */
interface PreparedTask {
  readonly id: string
  readonly name: string
  readonly duration: number
  readonly locked: boolean
  readonly startOrdinal: DayOrdinal | null
  readonly finishOrdinal: DayOrdinal | null
  readonly finishConstraint: DayOrdinal | null
  readonly startConstraint: DayOrdinal | null
}

/**
 * Validate tasks and links, rejecting duplicates, dangling references,
 * cycles, bad durations and lags, and malformed dates with one error message
 * listing every problem.
 * @param input - the raw schedule input.
 * @returns prepared tasks, supported FS edges, and reported link rows.
 */
export function prepareSchedule(
  input: ScheduleInput,
): { tasks: PreparedTask[]; links: SupportedLink[]; reported: ScheduleLinkResult[]; unsupported: string[] } {
  const errors: string[] = []
  const ids = new Set<string>()
  const tasks: PreparedTask[] = []
  for (const raw of input.tasks) {
    const id = raw.id
    if (typeof id !== 'string' || id.trim().length === 0) {
      errors.push('every task requires a non-empty id')
      continue
    }
    if (ids.has(id)) errors.push(`duplicate task id "${id}"`)
    ids.add(id)
    const duration = raw.duration ?? 0
    if (!Number.isInteger(duration) || duration < 0) errors.push(`task "${id}" duration ${String(raw.duration)} is not a nonnegative integer of working days`)
    for (const [field, value] of [['locked_start', raw.locked_start], ['locked_finish', raw.locked_finish], ['start_no_earlier_than', raw.start_no_earlier_than], ['finish_no_later_than', raw.finish_no_later_than]] as const) {
      if (value !== undefined && isoToOrdinal(value) === null) errors.push(`task "${id}" ${field} "${value}" is not a valid ISO date`)
    }
    tasks.push({
      id,
      name: raw.name ?? id,
      duration,
      locked: raw.locked_start !== undefined || raw.locked_finish !== undefined,
      startOrdinal: raw.locked_start !== undefined ? isoToOrdinal(raw.locked_start) : null,
      finishOrdinal: raw.locked_finish !== undefined ? isoToOrdinal(raw.locked_finish) : null,
      startConstraint: raw.start_no_earlier_than !== undefined ? isoToOrdinal(raw.start_no_earlier_than) : null,
      finishConstraint: raw.finish_no_later_than !== undefined ? isoToOrdinal(raw.finish_no_later_than) : null,
    })
  }
  if (input.tasks.length === 0) errors.push('at least one task is required')

  const links: SupportedLink[] = []
  const reported: ScheduleLinkResult[] = []
  const unsupported: string[] = []
  for (const raw of input.links ?? []) {
    if (!ids.has(raw.from) || !ids.has(raw.to)) {
      errors.push(`link "${raw.from} -> ${raw.to}" references an unknown task`)
      continue
    }
    const lag = raw.lag ?? 0
    if (!Number.isInteger(lag) || lag < 0) {
      errors.push(`link "${raw.from} -> ${raw.to}" lag ${String(raw.lag)} is not a nonnegative integer of working days`)
      continue
    }
    const relation = raw.relation ?? 'FS'
    if (relation !== 'FS') {
      reported.push({ from: raw.from, to: raw.to, lag, supported: false })
      unsupported.push(`${relation} link ${raw.from} -> ${raw.to} is unsupported and was not rewritten as finish-to-start`)
      continue
    }
    links.push({ from: raw.from, to: raw.to, lag })
    reported.push({ from: raw.from, to: raw.to, lag, supported: true })
  }
  if (errors.length > 0) throw new Error(`invalid schedule: ${errors.join('; ')}`)

  // Kahn's algorithm rejects cycles before any date is computed. Link
  // endpoints are validated above, so every endpoint has an indegree entry.
  const indegree = new Map<string, number>()
  const successors = new Map<string, SupportedLink[]>()
  for (const task of tasks) indegree.set(task.id, 0)
  for (const link of links) {
    indegree.set(link.to, (indegree.get(link.to) as number) + 1)
    successors.set(link.from, [...(successors.get(link.from) ?? []), link])
  }
  const queue = tasks.filter(task => (indegree.get(task.id) as number) === 0).map(task => task.id)
  const ordered: string[] = []
  while (queue.length > 0) {
    const id = queue.shift() as string
    ordered.push(id)
    for (const link of successors.get(id) ?? []) {
      const remaining = (indegree.get(link.to) as number) - 1
      indegree.set(link.to, remaining)
      if (remaining === 0) queue.push(link.to)
    }
  }
  if (ordered.length !== tasks.length) {
    const cycle = findCycle(tasks.map(task => task.id), links)
    throw new Error(`invalid schedule: cycle detected: ${cycle.join(' -> ')}; resolve the circular logic before calculating`)
  }
  return { tasks, links, reported, unsupported }
}

/** One concrete cycle through the link graph, for the rejection message. */
function findCycle(ids: readonly string[], links: readonly SupportedLink[]): string[] {
  const successors = new Map<string, string[]>()
  for (const link of links) successors.set(link.from, [...(successors.get(link.from) ?? []), link.to])
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const visit = (id: string): string[] | null => {
    state.set(id, 'visiting')
    stack.push(id)
    for (const next of successors.get(id) ?? []) {
      const mark = state.get(next)
      if (mark === 'visiting') return stack.slice(stack.indexOf(next))
      if (mark === undefined) {
        const found = visit(next)
        if (found !== null) return found
      }
    }
    stack.pop()
    state.set(id, 'done')
    return null
  }
  for (const id of ids) {
    if (state.has(id)) continue
    const found = visit(id)
    if (found !== null) return [...found, found[0] as string]
  }
  /* v8 ignore next -- callers invoke findCycle only after Kahn's algorithm proved a cycle, so this fallback is unreachable. */
  return [ids[0] as string]
}

/**
 * Calculate one CPM scenario. Dates derive only from the input calendar and
 * constraints; the critical path is claimed only when every link is
 * supported and every task is anchored by logic or a start constraint.
 * @param input - the validated schedule input.
 * @returns the frozen schedule result.
 */
export function calculateSchedule(input: ScheduleInput): ScheduleResult {
  const calendar = buildCalendar(input)
  const { tasks, links, reported, unsupported } = prepareSchedule(input)
  const assumptions: string[] = [...unsupported]

  const projectStartCandidates: DayOrdinal[] = []
  if (input.project_start !== undefined) {
    const ordinal = isoToOrdinal(input.project_start)
    if (ordinal === null) throw new Error(`invalid schedule: project_start "${input.project_start}" is not a valid ISO date`)
    projectStartCandidates.push(ordinal)
  }
  for (const task of tasks) {
    if (task.startConstraint !== null) projectStartCandidates.push(task.startConstraint)
    if (task.startOrdinal !== null) projectStartCandidates.push(task.startOrdinal)
  }
  if (projectStartCandidates.length === 0) {
    throw new Error('invalid schedule: provide project_start, a start_no_earlier_than constraint, or a locked start so the calculation has an anchor date')
  }
  const projectStart = nextWorkingDay(calendar, Math.min(...projectStartCandidates))
  if (!isWorkingDay(calendar, Math.min(...projectStartCandidates))) {
    assumptions.push(`the earliest supplied date falls on a non-working day; the calculation starts on the next working day ${ordinalToIso(projectStart)}`)
  }

  const predecessors = new Map<string, SupportedLink[]>()
  for (const link of links) predecessors.set(link.to, [...(predecessors.get(link.to) ?? []), link])

  // Forward pass in topological order.
  const earlyStart = new Map<string, DayOrdinal>()
  const earlyFinish = new Map<string, DayOrdinal>()
  const topo = topologicalOrder(tasks, links)
  for (const task of topo) {
    let start = projectStart
    if (task.startConstraint !== null) start = Math.max(start, task.startConstraint)
    if (task.startOrdinal !== null) start = Math.max(start, task.startOrdinal)
    for (const link of predecessors.get(task.id) ?? []) {
      start = Math.max(start, advanceByLag(calendar, earlyFinish.get(link.from) as number, link.lag))
    }
    if (!isWorkingDay(calendar, start)) {
      const moved = nextWorkingDay(calendar, start)
      assumptions.push(`task "${task.id}" start moved from ${ordinalToIso(start)} to the next working day ${ordinalToIso(moved)}`)
      start = moved
    }
    earlyStart.set(task.id, start)
    earlyFinish.set(task.id, finishBoundary(calendar, start, task.duration))
  }

  // Locked tasks honor their recorded finish as the last working day.
  for (const task of tasks) {
    if (task.locked && task.finishOrdinal !== null) {
      const boundary = nextWorkingDay(calendar, task.finishOrdinal + 1)
      if (boundary < (earlyFinish.get(task.id) as number)) {
        throw new Error(`invalid schedule: locked task "${task.id}" records finish ${ordinalToIso(task.finishOrdinal)} but the logic requires ${ordinalToIso(prevWorkingDay(calendar, (earlyFinish.get(task.id) as number) - 1))}`)
      }
      earlyFinish.set(task.id, boundary)
    }
  }

  // Constraint conflicts reject the scenario.
  const conflicts: string[] = []
  for (const task of tasks) {
    if (task.finishConstraint !== null) {
      const displayFinish = task.duration === 0
        ? earlyStart.get(task.id) as number
        : prevWorkingDay(calendar, (earlyFinish.get(task.id) as number) - 1)
      if (displayFinish > task.finishConstraint) {
        conflicts.push(`task "${task.id}" finish_no_later_than ${ordinalToIso(task.finishConstraint)} but the logic requires ${ordinalToIso(displayFinish)}`)
      }
    }
  }
  if (conflicts.length > 0) throw new Error(`invalid schedule: constraint conflict: ${conflicts.join('; ')}`)

  // Backward pass from the project finish boundary.
  const projectFinish = Math.max(...topo.map(task => earlyFinish.get(task.id) as number))
  const successors = new Map<string, SupportedLink[]>()
  for (const link of links) successors.set(link.from, [...(successors.get(link.from) ?? []), link])
  const lateFinish = new Map<string, DayOrdinal>()
  const lateStart = new Map<string, DayOrdinal>()
  for (const task of [...topo].reverse()) {
    let finish = projectFinish
    const outgoing = successors.get(task.id) ?? []
    if (outgoing.length > 0) {
      finish = Math.min(...outgoing.map(link => retreatByLag(calendar, lateStart.get(link.to) as number, link.lag)))
    }
    if (task.finishConstraint !== null) {
      finish = Math.min(finish, nextWorkingDay(calendar, task.finishConstraint + 1))
    }
    lateFinish.set(task.id, finish)
    lateStart.set(task.id, task.duration === 0 ? finish : lastOccupiedReverse(calendar, finish, task.duration))
  }

  // Logic completeness decides whether a critical path may be claimed.
  const anchored = new Set<string>()
  for (const link of links) {
    anchored.add(link.from)
    anchored.add(link.to)
  }
  for (const task of tasks) {
    if (task.startConstraint !== null || task.locked) anchored.add(task.id)
  }
  const logicComplete = unsupported.length === 0 && tasks.every(task => anchored.has(task.id))

  const results: ScheduleTaskResult[] = topo.map((task) => {
    const start = earlyStart.get(task.id) as number
    const finishBoundaryValue = earlyFinish.get(task.id) as number
    const finish = task.duration === 0 ? start : prevWorkingDay(calendar, finishBoundaryValue - 1)
    const totalFloat = task.locked ? 0 : workingDaysBetween(calendar, start, lateStart.get(task.id) as number)
    return {
      id: task.id,
      name: task.name,
      duration: task.duration,
      start: ordinalToIso(start),
      finish: ordinalToIso(finish),
      total_float: totalFloat,
      is_critical: logicComplete && !task.locked && totalFloat === 0,
      is_milestone: task.duration === 0,
      locked: task.locked,
    }
  })
  const criticalPath = logicComplete
    ? results
      .filter(task => task.is_critical)
      .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
      .map(task => task.id)
    : null
  if (!logicComplete) {
    assumptions.push('the logic is incomplete (unsupported relations or tasks without links or start constraints); no critical path is claimed')
  }

  return {
    schema_version: 1,
    calculator_version: SCHEDULE_CALCULATOR_VERSION,
    scenario_id: input.scenario_id ?? 'scenario-1',
    calendar: {
      weekly_rest_days: [...(input.weekly_rest_days ?? [6, 0])].sort((a, b) => a - b),
      holidays: [...(input.holidays ?? [])].sort(),
    },
    tasks: results,
    links: reported,
    critical_path: criticalPath,
    assumptions,
    unresolved: [...unsupported],
    warnings: [],
  }
}

/** Latest start for a positive duration: the first of `duration` working days ending before the finish boundary. */
function lastOccupiedReverse(calendar: WorkingCalendar, finishBoundaryValue: DayOrdinal, duration: number): DayOrdinal {
  let day = prevWorkingDay(calendar, finishBoundaryValue - 1)
  let occupied = 1
  while (occupied < duration) {
    day = prevWorkingDay(calendar, day - 1)
    occupied += 1
  }
  return day
}

/** Topological order of the supported link graph (the input is already validated acyclic). */
function topologicalOrder(tasks: readonly PreparedTask[], links: readonly SupportedLink[]): PreparedTask[] {
  const indegree = new Map<string, number>()
  const successors = new Map<string, string[]>()
  for (const task of tasks) indegree.set(task.id, 0)
  for (const link of links) {
    indegree.set(link.to, (indegree.get(link.to) as number) + 1)
    successors.set(link.from, [...(successors.get(link.from) ?? []), link.to])
  }
  const queue = tasks.filter(task => (indegree.get(task.id) as number) === 0).map(task => task.id)
  const byId = new Map(tasks.map(task => [task.id, task]))
  const ordered: PreparedTask[] = []
  while (queue.length > 0) {
    const id = queue.shift() as string
    ordered.push(byId.get(id) as PreparedTask)
    for (const next of successors.get(id) ?? []) {
      const remaining = (indegree.get(next) as number) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }
  return ordered
}

/** In-memory store of presented schedule results, keyed by content hash. */
export class ScheduleResultStore {
  private readonly results = new Map<string, ScheduleResult>()

  /**
   * Persist one frozen schedule result under the sha256 of its canonical
   * JSON; re-presenting an identical result returns the same id.
   * @param result - the frozen schedule result.
   * @returns the store key and the stored result.
   */
  put(result: ScheduleResult): { resultId: string; result: ScheduleResult } {
    const canonical = JSON.stringify(result)
    const resultId = createHash('sha256').update(canonical).digest('hex')
    this.results.set(resultId, result)
    return { resultId, result }
  }

  /**
   * Read one stored result.
   * @param resultId - the key returned by {@link put}.
   * @returns the stored result, or undefined for an unknown id.
   */
  get(resultId: string): ScheduleResult | undefined {
    return this.results.get(resultId)
  }
}

const taskParameterSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true, description: 'Unique task id.' },
    name: { type: 'string' },
    duration: { type: 'integer', description: 'Whole-working-day duration; 0 or omitted for a milestone.' },
    locked_start: { type: 'string', description: 'ISO date; locks completed work against rescheduling.' },
    locked_finish: { type: 'string', description: 'ISO date; locks completed work against rescheduling.' },
    start_no_earlier_than: { type: 'string', description: 'ISO date start constraint.' },
    finish_no_later_than: { type: 'string', description: 'ISO date finish constraint (display basis).' },
  },
} as const

const scheduleInputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scenario_id: { type: 'string', description: 'Scenario identifier; revisions should use a new id.' },
    project_start: { type: 'string', description: 'ISO date anchoring the calculation when no constraint or locked start exists.' },
    weekly_rest_days: { type: 'array', items: { type: 'integer' }, description: 'Weekday numbers (0 Sunday to 6 Saturday); defaults to [6, 0].' },
    holidays: { type: 'array', items: { type: 'string' }, description: 'Holiday ISO dates excluded from working time.' },
    tasks: { type: 'array', required: true, items: taskParameterSchema },
    links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string', required: true },
          to: { type: 'string', required: true },
          lag: { type: 'integer', description: 'Finish-to-start lag in whole working days; must be nonnegative.' },
          relation: { type: 'string', description: 'Only FS is supported; other relations are reported, never rewritten.' },
        },
      },
    },
  },
} as const

function scheduleResultSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      schema_version: { type: 'integer', const: 1 },
      calculator_version: { type: 'string' },
      scenario_id: { type: 'string' },
      calendar: { type: 'json' },
      tasks: { type: 'array', items: { type: 'json' } },
      links: { type: 'array', items: { type: 'json' } },
      critical_path: { type: 'json' },
      assumptions: { type: 'array', items: { type: 'string' } },
      unresolved: { type: 'array', items: { type: 'string' } },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  } as const
}

/** Assert that one value is a frozen schedule result from this calculator. */
function assertScheduleResult(value: unknown): asserts value is ScheduleResult {
  const candidate = value as Partial<ScheduleResult> | null
  if (candidate === null || typeof candidate !== 'object'
    || candidate.schema_version !== 1
    || typeof candidate.calculator_version !== 'string'
    || !candidate.calculator_version.startsWith('construction-schedule/')
    || !Array.isArray(candidate.tasks)
    || typeof candidate.scenario_id !== 'string') {
    throw new Error('result is not a frozen schedule result from construction_schedule_calculate')
  }
}

/**
 * Register `construction_schedule_calculate` and `construction_schedule_present`.
 * Both require an active schedule task.
 * @param ctx - the plugin context.
 * @param bindings - the task binding store.
 * @param store - the presented-result store.
 */
export function applyScheduleTools(
  ctx: Context,
  bindings: TaskBindings,
  store: ScheduleResultStore,
): void {
  const requireSchedule = (exec: ToolExecution, taskId: string | undefined): void => {
    bindings.requireTask(bindings.scopeFor(exec.agent), taskId, ['schedule'])
  }

  ctx.tools.register(defineTool({
    name: 'construction_schedule_calculate',
    description: 'Calculate a CPM schedule from tasks, whole-working-day durations, finish-to-start links with nonnegative lags, and one project working calendar. Dates use inclusive-start/exclusive-finish working-day boundaries; the displayed finish is the last working date before the finish boundary. A critical path is claimed only when the logic is complete; unsupported relations are reported, never rewritten. Requires an active schedule task.',
    parameters: {
      input: { ...scheduleInputSchema, required: true, description: 'Schedule input: scenario, calendar, tasks, and links.' },
      task_id: { type: 'string', description: 'Active schedule task binding id.' },
    },
    output: { schema: scheduleResultSchema(), render: (_args, value) => [{ type: 'text', text: renderSchedule(value as unknown as ScheduleResult) }] },
    execute(args, exec) {
      requireSchedule(exec, args.task_id)
      return Promise.resolve(calculateSchedule(args.input as unknown as ScheduleInput) as never)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'construction_schedule_present',
    description: 'Persist a frozen schedule result so the Gantt chart can render it, and return the result identifier with scenario metadata. Re-presenting an identical result returns the same identifier. Requires an active schedule task.',
    parameters: {
      result: { ...scheduleResultSchema(), required: true, description: 'The frozen ScheduleResult from construction_schedule_calculate.' },
      task_id: { type: 'string', description: 'Active schedule task binding id.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          schema_version: { type: 'integer', const: 1 },
          result_id: { type: 'string' },
          scenario_id: { type: 'string' },
          calculator_version: { type: 'string' },
          task_count: { type: 'integer' },
          date_range: { type: 'json' },
          gantt: { type: 'json' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderSchedulePresent(value as unknown as SchedulePresentResult),
      }],
    },
    execute(args, exec) {
      requireSchedule(exec, args.task_id)
      assertScheduleResult(args.result)
      exec.signal.throwIfAborted()
      const { resultId, result } = store.put(args.result)
      const starts = result.tasks.map(task => task.start)
      const finishes = result.tasks.map(task => task.finish)
      return Promise.resolve({
        schema_version: 1 as const,
        result_id: resultId,
        scenario_id: result.scenario_id,
        calculator_version: result.calculator_version,
        task_count: result.tasks.length,
        date_range: {
          start: starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : '',
          finish: finishes.length > 0 ? finishes.reduce((a, b) => (a > b ? a : b)) : '',
        },
        gantt: { kind: 'schedule-result', result_id: resultId },
      })
    },
  }))
}

/** Render one presented-schedule summary. */
function renderSchedulePresent(value: SchedulePresentResult): string {
  return `presented schedule scenario ${value.scenario_id} (${value.task_count} tasks, ${value.date_range.start} to ${value.date_range.finish}) as ${value.result_id}`
}

/** Render one schedule result as a compact task table plus the frozen JSON for verbatim pass-back. */
function renderSchedule(value: ScheduleResult): string {
  const lines = [
    `scenario: ${value.scenario_id}`,
    ...value.tasks.map(task => `task ${task.id}: ${task.start} -> ${task.finish} (${task.duration} wd, float ${task.total_float})${task.is_critical ? ' CRITICAL' : ''}${task.is_milestone ? ' milestone' : ''}${task.locked ? ' locked' : ''}`),
    `critical path: ${value.critical_path === null ? 'not claimed (logic incomplete)' : value.critical_path.join(' -> ')}`,
    ...value.assumptions.map(note => `assumption: ${note}`),
    ...value.unresolved.map(note => `unresolved: ${note}`),
  ]
  return [
    lines.join('\n'),
    '',
    'Frozen result JSON — pass it back verbatim to construction_schedule_present or construction_report_export; never retype, round, or edit its values.',
    JSON.stringify(value, null, 2),
  ].join('\n')
}
