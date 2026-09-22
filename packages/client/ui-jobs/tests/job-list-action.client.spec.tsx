// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  SessionListState,
  SubagentCatalogSnapshot,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionJob as JobView } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { GoalId } from '@deepseek-ai/dsh-goal'
import type { GoalProjection } from '@deepseek-ai/dsh-goal/client'
import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { JobListAction, type JobListActionProps } from '../src/client/JobListAction.tsx'
import { zh } from '../src/client/locales.ts'

// Live rows render `now - startedAt`, so every assertion needs a pinned clock.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const SESSION = 'session' as SessionId
const START = 1_700_000_000_000
const t: JobListActionProps['t'] = makeTranslate(zh)

function job(over: Partial<JobView> = {}): JobView {
  return {
    id: 'bash-1' as JobView['id'],
    kind: 'bash',
    label: 'pnpm run build',
    status: 'running',
    startedAt: START,
    ...over,
  }
}

function goalProjection(over: Partial<GoalProjection['goal']> = {}): GoalProjection {
  return {
    goal: {
      id: GoalId('goal-1'),
      revision: 1,
      objective: '拆解这批图纸',
      phase: 'active',
      maxGoalRounds: 3,
      ...over,
    },
    roundsStarted: 0,
    createdAt: START,
    updatedAt: START,
  }
}

function goalFace(projection: GoalProjection | null): HostObservable<GoalProjection | null> {
  return {
    getSnapshot: () => projection,
    subscribe: () => () => {},
  }
}

/** One catalog row, as folded by the Session Controller's subagent listing. */
type CatalogEntry = SubagentCatalogSnapshot['entries'][number]

/**
 * Child-row overrides a test may set. The built literal is re-narrowed to the
 * catalog union: a `mode: 'continuable'` override also requires a label, which
 * the per-call object literal already supplies.
 */
function childEntry(over: Partial<{
  readonly id: SessionId
  readonly activity: 'running' | 'inactive'
  readonly hasChildren: boolean
  readonly mode: 'one-shot' | 'continuable'
  readonly label: string
}> = {}): CatalogEntry {
  return {
    kind: 'child',
    id: 'child-1' as SessionId,
    activity: 'running',
    hasChildren: false,
    mode: 'one-shot',
    ...over,
  } as CatalogEntry
}

function diagnosticEntry(
  reason: Extract<CatalogEntry, { kind: 'diagnostic' }>['reason'],
  id = 'child-x',
): CatalogEntry {
  return { kind: 'diagnostic', id: id as SessionId, reason }
}

function catalog(entries: readonly CatalogEntry[]): SubagentCatalogSnapshot {
  return { entries, state: 'ready', error: null }
}

/** Optional aggregation sources beyond jobs and the goal. */
interface StatusOptions {
  /** Value returned by the `plan` projection seat; absent when undefined. */
  plan?: PlanProjection
  /** Whether the session has a pending interaction awaiting its user. */
  pending?: boolean
  /** Direct-child catalog mirror for this session. */
  catalog?: SubagentCatalogSnapshot
}

function props(
  jobs: readonly JobView[] | undefined,
  goal?: GoalProjection | null,
  options: StatusOptions = {},
): JobListActionProps {
  const state = {
    ids: [SESSION],
    byId: {},
    phase: 'ready',
    subagentsByParent: options.catalog === undefined ? {} : { [SESSION]: options.catalog },
    jobsBySession: jobs === undefined ? {} : { [SESSION]: jobs },
  } satisfies SessionListState
  const status: SessionStatusSnapshot = options.pending === true
    ? new Map([[SESSION, {
      running: true,
      pendingInteraction: { key: 'approval:1', kind: 'approval', sessionId: SESSION },
      completionUnread: false,
    }]])
    : new Map()
  function useSessions<T>(select: (snapshot: SessionListState) => T): T {
    return select(state)
  }
  function useSessionStatus<T>(select: (snapshot: SessionStatusSnapshot) => T): T {
    return select(status)
  }
  function useProjection(key: 'plan' | 'goal'): PlanProjection | undefined {
    return key === 'plan' ? options.plan : undefined
  }
  return {
    sessionId: SESSION,
    useSessions,
    useSessionStatus,
    useProjection,
    t,
    goalFace: goal === undefined ? undefined : goalFace(goal),
  } as unknown as JobListActionProps
}

/**
 * Rows in render order as `[kind, label, status, duration]`. Adjacent spans
 * carry no whitespace between them, so the cells are read one element at a
 * time rather than split out of a flattened string.
 */
function rowCells(): string[][] {
  return within(screen.getByRole('list', { name: zh['list.aria'] }))
    .getAllByRole('listitem')
    .map(row => [...row.children]
      .map(cell => cell.textContent ?? '')
      .filter(text => text !== ''))
}

describe('JobListAction visibility', () => {
  it('renders nothing while the session has no jobs', () => {
    const { container } = render(<JobListAction {...props(undefined)} />)
    expect(container.innerHTML).toBe('')
  })

  it('counts only live jobs, and falls back to the total when none are live', () => {
    const { rerender } = render(<JobListAction {...props([job(), job({ id: 'bash-2' as JobView['id'] })])} />)
    expect(screen.getByRole('button', { name: '2 个后台任务运行中' })).toBeDefined()

    rerender(<JobListAction {...props([job({ status: 'completed', finishedAt: START + 3_000 })])} />)
    expect(screen.getByRole('button', { name: '1 个后台任务' })).toBeDefined()
  })

  it('closes and unmounts when the last job disappears while the list is open', () => {
    const { container, rerender } = render(<JobListAction {...props([job()])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('list', { name: zh['list.aria'] })).toBeDefined()

    rerender(<JobListAction {...props([])} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('JobListAction goal summary', () => {
  it('shows the objective and phase above the rows while the list is open', () => {
    render(<JobListAction {...props([job()], goalProjection())} />)
    fireEvent.click(screen.getByRole('button'))
    const section = screen.getByRole('note', { name: '当前目标' })
    expect(section.textContent).toContain('拆解这批图纸')
    expect(section.textContent).toContain('进行中')
    expect(screen.getByRole('list', { name: zh['list.aria'] })).toBeDefined()
  })

  it('renders no goal section without a projection, with none set, or when complete', () => {
    const noFace = render(<JobListAction {...props([job()])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('note')).toBeNull()
    cleanup()

    const none = render(<JobListAction {...props([job()], null)} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('note')).toBeNull()
    cleanup()

    const complete = render(<JobListAction {...props([job()], goalProjection({ phase: 'complete' }))} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('note')).toBeNull()
    noFace.unmount()
    none.unmount()
    complete.unmount()
  })

  it('follows a goal change while the popover stays open', () => {
    let projection: GoalProjection | null = goalProjection()
    const listeners = new Set<() => void>()
    const face: HostObservable<GoalProjection | null> = {
      getSnapshot: () => projection,
      subscribe: (fn) => {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
    }
    const state = {
      ids: [SESSION], byId: {}, phase: 'ready', subagentsByParent: {},
      jobsBySession: { [SESSION]: [job()] },
    } satisfies SessionListState
    function useSessions<T>(select: (snapshot: SessionListState) => T): T {
      return select(state)
    }
    function useSessionStatus<T>(select: (snapshot: SessionStatusSnapshot) => T): T {
      return select(new Map())
    }
    function useProjection(_key: 'plan' | 'goal'): PlanProjection | undefined {
      return undefined
    }
    render(<JobListAction {...{
      sessionId: SESSION, useSessions, useSessionStatus, useProjection, t, goalFace: face,
    } as unknown as JobListActionProps} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('note', { name: '当前目标' }).textContent).toContain('进行中')
    projection = goalProjection({ phase: 'blocked' })
    act(() => { for (const listener of listeners) listener() })
    expect(screen.getByRole('note', { name: '当前目标' }).textContent).toContain('已阻塞')
  })
})

describe('JobListAction rows', () => {
  it('orders live jobs by start, then settled jobs newest-first', () => {
    render(<JobListAction {...props([
      job({ id: 'bash-3' as JobView['id'], label: 'old done', status: 'completed', startedAt: START, finishedAt: START + 1_000 }),
      job({ id: 'bash-4' as JobView['id'], label: 'new done', status: 'failed', startedAt: START, finishedAt: START + 9_000 }),
      job({ id: 'bash-2' as JobView['id'], label: 'later live', startedAt: START + 5_000 }),
      job({ id: 'bash-1' as JobView['id'], label: 'earlier live', startedAt: START }),
    ])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(rowCells()).toEqual([
      ['bash', 'earlier live', '运行中', '0秒'],
      ['bash', 'later live', '运行中', '0秒'],
      ['bash', 'new done', '已失败', '9秒'],
      ['bash', 'old done', '已完成', '1秒'],
    ])
  })

  it('breaks a settled tie on start order so map iteration never decides it', () => {
    render(<JobListAction {...props([
      job({ id: 'bash-2' as JobView['id'], label: 'second', status: 'completed', startedAt: START + 10, finishedAt: START + 100 }),
      job({ id: 'bash-1' as JobView['id'], label: 'first', status: 'completed', startedAt: START, finishedAt: START + 100 }),
    ])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(rowCells().map(cells => cells[1])).toEqual(['first', 'second'])
  })

  it('prefers the producer detail over the generic status word', () => {
    render(<JobListAction {...props([
      job({ status: 'killed', detail: 'signal: SIGTERM', finishedAt: START + 2_000 }),
    ])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(rowCells()[0]).toContain('signal: SIGTERM')
  })

  it('renders every status word, including the stopping transition', () => {
    render(<JobListAction {...props([
      job({ id: 'bash-1' as JobView['id'], label: 'a', status: 'running' }),
      job({ id: 'bash-2' as JobView['id'], label: 'b', status: 'stopping' }),
      job({ id: 'bash-3' as JobView['id'], label: 'c', status: 'completed', finishedAt: START }),
      job({ id: 'bash-4' as JobView['id'], label: 'd', status: 'killed', finishedAt: START }),
      job({ id: 'bash-5' as JobView['id'], label: 'e', status: 'failed', finishedAt: START }),
    ])} />)
    fireEvent.click(screen.getByRole('button'))
    const words = rowCells().map(cells => cells[2])
    expect(new Set(words)).toEqual(new Set(['运行中', '正在停止', '已完成', '已取消', '已失败']))
  })
})

describe('JobListAction duration', () => {
  it('advances a live row once per second and freezes a settled one', () => {
    vi.setSystemTime(START + 1_000)
    render(<JobListAction {...props([
      job({ id: 'bash-1' as JobView['id'], label: 'live' }),
      job({ id: 'bash-2' as JobView['id'], label: 'done', status: 'completed', finishedAt: START + 4_000 }),
    ])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(rowCells()[0]).toContain('1秒')
    expect(rowCells()[1]).toContain('4秒')

    act(() => { vi.advanceTimersByTime(2_000) })
    expect(rowCells()[0]).toContain('3秒')
    expect(rowCells()[1]).toContain('4秒')
  })

  it('widens to minutes and then hours, and never shows a negative figure', () => {
    render(<JobListAction {...props([
      job({ id: 'bash-1' as JobView['id'], label: 'm', status: 'completed', finishedAt: START + 125_000 }),
      job({ id: 'bash-2' as JobView['id'], label: 'h', status: 'completed', finishedAt: START + 7_380_000 }),
      // A clock that moved backwards must not render a negative duration.
      job({ id: 'bash-3' as JobView['id'], label: 'skew', status: 'completed', startedAt: START + 5_000, finishedAt: START }),
    ])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(rowCells().map(cells => cells[3])).toEqual(['2小时3分', '2分5秒', '0秒'])
  })

  it('runs no clock while the list is closed', () => {
    const interval = vi.spyOn(globalThis, 'setInterval')
    render(<JobListAction {...props([job()])} />)
    expect(interval).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button'))
    expect(interval).toHaveBeenCalledTimes(1)
  })

  it('runs no clock for an open list holding only settled jobs', () => {
    const interval = vi.spyOn(globalThis, 'setInterval')
    render(<JobListAction {...props([job({ status: 'completed', finishedAt: START })])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(interval).not.toHaveBeenCalled()
  })
})

describe('JobListAction dismissal', () => {
  it('closes on Escape and returns focus to the trigger', () => {
    render(<JobListAction {...props([job()])} />)
    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('ignores other keys and a closed-list Escape', () => {
    render(<JobListAction {...props([job()])} />)
    const trigger = screen.getByRole('button')
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes on an outside pointer press but not on one inside', () => {
    render(<JobListAction {...props([job()])} />)
    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)

    fireEvent.pointerDown(screen.getByRole('list', { name: zh['list.aria'] }))
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.pointerDown(document.body)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('JobListAction wire tolerance', () => {
  it('treats a settled job with no finishedAt as zero-duration and sorts it by start', () => {
    // `finishedAt` is optional on the wire; the Host always sets it, so this
    // covers a producer or carrier that ever stops doing so.
    render(<JobListAction {...props([
      job({ id: 'bash-1' as JobView['id'], label: 'no finish', status: 'completed' }),
      job({ id: 'bash-2' as JobView['id'], label: 'finished', status: 'completed', startedAt: START - 1_000, finishedAt: START + 2_000 }),
    ])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(rowCells().map(cells => [cells[1], cells[3]])).toEqual([
      ['finished', '3秒'],
      ['no finish', '0秒'],
    ])
  })

  it('falls back to start order when neither settled job carries a finish time', () => {
    render(<JobListAction {...props([
      job({ id: 'bash-2' as JobView['id'], label: 'later', status: 'failed', startedAt: START + 1_000 }),
      job({ id: 'bash-1' as JobView['id'], label: 'earlier', status: 'failed', startedAt: START }),
    ])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(rowCells().map(cells => cells[1])).toEqual(['later', 'earlier'])
  })
})

describe('JobListAction pending confirmation', () => {
  it('shows the notice first when an interaction awaits the user', () => {
    render(<JobListAction {...props([job()], undefined, { pending: true })} />)
    fireEvent.click(screen.getByRole('button'))
    const section = screen.getByRole('note', { name: zh['pending.section'] })
    expect(section.textContent).toContain('需要你确认')
  })

  it('renders no notice when nothing is pending', () => {
    render(<JobListAction {...props([job()])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('note', { name: zh['pending.section'] })).toBeNull()
  })

  it('orders the pending notice ahead of the goal section', () => {
    render(<JobListAction {...props([job()], goalProjection(), { pending: true })} />)
    fireEvent.click(screen.getByRole('button'))
    const names = screen.getAllByRole('note').map(note => note.getAttribute('aria-label'))
    expect(names).toEqual([zh['pending.section'], zh['goal.section']])
  })
})

describe('JobListAction plan state', () => {
  it('shows plan mode while the effective target is plan mode', () => {
    render(<JobListAction {...props([job()], undefined, { plan: { active: true, pending: false } })} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('note', { name: zh['plan.section'] }).textContent).toContain('计划模式')
  })

  it('shows plan mode while a selection is turning it on', () => {
    render(<JobListAction {...props([job()], undefined, { plan: { active: false, pending: true } })} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('note', { name: zh['plan.section'] }).textContent).toContain('计划模式')
  })

  it('renders no plan row without the capability, while off, or while turning off', () => {
    const off = render(<JobListAction {...props([job()])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('note', { name: zh['plan.section'] })).toBeNull()
    cleanup()

    const inactive = render(<JobListAction {...props([job()], undefined, { plan: { active: false, pending: false } })} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('note', { name: zh['plan.section'] })).toBeNull()
    cleanup()

    render(<JobListAction {...props([job()], undefined, { plan: { active: true, pending: true } })} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('note', { name: zh['plan.section'] })).toBeNull()
    off.unmount()
    inactive.unmount()
  })
})

describe('JobListAction subagent catalog', () => {
  it('renders no subagent section without a loaded catalog or with an empty one', () => {
    const none = render(<JobListAction {...props([job()])} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('list', { name: zh['subagent.section'] })).toBeNull()
    cleanup()

    render(<JobListAction {...props([job()], undefined, { catalog: catalog([]) })} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('list', { name: zh['subagent.section'] })).toBeNull()
    none.unmount()
  })

  it('renders child rows with mode chip, label, and activity word', () => {
    render(<JobListAction {...props([job()], undefined, {
      catalog: catalog([
        childEntry({ id: 'child-1' as SessionId, label: '图纸拆解', activity: 'running' }),
        childEntry({
          id: 'child-2' as SessionId, mode: 'continuable', label: '资料整理', activity: 'inactive',
        }),
      ]),
    })} />)
    fireEvent.click(screen.getByRole('button'))
    const rows = within(screen.getByRole('list', { name: zh['subagent.section'] }))
      .getAllByRole('listitem')
      .map(row => [...row.children].map(cell => cell.textContent ?? '').filter(text => text !== ''))
    expect(rows).toEqual([
      ['一次性', '图纸拆解', '运行中'],
      ['可继续', '资料整理', '未运行'],
    ])
  })

  it('falls back to the durable id when a one-shot child has no label', () => {
    render(<JobListAction {...props([job()], undefined, {
      catalog: catalog([childEntry({ id: 'child-9' as SessionId })]),
    })} />)
    fireEvent.click(screen.getByRole('button'))
    const row = within(screen.getByRole('list', { name: zh['subagent.section'] })).getByRole('listitem')
    expect(row.textContent).toContain('child-9')
  })

  it('renders every diagnostic reason without a mode chip or activity word', () => {
    render(<JobListAction {...props([job()], undefined, {
      catalog: catalog([
        diagnosticEntry('corrupt', 'child-a'),
        diagnosticEntry('unavailable', 'child-b'),
        diagnosticEntry('unsupported', 'child-c'),
      ]),
    })} />)
    fireEvent.click(screen.getByRole('button'))
    const rows = within(screen.getByRole('list', { name: zh['subagent.section'] }))
      .getAllByRole('listitem')
      .map(row => [...row.children].map(cell => cell.textContent ?? '').filter(text => text !== ''))
    expect(rows).toEqual([['记录损坏'], ['暂不可读'], ['无法支持']])
  })
})
