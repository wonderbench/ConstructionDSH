/** Tabs a reload could not bring back, and why, in the frame's overlay layer. */
import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the 'shell.overlay' SlotMap declaration from the frame.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { RestoreFailureReason } from '../restore-check.ts'
import type { RestoreNoticeEntry } from '../restore-notice.ts'
import css from './RestoreNotice.module.css'

/** The overlay seat's injected face: the notice list and its dismissal. */
export interface RestoreNoticeInjected {
  readonly hooks: { readonly restoreNotices: HostObservable<readonly RestoreNoticeEntry[]> }
  /** @param id - the notice's dismissal key. */
  readonly dismissRestoreNotice: (id: string) => void
}

/** One copy key per failure reason; the union stays exhaustive as reasons grow. */
const copyOf: Record<RestoreFailureReason, 'restore.fileNotFound'> = {
  fileNotFound: 'restore.fileNotFound',
}

/**
 * Render one alert per unrestored tab; empty when everything came back.
 * @param props - root overlay runtime seats, the dismissal command, and copy.
 * @returns the notice stack, or nothing while the list is empty.
 */
export function RestoreNotice({ useRestoreNotices, dismissRestoreNotice, t }: PropsRuntime<'shell.overlay'> & PropsLocale<'sidebarRight'> & InjectFace<RestoreNoticeInjected>): ReactNode {
  const notices = useRestoreNotices(value => value)
  if (notices.length === 0) return null
  return (
    <div className={css.stack} data-sidebar-restore-notices>
      {notices.map(notice => (
        <div key={notice.id} className={css.notice} role="alert" data-sidebar-restore-notice={notice.reason}>
          <span>{t(copyOf[notice.reason], { title: notice.title })}</span>
          <button type="button" onClick={() => { dismissRestoreNotice(notice.id) }}>{t('restore.dismiss')}</button>
        </div>
      ))}
    </div>
  )
}
