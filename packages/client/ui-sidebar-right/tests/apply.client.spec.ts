/**
 * The plugin's wiring, and its removal when the plugin goes.
 *
 * The registry and the navigation controller are real, because "provided"
 * means what those faces do; the slot, locale, frame, and resource faces are
 * recorders, because what matters here is what was handed to them — two seats
 * over one store, the guide's body under its own id, the frame reports, the
 * service binding — and that every registration is gone after dispose, which
 * is what makes a reload safe. The seats' components have their own specs.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ResourceSnapshot } from '@deepseek-ai/dsh-client-resources/client'
import { apply, inject } from '../src/client/index.ts'
import type { GuideInjected, RestoreNoticeInjected, SidebarRightInjected } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { SidebarRightController } from '../src/client/service.ts'
import { SidebarRightTabRegistry } from '../src/client/tab-registry.ts'
import type { createSidebarRightStore } from '../src/client/stores.ts'
import * as sidebarStores from '../src/client/stores.ts'
import { RightbarSeat } from '../src/client/shell/SidebarRight.tsx'
import { RightbarRoot } from '../src/client/shell/RightbarRoot.tsx'
import { ExpandButton } from '../src/client/shell/ExpandButton.tsx'
import { RestoreNotice } from '../src/client/shell/RestoreNotice.tsx'
import { GuideBody } from '../src/client/tabs/guide/GuideBody.tsx'
import { GuideTitle } from '../src/client/tabs/guide/GuideTitle.tsx'
import { GUIDE_ID } from '../src/client/tabs/guide/definition.ts'
import { en, zh } from '../src/client/locales.ts'

const SESSION = 's-test' as SessionId

interface Recorded {
  name: string
  key?: string
  locale?: string
  store?: unknown
  children?: unknown
  inject?: (sessionId: SessionId) => unknown
  component: unknown
}

async function boot() {
  const ctx = new Context()
  const registered: Recorded[] = []
  const slots = {
    inject: vi.fn((_name: string, register: Parameters<SlotRegistry['inject']>[1]) => ctx.effect(register)),
    register: vi.fn((options: Omit<Recorded, 'component'>, component: unknown) => {
      const entry: Recorded = { ...options, component }
      registered.push(entry)
      return () => { registered.splice(registered.indexOf(entry), 1) }
    }),
  }
  const dictionaries = new Map<string, unknown>()
  const locale = {
    // Copy is the dictionary's contract; the key stands in for the translation.
    bind: vi.fn(() => (key: string) => key),
    register: vi.fn((ns: string, dicts: unknown) => {
      dictionaries.set(ns, dicts)
      return () => { dictionaries.delete(ns) }
    }),
  }
  const layout = { openRightbar: vi.fn(), closeRightbar: vi.fn() }
  const resources = {
    pin: vi.fn<(address: string, signal: AbortSignal) => void>(),
    source: vi.fn<(address: string) => unknown>(),
  }
  ctx.provide('slots', slots as never)
  ctx.provide('locale', locale as never)
  ctx.provide('layout', layout as never)
  ctx.provide('resources', resources as never)
  ctx.provide('sessions', { retain: vi.fn() } as never)
  ctx.provide('uiSession', { adapter: { current: createSnapshotStore({ key: undefined }) } } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const seat = (name: string): Recorded => {
    const entry = registered.find(candidate => candidate.name === name)
    if (entry === undefined) throw new Error(`expected a registration into ${name}`)
    return entry
  }
  const injectedOf = (entry: Recorded): unknown => {
    if (entry.inject === undefined) throw new Error(`expected ${entry.name} to inject`)
    return entry.inject(SESSION)
  }
  return { ctx, registered, dictionaries, layout, resources, fiber, seat, injectedOf }
}

describe('ui-sidebar-right apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('provides both faces, and registers the guide through the same two-stage path as any other type', async () => {
    const { ctx, registered, dictionaries, seat } = await boot()
    expect(ctx.sidebarRightTabs).toBeInstanceOf(SidebarRightTabRegistry)
    expect(ctx.sidebarRight).toBeInstanceOf(SidebarRightController)
    expect('adopt' in ctx.sidebarRight).toBe(false)
    expect(dictionaries.get('sidebarRight')).toEqual({ zh, en })
    const guide = ctx.sidebarRightTabs.get('guide')
    expect(guide?.id).toBe(GUIDE_ID)
    expect(guide?.priority).toBe('builtin')
    expect(guide?.title('sidebar://guide')).toBe('tab.guide.title')
    // Six registrations: the root and panel seats, the header's corner seat,
    // the restore-notice overlay, and the guide body and chip title under the
    // guide implementation's id.
    // The guide draws no product copy of its own, so neither guide seat binds the dictionary.
    expect(registered.map(entry => [entry.name, entry.key, entry.locale, entry.component])).toEqual([
      ['rightbar', undefined, undefined, RightbarRoot],
      ['rightbar.session', undefined, 'sidebarRight', RightbarSeat],
      ['conversation.session.header.corner', undefined, 'sidebarRight', ExpandButton],
      ['shell.overlay', undefined, 'sidebarRight', RestoreNotice],
      ['sidebar.right.pane.tab', GUIDE_ID, undefined, GuideBody],
      ['sidebar.right.pane.tab.title', GUIDE_ID, undefined, GuideTitle],
    ])
    // The panel declares the extension seats; the guide declares its chain child.
    expect(Object.keys(seat('rightbar.session').children as object)).toEqual([
      'sidebar.right.pane.tab', 'sidebar.right.pane.tab.title', 'sidebar.right.tab.menu.item',
    ])
    expect(seat('sidebar.right.pane.tab').children).toMatchObject({ 'sidebar.right.tab.guide': { kind: 'chain', scope: 'session' } })
    // Both seats read one store: the button only needs to know whether the panel is expanded.
    expect(seat('rightbar.session').store).toBeDefined()
    expect(seat('conversation.session.header.corner').store).toBe(seat('rightbar.session').store)
  })

  it('hands the panel seat the frame report, the service binding, the opens, the observable registry, and the Tab domain', async () => {
    const { ctx, layout, resources, seat, injectedOf } = await boot()
    const injected = injectedOf(seat('rightbar.session')) as SidebarRightInjected
    // The frame learns the composition of expanded and presentation, nothing else.
    injected.syncPresentation({ shown: true, track: true, fullscreen: false })
    expect(layout.openRightbar).toHaveBeenLastCalledWith(true, false)
    injected.syncPresentation({ shown: true, track: true, fullscreen: true })
    expect(layout.openRightbar).toHaveBeenLastCalledWith(true, true)
    injected.syncPresentation({ shown: true, track: false, fullscreen: true })
    expect(layout.openRightbar).toHaveBeenLastCalledWith(false, true)
    injected.syncPresentation({ shown: false, track: false, fullscreen: false })
    expect(layout.closeRightbar).toHaveBeenCalledOnce()
    // The registry, observable: what the seat dispatches a kind to.
    expect(injected.hooks.tabTypes.getSnapshot().find(type => type.kind === 'guide')?.id).toBe(GUIDE_ID)
    const seen = vi.fn()
    const unsubscribe = injected.hooks.tabTypes.subscribe(seen)
    ctx.sidebarRightTabs.register({ id: 'spec/text', kind: 'text', patterns: ['dsh-resource://file/**'], title: () => 'text' })
    expect(seen).toHaveBeenCalledOnce()
    unsubscribe()
    // The binding makes the service act on this seat's session; the seat's
    // store instance is minted here from the handle the registration declared.
    const handle = seat('rightbar.session').store as ReturnType<typeof createSidebarRightStore>
    const instance = handle.create()
    instance.clearPersisted()
    const release = injected.bindService({ sessionId: SESSION, actions: instance.actions, surfaces: {}, canSplitPane: () => true })
    injected.openTab('guide', { revealIfOpened: false })
    const surface = instance.getSnapshot().bySession[SESSION]
    expect(surface?.layout.expanded).toBe(true)
    expect(Object.values(surface?.layout.tabs ?? {}).map(tab => tab.kind)).toEqual(['guide'])
    // Holding a record pins its address through the resource model.
    if (surface === undefined) throw new Error('expected a surface')
    ctx.sidebarRight.tabDomain.sync(SESSION, surface.layout)
    expect(resources.pin).toHaveBeenCalledWith('sidebar://guide', expect.any(AbortSignal))
    release()
    expect(() => { ctx.sidebarRight.toggleExpanded() }).toThrow('no session surface is mounted')
  })

  it('adopts each session\'s store instance as the runtime mints it, so a tab\'s own actions land with no seat bound', async () => {
    const { ctx, resources, seat } = await boot()
    const handle = seat('rightbar.session').store as ReturnType<typeof createSidebarRightStore>
    // Both seats declare the same wrapped handle, so either minting adopts.
    expect(seat('conversation.session.header.corner').store).toBe(handle)
    const instance = handle.create(SESSION)
    instance.actions.open(SESSION)
    // The first expansion seeds the guide; a second tab beside it makes it closable.
    instance.actions.setExpanded(SESSION, true)
    instance.actions.openContent(SESSION, { kind: 'text', contentId: 'dsh-resource://file/session/s/a.txt', title: 'a' }, () => {})
    const guide = Object.values(instance.getSnapshot().bySession[SESSION]?.layout.tabs ?? {}).find(tab => tab.kind === 'guide')
    if (guide === undefined) throw new Error('expected the seeded guide')
    // Held and pinned from the store's own commit: no seat synced anything.
    const occurrence = ctx.sidebarRight.tabDomain.occurrence(SESSION, guide)
    expect(resources.pin).toHaveBeenCalledWith('sidebar://guide', occurrence.signal)
    occurrence.tabActions.close()
    expect(instance.getSnapshot().bySession[SESSION]?.layout.tabs[guide.id]).toBeUndefined()
    expect(occurrence.signal.aborted).toBe(true)
    expect(ctx.sidebarRight.openTabs.getSnapshot().length).toBeGreaterThan(0)
    instance.clearPersisted()
    expect(ctx.sidebarRight.openTabs.getSnapshot()).toEqual([])
  })

  it('releases replaced store adoptions once and keeps the latest store for each Session', async () => {
    const originalFactory = sidebarStores.createSidebarRightStore
    const stops: Array<ReturnType<typeof vi.fn<() => void>>> = []
    const factory = vi.spyOn(sidebarStores, 'createSidebarRightStore').mockImplementation((seed) => {
      const handle = originalFactory(seed)
      return {
        ...handle,
        create(scopeKey) {
          const instance = handle.create(scopeKey)
          return {
            ...instance,
            subscribe(listener) {
              const stop = vi.fn(instance.subscribe(listener))
              stops.push(stop)
              return stop
            },
          }
        },
      }
    })
    let b: Awaited<ReturnType<typeof boot>> | undefined
    try {
      b = await boot()
      const handle = b.seat('rightbar.session').store as ReturnType<typeof createSidebarRightStore>
      const other = 's-other' as SessionId
      handle.create(SESSION)
      handle.create(other)
      handle.create(SESSION)
      handle.create(other)
      const current = handle.create(SESSION)
      const currentOther = handle.create(other)
      expect(stops.map(stop => stop.mock.calls.length)).toEqual([1, 1, 1, 1, 0, 0])
      current.actions.setExpanded(SESSION, true)
      currentOther.actions.setExpanded(other, true)
      expect(new Set(b.ctx.sidebarRight.openTabs.getSnapshot().map(tab => tab.sessionId)))
        .toEqual(new Set([SESSION, other]))
      await b.fiber.dispose()
      expect(stops.map(stop => stop.mock.calls.length)).toEqual([1, 1, 1, 1, 1, 1])
    } finally {
      await b?.ctx.fiber.dispose()
      factory.mockRestore()
    }
  })

  it('hands the guide body the registry\'s entry boxes, observable', async () => {
    const { ctx, seat, injectedOf } = await boot()
    const { hooks: { guideEntries } } = injectedOf(seat('sidebar.right.pane.tab')) as GuideInjected
    expect(guideEntries.getSnapshot()).toEqual([])
    const seen = vi.fn()
    guideEntries.subscribe(seen)
    ctx.sidebarRightTabs.register({
      id: 'spec/files',
      kind: 'files',
      title: () => 'Files',
      guide: [{ id: 'default', order: 10, title: () => 'Files' }],
    })
    expect(seen).toHaveBeenCalledOnce()
    expect(guideEntries.getSnapshot().map(entry => entry.kind)).toEqual(['files'])
  })

  it('closes a restored tab whose file is gone and explains it in the overlay, dismissible', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    })
    try {
      const { resources, seat, injectedOf } = await boot()
      const address = 'dsh-resource://file/session/s-test/a.txt'
      const handle = seat('rightbar.session').store as ReturnType<typeof createSidebarRightStore>
      // Seed the persisted layout: one open file tab in the mounted session.
      const seed = handle.create(SESSION)
      seed.actions.openContent(SESSION, { kind: 'text', contentId: address, title: 'a.txt' }, () => {})
      expect(values.get(`dsh.sidebar-right.v1.${SESSION}`)).toBeDefined()
      const seeded = Object.values(seed.getSnapshot().bySession[SESSION]?.layout.tabs ?? {})
      expect(seeded).toHaveLength(1)
      // The file settles as definitively gone before the reloaded store appears.
      const snapshot: ResourceSnapshot<unknown> = {
        status: 'failed', value: undefined,
        failure: Object.assign(new Error('gone'), { name: 'RemoteError', isDSHRemoteError: true as const, code: 'workspace-file/not-found' as const, details: {} }) as ResourceSnapshot<unknown>['failure'],
      }
      const listeners = new Set<() => void>()
      resources.source.mockImplementation(() => ({
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      }))
      // The watch fires synchronously on the settled failure: the tab closes
      // (a sole docked tab takes the column down with it) and the overlay learns why.
      const reloaded = handle.create(SESSION)
      expect(reloaded.getSnapshot().bySession[SESSION]?.layout.tabs).toEqual({})
      expect(reloaded.getSnapshot().bySession[SESSION]?.layout.expanded).toBe(false)
      expect(listeners.size).toBe(0)
      const overlay = injectedOf(seat('shell.overlay')) as RestoreNoticeInjected
      expect(overlay.hooks.restoreNotices.getSnapshot()).toEqual([{ id: seeded[0]!.id, title: 'a.txt', reason: 'fileNotFound' }])
      overlay.dismissRestoreNotice(seeded[0]!.id)
      expect(overlay.hooks.restoreNotices.getSnapshot()).toEqual([])
      reloaded.clearPersisted()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps restored tabs whose resource confirms and stays silent about tabs the reader closed first', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    })
    try {
      const { resources, seat, injectedOf, fiber } = await boot()
      const confirmedAddress = 'dsh-resource://file/session/s-test/kept.txt'
      const pendingAddress = 'dsh-resource://file/session/s-test/closed.txt'
      const waitingAddress = 'dsh-resource://file/session/s-test/waiting.txt'
      const handle = seat('rightbar.session').store as ReturnType<typeof createSidebarRightStore>
      const seed = handle.create(SESSION)
      seed.actions.openContent(SESSION, { kind: 'text', contentId: confirmedAddress, title: 'kept.txt' }, () => {})
      seed.actions.openContent(SESSION, { kind: 'text', contentId: pendingAddress, title: 'closed.txt' }, () => {})
      seed.actions.openContent(SESSION, { kind: 'text', contentId: waitingAddress, title: 'waiting.txt' }, () => {})
      const snapshots = new Map<string, ResourceSnapshot<unknown>>([
        [confirmedAddress, { status: 'live', value: { version: '1' }, failure: undefined }],
        [pendingAddress, { status: 'loading', value: undefined, failure: undefined }],
        [waitingAddress, { status: 'loading', value: undefined, failure: undefined }],
      ])
      const listeners = new Map<string, Set<() => void>>()
      resources.source.mockImplementation((address: string) => ({
        getSnapshot: () => snapshots.get(address)!,
        subscribe: (listener: () => void) => {
          const set = listeners.get(address) ?? new Set<() => void>()
          set.add(listener)
          listeners.set(address, set)
          return () => { set.delete(listener) }
        },
      }))
      const reloaded = handle.create(SESSION)
      const tabs = Object.values(reloaded.getSnapshot().bySession[SESSION]?.layout.tabs ?? {})
      const pending = tabs.find(tab => tab.contentId === pendingAddress)!
      // The confirmed tab settles immediately and ends its watch; the pending one waits.
      expect(tabs.map(tab => tab.contentId)).toContain(confirmedAddress)
      expect(listeners.get(confirmedAddress)?.size ?? 0).toBe(0)
      expect(listeners.get(pendingAddress)?.size).toBe(1)
      // The reader closes the pending tab before its resource settles: the late
      // failure names no notice and re-closes nothing, and the watch itself
      // ends on the settled verdict.
      reloaded.actions.closeTab(SESSION, pending.id)
      expect(listeners.get(pendingAddress)?.size).toBe(1)
      const settled: ResourceSnapshot<unknown> = {
        status: 'failed', value: undefined,
        failure: Object.assign(new Error('gone'), { name: 'RemoteError', isDSHRemoteError: true as const, code: 'workspace-file/not-found' as const, details: {} }) as ResourceSnapshot<unknown>['failure'],
      }
      snapshots.set(pendingAddress, settled)
      for (const listener of [...listeners.get(pendingAddress) ?? []]) listener()
      const overlay = injectedOf(seat('shell.overlay')) as RestoreNoticeInjected
      expect(overlay.hooks.restoreNotices.getSnapshot()).toEqual([])
      expect(reloaded.getSnapshot().bySession[SESSION]?.layout.tabs[pending.id]).toBeUndefined()
      expect(listeners.get(pendingAddress)?.size).toBe(0)
      // The never-settled watch rides until the plugin's teardown releases it.
      expect(listeners.get(waitingAddress)?.size).toBe(1)
      reloaded.clearPersisted()
      await fiber.dispose()
      expect(listeners.get(waitingAddress)?.size).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('takes every registration and both faces back when disposed, aborting the open records, so a reload registers again', async () => {
    const { ctx, registered, dictionaries, fiber, seat, injectedOf } = await boot()
    const injected = injectedOf(seat('rightbar.session')) as SidebarRightInjected
    const handle = seat('rightbar.session').store as ReturnType<typeof createSidebarRightStore>
    // Minted under the session key, so the instance is adopted and the teardown releases it.
    const instance = handle.create(SESSION)
    injected.bindService({ sessionId: SESSION, actions: instance.actions, surfaces: {}, canSplitPane: () => true })
    injected.openTab('guide')
    const surface = instance.getSnapshot().bySession[SESSION]
    const guide = Object.values(surface?.layout.tabs ?? {})[0]
    if (guide === undefined) throw new Error('expected the guide tab')
    const { signal, tabActions } = ctx.sidebarRight.tabDomain.occurrence(SESSION, guide)
    await fiber.dispose()
    expect(signal.aborted).toBe(true)
    // The adoption went with the plugin: a late action from the dead occurrence changes nothing.
    tabActions.close()
    expect(instance.getSnapshot().bySession[SESSION]?.layout.tabs[guide.id]).toBeDefined()
    expect(ctx.get('sidebarRight')).toBeUndefined()
    expect(ctx.get('sidebarRightTabs')).toBeUndefined()
    expect(registered).toEqual([])
    expect(dictionaries.size).toBe(0)
    await ctx.plugin({ inject: [...inject], apply }).await()
    expect(ctx.sidebarRightTabs.get('guide')?.id).toBe(GUIDE_ID)
    expect(registered).toHaveLength(6)
  })
})
