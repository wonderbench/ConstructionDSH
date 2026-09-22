/**
 * Restore-time validation for tabs that came back from persisted storage.
 *
 * A persisted layout replays its tab records before any body renders, so the
 * records re-validate here instead of trusting the storage: a tab whose
 * resource address settles as definitively missing cannot be brought back and
 * is reported to the caller (which closes it and explains through the frame
 * overlay). Other failures may be transient — a transport error, an
 * unresolvable workspace — so those tabs stay; their bodies already explain
 * and offer a retry.
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ResourceSnapshot } from '@deepseek-ai/dsh-client-resources/client'
import type { TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'

/** The address prefix every resource tab carries; other addresses name pages. */
export const RESOURCE_ADDRESS_PREFIX = 'dsh-resource://'

/** The workspace-file protocol's definitive "the file no longer exists" code. */
const FILE_NOT_FOUND = 'workspace-file/not-found'

/** Why one restored tab could not be brought back. */
export type RestoreFailureReason = 'fileNotFound'

/** One restored tab that failed re-validation. */
export interface RestoreFailure {
  /** The record as persisted. */
  readonly tab: TabRecord
  /** The validation outcome. */
  readonly reason: RestoreFailureReason
}

/** Read one address's live resource state; supplied by the resource model. */
export type RestoredResourceSource = (address: string) => ObservableSnapshot<ResourceSnapshot<unknown>>

/**
 * Watch the tabs present at restore until each resource settles.
 *
 * Every record whose address carries the resource scheme is watched: the first
 * `live` frame confirms the file still exists and ends that watch, a `none`
 * state means no provider registered for the protocol (nothing to validate
 * against), and a `failed` frame carrying the not-found code reports the tab
 * through `onFailure` exactly once. Watches end with the returned disposer,
 * which the plugin releases on unload.
 * @param records - the tabs present when the restored surface was adopted.
 * @param sourceOf - one address's live resource source.
 * @param onFailure - receives each tab whose file is definitively gone.
 * @returns disposer releasing every remaining watch.
 */
export function watchRestoredResources(
  records: readonly TabRecord[],
  sourceOf: RestoredResourceSource,
  onFailure: (failure: RestoreFailure) => void,
): () => void {
  const disposers: Array<() => void> = []
  for (const tab of records) {
    if (!tab.contentId.startsWith(RESOURCE_ADDRESS_PREFIX)) continue
    const source = sourceOf(tab.contentId)
    const watch: { settled: boolean; unsubscribe: (() => void) | undefined } = { settled: false, unsubscribe: undefined }
    const dispose = (): void => {
      if (watch.settled) return
      watch.settled = true
      watch.unsubscribe?.()
    }
    const check = (): void => {
      /* v8 ignore next -- a source cannot notify after its unsubscribe; the settled arm is only reachable through a re-entrant provider. */
      if (watch.settled) return
      const snapshot = source.getSnapshot()
      if (snapshot.status === 'live' || snapshot.status === 'none') { dispose(); return }
      if (snapshot.status === 'failed' && snapshot.failure?.code === FILE_NOT_FOUND) {
        dispose()
        onFailure({ tab, reason: 'fileNotFound' })
      }
      // Any other failure may recover; the tab's body carries the explanation
      // and the retry until the stream says otherwise.
    }
    watch.unsubscribe = source.subscribe(check)
    // The first frame may have settled before this watch subscribed.
    check()
    disposers.push(dispose)
  }
  return () => { for (const dispose of disposers) dispose() }
}
