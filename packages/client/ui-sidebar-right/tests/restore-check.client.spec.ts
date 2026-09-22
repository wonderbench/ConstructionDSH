/** Restore-time validation: confirmed tabs stay, definitively gone tabs are reported. */
import { describe, expect, it, vi } from 'vitest'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ResourceSnapshot } from '@deepseek-ai/dsh-client-resources/client'
import type { TabId, TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
import { watchRestoredResources, type RestoreFailure } from '../src/client/restore-check.ts'

type Snapshot = ResourceSnapshot<unknown>
type Failure = NonNullable<Snapshot['failure']>

const loading: Snapshot = { status: 'loading', value: undefined, failure: undefined }
const live: Snapshot = { status: 'live', value: { version: '1' }, failure: undefined }
const none: Snapshot = { status: 'none', value: undefined, failure: undefined }
/** Test wire: a settled failure frame with the given carrier code. */
function failure(code: string): Failure {
  return Object.assign(new Error(code), {
    name: 'RemoteError', isDSHRemoteError: true as const, code, details: {},
  }) as unknown as Failure
}

const notFound: Snapshot = { status: 'failed', value: undefined, failure: failure('workspace-file/not-found') }
const transient: Snapshot = { status: 'failed', value: undefined, failure: failure('gateway/transport') }

/** One driven resource source; `push` replaces the snapshot and notifies. */
interface FakeSource extends ObservableSnapshot<Snapshot> {
  push(next: Snapshot): void
  readonly listeners: number
}

function fakeSource(initial: Snapshot): FakeSource {
  let current = initial
  const subscribers = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe: (listener) => { subscribers.add(listener); return () => { subscribers.delete(listener) } },
    push: (next) => { current = next; for (const listener of [...subscribers]) listener() },
    get listeners() { return subscribers.size },
  }
}

function record(id: string, contentId: string): TabRecord {
  return { id: id as TabId, kind: 'text', contentId, title: id }
}

describe('watchRestoredResources', () => {
  it('reports a restored tab whose file is definitively gone and stops watching it', () => {
    const source = fakeSource(notFound)
    const onFailure = vi.fn<(failure: RestoreFailure) => void>()
    const dispose = watchRestoredResources([record('tab1', 'dsh-resource://file/session/s/a.txt')], () => source, onFailure)
    expect(onFailure).toHaveBeenCalledExactlyOnceWith({ tab: record('tab1', 'dsh-resource://file/session/s/a.txt'), reason: 'fileNotFound' })
    expect(source.listeners).toBe(0)
    dispose()
  })

  it('keeps restored tabs whose resource confirms, cannot be validated, or fails transiently', () => {
    const confirmed = fakeSource(live)
    const unverifiable = fakeSource(none)
    const maybeLater = fakeSource(loading)
    const onFailure = vi.fn<(failure: RestoreFailure) => void>()
    const dispose = watchRestoredResources([
      record('tab1', 'dsh-resource://file/session/s/a.txt'),
      record('tab2', 'dsh-resource://file/session/s/b.txt'),
      record('tab3', 'dsh-resource://file/session/s/c.txt'),
    ], (address) => {
      if (address.endsWith('a.txt')) return confirmed
      if (address.endsWith('b.txt')) return unverifiable
      return maybeLater
    }, onFailure)
    expect(onFailure).not.toHaveBeenCalled()
    // Confirmed and unverifiable watches ended; the transient one waits for a verdict.
    expect(confirmed.listeners).toBe(0)
    expect(unverifiable.listeners).toBe(0)
    expect(maybeLater.listeners).toBe(1)
    maybeLater.push(transient)
    expect(onFailure).not.toHaveBeenCalled()
    maybeLater.push(live)
    expect(maybeLater.listeners).toBe(0)
    dispose()
    expect(maybeLater.listeners).toBe(0)
  })

  it('watches only resource addresses and reports each gone tab once', () => {
    const goneA = fakeSource(notFound)
    const goneB = fakeSource(loading)
    const onFailure = vi.fn<(failure: RestoreFailure) => void>()
    const dispose = watchRestoredResources([
      record('page1', 'sidebar://guide'),
      record('tab1', 'dsh-resource://file/session/s/a.txt'),
      record('tab2', 'dsh-resource://file/session/s/b.txt'),
    ], address => (address.endsWith('a.txt') ? goneA : goneB), onFailure)
    expect(onFailure).toHaveBeenCalledTimes(1)
    goneB.push(notFound)
    expect(onFailure).toHaveBeenCalledTimes(2)
    // A stale frame after settling writes nothing more.
    goneA.push(notFound)
    expect(onFailure).toHaveBeenCalledTimes(2)
    expect(onFailure.mock.calls.map(([failure]) => failure.reason)).toEqual(['fileNotFound', 'fileNotFound'])
    dispose()
  })

  it('releases every pending watch on dispose', () => {
    const pending = fakeSource(loading)
    const dispose = watchRestoredResources([record('tab1', 'dsh-resource://file/session/s/a.txt')], () => pending, () => {})
    expect(pending.listeners).toBe(1)
    dispose()
    expect(pending.listeners).toBe(0)
  })
})
