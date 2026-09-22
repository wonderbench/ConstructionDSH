/** Shared `ScheduleResult` fixtures for the Gantt package specs. */
import type { ScheduleResultData, ScheduleScenario, ScheduleTask } from '../src/client/contract.ts'

/** Small two-task plan with one milestone and one critical path. */
export function makeScheduleResult(overrides: Partial<ScheduleResultData> = {}): ScheduleResultData {
  return {
    schemaVersion: 1,
    resultId: 'sha256-baseline',
    scenarioId: 'baseline',
    scenarioLabel: 'Baseline',
    calendar: { weeklyRestDays: [6, 0], holidays: ['2026-10-01'] },
    dateRange: { start: '2026-10-01', finish: '2026-11-16' },
    tasks: [
      { id: 'T1', name: 'Earthworks excavation for the foundation pit', duration: 10, start: '2026-10-02', finish: '2026-10-16', totalFloat: 0, isCritical: true, isMilestone: false, locked: false },
      { id: 'T2', name: 'Foundation concrete pour', duration: 8, start: '2026-10-16', finish: '2026-10-28', totalFloat: 4, isCritical: true, isMilestone: false, locked: false },
      { id: 'M1', name: 'Foundation acceptance', duration: 0, start: '2026-10-28', finish: '2026-10-28', totalFloat: 0, isCritical: true, isMilestone: true, locked: true },
    ],
    links: [{ from: 'T1', to: 'T2', lagDays: 0 }, { from: 'T2', to: 'M1', lagDays: 0 }],
    criticalPath: ['T1', 'T2', 'M1'],
    assumptions: ['Weather allowance excluded'],
    unresolved: ['Confirm rebar delivery date'],
    warnings: [],
    ...overrides,
  }
}

/** The raw tool-result text logged by `construction_schedule_present`. */
export function makeResultText(result: ScheduleResultData = makeScheduleResult()): string {
  return JSON.stringify(result)
}

/** A folded scenario at one Session-log sequence. */
export function makeScenario(seq: number, overrides: Partial<ScheduleResultData> = {}): ScheduleScenario {
  return { ...makeScheduleResult(overrides), seq }
}

function iso(day: number): string {
  const date = new Date(Date.UTC(2026, 9, 1) + day * 86_400_000)
  return date.toISOString().slice(0, 10)
}

/** 105 linked activities across ~210 days for the readability fixture. */
export function makeLargeScheduleResult(): ScheduleResultData {
  const tasks: ScheduleTask[] = []
  for (let index = 1; index <= 105; index += 1) {
    const startDay = (index - 1) * 2
    tasks.push({
      id: `A${index}`,
      name: `Activity ${index} — long descriptive name for truncation checks at narrow widths`,
      duration: 2,
      start: iso(startDay),
      finish: iso(startDay + 2),
      totalFloat: 0,
      isCritical: true,
      isMilestone: index % 35 === 0,
      locked: false,
    })
  }
  const links = tasks.slice(1).map((task, index) => ({ from: `A${index + 1}`, to: task.id, lagDays: 0 }))
  return makeScheduleResult({
    resultId: 'sha256-large',
    scenarioLabel: 'Large plan',
    dateRange: { start: iso(0), finish: iso(212) },
    tasks,
    links,
    criticalPath: tasks.map(task => task.id),
    assumptions: [],
    unresolved: [],
  })
}

/** tool/call event payload for one schedule presentation call. */
export function callEvent(callId: string, seq: number): Record<string, unknown> {
  return {
    seq,
    time: 1_700_000_000_000 + seq,
    type: 'tool/call',
    data: { callId, name: 'construction_schedule_present', arguments: '{}', turn: 1, step: 1 },
  }
}

/** tool/result event payload carrying one text content block. */
export function resultEvent(callId: string, seq: number, text: string, isError = false): Record<string, unknown> {
  return {
    seq,
    time: 1_700_000_000_000 + seq,
    type: 'tool/result',
    data: {
      message: {
        role: 'user',
        content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) }],
        source: { kind: 'tool', callId },
      },
    },
  }
}
