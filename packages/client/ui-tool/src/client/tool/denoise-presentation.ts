/**
 * Output-denoise presentation mode for Tool surfaces, read from the document
 * body attributes the settings surfaces publish: `data-dsw-output-denoise`
 * (ui-theme boot script and presenter) and `data-dsw-ui-mode` (the
 * business/expert mode owner). The read happens at render time, so any
 * seat-driven re-render picks up a toggle; nothing subscribes to attribute
 * mutations, matching the coordination contract for mode reads across feature
 * packages.
 */

/** Body attribute publishing the output-denoise Beta flag. */
const OUTPUT_DENOISE_ATTRIBUTE = 'data-dsw-output-denoise'

/** Body attribute publishing the business/expert UI mode. */
const UI_MODE_ATTRIBUTE = 'data-dsw-ui-mode'

/** Presentation modes the Tool denoise layer keys off. */
export interface ToolPresentation {
  /** Output-denoise Beta flag on; technical fields may layer behind details. */
  readonly denoise: boolean
  /** Expert mode: technical details default expanded. */
  readonly expert: boolean
}

/**
 * Read the denoise presentation mode from the body attributes.
 * @param doc - document to read (defaults to the global document; undefined in non-browser runs).
 * @returns the current presentation mode; both flags off/absent is the default.
 */
export function readToolPresentation(doc?: Document): ToolPresentation {
  const body = doc?.body ?? (typeof document === 'undefined' ? undefined : document.body)
  return {
    denoise: body?.hasAttribute(OUTPUT_DENOISE_ATTRIBUTE) ?? false,
    expert: body?.getAttribute(UI_MODE_ATTRIBUTE) === 'expert',
  }
}
