// @vitest-environment jsdom
/** UiModeRow behavior: title, presentation-only description, two-option
 * segmented control; the click requests the write and the display follows
 * the store mirror, never the click echo. */
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { UiModeRow } from '../src/client/UiModeRow.tsx'
import type { UiModeRowComponentProps } from '../src/client/UiModeRow.tsx'
import { createUiModeRowStore } from '../src/client/settings-store.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const COPY: Record<string, string> = {
  'uiMode.title': 'Interface mode',
  'uiMode.description': 'Affects presentation only — never changes features or permissions',
  'uiMode.business': 'Business',
  'uiMode.expert': 'Expert',
}

/** Empty global standard-kit hooks (the row reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', subagentsByParent: {}, jobsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<UiModeRowComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: UiModeRowComponentProps['useSessionStatus'] = selector => selector(noAttention)

function mount(mode: 'business' | 'expert' = 'business') {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createUiModeRowStore().create()
  store.actions.sync(mode, 0)
  const setUiMode = vi.fn()
  const props: UiModeRowComponentProps = {
    useSessions: emptySessions(),
    useSessionStatus,
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setUiMode,
  }
  render(<UiModeRow {...props} />)
  return { store, setUiMode }
}

const option = (name: string): HTMLButtonElement =>
  screen.getByRole('button', { name }) as HTMLButtonElement

describe('UiModeRow', () => {
  it('renders the title, the presentation-only description, and a business-selected control', () => {
    mount('business')
    expect(screen.getByText('Interface mode')).toBeDefined()
    expect(screen.getByText('Affects presentation only — never changes features or permissions')).toBeDefined()
    expect(option('Business').getAttribute('aria-pressed')).toBe('true')
    expect(option('Expert').getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking the expert option requests the write', () => {
    const b = mount('business')
    fireEvent.click(option('Expert'))
    expect(b.setUiMode).toHaveBeenCalledWith('expert')
  })

  it('display follows the store mirror, not the click echo', () => {
    const b = mount('business')
    fireEvent.click(option('Expert'))
    expect(option('Expert').getAttribute('aria-pressed')).toBe('false')
    act(() => { b.store.actions.sync('expert', 1) })
    expect(option('Expert').getAttribute('aria-pressed')).toBe('true')
    expect(option('Business').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(option('Business'))
    expect(b.setUiMode).toHaveBeenLastCalledWith('business')
  })
})
