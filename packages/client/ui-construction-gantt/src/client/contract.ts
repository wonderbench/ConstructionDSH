/**
 * Read-only model of one `construction_schedule_present` tool result.
 *
 * The Host tool logs these payloads as tool-result text in the Session log;
 * this package validates that text and derives every Gantt input from the
 * validated value. Dates are ISO `YYYY-MM-DD` calendar days; `start` is
 * inclusive and `finish` is the exclusive working-day boundary, so the last
 * displayed working date of a task is the day before its `finish`.
 */
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'

/** Working-day calendar declared by the schedule calculation. */
export interface ScheduleCalendar {
  /** Weekly rest days as JavaScript `Date#getDay` numbers (0 = Sunday). */
  readonly weeklyRestDays: readonly number[]
  /** Holiday dates, ISO `YYYY-MM-DD`. */
  readonly holidays: readonly string[]
}

/** Inclusive-start / exclusive-finish date range of the whole plan. */
export interface ScheduleDateRange {
  /** First scheduled day, ISO `YYYY-MM-DD`. */
  readonly start: string
  /** Exclusive finish boundary, ISO `YYYY-MM-DD`. */
  readonly finish: string
}

/** One scheduled activity. */
export interface ScheduleTask {
  /** Stable activity identity used by links and the critical path. */
  readonly id: string
  /** Human-readable activity name shown in the fixed name column. */
  readonly name: string
  /** Working-day duration. */
  readonly duration: number
  /** First working day, ISO `YYYY-MM-DD`. */
  readonly start: string
  /** Exclusive finish boundary, ISO `YYYY-MM-DD`. */
  readonly finish: string
  /** Total float in working days; zero marks the critical path. */
  readonly totalFloat: number
  /** Whether the activity lies on the calculated critical path. */
  readonly isCritical: boolean
  /** Whether the activity is a zero-duration milestone. */
  readonly isMilestone: boolean
  /** Whether the activity dates are locked against rescheduling. */
  readonly locked: boolean
}

/** One finish-to-start dependency between two activities. */
export interface ScheduleLink {
  /** Predecessor activity id. */
  readonly from: string
  /** Successor activity id. */
  readonly to: string
  /** Lag in working days. */
  readonly lagDays: number
}

/** Validated `schemaVersion: 1` schedule payload. */
export interface ScheduleResultData {
  /** Payload schema version; only `1` is accepted. */
  readonly schemaVersion: 1
  /** Content hash identifying this published scenario. */
  readonly resultId: string
  /** Stable scenario identifier, e.g. `baseline`. */
  readonly scenarioId: string
  /** Human-readable scenario label for selection. */
  readonly scenarioLabel: string
  /** Working-day calendar. */
  readonly calendar: ScheduleCalendar
  /** Planned date range. */
  readonly dateRange: ScheduleDateRange
  /** Activities in display order. */
  readonly tasks: readonly ScheduleTask[]
  /** Dependencies between activities. */
  readonly links: readonly ScheduleLink[]
  /** Critical-path activity ids in path order. */
  readonly criticalPath: readonly string[]
  /** Assumptions the calculation relied on. */
  readonly assumptions: readonly string[]
  /** Unresolved inputs the reader must confirm. */
  readonly unresolved: readonly string[]
  /** Non-fatal calculation warnings. */
  readonly warnings: readonly string[]
}

/** One selectable, validated scenario kept for the current Session only. */
export interface ScheduleScenario extends ScheduleResultData {
  /** Session-log sequence of the tool result that carried this scenario. */
  readonly seq: number
}

/** Why one `construction_schedule_present` result could not produce a chart. */
export type ScheduleFailureReason = 'malformed' | 'error'

/** One failed presentation attempt, kept beside the successful scenarios. */
export interface ScheduleFailure {
  /** Call identity of the failed tool call. */
  readonly callId: string
  /** `malformed` for invalid payloads, `error` for tool errors. */
  readonly reason: ScheduleFailureReason
  /** Session-log sequence of the failed result. */
  readonly seq: number
}

/**
 * Per-Session schedule snapshot folded from the conversation event stream.
 * Every value comes from the current Session's log; a Session switch yields
 * that Session's own snapshot and never another Session's scenarios.
 */
export interface ConstructionGanttSnapshot {
  /** Valid scenarios, latest result first, deduplicated by `resultId`. */
  readonly scenarios: readonly ScheduleScenario[]
  /** Failed presentation attempts, latest first. */
  readonly failures: readonly ScheduleFailure[]
  /** Whether a schedule presentation call is open without a result yet. */
  readonly running: boolean
}

/** Selector hook over the current Session's folded schedule snapshot. */
export type UseConstructionGantt = SnapshotSelectorHook<ConstructionGanttSnapshot>

/** Stable empty snapshot used before the Session has folded any schedule call. */
export const EMPTY_CONSTRUCTION_GANTT_SNAPSHOT: ConstructionGanttSnapshot = {
  scenarios: [],
  failures: [],
  running: false,
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    /** Per-Session schedule scenarios folded from `construction_schedule_present` results. */
    constructionGantt: ConstructionGanttSnapshot
  }
}
