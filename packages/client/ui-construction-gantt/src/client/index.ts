/**
 * Browser half: register the read-only construction Gantt as a right-Sidebar
 * page tab fed by the current Session's `construction_schedule_present` tool
 * results. The tab reaches the Sidebar through its public path only — the
 * type registry, the keyed body/title seats, and the locale dictionaries —
 * and the schedule snapshot arrives as a framework-bound session hook through
 * `ctx.uiSession.provide`, folded from the Session's own conversation events
 * so a Session switch never shows another Session's scenarios.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'sidebar.right.pane.tab' SlotMap rows must be in the program.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// Type-only: the Conversation registries' Context merge (ctx.uiConversation).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the session source provider's Context merge (ctx.uiSession).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: the slots Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { GanttBody } from './GanttBody.tsx'
import { GanttTitle } from './GanttTitle.tsx'
import { GanttGuideIcon } from './GanttGuideIcon.tsx'
import type { GanttBodyInjected, GanttTitleInjected } from './face.ts'
import { EMPTY_CONSTRUCTION_GANTT_SNAPSHOT } from './contract.ts'
import type { ConstructionGanttSnapshot } from './contract.ts'
import { registerConstructionScheduleDefinition } from './definition.ts'
import { en, zh } from './locales.ts'

/** Loader-visible plugin name. */
export const name = 'ui-construction-gantt'

/** This package's copy namespace. */
export const NS = 'constructionGantt'

/** Tab-type identity shared by the type, body, and title registrations. */
export const GANTT_TAB_ID = '@deepseek-ai/dsh-client-ui-construction-gantt'

/** Tab kind other callers name to open this page. */
export const GANTT_TAB_KIND = 'construction-gantt'

/** Required services: the sidebar tab registry, the slots, copy, the Session source provider, and Conversation assembly. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'uiSession', 'uiConversation']

/**
 * Register the tab type, its seats, its dictionaries, and the per-Session
 * schedule snapshot source.
 * @param ctx - Client root context carrying the sidebar, slots, copy, and Conversation services.
 */
export function apply(ctx: Context): void {
  registerConstructionScheduleDefinition(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-construction-gantt: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: GANTT_TAB_ID,
    kind: GANTT_TAB_KIND,
    priority: 'extension',
    title: () => t('title'),
    guide: [{
      id: 'open',
      order: 30,
      title: () => t('title'),
      description: () => t('description'),
      icon: GanttGuideIcon,
    }],
  }), 'ui-construction-gantt: tab type')
  const sources = new WeakMap<ObservableSnapshot<ConstructionGanttSnapshot | undefined>, ObservableSnapshot<ConstructionGanttSnapshot>>()
  const source = (target: ObservableSnapshot<ConstructionGanttSnapshot | undefined>): ObservableSnapshot<ConstructionGanttSnapshot> => {
    let cached = sources.get(target)
    if (cached === undefined) {
      cached = {
        getSnapshot: () => target.getSnapshot() ?? EMPTY_CONSTRUCTION_GANTT_SNAPSHOT,
        subscribe: listener => target.subscribe(listener),
      }
      sources.set(target, cached)
    }
    return cached
  }
  const disposeScheduleSource = ctx.uiSession.provide({
    hooks: ['constructionGantt'],
    resolve: binding => ({ hooks: { constructionGantt: source(ctx.uiConversation.binding(binding).target('constructionGantt')) } }),
  })
  ctx.effect(() => disposeScheduleSource, 'ui-construction-gantt: session source')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: GANTT_TAB_ID, locale: NS,
      inject: (sessionId: SessionId): GanttBodyInjected =>
        ({ hooks: { constructionGantt: source(ctx.uiConversation.binding(sessionId).target('constructionGantt')) } }) },
    GanttBody,
  )), 'ui-construction-gantt: body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: GANTT_TAB_ID, locale: NS,
      inject: (sessionId: SessionId): GanttTitleInjected =>
        ({ hooks: { constructionGantt: source(ctx.uiConversation.binding(sessionId).target('constructionGantt')) } }) },
    GanttTitle,
  )), 'ui-construction-gantt: title')
}
