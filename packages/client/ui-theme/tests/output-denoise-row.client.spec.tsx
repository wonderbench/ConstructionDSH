// @vitest-environment jsdom
/** OutputDenoiseRow behavior: Beta tag, toggle drives setOutputDenoise,
 * display follows the store mirror, not the click echo. */
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { OutputDenoiseRow } from '../src/client/OutputDenoiseRow.tsx'
import type { OutputDenoiseRowComponentProps } from '../src/client/OutputDenoiseRow.tsx'
import { createOutputDenoiseRowStore } from '../src/client/settings-store.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const COPY: Record<string, string> = {
  'outputDenoise.title': 'Output denoise',
  'outputDenoise.beta': 'Beta',
  'outputDenoise.description': 'Experimental: folds explanatory model output',
  'outputDenoise.toggle': 'Toggle output denoise',
}

/** Empty global standard-kit hooks (the row reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<OutputDenoiseRowComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: OutputDenoiseRowComponentProps['useSessionStatus'] = selector => selector(noAttention)

function mount(enabled = false) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createOutputDenoiseRowStore().create()
  store.actions.sync(enabled, 0)
  const setOutputDenoise = vi.fn()
  const props: OutputDenoiseRowComponentProps = {
    useSessions: emptySessions(),
    useSessionStatus,
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setOutputDenoise,
  }
  render(<OutputDenoiseRow {...props} />)
  return { store, setOutputDenoise }
}

const toggle = (): HTMLButtonElement =>
  screen.getByRole('switch', { name: 'Toggle output denoise' }) as HTMLButtonElement

describe('OutputDenoiseRow', () => {
  it('renders the Beta-tagged title, description, and an off toggle by default', () => {
    mount(false)
    expect(screen.getByText('Output denoise')).toBeDefined()
    expect(screen.getByText('Beta')).toBeDefined()
    expect(screen.getByText('Experimental: folds explanatory model output')).toBeDefined()
    expect(toggle().getAttribute('aria-checked')).toBe('false')
  })

  it('clicking the toggle requests the opposite of the displayed state', () => {
    const b = mount(false)
    fireEvent.click(toggle())
    expect(b.setOutputDenoise).toHaveBeenCalledWith(true)
  })

  it('display follows the store mirror, not the click echo', () => {
    const b = mount(false)
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-checked')).toBe('false')
    act(() => { b.store.actions.sync(true, 1) })
    expect(toggle().getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle())
    expect(b.setOutputDenoise).toHaveBeenLastCalledWith(false)
  })
})
