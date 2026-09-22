// @vitest-environment jsdom
/** Plugin registration: tab type, seats, dictionaries, and the per-Session snapshot source. */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import type { ConversationNodeDefinition, ConversationViewDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { apply, GANTT_TAB_ID, GANTT_TAB_KIND, inject, name, NS } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { EMPTY_CONSTRUCTION_GANTT_SNAPSHOT } from '../src/client/contract.ts'
import type { ConstructionGanttSnapshot } from '../src/client/contract.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { /* contexts disposed per mount below */ })

async function mountPlugin() {
  const ctx = new Context()
  const tabs = new SidebarRightTabRegistry(ctx)
  ctx.provide('sidebarRightTabs', tabs)
  const entries: {
    name: string
    key?: string
    locale: string
    component: unknown
    inject: (id: SessionId) => unknown
  }[] = []
  let injectedSeat = 0
  const dictionaries = new Map<string, unknown>()
  const provided: { hooks: readonly string[]; resolve: (binding: unknown) => unknown }[] = []
  const eventDefinitions: ConversationNodeDefinition[] = []
  const viewDefinitions: ConversationViewDefinition[] = []
  const target = {
    getSnapshot: vi.fn((): ConstructionGanttSnapshot | undefined => undefined),
    subscribe: vi.fn(() => () => {}),
  }
  const boundSessions: unknown[] = []
  ctx.provide('slots', {
    inject: (_name: string, register: () => () => void) => { injectedSeat += 1; return register() },
    register: (options: Omit<typeof entries[number], 'component'>, component: unknown) => {
      const entry = { ...options, component }
      entries.push(entry)
      return () => { entries.splice(entries.indexOf(entry), 1) }
    },
  } as never)
  ctx.provide('locale', {
    bind: (namespace: string) => (key: string) => `${namespace}:${key}`,
    register: (namespace: string, values: unknown) => {
      dictionaries.set(namespace, values)
      return () => { dictionaries.delete(namespace) }
    },
  } as never)
  ctx.provide('uiSession', {
    provide: (descriptor: { hooks: readonly string[]; resolve: (binding: unknown) => unknown }) => {
      provided.push(descriptor)
      return () => { provided.splice(provided.indexOf(descriptor), 1) }
    },
  } as never)
  ctx.provide('uiConversation', {
    events: {
      register: (definition: ConversationNodeDefinition) => {
        eventDefinitions.push(definition)
        return () => { eventDefinitions.splice(eventDefinitions.indexOf(definition), 1) }
      },
    },
    views: {
      register: (definition: ConversationViewDefinition) => {
        viewDefinitions.push(definition)
        return () => { viewDefinitions.splice(viewDefinitions.indexOf(definition), 1) }
      },
    },
    binding: (source: unknown) => {
      boundSessions.push(source)
      return { target: (targetName: string) => {
        expect(targetName).toBe('constructionGantt')
        return target
      } }
    },
  } as never)
  const fiber = await ctx.plugin({ name, inject, apply })
  return {
    ctx, tabs, entries, dictionaries, provided, eventDefinitions, viewDefinitions, target, boundSessions,
    async dispose() { await fiber.dispose(); await ctx.fiber.dispose() },
  }
}

it('registers the type, dictionaries, seats, definition, and snapshot source', async () => {
  const app = await mountPlugin()
  try {
    expect(app.dictionaries.get(NS)).toEqual({ zh, en })
    const type = app.tabs.entries().find(definition => definition.id === GANTT_TAB_ID)
    expect(type).toMatchObject({ id: GANTT_TAB_ID, kind: GANTT_TAB_KIND, priority: 'extension' })
    expect(type?.title('')).toBe(`${NS}:title`)
    expect(type?.guide?.map(entry => entry.id)).toEqual(['open'])
    expect(type?.guide?.[0]?.title()).toBe(`${NS}:title`)
    expect(type?.guide?.[0]?.description?.()).toBe(`${NS}:description`)
    expect(renderToStaticMarkup(createElement(type?.guide?.[0]?.icon ?? (() => null)))).toContain('svg')
    expect(app.eventDefinitions.map(definition => definition.kind)).toEqual(['construction-schedule-result'])
    expect(app.viewDefinitions.map(definition => definition.target)).toEqual(['constructionGantt'])
    expect(app.entries.map(entry => entry.name)).toEqual(['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title'])
    expect(app.entries.every(entry => entry.key === GANTT_TAB_ID && entry.locale === NS)).toBe(true)
    expect(app.provided.map(descriptor => descriptor.hooks)).toEqual([['constructionGantt']])
  } finally {
    await app.dispose()
  }
})

it('resolves per-session snapshot sources that fall back to empty', async () => {
  const app = await mountPlugin()
  try {
    const resolve = app.provided[0]?.resolve
    expect(resolve).toBeDefined()
    const bindingSource = resolve?.({ binding: 'b1' })
    const hook = (bindingSource as {
      hooks: { constructionGantt: { getSnapshot(): unknown; subscribe(l: () => void): () => void } }
    }).hooks.constructionGantt
    expect(hook.getSnapshot()).toEqual(EMPTY_CONSTRUCTION_GANTT_SNAPSHOT)
    const filled: ConstructionGanttSnapshot = { scenarios: [], failures: [], running: true }
    app.target.getSnapshot.mockReturnValue(filled)
    expect(hook.getSnapshot()).toBe(filled)
    const listener = vi.fn()
    expect(hook.subscribe(listener)).toBeTypeOf('function')
    // The same target resolves through the slot inject face too, per session identity.
    const bodyInject = app.entries.find(entry => entry.name === 'sidebar.right.pane.tab')?.inject
    const injected = bodyInject?.('session-1' as SessionId) as { hooks: { constructionGantt: unknown } }
    expect(app.boundSessions).toContain('session-1')
    expect(injected.hooks.constructionGantt).toBe(hook)
    const titleInject = app.entries.find(entry => entry.name === 'sidebar.right.pane.tab.title')?.inject
    const titleInjected = titleInject?.('session-1' as SessionId) as { hooks: { constructionGantt: unknown } }
    expect(titleInjected.hooks.constructionGantt).toBe(hook)
  } finally {
    await app.dispose()
  }
})

it('removes every registration when the plugin disposes', async () => {
  const app = await mountPlugin()
  await app.dispose()
  expect(app.tabs.entries()).toHaveLength(0)
  expect(app.entries).toHaveLength(0)
  expect(app.dictionaries.size).toBe(0)
  expect(app.provided).toHaveLength(0)
  expect(app.eventDefinitions).toHaveLength(0)
  expect(app.viewDefinitions).toHaveLength(0)
})

it('hosts an empty node-half apply', () => {
  expect(() => { hostApply() }).not.toThrow()
})
