// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  SidebarFooterActionOwnerProps, SidebarPanelMetadata, SidebarRootComponentProps, SidebarSectionOwnerProps,
  SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import { HeaderLeadingControls, type HeaderLeadingControlsProps } from '../src/client/HeaderLeadingControls.tsx'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { en } from '../src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

// The shell reads the presentation mode through the theme-snapshot-bound hook;
// tests flip this fixture between business and expert.
let uiModeFixture: 'business' | 'expert' = 'business'
const useUiMode: SidebarRootComponentProps['useUiMode'] = selector => selector(uiModeFixture)

// English-dictionary translate stub: the shell renders the same copy the
// assertions below query by accessible name.
const t: SidebarRootComponentProps['t'] = key =>
  (en as Record<string, string>)[key] ?? (commonEn as Record<string, string>)[key] ?? key

afterEach(() => {
  cleanup()
  uiModeFixture = 'business'
  delete document.documentElement.dataset.platform
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// The shell never reads the global hooks itself, but they ride the standard
// props share; stub them as never-called functions.
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never
type AttentionSnapshot = Parameters<Parameters<SidebarRootComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: SidebarRootComponentProps['useSessionStatus'] = selector => selector(noAttention)

function mountShell({ collapsed = false, width = 300 }: { collapsed?: boolean; width?: number } = {}) {
  const startSession = vi.fn()
  const toggleSidebar = vi.fn()
  let regionOwner: SidebarSectionOwnerProps | undefined
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined
  const brandMark = <span data-testid="custom-brand-mark">M</span>
  const brandName = <span data-testid="custom-brand-name">Custom Brand</span>
  let current = { collapsed, width }
  const root = () => (
    <SidebarRoot
      collapsed={current.collapsed} width={current.width}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} usePanels={selector => selector([])} useUiMode={useUiMode}
      useResource={useResource} useWorkspaces={neverHook}
      startSession={startSession} toggleSidebar={toggleSidebar} t={t}
      renderSlot={((
        key: string,
        owner: SidebarFooterActionOwnerProps | SidebarSectionOwnerProps | SidebarSettingsOwnerProps,
      ) => {
        if (key === 'sidebar.brand.mark') return brandMark
        if (key === 'sidebar.brand.name') return brandName
        if (key === 'sidebar.toggle.badge') return null
        if (key === 'sidebar.settings') {
          settingsOwner = owner
          return <div data-testid="settings-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.footer.action') {
          footerActionOwner = owner
          return <div data-testid="footer-action-seat" data-wide={owner.wide} />
        }
        regionOwner = owner as SidebarSectionOwnerProps
        return <div data-testid="region" data-wide={owner.wide} />
      }) as SidebarRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    startSession,
    toggleSidebar,
    regionOwner: () => {
      if (regionOwner === undefined) throw new Error('region owner not rendered')
      return regionOwner
    },
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error('settings owner not rendered')
      return settingsOwner
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error('footer action owner not rendered')
      return footerActionOwner
    },
    rerender(next: Partial<typeof current>) {
      current = { ...current, ...next }
      view.rerender(root())
    },
  }
}

describe('SidebarRoot shell', () => {
  it('routes New Session (capsule + wordmark) and the column toggle', () => {
    const b = mountShell()
    expect(screen.getByTestId('custom-brand-mark')).toBeTruthy()
    expect(screen.getByTestId('custom-brand-name')).toBeTruthy()
    // Expanded, both the wordmark and the capsule start a session.
    const starters = screen.getAllByRole('button', { name: 'New session' })
    expect(starters).toHaveLength(2)
    for (const button of starters) fireEvent.click(button)
    expect(b.startSession).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders the custom brand logo fallbacks when no package fills the slots', () => {
    const { container } = render(<SidebarRoot
      collapsed={false} width={300}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} usePanels={selector => selector([])} useUiMode={useUiMode}
      useResource={useResource} useWorkspaces={neverHook}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    const expandedLogo = container.querySelector('img[src="/brand-logo2.png"]')
    expect(expandedLogo).not.toBeNull()
    expect(expandedLogo?.getAttribute('src')).toBe('/brand-logo2.png')
    expect(container.textContent).not.toContain('DSH Local Build')
  })

  it('renders the collapsed rail logo fallback', () => {
    const { container } = render(<SidebarRoot
      collapsed width={300}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} usePanels={selector => selector([])} useUiMode={useUiMode}
      useResource={useResource} useWorkspaces={neverHook}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    const railLogo = container.querySelector('img[src="/brand-logo1.png"]')
    expect(railLogo).not.toBeNull()
    expect(railLogo?.getAttribute('src')).toBe('/brand-logo1.png')
  })

  it('hands the region its wide flag and clamps expandSidebar to the collapsed state', () => {
    const b = mountShell()
    expect(b.regionOwner().wide).toBe(true)
    // The settings seat rides the same wide flag (ui-settings renders the row).
    expect(b.settingsOwner().wide).toBe(true)
    expect(b.footerActionOwner().wide).toBe(true)
    // Expanded: the request is a no-op (no accidental collapse).
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('keeps the region mounted through collapse and expands on its request', () => {
    vi.useFakeTimers()
    const b = mountShell()
    b.rerender({ collapsed: true })
    // Wide content survives the crossfade window, then settles into the rail.
    expect(b.regionOwner().wide).toBe(true)
    vi.advanceTimersByTime(200)
    b.rerender({})
    expect(b.regionOwner().wide).toBe(false)
    expect(b.footerActionOwner().wide).toBe(false)
    expect(screen.getByTestId('region')).toBeTruthy()
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders statically collapsed on a cold start (no crossfade classes)', () => {
    const b = mountShell({ collapsed: true })
    expect(b.regionOwner().wide).toBe(false)
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
  })

  it('shows only the badge bubble while the rail badge is hovered inside the toggle', () => {
    vi.useFakeTimers()
    render(<SidebarRoot
      collapsed width={56}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} usePanels={selector => selector([])} useUiMode={useUiMode}
      useResource={useResource} useWorkspaces={neverHook}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((key: string) => key === 'sidebar.toggle.badge'
        ? <Tooltip label="Update — V1.2.3"><span data-testid="badge" /></Tooltip>
        : null) as SidebarRootComponentProps['renderSlot']}
    />)
    const toggle = screen.getByRole('button', { name: 'Open sidebar' })
    fireEvent.mouseEnter(toggle)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByRole('tooltip').textContent).toBe('Open sidebar')
    // The badge's own bubble replaces the toggle's rather than stacking on it,
    // even after the toggle's longer hover delay has elapsed.
    fireEvent.mouseEnter(screen.getByTestId('badge'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getAllByRole('tooltip').map(bubble => bubble.textContent)).toEqual(['Update — V1.2.3'])
    fireEvent.mouseLeave(screen.getByTestId('badge'), { relatedTarget: toggle })
    expect(screen.getByRole('tooltip').textContent).toBe('Open sidebar')
    fireEvent.mouseLeave(toggle)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('SidebarRoot presentation mode', () => {
  const PANELS: SidebarPanelMetadata[] = [
    { id: 'plugins' as MainPanelId, order: 0, label: 'Plugins' },
    { id: 'terminal' as MainPanelId, order: 1, label: 'Terminal' },
    { id: 'chat' as MainPanelId, order: 2, label: 'Chat' },
  ]

  function renderShell(panels: SidebarPanelMetadata[] = PANELS) {
    const selectPanel = vi.fn()
    let settingsRendered = false
    // A fresh element per render: React bails out when the rerendered element
    // is referentially identical, which would hide the fixture flip.
    const element = () => (
      <SidebarRoot
        collapsed={false} width={300}
        useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
        usePanelInfo={usePanelInfo} selectPanel={selectPanel}
        usePanels={selector => selector(panels)} useUiMode={useUiMode}
        useResource={useResource} useWorkspaces={neverHook}
        startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
        renderSlot={(((key: string, _owner: unknown, options?: { only?: string }) => {
          if (key === 'sidebar.settings') {
            settingsRendered = true
            return <div data-testid="settings-seat" />
          }
          if (key === 'sidebar.panellist') return <span data-testid={`icon-${options?.only}`} />
          return null
        }) as SidebarRootComponentProps['renderSlot'])}
      />
    )
    const view = render(element())
    return {
      view, selectPanel,
      settingsRendered: () => settingsRendered,
      // The hook fixture flip is only observable through a re-render, exactly
      // as the bound theme-snapshot hook re-renders the shell on change.
      rerender: () => { view.rerender(element()) },
    }
  }

  it('hides technical panel rows in the default business mode, keeping the settings seat', () => {
    const b = renderShell()
    expect(screen.queryByRole('button', { name: 'Plugins' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Terminal' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Chat' })).toBeTruthy()
    // The mode switch stays reachable: the settings seat is never filtered.
    expect(b.settingsRendered()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
    expect(b.selectPanel).toHaveBeenCalledWith('chat')
  })

  it('drops the whole panel nav when every entry is technical in business mode', () => {
    const b = renderShell([{ id: 'plugins' as MainPanelId, order: 0, label: 'Plugins' }])
    expect(screen.queryByRole('navigation')).toBeNull()
    // Expert mode brings the row back.
    uiModeFixture = 'expert'
    b.rerender()
    expect(screen.getByRole('button', { name: 'Plugins' })).toBeTruthy()
  })

  it('shows every registered panel row in expert mode', () => {
    uiModeFixture = 'expert'
    const b = renderShell()
    expect(screen.getByRole('button', { name: 'Plugins' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Terminal' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chat' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
    expect(b.selectPanel).toHaveBeenCalledWith('terminal')
  })
})

it('keeps the macOS sidebar toggle in its top strip', () => {
  document.documentElement.dataset.platform = 'darwin'
  const shell = mountShell()
  fireEvent.click(screen.getByRole('button', { name: en['toggle.collapse'] }))
  expect(shell.toggleSidebar).toHaveBeenCalledOnce()
})

it.each([undefined, 'win32', 'linux', 'darwin'])('shows header sidebar controls only on macOS desktop (%s)', (platform) => {
  if (platform !== undefined) document.documentElement.dataset.platform = platform
  const toggleSidebar = vi.fn()
  const startSession = vi.fn()
  // This occupant only consumes its two actions and locale, not Session hooks.
  const props = { toggleSidebar, startSession, t } as HeaderLeadingControlsProps
  const view = render(<HeaderLeadingControls {...props} />)
  if (platform !== 'darwin') {
    expect(view.container.innerHTML).toBe('')
    return
  }
  fireEvent.click(screen.getByRole('button', { name: en['toggle.open'] }))
  fireEvent.click(screen.getByRole('button', { name: en['session.new.label'] }))
  expect(toggleSidebar).toHaveBeenCalledOnce()
  expect(startSession).toHaveBeenCalledOnce()
})
