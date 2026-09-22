import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionJob as JobView } from '@deepseek-ai/dsh-api-session-controller/types'
import type { GoalPhase, GoalProjection } from '@deepseek-ai/dsh-goal/client'
// Type-only: pulls the `plan` SessionProjectionMap merge for useProjection('plan').
import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode/client'
import { IconChevronDownOutline14, StateDot, useDismissOnOutsidePointer, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS, type JobKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './JobListAction.module.css'

/** The session's projected goal, injected per session by the plugin body. */
type GoalFace = HostObservable<GoalProjection | null | undefined>

/** Injected business face: the goal projection face of the open session. */
export interface JobListActionInjected {
  /** Goal projection of this session; undefined when the binding is unavailable. */
  goalFace: GoalFace | undefined
}

/** Full props for the session-header background-job action. */
export type JobListActionProps =
  PropsRuntime<'conversation.session.header.actions'> & PropsLocale<typeof NS> & JobListActionInjected

/** Stable empty list so a session with no jobs keeps one array identity. */
const NO_TASKS: readonly JobView[] = []

/** One row of the session's direct-child subagent catalog mirror. */
type CatalogEntry = SessionListState['subagentsByParent'][keyof SessionListState['subagentsByParent']]['entries'][number]

/** A job the registry still holds open, and whose duration therefore ticks. */
function isLive(job: JobView): boolean {
  return job.status === 'running' || job.status === 'stopping'
}

/** Closed-union exhaustiveness fence for the wire status set. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a status is forged */
function assertNever(value: never): never {
  throw new Error(`unhandled job status: ${JSON.stringify(value)}`)
}

/**
 * Status marker semantics. `stopping` and `killed` share the attention color:
 * both mean the work ended (or is ending) on request rather than on its own.
 */
function dotState(status: JobView['status']): StateDotState {
  switch (status) {
    case 'running': return 'ongoing'
    case 'stopping': return 'warning'
    case 'completed': return 'done'
    case 'killed': return 'warning'
    case 'failed': return 'error'
    /* v8 ignore next -- closed wire status union */
    default: return assertNever(status)
  }
}

/** Human status word for the row and its accessible name. */
function statusLabel(status: JobView['status'], t: TranslateNS<typeof NS>): string {
  switch (status) {
    case 'running': return t('status.running')
    case 'stopping': return t('status.stopping')
    case 'completed': return t('status.completed')
    case 'killed': return t('status.killed')
    case 'failed': return t('status.failed')
    /* v8 ignore next -- closed wire status union */
    default: return assertNever(status)
  }
}

/**
 * Elapsed time in at most two adjacent units. A background job that outlives
 * an hour is already exceptional, so hours is the widest unit — beyond that the
 * figure stays in hours rather than growing a day/month vocabulary no producer
 * currently reaches.
 */
function formatDuration(elapsedMs: number, t: TranslateNS<typeof NS>): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1_000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3_600)
  if (hours > 0) return t('duration.hours', { hours, minutes })
  if (minutes > 0) return t('duration.minutes', { minutes, seconds })
  return t('duration.seconds', { seconds })
}

/**
 * Live rows first in start order, then settled rows newest-first. Two jobs
 * that settled in the same millisecond fall back to start order, so the sort
 * never depends on the host's map iteration.
 */
function ordered(jobs: readonly JobView[]): JobView[] {
  return [...jobs].sort((left, right) => {
    const liveLeft = isLive(left)
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1
    if (liveLeft) return left.startedAt - right.startedAt
    const finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt)
    return finished !== 0 ? finished : left.startedAt - right.startedAt
  })
}

/** Locale keys for the live goal phases; a complete goal renders nothing. */
const GOAL_PHASE_KEYS = {
  active: 'goal.phase.active',
  paused: 'goal.phase.paused',
  blocked: 'goal.phase.blocked',
} as const satisfies Record<Exclude<GoalPhase, 'complete'>, JobKey>

type GoalPhaseKey = (typeof GOAL_PHASE_KEYS)[keyof typeof GOAL_PHASE_KEYS]

/** The locale key for a live goal phase; a complete goal renders nothing. */
function goalPhaseKey(phase: GoalPhase): GoalPhaseKey | undefined {
  if (!(phase in GOAL_PHASE_KEYS)) return undefined
  return GOAL_PHASE_KEYS[phase as keyof typeof GOAL_PHASE_KEYS]
}

/**
 * Goal projection read while the popover is open. Subscribing only while
 * open keeps a closed popover from holding a projection listener; the
 * snapshot read on open avoids one frame of stale "not loaded" state.
 */
function useGoalProjection(face: GoalFace | undefined, open: boolean): GoalProjection | null | undefined {
  const [projection, setProjection] = useState<GoalProjection | null | undefined>(undefined)
  useEffect(() => {
    if (!open || face === undefined) return
    setProjection(face.getSnapshot())
    return face.subscribe(() => { setProjection(face.getSnapshot()) })
  }, [face, open])
  return projection
}

/**
 * Whether plan mode is effectively in force, folding the pending selection
 * the same way the composer plan chip does (`pending ? !active : active`),
 * so the summary never disagrees with the chip.
 */
function planModeOn(plan: PlanProjection | undefined): boolean {
  return plan !== undefined && (plan.pending ? !plan.active : plan.active)
}

/** Status marker for one catalog row: live children tick, diagnostics warn. */
function subagentDot(entry: CatalogEntry): StateDotState {
  if (entry.kind === 'diagnostic') return 'warning'
  return entry.activity === 'running' ? 'ongoing' : 'done'
}

/** Locale-owned label for a catalog row: child label, else durable id. */
function subagentLabel(entry: CatalogEntry, t: TranslateNS<typeof NS>): string {
  if (entry.kind === 'diagnostic') {
    switch (entry.reason) {
      case 'corrupt': return t('subagent.reason.corrupt')
      case 'unavailable': return t('subagent.reason.unavailable')
      case 'unsupported': return t('subagent.reason.unsupported')
      /* v8 ignore next -- closed wire reason union */
      default: return assertNever(entry.reason)
    }
  }
  return entry.label ?? entry.id
}

/**
 * Session-header entry point for this session's background jobs. It renders
 * nothing at all until the session has at least one job, so an ordinary
 * conversation never grows a control for a capability it is not using.
 * The open popover is the session's read-only status aggregation: the
 * pending-confirmation notice first, then the live goal, plan mode, the
 * direct-child subagent catalog mirror, and finally the job rows. Every
 * section hides when its source is absent rather than faking an empty one.
 * @param props - runtime slot currency plus the namespace translator.
 * @returns the trigger and its popover list, or null when there is nothing to show.
 */
export function JobListAction({ sessionId, useSessions, useSessionStatus, useProjection, goalFace, t }: JobListActionProps) {
  const jobs = useSessions(state => state.jobsBySession[sessionId]) ?? NO_TASKS
  const catalog = useSessions(state => state.subagentsByParent[sessionId])
  const pending = useSessionStatus(snapshot => snapshot.get(sessionId)?.pendingInteraction)
  const plan = useProjection('plan')
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const goal = useGoalProjection(goalFace, open)

  const rows = useMemo(() => ordered(jobs), [jobs])
  const liveCount = useMemo(() => jobs.filter(isLive).length, [jobs])

  useDismissOnOutsidePointer(rootRef, open, setOpen)

  // The clock only runs while an open list is showing something that moves.
  useEffect(() => {
    if (!open || liveCount === 0) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [open, liveCount])

  // The last job disappearing removes this control; close first so focus does
  // not vanish from an unmounting node.
  useEffect(() => {
    if (jobs.length === 0 && open) setOpen(false)
  }, [jobs.length, open])

  if (jobs.length === 0) return null

  const countKey = liveCount > 0
    ? (liveCount === 1 ? 'count.live.one' : 'count.live.other')
    : (jobs.length === 1 ? 'count.idle.one' : 'count.idle.other')
  const countLabel = t(countKey, { count: liveCount > 0 ? liveCount : jobs.length })

  // Live goal phases only; a complete goal renders nothing, mirroring GoalBar.
  let goalSection: ReactNode = null
  if (goal != null) {
    const phaseKey = goalPhaseKey(goal.goal.phase)
    if (phaseKey !== undefined) {
      goalSection = (
        <div className={css.goal} role="note" aria-label={t('goal.section')}>
          <span className={css.goalPhase}>{t(phaseKey)}</span>
          <span className={css.goalObjective} title={goal.goal.objective}>{goal.goal.objective}</span>
        </div>
      )
    }
  }

  // The highest-precedence pending interaction awaiting this session's user.
  const pendingSection: ReactNode = pending !== undefined
    ? (
      <div className={css.pending} role="note" aria-label={t('pending.section')}>
        <StateDot state="warning" className={css.rowDot} />
        <span className={css.pendingLabel}>{t('pending.label')}</span>
      </div>
    )
    : null

  const planSection: ReactNode = planModeOn(plan)
    ? (
      <div className={css.plan} role="note" aria-label={t('plan.section')}>
        <span className={css.planChip}>{t('plan.modeOn')}</span>
      </div>
    )
    : null

  // The catalog mirror is populated by whichever consumer requested the
  // listing (the header lineage dropdown, a sidebar chat); this package
  // issues no RPC of its own, so the section appears once that read lands.
  const subagentSection: ReactNode = catalog !== undefined && catalog.entries.length > 0
    ? (
      <ul className={css.subagents} aria-label={t('subagent.section')}>
        {catalog.entries.map(entry => (
          <li key={entry.id} className={css.row}>
            <StateDot state={subagentDot(entry)} className={css.rowDot} />
            {entry.kind === 'child'
              ? <span className={css.kind}>{t(entry.mode === 'one-shot' ? 'subagent.mode.one-shot' : 'subagent.mode.continuable')}</span>
              : null}
            <span className={css.subagentLabel} title={subagentLabel(entry, t)}>{subagentLabel(entry, t)}</span>
            {entry.kind === 'child'
              ? <span className={css.status}>{t(entry.activity === 'running' ? 'subagent.activity.running' : 'subagent.activity.inactive')}</span>
              : null}
          </li>
        ))}
      </ul>
    )
    : null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-expanded={open}
        aria-label={countLabel}
        onClick={() => {
          // Sample the clock in the same commit that opens the list: the
          // mount-time value predates every job, so the first painted frame
          // would otherwise clamp a long-running row to zero until the
          // open effect corrects it a frame later.
          setNow(Date.now())
          setOpen(current => !current)
        }}
      >
        {liveCount > 0 ? <StateDot state="ongoing" className={css.triggerDot} /> : null}
        <span className={css.count}>{countLabel}</span>
        <IconChevronDownOutline14 className={open ? css.triggerOpen : undefined} />
      </button>
      {open
        ? (
          <div className={css.menu}>
            {pendingSection}
            {goalSection}
            {planSection}
            {subagentSection}
            <ul className={css.menuList} aria-label={t('list.aria')}>
              {rows.map((job) => {
                const live = isLive(job)
                const elapsed = live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt
                const duration = formatDuration(elapsed, t)
                const status = statusLabel(job.status, t)
                return (
                  <li key={job.id} className={live ? css.row : `${css.row} ${css.rowSettled}`}>
                    <StateDot state={dotState(job.status)} className={css.rowDot} />
                    <span className={css.kind}>{job.kind}</span>
                    <span className={css.label} title={job.label}>{job.label}</span>
                    <span className={css.status} title={job.detail ?? status}>{job.detail ?? status}</span>
                    <span
                      className={css.duration}
                      title={t(live ? 'duration.title.live' : 'duration.title.done', { duration })}
                    >
                      {duration}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
        : null}
    </div>
  )
}
