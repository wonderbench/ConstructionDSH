/**
 * Presentation-mode document reader: the pure, context-free way any browser
 * code (React or not) learns the active interface mode. The mode is published
 * as `body[data-dsw-ui-mode]` by the Host boot script (pre-plugin first paint)
 * and kept in sync by ui-layout's theme presenter; an absent or unrecognized
 * attribute reads as the schema default `business`.
 */
import {
  DEFAULT_UI_MODE, isUiMode, UI_MODE_ATTRIBUTE, type UiMode,
} from '../theme-settings.ts'

/**
 * Read the active presentation mode from the document body.
 * @returns the mode published on `body[data-dsw-ui-mode]`, or `business` when
 * the attribute is absent, unrecognized, or no document exists.
 */
export function readUiMode(): UiMode {
  /* v8 ignore next -- needs a documentless run (node e2e booting the client tree), not constructible under jsdom */
  if (typeof document === 'undefined') return DEFAULT_UI_MODE
  const raw = document.body.getAttribute(UI_MODE_ATTRIBUTE)
  return isUiMode(raw) ? raw : DEFAULT_UI_MODE
}
