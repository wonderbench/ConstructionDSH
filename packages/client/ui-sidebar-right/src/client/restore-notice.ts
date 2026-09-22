/**
 * Restore-explanation notices: what a reload could not bring back, and why.
 *
 * Entries accumulate while restored tabs fail re-validation and leave when the
 * reader dismisses them. The sink is a bare snapshot store owned by the
 * plugin; the frame overlay binds it as an injected hook, so no component
 * sees the source object.
 */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { RestoreFailureReason } from './restore-check.ts'

/** One notice line; `id` is the unrestored tab's id. */
export interface RestoreNoticeEntry {
  /** The tab id the notice explains; also the dismissal key. */
  readonly id: string
  /** The tab chip's title, captured when the tab opened. */
  readonly title: string
  /** Why the tab could not be restored. */
  readonly reason: RestoreFailureReason
}

/** Observable notice list owned by the plugin. */
export class RestoreNoticeSink {
  private readonly store = createSnapshotStore<readonly RestoreNoticeEntry[]>([])

  /** Read-only observable for the overlay seat's injected hook. */
  readonly source: ObservableSnapshot<readonly RestoreNoticeEntry[]> = this.store

  /**
   * Add one notice; an id already present leaves the list unchanged.
   * @param entry - the notice to show.
   */
  add(entry: RestoreNoticeEntry): void {
    const current = this.store.getSnapshot()
    if (current.some(existing => existing.id === entry.id)) return
    this.store.set([...current, entry])
  }

  /**
   * Remove one notice.
   * @param id - the notice's dismissal key.
   */
  dismiss(id: string): void {
    this.store.set(this.store.getSnapshot().filter(entry => entry.id !== id))
  }

  /** Read the current notice list.
   * @returns the notices (stable reference until the next change).
   */
  getSnapshot(): readonly RestoreNoticeEntry[] {
    return this.store.getSnapshot()
  }

  /**
   * Observe notice-list replacements.
   * @param listener - invoked after each change.
   * @returns disposer removing this listener.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }
}
