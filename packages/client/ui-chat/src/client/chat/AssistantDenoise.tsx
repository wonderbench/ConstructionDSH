import { memo, useState } from 'react'
import { IconChevronDownOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AssistantMarkdownProps } from './AssistantMarkdown.tsx'
import { AssistantMarkdown } from './AssistantMarkdown.tsx'
import { nonProseBlocks, proseFold } from './assistant-denoise.ts'
import css from './AssistantDenoise.module.css'

/**
 * Denoise presentation of one settled Assistant body: the first prose line
 * stands as the conclusion and prose beyond the threshold folds behind a
 * per-render expansion control (in-session only, never persisted). Expansion
 * renders the untouched {@link AssistantMarkdown} over the original blocks, so
 * the expanded prose is verbatim by construction — one character unchanged,
 * one character not lost.
 */
export const AssistantDenoise = memo(function AssistantDenoise(props: AssistantMarkdownProps) {
  const { blocks, t } = props
  const fold = proseFold(blocks)
  const [expanded, setExpanded] = useState(false)
  if (fold === null) return <AssistantMarkdown {...props} />
  const toggle = (): void => { setExpanded(value => !value) }
  return (
    <div className={css.root} data-denoise-fold="" data-expanded={expanded || undefined}>
      {!expanded && <p className={css.conclusion}>{fold.conclusion}</p>}
      <button
        type="button"
        className={css.toggle}
        aria-expanded={expanded}
        onClick={toggle}
      >
        <IconChevronDownOutlineMedium
          size={12}
          className={expanded ? `${css.chevron} ${css.chevronOpen}` : css.chevron}
        />
        {t(expanded ? 'message.denoise.hideExplanation' : 'message.denoise.viewExplanation')}
      </button>
      <AssistantMarkdown {...props} blocks={expanded ? blocks : nonProseBlocks(blocks)} />
    </div>
  )
})
