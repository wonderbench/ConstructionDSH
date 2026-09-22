/**
 * Background-job plugin, browser half: contributes one session-header action
 * that renders this session's jobs. Job rows, per-row observation streams,
 * and the human kill all go through the `jobs` client service; the open
 * popover also aggregates the session's read-only status — pending
 * confirmation, live goal, plan mode, and the direct-child subagent catalog —
 * each section drawn only from its real source. The plugin itself holds no
 * transport state of its own.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type { GoalProjection } from '@deepseek-ai/dsh-goal/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { JobListAction } from './JobListAction.tsx'
import type { JobListInjected } from './JobListAction.tsx'
import type {} from '@deepseek-ai/dsh-api-job-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { en, NS, zh, type JobKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Background-job list copy. */
    'job': JobKey
  }
}

export type { JobListActionProps, JobListInjected } from './JobListAction.tsx'

/**
 * Required services: the sessions bindings behind the goal face, the jobs
 * rosters, observations, and kill, the slot registry, and dictionaries.
 */
export const inject = ['sessions', 'jobs', 'slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the header action.
 * The action's inject face carries this session's goal projection so the
 * popover can summarize it read-only; the plugin itself still issues no RPC.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-jobs: dictionaries')
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'job-list',
      // Between the preset label and the subagent catalog (order 30): running
      // work reads before the session lineage.
      order: 20,
      locale: NS,
      inject: (sessionId): JobListInjected => ({
        hooks: { jobs: ctx.jobs.state },
        watchRows: id => ctx.jobs.watchRows(id),
        observe: (id, jobId) => ctx.jobs.observe(id, jobId),
        // The brand is nominal typing only; the row key is the registry id the
        // roster stream delivered, so the wire boundary stamps it back here.
        killJob: async (id, jobId) => (await ctx.jobs.kill(id, jobId as JobId)).ok,
        goalFace: ctx.sessions.binding(sessionId)?.session.projections.faceOf('goal') as
          | HostObservable<GoalProjection | null | undefined>
          | undefined,
      }),
    }, JobListAction),
  )
}
