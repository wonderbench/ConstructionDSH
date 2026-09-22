/**
 * Interface-mode row registered into the General section item slot:
 * title + description + a two-option segmented control (business / expert).
 * Registered by this package — the theme feature owns this presentation flag
 * the same way it owns the appearance preference and the content font size.
 * The description states the presentation-only contract: the mode never
 * changes features or permissions. Selection follows the persisted setting,
 * never the click echo.
 */
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { UiMode } from '../theme-settings.ts'
import type { createUiModeRowStore } from './settings-store.ts'
import css from './UiModeRow.module.css'

/** Injected business face: the mode write (t rides the standard locale seat). */
export interface UiModeRowInjected {
  /** Switch the presentation mode. */
  setUiMode: (mode: UiMode) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type UiModeRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createUiModeRowStore>>
  & PropsLocale<'settings.theme'> & UiModeRowInjected

/** Option order: business first — it is the schema default. */
const OPTIONS: readonly UiMode[] = ['business', 'expert']

/** Copy key per mode option. */
const OPTION_LABEL_KEYS: Record<UiMode, 'uiMode.business' | 'uiMode.expert'> = {
  business: 'uiMode.business',
  expert: 'uiMode.expert',
}

/**
 * Render the interface-mode row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function UiModeRow({ t, setUiMode, useStore }: UiModeRowComponentProps) {
  const mode = useStore(s => s.mode)
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('uiMode.title')}</div>
        <div className={css.desc}>{t('uiMode.description')}</div>
      </div>
      <div className={css.segment} role="group" aria-label={t('uiMode.title')}>
        {OPTIONS.map(option => (
          <button
            key={option}
            type="button"
            className={clsx(css.option, mode === option && css.selected)}
            aria-pressed={mode === option}
            onClick={() => { setUiMode(option) }}
          >
            {t(OPTION_LABEL_KEYS[option])}
          </button>
        ))}
      </div>
    </div>
  )
}
