// @vitest-environment jsdom
/** Restore notices accumulate, deduplicate, dismiss, and render one alert each. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { RestoreNotice } from '../src/client/shell/RestoreNotice.tsx'
import { RestoreNoticeSink } from '../src/client/restore-notice.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('sink keeps one notice per tab id and dismisses by id', () => {
  const sink = new RestoreNoticeSink()
  const seen = vi.fn()
  const unsubscribe = sink.subscribe(seen)
  expect(sink.getSnapshot()).toEqual([])
  sink.add({ id: 'tab1', title: 'a.txt', reason: 'fileNotFound' })
  sink.add({ id: 'tab1', title: 'a.txt', reason: 'fileNotFound' })
  sink.add({ id: 'tab2', title: 'b.txt', reason: 'fileNotFound' })
  expect(sink.getSnapshot().map(entry => entry.id)).toEqual(['tab1', 'tab2'])
  expect(seen).toHaveBeenCalledTimes(2)
  sink.dismiss('tab1')
  sink.dismiss('tab-missing')
  expect(sink.getSnapshot().map(entry => entry.id)).toEqual(['tab2'])
  unsubscribe()
})

type NoticeProps = Parameters<typeof RestoreNotice>[0]
const unusedHook = (): never => { throw new Error('Restore notices consume no global hooks') }
const standard: Omit<NoticeProps, 'useRestoreNotices' | 'dismissRestoreNotice' | 't'> = {
  useSessions: unusedHook, useSessionStatus: unusedHook, useSessionRetainInfo: unusedHook, usePanelInfo: unusedHook,
  useWorkspaces: unusedHook, useResource: unusedHook,
}

it('renders nothing while every restored tab came back', () => {
  let notices: readonly { id: string; title: string; reason: 'fileNotFound' }[] = []
  const dismissRestoreNotice = vi.fn<NoticeProps['dismissRestoreNotice']>()
  const useRestoreNotices: NoticeProps['useRestoreNotices'] = selector => selector(notices)
  const view = render(
    <RestoreNotice {...standard} useRestoreNotices={useRestoreNotices}
      dismissRestoreNotice={dismissRestoreNotice} t={makeTranslate(en)} />,
  )
  expect(view.container.childElementCount).toBe(0)
  notices = [{ id: 'tab1', title: 'a.txt', reason: 'fileNotFound' }]
  view.rerender(
    <RestoreNotice {...standard} useRestoreNotices={useRestoreNotices}
      dismissRestoreNotice={dismissRestoreNotice} t={makeTranslate(en)} />,
  )
  const alert = view.getByRole('alert')
  expect(alert.textContent).toContain('The tab “a.txt” could not be restored: the file no longer exists.')
  expect(alert.getAttribute('data-sidebar-restore-notice')).toBe('fileNotFound')
  fireEvent.click(view.getByRole('button', { name: en['restore.dismiss'] }))
  expect(dismissRestoreNotice).toHaveBeenCalledExactlyOnceWith('tab1')
  notices = []
  view.rerender(
    <RestoreNotice {...standard} useRestoreNotices={useRestoreNotices}
      dismissRestoreNotice={dismissRestoreNotice} t={makeTranslate(en)} />,
  )
  expect(view.container.childElementCount).toBe(0)
})

it('keeps one alert per unrestored tab and dismisses the tab the reader picked', () => {
  const notices = [
    { id: 'tab1', title: 'a.txt', reason: 'fileNotFound' as const },
    { id: 'tab2', title: 'b.txt', reason: 'fileNotFound' as const },
  ]
  const dismissRestoreNotice = vi.fn<NoticeProps['dismissRestoreNotice']>()
  const useRestoreNotices: NoticeProps['useRestoreNotices'] = selector => selector(notices)
  const view = render(
    <RestoreNotice {...standard} useRestoreNotices={useRestoreNotices}
      dismissRestoreNotice={dismissRestoreNotice} t={makeTranslate(en)} />,
  )
  const alerts = view.getAllByRole('alert')
  expect(alerts).toHaveLength(2)
  fireEvent.click(view.getAllByRole('button', { name: en['restore.dismiss'] })[1]!)
  expect(dismissRestoreNotice).toHaveBeenCalledExactlyOnceWith('tab2')
})
