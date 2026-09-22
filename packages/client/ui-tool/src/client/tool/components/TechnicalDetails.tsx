/** Collapsible technical-details section for the output-denoise field layer. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { IconChevronDownOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TechnicalDetails.module.css'

export interface TechnicalDetailsProps {
  /** Translator for the Tool-owned 'tool' namespace. */
  t: TranslateNS<'tool'>
  /** Initial expansion; expert mode opens the section by default. */
  defaultOpen: boolean
  /** Technical content (raw arguments, raw output) shown while open. */
  children: ReactNode
}

/**
 * One composable denoise layer: technical Tool fields (raw JSON, timings,
 * full output) render inside this disclosure so business-mode rows flatten to
 * their comprehensible summary, while expert mode opens it by default. Only
 * rendered by callers when the denoise flag is on, so the flag off keeps the
 * pre-layer rendering exactly.
 */
export function TechnicalDetails({ t, defaultOpen, children }: TechnicalDetailsProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={css.root} data-technical-details="" data-open={open || undefined}>
      <button
        type="button"
        className={css.toggle}
        aria-expanded={open}
        aria-label={open ? t('technicalDetails.collapse') : t('technicalDetails.expand')}
        onClick={() => { setOpen(value => !value) }}
      >
        <IconChevronDownOutlineMedium size={12} className={clsx(css.chevron, open && css.chevronOpen)} />
        {t('technicalDetails.title')}
      </button>
      {open && <div className={css.content}>{children}</div>}
    </div>
  )
}
