/**
 * Output-denoise Beta row registered into the General section item slot:
 * title + Beta tag + description + an on/off toggle. Registered by this
 * package — the theme feature owns this presentation flag the same way it
 * owns the appearance preference and the content font size. The displayed
 * state follows the persisted setting, never the click echo.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createOutputDenoiseRowStore } from './settings-store.ts'
import css from './OutputDenoiseRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface OutputDenoiseRowInjected {
  /** Toggle the output-denoise Beta flag. */
  setOutputDenoise: (enabled: boolean) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type OutputDenoiseRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createOutputDenoiseRowStore>>
  & PropsLocale<'settings.theme'> & OutputDenoiseRowInjected

/**
 * Render the output-denoise row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function OutputDenoiseRow({ t, setOutputDenoise, useStore }: OutputDenoiseRowComponentProps) {
  const enabled = useStore(s => s.enabled)
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.titleLine}>
          <span className={css.title}>{t('outputDenoise.title')}</span>
          <span className={css.beta}>{t('outputDenoise.beta')}</span>
        </div>
        <div className={css.desc}>{t('outputDenoise.description')}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t('outputDenoise.toggle')}
        className={enabled ? css.trackOn : css.track}
        onClick={() => { setOutputDenoise(!enabled) }}
      >
        <span className={enabled ? css.knobOn : css.knob} />
      </button>
    </div>
  )
}
